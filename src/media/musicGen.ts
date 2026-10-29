/**
 * Música de fundo gerada pelo Lumiar: composta e tocada na hora a partir de regras (sem samples,
 * sem internet, sem direitos autorais de ninguém, sem Content ID). Cada estilo tem seus instrumentos
 * e padrões; a semente escolhe tom, progressão de acordes, ritmos e melodia.
 *
 * A estrutura é sempre introdução → partes A/B (com respiro no meio, se for longa) → final, e o
 * último acorde soa até o fim exato da duração pedida: a música termina, não é cortada.
 * Para caber certinho, o número de compassos é inteiro e o "rabo" do acorde final absorve a sobra
 * (se não der, o andamento muda um pouquinho).
 *
 * Sem textos de interface aqui (os nomes dos estilos ficam na tela): o módulo roda também num worker.
 */

import { measureLufs, normalizeLoudness } from './loudness';
import { boom, clap, crash, epiano, highpass, hat, hz, kick, lowpass, Mix, play, pluck, random, reverb, riser, snare, SR, taiko, tape, tapeStop, vinyl } from './synth';

export type MusicStyle = 'lofi' | 'tensao' | 'epico' | 'terror' | 'alegre' | 'eletronico';

export interface MusicOptions {
  style: MusicStyle;
  /** Duração exata (s) */
  duration: number;
  bpm: number;
  /** 0 (calma) a 1 (cheia) */
  intensity: number;
  /** Variação: outra semente, outra música */
  seed: number;
}

export interface StyleSpec {
  id: MusicStyle;
  bpm: number;
  minBpm: number;
  maxBpm: number;
  /** Sonoridade final (LUFS integrado) */
  lufs: number;
}

export const MUSIC_STYLE_SPECS: StyleSpec[] = [
  { id: 'lofi', bpm: 80, minBpm: 60, maxBpm: 96, lufs: -16 },
  { id: 'tensao', bpm: 100, minBpm: 70, maxBpm: 140, lufs: -17 },
  { id: 'epico', bpm: 92, minBpm: 70, maxBpm: 130, lufs: -15 },
  { id: 'terror', bpm: 60, minBpm: 40, maxBpm: 90, lufs: -18 },
  { id: 'alegre', bpm: 116, minBpm: 95, maxBpm: 140, lufs: -15 },
  { id: 'eletronico', bpm: 124, minBpm: 110, maxBpm: 140, lufs: -15 },
];

export const styleSpec = (style: MusicStyle) => MUSIC_STYLE_SPECS.find((s) => s.id === style) ?? MUSIC_STYLE_SPECS[0];

export type SectionKind = 'intro' | 'a' | 'b' | 'break' | 'outro';

export interface Section {
  kind: SectionKind;
  /** Compassos [from, to) */
  from: number;
  to: number;
}

export interface MusicPlan {
  duration: number;
  bpm: number;
  beatsPerBar: number;
  /** Segundos por tempo e por compasso */
  beat: number;
  bar: number;
  bars: number;
  /** Onde cai o acorde final (s); dali até `duration` ele soa e some */
  bodyEnd: number;
  sections: Section[];
  /** Seção, energia (0 a 1) e "virada" (prepara a próxima parte) de cada compasso */
  barKind: SectionKind[];
  energy: number[];
  fill: boolean[];
  /** Instantes de cada tempo, incluindo o do acorde final */
  beats: number[];
}

// ---------------------------------------------------------------- Estrutura

/** Compassos, andamento e partes para caber exatamente em `duration`. */
export function planMusic(options: Pick<MusicOptions, 'style' | 'duration' | 'bpm'>): MusicPlan {
  const spec = styleSpec(options.style);
  const duration = Math.max(2, options.duration);
  const wanted = Math.max(30, Math.min(220, options.bpm || spec.bpm));
  const long = options.style === 'terror' ? [2.5, 5.5] : [1.5, 4];
  const tailMin = Math.min(long[0], duration * 0.3);
  const tailMax = Math.max(tailMin, Math.min(long[1], duration * 0.5));
  let beatsPerBar = 4;
  let barLen = (60 / wanted) * beatsPerBar;
  let bars = Math.floor((duration - tailMin) / barLen);
  if (bars < 1) {
    // Curtinho demais para um compasso inteiro: um compasso com menos tempos.
    beatsPerBar = Math.max(1, Math.floor((duration - tailMin) / (60 / wanted)));
    barLen = (60 / wanted) * beatsPerBar;
    bars = 1;
  }
  let tail = duration - bars * barLen;
  if (tail > tailMax) {
    // A sobra não cabe no rabo: mais um compasso (um pouco mais rápido) ou o mesmo (um pouco mais lento).
    const faster = (duration - tailMin) / (bars + 1);
    const slower = (duration - tailMax) / bars;
    barLen = Math.abs(faster - barLen) < Math.abs(slower - barLen) ? faster : slower;
    if (barLen === faster) bars += 1;
    tail = duration - bars * barLen;
  }
  const beat = barLen / beatsPerBar;
  const bpm = 60 / beat;
  const bodyEnd = bars * barLen;

  const sections = arrange(bars);
  const barKind: SectionKind[] = [];
  const energy: number[] = [];
  const fill: boolean[] = [];
  for (const s of sections) {
    for (let b = s.from; b < s.to; b++) {
      const p = (b - s.from) / Math.max(1, s.to - s.from);
      barKind[b] = s.kind;
      energy[b] =
        s.kind === 'intro' ? 0.25 + 0.15 * p : s.kind === 'a' ? 0.65 : s.kind === 'b' ? 1 : s.kind === 'break' ? 0.4 : 0.5 - 0.3 * p;
    }
  }
  for (let b = 0; b < bars; b++) {
    const next = barKind[b + 1];
    fill[b] = next !== undefined && next !== barKind[b] && (next === 'b' || next === 'a');
  }
  const beats: number[] = [];
  for (let i = 0; i <= bars * beatsPerBar; i++) beats.push(i * beat);
  return { duration, bpm, beatsPerBar, beat, bar: barLen, bars, bodyEnd, sections, barKind, energy, fill, beats };
}

/** Introdução, frases de 8 (ou 4) compassos alternando A e B (a última antes do final é B) e o final. */
function arrange(bars: number): Section[] {
  if (bars <= 3) return [{ kind: 'a', from: 0, to: bars }];
  const intro = bars >= 24 ? 4 : bars >= 8 ? 2 : 1;
  const outro = bars >= 24 ? 4 : bars >= 10 ? 2 : 1;
  const middle = bars - intro - outro;
  const phrase = middle >= 16 ? 8 : 4;
  const count = Math.max(1, Math.round(middle / phrase));
  const kinds: SectionKind[] = Array.from({ length: count }, (_, i) => ((count - 1 - i) % 2 === 0 ? 'b' : 'a'));
  // Música longa: uma parte vira respiro (só a base), para a volta do refrão ter força.
  if (count >= 5) {
    const k = Math.floor(count * 0.55);
    if (kinds[k] === 'a') kinds[k] = 'break';
  }
  const sections: Section[] = [{ kind: 'intro', from: 0, to: intro }];
  let at = intro;
  kinds.forEach((kind, i) => {
    // A primeira frase absorve o que sobra da divisão.
    const length = i === 0 ? middle - phrase * (count - 1) : phrase;
    if (length <= 0) return;
    sections.push({ kind, from: at, to: at + length });
    at += length;
  });
  sections.push({ kind: 'outro', from: at, to: bars });
  return sections.filter((s) => s.to > s.from);
}

// ---------------------------------------------------------------- Harmonia

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];

/** Acorde empilhando terças da escala a partir do grau (0 = tônica). */
function chordOf(scale: number[], degree: number, notes = 3): number[] {
  return Array.from({ length: notes }, (_, i) => {
    const step = degree + i * 2;
    return scale[step % 7] + 12 * Math.floor(step / 7);
  });
}

/** Notas do acorde perto de `center` (voz fechada), em ordem. */
function voice(key: number, chord: number[], center: number): number[] {
  return chord
    .map((o) => {
      let n = key + o;
      while (n < center - 6) n += 12;
      while (n > center + 6) n -= 12;
      return n;
    })
    .sort((a, b) => a - b);
}

const PROGRESSIONS: Record<MusicStyle, { scale: number[]; sevenths: boolean; list: number[][] }> = {
  lofi: { scale: MAJOR, sevenths: true, list: [[1, 4, 0, 5], [0, 5, 1, 4], [3, 2, 1, 0], [0, 3, 2, 5]] },
  alegre: { scale: MAJOR, sevenths: false, list: [[0, 4, 5, 3], [0, 3, 4, 3], [5, 3, 0, 4], [0, 5, 3, 4]] },
  eletronico: { scale: MINOR, sevenths: false, list: [[0, 5, 2, 6], [0, 6, 5, 4], [5, 6, 0, 0], [0, 2, 5, 6]] },
  epico: { scale: MINOR, sevenths: false, list: [[0, 5, 2, 6], [0, 6, 5, 6], [5, 6, 0, 0], [0, 3, 5, 4]] },
  tensao: { scale: HARMONIC, sevenths: false, list: [[0, 0, 5, 4], [0, 5, 0, 4], [0, 3, 0, 4]] },
  terror: { scale: MINOR, sevenths: false, list: [[0, 0, 0, 0]] },
};

// ---------------------------------------------------------------- O arranjo

interface Ctx {
  mix: Mix;
  plan: MusicPlan;
  rnd: () => number;
  intensity: number;
  /** Tônica (MIDI, perto do Dó 3) */
  key: number;
  scale: number[];
  /** Acorde (intervalos a partir da tônica) de cada compasso */
  chords: number[][];
  /** Ritmos e melodia sorteados uma vez (a música repete as ideias, como uma música de verdade) */
  pattern: number;
  motif: { step: number; len: number; deg: number }[];
}

const barAt = (c: Ctx, b: number) => b * c.plan.bar;
const beatAt = (c: Ctx, b: number, beat: number) => b * c.plan.bar + beat * c.plan.beat;

/** Melodia de 2 compassos em colcheias: ritmo sorteado, notas andando pela pentatônica. */
function makeMotif(rnd: () => number): { step: number; len: number; deg: number }[] {
  const rhythms = [
    [0, 2, 3, 4, 6, 8, 10, 11, 12],
    [0, 3, 4, 6, 8, 11, 12, 14],
    [0, 1, 2, 4, 6, 8, 9, 10, 12],
    [0, 4, 6, 7, 8, 12],
    [0, 2, 4, 7, 8, 10, 12],
  ];
  const steps = rhythms[Math.floor(rnd() * rhythms.length)];
  let deg = Math.floor(rnd() * 3);
  return steps.map((step, i) => {
    if (i > 0) deg += [-2, -1, -1, 1, 1, 2, 0][Math.floor(rnd() * 7)];
    deg = Math.max(-2, Math.min(7, deg));
    const next = steps[i + 1] ?? 16;
    return { step, len: next - step, deg };
  });
}

/** Toca a melodia sorteada a partir do compasso `b` (2 compassos), ajeitando as notas fortes ao acorde. */
function melody(c: Ctx, b: number, pent: number[], base: number, draw: (midi: number, at: number, length: number, accent: boolean) => void, varied: boolean): void {
  const eighth = c.plan.beat / 2;
  const total = Math.min(2, c.plan.bars - b) * c.plan.beatsPerBar * 2;
  c.motif.forEach((m, i) => {
    if (m.step >= total) return;
    let deg = m.deg;
    // Na repetição, o fim da frase muda (pergunta e resposta).
    if (varied && i >= c.motif.length - 2) deg = i === c.motif.length - 1 ? 0 : deg + 1;
    const octave = Math.floor(deg / pent.length);
    let midi = base + pent[((deg % pent.length) + pent.length) % pent.length] + 12 * octave;
    const bar = b + Math.floor(m.step / (c.plan.beatsPerBar * 2));
    const chord = c.chords[bar] ?? c.chords[b];
    // Tempo forte: a nota do acorde mais próxima.
    if (m.step % 4 === 0 && chord) {
      const tones = chord.flatMap((o) => [-12, 0, 12, 24].map((x) => base + (o % 12) + x));
      midi = tones.reduce((best, n) => (Math.abs(n - midi) < Math.abs(best - midi) ? n : best), tones[0]);
    }
    draw(midi, barAt(c, b) + m.step * eighth, Math.max(1, m.len) * eighth * 0.9, m.step % 4 === 0);
  });
}

type Arranger = {
  /** Camadas que atravessam a música inteira (vinil, drone…) */
  setup?: (c: Ctx) => void;
  bar: (c: Ctx, b: number) => void;
  final: (c: Ctx, at: number, tail: number) => void;
  /** Eco: tamanho (0 a 1), abafamento e volume */
  room: [number, number, number];
  /** Fita (oscilação de altura) e passa-baixas da mistura final */
  wow?: [number, number];
  lowpass?: (intensity: number) => number;
  /** Profundidade do "bombear" com o bumbo (eletrônico) */
  pump?: number;
};

const lvl = (c: Ctx, base: number) => base * (0.65 + 0.35 * c.intensity);

const ARRANGERS: Record<MusicStyle, Arranger> = {
  // ------------------------------------------------ Lo-fi: piano elétrico, bateria preguiçosa e vinil
  lofi: {
    room: [0.55, 0.5, 0.9],
    wow: [0.15, 0.05],
    lowpass: (i) => 8500 + i * 4000,
    setup: (c) => vinyl(c.mix, 0.02 + 0.02 * c.intensity, c.pattern + 3),
    bar(c, b) {
      const kind = c.plan.barKind[b];
      const e = c.plan.energy[b];
      const chord = voice(c.key, c.chords[b], 62);
      const swing = c.plan.beat * 0.08;
      // Acordes: um no começo e uma antecipação no "e" do 3.
      chord.forEach((n, i) => epiano(c.mix, hz(n), barAt(c, b) + i * 0.012, c.plan.beat * 2.2, 0.17 * (0.8 + 0.2 * e), (i - 1.5) * 0.4));
      if (c.plan.beatsPerBar > 3 && (kind !== 'intro' || c.rnd() < 0.5)) chord.forEach((n, i) => epiano(c.mix, hz(n), beatAt(c, b, 2.5) + swing + i * 0.01, c.plan.beat * 1.3, 0.11, (i - 1.5) * 0.4));
      const drums = kind === 'a' || kind === 'b' || (kind === 'outro' && b < c.plan.bars - 1);
      if (drums) {
        const kicks = [[0, 2.5], [0, 1.75, 2.5], [0, 0.5, 2.5], [0, 2.25, 2.75]][c.pattern % 4];
        for (const k of kicks.filter((k) => k < c.plan.beatsPerBar)) kick(c.mix, beatAt(c, b, k) + (k % 1 ? swing : 0), lvl(c, 0.6), { from: 110, to: 52, decay: 0.22 });
        for (const s of [1, 3].filter((s) => s < c.plan.beatsPerBar)) snare(c.mix, beatAt(c, b, s) + 0.01, lvl(c, 0.42), { tone: 180, decay: 0.2, bright: 0.3, send: 0.35 });
        for (let h = 0; h < c.plan.beatsPerBar * 2; h++) {
          const at = beatAt(c, b, h / 2) + (h % 2 ? swing : 0);
          hat(c.mix, at, lvl(c, h % 2 ? 0.13 : 0.2), false, 0.3);
        }
        if (c.intensity > 0.6 && kind === 'b') hat(c.mix, beatAt(c, b, 3.75), 0.05, false, 0.3);
        if (c.plan.fill[b]) snare(c.mix, beatAt(c, b, 3.5) + swing, lvl(c, 0.25), { tone: 170, decay: 0.15, bright: 0.1 });
        // Baixo redondo: fundamental e a quinta.
        const root = c.key - 12 + (c.chords[b][0] % 12);
        play(c.mix, { wave: 'tri', freq: hz(root), level: 0.2, a: 0.01, d: 0.4, s: 0.6, r: 0.08, filter: { type: 'lp', from: 700 } }, barAt(c, b), c.plan.beat * 1.6);
        play(c.mix, { wave: 'tri', freq: hz(root + (c.rnd() < 0.5 ? 7 : 12)), level: 0.15, filter: { type: 'lp', from: 700 }, a: 0.01, d: 0.3, s: 0.5, r: 0.08 }, beatAt(c, b, 2.5) + swing, c.plan.beat);
      }
      // Melodia "flauta" nos refrões.
      if (kind === 'b' && (b - startOf(c, b)) % 2 === 0) {
        melody(c, b, [0, 2, 4, 7, 9], c.key + 12, (m, at, len) => {
          play(c.mix, { wave: 'tri', freq: hz(m), level: lvl(c, 0.1), a: 0.03, d: 0.3, s: 0.7, r: 0.2, filter: { type: 'lp', from: 2500 }, vibrato: { rate: 5, cents: 12 }, send: 0.4, pan: 0.2 }, at, len);
        }, ((b - startOf(c, b)) / 2) % 2 === 1);
      }
    },
    final(c, at, tail) {
      const chord = voice(c.key, [...chordOf(MAJOR, 0, 4), 14], 64);
      chord.forEach((n, i) => epiano(c.mix, hz(n), at + i * 0.03, tail, 0.15, (i - 2) * 0.3));
      play(c.mix, { wave: 'sine', freq: hz(c.key - 12), level: 0.3, a: 0.01, d: 1.2, s: 0.3, r: 0.5 }, at, tail * 0.6);
    },
  },

  // ------------------------------------------------ Tensão / suspense: cordas pulsando, relógio e coração
  tensao: {
    room: [0.75, 0.4, 1],
    bar(c, b) {
      const kind = c.plan.barKind[b];
      const e = c.plan.energy[b];
      const root = c.key - 12 + (c.chords[b][0] % 12);
      // Tique-taque do relógio.
      for (let k = 0; k < c.plan.beatsPerBar * 2; k++) {
        play(c.mix, { wave: 'noise', freq: 1, level: k % 2 ? 0.05 : 0.08, filter: { type: 'bp', from: k % 2 ? 3200 : 4200, q: 6 }, a: 0.0005, d: 0.012, s: 0, r: 0.01, pan: k % 2 ? 0.5 : -0.5, send: 0.2 }, beatAt(c, b, k / 2), 0.015);
      }
      // Fundo escuro que cresce devagar (troca a cada 2 compassos).
      if (b % 2 === 0 || kind !== c.plan.barKind[b - 1]) {
        const len = Math.min(2, c.plan.bars - b) * c.plan.bar;
        for (const n of voice(c.key, c.chords[b], 55)) {
          play(c.mix, { wave: 'saw', freq: hz(n), level: 0.06 * (0.6 + 0.5 * e), unison: 4, spread: 12, a: len * 0.4, d: 1, s: 1, r: 0.8, filter: { type: 'lp', from: 900 + 1500 * e }, send: 0.5, pan: (n % 3) * 0.3 - 0.3 }, barAt(c, b), len);
        }
      }
      if (kind === 'intro') {
        play(c.mix, { wave: 'saw', freq: hz(root + 12), level: 0.1, unison: 2, spread: 8, a: c.plan.bar * 0.5, d: 1, s: 1, r: 0.5, filter: { type: 'lp', from: 600 } }, barAt(c, b), c.plan.bar);
        return;
      }
      // Cordas graves em colcheias (semicolcheias nos refrões com intensidade).
      const sub = kind === 'b' && c.intensity > 0.4 ? 4 : 2;
      for (let k = 0; k < c.plan.beatsPerBar * sub; k++) {
        const accent = k % sub === 0;
        play(c.mix, { wave: 'saw', freq: hz(root + (k % (sub * 2) === sub * 2 - 1 ? 12 : 0)), level: lvl(c, accent ? 0.2 : 0.14), a: 0.005, d: 0.09, s: 0.2, r: 0.05, filter: { type: 'lp', from: 2600 * (0.6 + 0.4 * e), to: 700, time: 0.06 }, send: 0.2, unison: 2, spread: 6 }, beatAt(c, b, k / sub), c.plan.beat / sub * 0.6);
      }
      // Coração: tum-tum (refrão: em todo tempo).
      if (kind === 'b') for (let k = 0; k < c.plan.beatsPerBar; k++) kick(c.mix, beatAt(c, b, k), lvl(c, 0.5), { from: 110, to: 55, decay: 0.2 });
      else if (kind !== 'outro' || b < c.plan.bars - 1) {
        kick(c.mix, barAt(c, b), lvl(c, 0.45), { from: 100, to: 55, decay: 0.2 });
        kick(c.mix, beatAt(c, b, 0.4), lvl(c, 0.32), { from: 100, to: 55, decay: 0.2 });
      }
      // Violino agudo e dissonante.
      if (kind === 'b' && c.intensity > 0.35 && b % 2 === 0) {
        play(c.mix, { wave: 'saw', freq: hz(c.key + 25), level: 0.03, unison: 2, spread: 8, a: 0.8, d: 1, s: 1, r: 0.6, filter: { type: 'lp', from: 3500 }, vibrato: { rate: 6, cents: 25 }, send: 0.6, pan: 0.4 }, barAt(c, b), c.plan.bar * Math.min(2, c.plan.bars - b));
      }
      if (c.plan.fill[b]) riser(c.mix, barAt(c, b), barAt(c, b + 1), 0.35 * (0.5 + c.intensity));
      if (kind === 'b' && c.plan.barKind[b - 1] !== 'b') boom(c.mix, barAt(c, b), lvl(c, 0.45));
    },
    final(c, at, tail) {
      boom(c.mix, at, 0.7);
      play(c.mix, { wave: 'saw', freq: hz(c.key - 12), level: 0.14, unison: 3, spread: 12, a: 0.01, d: 1.5, s: 0.4, r: 0.6, filter: { type: 'lp', from: 1200, to: 300, time: 1 }, send: 0.5 }, at, tail * 0.7);
      play(c.mix, { wave: 'sine', freq: hz(c.key + 25), level: 0.03, a: 0.3, d: 1, s: 1, r: 0.5, vibrato: { rate: 5, cents: 30 }, send: 0.6 }, at, tail * 0.6);
    },
  },

  // ------------------------------------------------ Épico / trailer: cordas, tambores, metais e "BRAAAM"
  epico: {
    room: [0.85, 0.35, 1.1],
    bar(c, b) {
      const kind = c.plan.barKind[b];
      const e = c.plan.energy[b];
      const chord = c.chords[b];
      const root = c.key - 12 + (chord[0] % 12);
      const changes = b === 0 || c.chords[b - 1] !== chord || kind !== c.plan.barKind[b - 1];
      // Cordas longas (acompanham a troca de acorde).
      if (changes) {
        let len = 1;
        while (b + len < c.plan.bars && c.chords[b + len] === chord && c.plan.barKind[b + len] === kind) len++;
        for (const [i, n] of voice(c.key, chord, 60).entries()) {
          play(c.mix, { wave: 'saw', freq: hz(n), level: 0.1 * (0.6 + 0.5 * e), unison: 4, spread: 14, a: 0.5, d: 1, s: 1, r: 0.7, filter: { type: 'lp', from: 2200 + 3000 * e * (0.5 + 0.5 * c.intensity) }, vibrato: { rate: 5, cents: 6 }, send: 0.55, pan: (i - 1) * 0.5 }, barAt(c, b), len * c.plan.bar);
        }
        play(c.mix, { wave: 'saw', freq: hz(root), level: 0.12, unison: 2, spread: 8, a: 0.3, d: 1, s: 1, r: 0.6, filter: { type: 'lp', from: 700 }, send: 0.4 }, barAt(c, b), len * c.plan.bar);
      }
      if (kind === 'intro') {
        if (b === 0) taiko(c.mix, 0.02, 0.6, 55);
        return;
      }
      // Ostinato de cordas em colcheias.
      if (kind !== 'break' || c.intensity > 0.5) {
        const notes = [0, 0, 12, 0, 7, 0, 12, 7];
        for (let k = 0; k < c.plan.beatsPerBar * 2; k++) {
          play(c.mix, { wave: 'saw', freq: hz(root + 12 + notes[k % 8]), level: lvl(c, 0.14), unison: 2, spread: 6, a: 0.004, d: 0.12, s: 0.25, r: 0.06, filter: { type: 'lp', from: 4000, to: 1200, time: 0.08 }, send: 0.3, pan: -0.3 }, beatAt(c, b, k / 2), c.plan.beat * 0.4);
        }
      }
      // Tambores (taikos) nos refrões; só a marcação nas outras partes.
      const patterns = [[0, 1.5, 2, 3, 3.5], [0, 0.75, 1.5, 2, 3], [0, 2, 2.5, 3, 3.25, 3.5]];
      const hits = kind === 'b' ? patterns[c.pattern % 3] : [0, 2];
      if (kind !== 'outro' || b < c.plan.bars - 1) for (const h of hits) if (h < c.plan.beatsPerBar) taiko(c.mix, beatAt(c, b, h), lvl(c, h === 0 ? 0.5 : 0.32), h === 0 ? 70 : 95, h % 1 ? 0.3 : -0.2);
      // BRAAAM: metais graves abrindo no começo dos refrões.
      if (kind === 'b' && (b - startOf(c, b)) % 4 === 0) {
        for (const n of [root - 12, root - 5, root]) {
          play(c.mix, { wave: 'saw', freq: hz(n), level: lvl(c, 0.09), unison: 5, spread: 18, a: 0.08, d: 1.2, s: 0.6, r: 0.5, filter: { type: 'lp', from: 250, to: 1800, time: 0.4 }, drive: 0.5, send: 0.45 }, barAt(c, b), c.plan.bar * 1.5);
        }
        crash(c.mix, barAt(c, b), 0.18);
      }
      // Melodia de trompa nos refrões, se a intensidade for alta.
      if (kind === 'b' && c.intensity > 0.55 && (b - startOf(c, b)) % 4 === 2) {
        melody(c, b, [0, 3, 5, 7, 10], c.key, (m, at, len, accent) => {
          if (!accent && c.rnd() < 0.4) return;
          play(c.mix, { wave: 'saw', freq: hz(m), level: 0.07, unison: 2, spread: 6, a: 0.06, d: 0.4, s: 0.8, r: 0.3, filter: { type: 'lp', from: 1600 }, vibrato: { rate: 5, cents: 10 }, send: 0.5, pan: 0.25 }, at, len * 1.5);
        }, false);
      }
      if (c.plan.fill[b]) {
        riser(c.mix, beatAt(c, b, c.plan.beatsPerBar / 2), barAt(c, b + 1), 0.4);
        for (let k = 0; k < 8; k++) taiko(c.mix, beatAt(c, b, c.plan.beatsPerBar - 1 + k / 8), 0.25 + k * 0.05, 95, k % 2 ? 0.4 : -0.4);
      }
    },
    final(c, at, tail) {
      boom(c.mix, at, 0.9);
      taiko(c.mix, at, 0.8, 55);
      crash(c.mix, at, 0.2);
      for (const n of [c.key - 24, c.key - 17, c.key - 12]) {
        play(c.mix, { wave: 'saw', freq: hz(n), level: 0.1, unison: 5, spread: 18, a: 0.05, d: 1.5, s: 0.3, r: 0.8, filter: { type: 'lp', from: 300, to: 1500, time: 0.3 }, drive: 0.5, send: 0.5 }, at, tail * 0.5);
      }
      for (const n of voice(c.key, chordOf(MINOR, 0), 60)) {
        play(c.mix, { wave: 'saw', freq: hz(n), level: 0.06, unison: 4, spread: 14, a: 0.05, d: 2, s: 0.5, r: 1, filter: { type: 'lp', from: 2500 }, send: 0.6 }, at, tail * 0.5);
      }
    },
  },

  // ------------------------------------------------ Terror analógico: drones, fita lenta, metal raspando
  terror: {
    room: [0.92, 0.3, 1.2],
    wow: [0.6, 0.1],
    lowpass: (i) => 5000 + i * 3000,
    setup(c) {
      // Chiado da fita.
      play(c.mix, { wave: 'noise', freq: 1, level: 0.012, a: 2, d: 1, s: 1, r: 1, filter: { type: 'lp', from: 3000 } }, 0, c.plan.duration);
    },
    bar(c, b) {
      const kind = c.plan.barKind[b];
      const e = c.plan.energy[b];
      // O drone muda a cada 4 compassos: tônica, segunda menor, trítono…
      if (b % 4 === 0) {
        const len = Math.min(4, c.plan.bars - b) * c.plan.bar;
        const shift = [0, 1, 0, 6, 0, -1][Math.floor(b / 4) % 6];
        const root = c.key - 12 + shift;
        play(c.mix, { wave: 'sine', freq: hz(root), level: 0.16, a: Math.min(3, len * 0.4), d: 1, s: 1, r: 2, send: 0.3 }, barAt(c, b), len);
        // Um par levemente desafinado: o som "respira" (batimento).
        play(c.mix, { wave: 'sine', freq: hz(root) * 1.007, level: 0.11, a: Math.min(3, len * 0.4), d: 1, s: 1, r: 2, send: 0.3, pan: 0.5 }, barAt(c, b), len);
        play(c.mix, { wave: 'saw', freq: hz(root + 12), level: 0.08 * (0.5 + e), unison: 4, spread: 25, a: len * 0.5, d: 1, s: 1, r: 2, filter: { type: 'lp', from: 500 + 900 * e, q: 2 }, send: 0.6, pan: -0.4 }, barAt(c, b), len);
      }
      if (kind === 'intro') return;
      // Coração lento e abafado.
      if (kind !== 'outro' || b < c.plan.bars - 1) {
        kick(c.mix, barAt(c, b), lvl(c, 0.45), { from: 90, to: 50, decay: 0.25 });
        if (kind === 'b') kick(c.mix, beatAt(c, b, 0.35), lvl(c, 0.32), { from: 90, to: 50, decay: 0.25 });
      }
      // Metal raspando: sino grave inarmônico, em momentos sorteados.
      if (c.rnd() < 0.35 + 0.4 * e * c.intensity) {
        const at = beatAt(c, b, Math.floor(c.rnd() * c.plan.beatsPerBar * 2) / 2);
        const base = hz(c.key + 5 + Math.floor(c.rnd() * 12));
        for (const [ratio, amp] of [[1, 1], [2.32, 0.6], [4.25, 0.4], [6.63, 0.25]] as const) {
          play(c.mix, { wave: 'sine', freq: base * ratio, level: 0.035 * amp, a: 0.3, d: 1.5, s: 0, r: 0.5, vibrato: { rate: 0.7, cents: 40 }, send: 0.9, pan: c.rnd() * 1.6 - 0.8 }, at, 2);
        }
      }
      // Sussurro: faixa de ruído que passeia (refrões).
      if (kind === 'b' && b % 2 === 0) {
        play(c.mix, { wave: 'noise', freq: 1, level: 0.12 * c.intensity + 0.04, a: c.plan.bar * 0.6, d: 1, s: 1, r: 1, filter: { type: 'bp', from: 600 + c.rnd() * 600, to: 1800, time: c.plan.bar, q: 4 }, send: 0.7, pan: c.rnd() - 0.5 }, barAt(c, b), c.plan.bar * Math.min(2, c.plan.bars - b));
      }
      // Agudo que não deixa relaxar.
      if (kind === 'b' && c.intensity > 0.4 && b % 4 === 2) {
        play(c.mix, { wave: 'sine', freq: hz(c.key + 37), level: 0.02, a: 1.5, d: 1, s: 1, r: 1, vibrato: { rate: 3, cents: 35 }, send: 0.8 }, barAt(c, b), c.plan.bar * Math.min(2, c.plan.bars - b));
      }
      if (c.plan.fill[b]) riser(c.mix, barAt(c, b), barAt(c, b + 1), 0.25);
    },
    final(c, at, tail) {
      boom(c.mix, at, 0.6);
      play(c.mix, { wave: 'sine', freq: hz(c.key - 12), level: 0.25, a: 0.01, d: 1, s: 1, r: 0.5, send: 0.4 }, at, tail);
      play(c.mix, { wave: 'saw', freq: hz(c.key - 13), level: 0.06, unison: 3, spread: 30, a: 0.05, d: 1, s: 1, r: 0.5, filter: { type: 'lp', from: 600 }, send: 0.6 }, at, tail);
    },
  },

  // ------------------------------------------------ Alegre / vlog: ukulele, palmas, assobio de sino
  alegre: {
    room: [0.45, 0.4, 0.7],
    bar(c, b) {
      const kind = c.plan.barKind[b];
      const chord = voice(c.key, c.chords[b], 66);
      const root = c.key - 12 + (c.chords[b][0] % 12);
      // Batida do ukulele: baixo, baixo-cima, cima-baixo-cima.
      const strums: [number, boolean][] = [[0, true], [1, true], [1.5, false], [2.5, false], [3, true], [3.5, false]];
      for (const [beat, down] of strums) {
        if (beat >= c.plan.beatsPerBar) continue;
        const notes = down ? chord : [...chord].reverse();
        // Dois "violões" gravados duas vezes, um de cada lado (som largo, como em estúdio).
        for (const side of [-0.6, 0.6]) {
          notes.forEach((n, i) => pluck(c.mix, hz(n), beatAt(c, b, beat) + i * 0.011 + (side > 0 ? 0.008 : 0), c.plan.beat * 0.9, (down ? 0.36 : 0.22) * (kind === 'intro' ? 1.1 : 1), side + (i - 1) * 0.15, 0.2, down ? 0.65 : 0.5));
        }
      }
      if (kind === 'intro') {
        if (b === c.plan.sections[0].to - 1) clap(c.mix, beatAt(c, b, 3), 0.3);
        return;
      }
      const drums = kind !== 'outro' || b < c.plan.bars - 1;
      if (drums) {
        for (const k of [0, 2, ...(c.pattern % 2 ? [2.5] : [1.75])]) if (k < c.plan.beatsPerBar) kick(c.mix, beatAt(c, b, k), lvl(c, 0.7), { from: 140, to: 55, decay: 0.2 });
        for (const k of [1, 3]) if (k < c.plan.beatsPerBar) clap(c.mix, beatAt(c, b, k), lvl(c, kind === 'b' ? 0.45 : 0.35));
        const step = kind === 'b' && c.intensity > 0.5 ? 0.25 : 0.5;
        for (let h = 0; h < c.plan.beatsPerBar; h += step) hat(c.mix, beatAt(c, b, h), lvl(c, (h * 2) % 2 === 1 ? 0.1 : 0.06), false, 0.4);
        // Baixo pulando (fundamental e oitava).
        for (const [k, o] of [[0, 0], [1.5, 12], [2, 0], [3, 7], [3.5, 12]] as const) {
          if (k < c.plan.beatsPerBar) play(c.mix, { wave: 'tri', freq: hz(root + o), level: 0.22, a: 0.005, d: 0.15, s: 0.3, r: 0.05, filter: { type: 'lp', from: 1500 } }, beatAt(c, b, k), c.plan.beat * 0.4);
        }
      }
      // Sininho (glockenspiel) com a melodia nos refrões.
      if ((kind === 'b' || (kind === 'a' && c.intensity > 0.75)) && (b - startOf(c, b)) % 2 === 0) {
        melody(c, b, [0, 2, 4, 7, 9], c.key + 24, (m, at) => {
          for (const [ratio, amp, d] of [[1, 1, 0.6], [2.76, 0.25, 0.15], [5.4, 0.1, 0.08]] as const) {
            play(c.mix, { wave: 'sine', freq: hz(m) * ratio, level: lvl(c, 0.09) * amp, a: 0.002, d, s: 0, r: 0.1, send: 0.35, pan: 0.2 }, at, 0.3);
          }
        }, ((b - startOf(c, b)) / 2) % 2 === 1);
      }
      if (kind === 'b' && c.plan.barKind[b - 1] !== 'b') crash(c.mix, barAt(c, b), 0.1);
      if (c.plan.fill[b]) for (let k = 0; k < 4; k++) clap(c.mix, beatAt(c, b, c.plan.beatsPerBar - 1 + k / 4), 0.15 + k * 0.06);
    },
    final(c, at, tail) {
      const chord = voice(c.key, chordOf(MAJOR, 0), 66);
      chord.forEach((n, i) => pluck(c.mix, hz(n), at + i * 0.02, tail, 0.35, (i - 1) * 0.3, 0.3, 0.6));
      kick(c.mix, at, 0.7, { from: 140, to: 55, decay: 0.25 });
      crash(c.mix, at, 0.12);
      for (const [ratio, amp] of [[1, 1], [2.76, 0.25]] as const) play(c.mix, { wave: 'sine', freq: hz(c.key + 24) * ratio, level: 0.1 * amp, a: 0.002, d: 1, s: 0, r: 0.3, send: 0.4 }, at + 0.05, 1);
    },
  },

  // ------------------------------------------------ Eletrônico: bumbo reto, "supersaw" bombeando e arpejo
  eletronico: {
    room: [0.6, 0.45, 0.8],
    pump: 0.7,
    bar(c, b) {
      const kind = c.plan.barKind[b];
      const e = c.plan.energy[b];
      const chord = voice(c.key, c.chords[b], 62);
      const root = c.key - 12 + (c.chords[b][0] % 12);
      const cutoff = kind === 'intro' ? 600 + 1800 * ((b + 1) / Math.max(1, c.plan.sections[0].to)) : kind === 'break' ? 900 : kind === 'outro' ? 2500 * c.plan.energy[b] : 2500 + 4500 * e * (0.5 + 0.5 * c.intensity);
      for (const [i, n] of chord.entries()) {
        play(c.mix, { wave: 'saw', freq: hz(n), level: 0.08, unison: 5, spread: 22, a: 0.02, d: 0.5, s: 0.85, r: 0.2, filter: { type: 'lp', from: cutoff, q: 1.2 }, pump: true, send: 0.35, pan: (i - 1) * 0.45 }, barAt(c, b), c.plan.bar * 0.98);
      }
      const four = kind === 'a' || kind === 'b' || (kind === 'outro' && b < c.plan.bars - 1);
      // Introdução: só o chimbal abrindo caminho.
      if (kind === 'intro') for (let k = 0; k < c.plan.beatsPerBar; k++) hat(c.mix, beatAt(c, b, k + 0.5), 0.1, true, 0.25);
      if (four) {
        for (let k = 0; k < c.plan.beatsPerBar; k++) kick(c.mix, beatAt(c, b, k), lvl(c, 0.8), { from: 180, to: 52, decay: 0.26 });
        for (let k = 0; k < c.plan.beatsPerBar; k++) hat(c.mix, beatAt(c, b, k + 0.5), lvl(c, 0.16), true, 0.25);
        if (kind === 'b' || c.intensity > 0.5) for (const k of [1, 3]) if (k < c.plan.beatsPerBar) clap(c.mix, beatAt(c, b, k), lvl(c, 0.4));
        if (kind === 'b' && c.intensity > 0.6) for (let h = 0; h < c.plan.beatsPerBar; h += 0.25) hat(c.mix, beatAt(c, b, h), 0.035, false, -0.3);
        // Baixo no contratempo.
        for (let k = 0; k < c.plan.beatsPerBar; k++) {
          play(c.mix, { wave: 'saw', freq: hz(root), level: 0.18, a: 0.005, d: 0.12, s: 0.5, r: 0.04, filter: { type: 'lp', from: 1200, to: 400, time: 0.08, q: 1.5 }, pump: true }, beatAt(c, b, k + 0.5), c.plan.beat * 0.4);
        }
      }
      // Arpejo em semicolcheias.
      if (kind === 'b' || kind === 'break' || (kind === 'a' && c.intensity > 0.6)) {
        const order = c.pattern % 2 ? [0, 1, 2, 3, 2, 1, 0, 2] : [0, 2, 1, 2, 0, 2, 1, 3];
        const tones = [...chord, chord[0] + 12];
        for (let k = 0; k < c.plan.beatsPerBar * 4; k++) {
          const n = tones[order[k % 8] % tones.length] + 12;
          play(c.mix, { wave: 'square', freq: hz(n), level: lvl(c, kind === 'break' ? 0.05 : 0.07), a: 0.002, d: 0.08, s: 0, r: 0.05, filter: { type: 'lp', from: 5000 * (kind === 'break' ? 0.4 : 1), to: 700, time: 0.05 }, send: 0.45, pan: k % 2 ? 0.4 : -0.4 }, beatAt(c, b, k / 4), c.plan.beat * 0.2);
        }
      }
      if (c.plan.fill[b]) {
        riser(c.mix, barAt(c, b), barAt(c, b + 1), 0.45);
        for (let k = 0; k < 8; k++) snare(c.mix, beatAt(c, b, c.plan.beatsPerBar / 2 + (k * c.plan.beatsPerBar) / 16), 0.1 + k * 0.04, { tone: 200, decay: 0.08, bright: 0.7 });
      }
      if (kind === 'b' && c.plan.barKind[b - 1] !== 'b') crash(c.mix, barAt(c, b), 0.14);
    },
    final(c, at, tail) {
      boom(c.mix, at, 0.75);
      kick(c.mix, at, 0.9, { from: 180, to: 50, decay: 0.4 });
      crash(c.mix, at, 0.15);
      for (const [i, n] of voice(c.key, chordOf(MINOR, 0), 62).entries()) {
        play(c.mix, { wave: 'saw', freq: hz(n), level: 0.05, unison: 5, spread: 22, a: 0.01, d: 1.5, s: 0.4, r: 0.6, filter: { type: 'lp', from: 3000, to: 500, time: tail * 0.4 }, send: 0.5, pan: (i - 1) * 0.45 }, at, tail * 0.6);
      }
    },
  },
};

/** Compasso em que começa a parte onde está `b`. */
function startOf(c: Ctx, b: number): number {
  return c.plan.sections.find((s) => b >= s.from && b < s.to)?.from ?? 0;
}

// ---------------------------------------------------------------- Tocar

export interface RenderedMusic {
  channels: [Float32Array, Float32Array];
  sampleRate: number;
  plan: MusicPlan;
  /** Sonoridade final (LUFS) e pico (0 a 1) */
  lufs: number;
  peak: number;
}

/** Deixa a interface respirar de tempos em tempos (a música longa leva alguns segundos). */
function breather(): () => Promise<void> {
  let last = Date.now();
  return async () => {
    if (Date.now() - last < 30) return;
    await new Promise((r) => setTimeout(r, 0));
    last = Date.now();
  };
}

/** Compõe e toca a música. `onProgress` recebe de 0 a 1. */
export async function renderMusic(options: MusicOptions, onProgress: (fraction: number) => void = () => {}): Promise<RenderedMusic> {
  const plan = planMusic(options);
  const length = Math.round(plan.duration * SR);
  const mix = new Mix(length);
  const rnd = random(options.seed * 7919 + options.style.length * 31 + 1);
  const prog = PROGRESSIONS[options.style];
  const list = prog.list[Math.floor(rnd() * prog.list.length)];
  const perChord = options.style === 'terror' ? 4 : options.style === 'epico' || options.style === 'tensao' ? (plan.bars >= 8 ? 2 : 1) : 1;
  const chords = Array.from({ length: plan.bars }, (_, b) => chordOf(prog.scale, list[Math.floor(b / perChord) % list.length], prog.sevenths ? 4 : 3));
  // Mesmo acorde = mesmo objeto (o épico usa isso para saber quando o acorde muda).
  for (let b = 1; b < chords.length; b++) if (chords[b].join() === chords[b - 1].join()) chords[b] = chords[b - 1];
  const ctx: Ctx = {
    mix,
    plan,
    rnd,
    intensity: Math.max(0, Math.min(1, options.intensity)),
    // Tom sorteado, perto do Dó 3 (Lá 2 a Sol# 3): nem grave nem agudo demais para os instrumentos.
    key: 45 + Math.floor(rnd() * 12),
    scale: prog.scale,
    chords,
    pattern: Math.floor(rnd() * 1000),
    motif: makeMotif(rnd),
  };
  const arranger = ARRANGERS[options.style];
  const rest = breather();
  arranger.setup?.(ctx);
  for (let b = 0; b < plan.bars; b++) {
    arranger.bar(ctx, b);
    onProgress((0.7 * (b + 1)) / plan.bars);
    await rest();
  }
  arranger.final(ctx, plan.bodyEnd, plan.duration - plan.bodyEnd);

  // Bombear com o bumbo: a base abaixa em cada tempo e volta.
  if (arranger.pump) {
    for (let i = 0; i < length; i++) {
      const t = i / SR;
      const bar = Math.min(plan.bars - 1, Math.floor(t / plan.bar));
      const kind = plan.barKind[bar];
      let g = 1;
      if (t < plan.bodyEnd && (kind === 'a' || kind === 'b' || kind === 'outro')) {
        const dt = t % plan.beat;
        g = 1 - arranger.pump * Math.exp(-dt / (plan.beat * 0.22)) * Math.min(1, dt / 0.005);
      }
      mix.dry[0][i] += mix.pump[0][i] * g;
      mix.dry[1][i] += mix.pump[1][i] * g;
    }
  }
  onProgress(0.75);
  await rest();
  // Eco de sala (cada lado com tamanhos um pouco diferentes: o som abre no estéreo).
  const [size, damp, wet] = arranger.room;
  const out: [Float32Array, Float32Array] = [mix.dry[0], mix.dry[1]];
  const wetL = new Float32Array(length);
  const wetR = new Float32Array(length);
  reverb(mix.send[0], wetL, size, damp, 0);
  await rest();
  reverb(mix.send[1], wetR, size, damp, 23);
  for (let i = 0; i < length; i++) {
    out[0][i] += wetL[i] * wet;
    out[1][i] += wetR[i] * wet;
  }
  onProgress(0.85);
  await rest();
  for (const ch of out) {
    if (arranger.wow) tape(ch, arranger.wow[0], arranger.wow[1], options.seed + 11);
    if (arranger.lowpass) lowpass(ch, arranger.lowpass(ctx.intensity));
    highpass(ch, 28);
  }
  // Terror: no fim, a fita para.
  if (options.style === 'terror') for (const ch of out) tapeStop(ch, plan.bodyEnd + Math.min(0.6, (plan.duration - plan.bodyEnd) * 0.2));
  shapeEnds(out, plan);
  onProgress(0.95);
  await rest();
  // Volume no alvo do estilo, com o pico abaixo de -1 dB.
  const fake = { sampleRate: SR, numberOfChannels: 2, length, duration: plan.duration, getChannelData: (c: number) => out[c] } as unknown as AudioBuffer;
  normalizeLoudness(fake, styleSpec(options.style).lufs);
  // O limitador pode deixar o começo/fim com um resto: as pontas voltam a zero.
  shapeEnds(out, plan);
  let peak = 0;
  for (const ch of out) for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  onProgress(1);
  return { channels: out, sampleRate: SR, plan, lufs: measureLufs(fake), peak };
}

/** Entrada sem estalo e o rabo do acorde final sumindo até zero exatamente no fim. */
function shapeEnds(out: Float32Array[], plan: MusicPlan): void {
  const length = out[0].length;
  const fadeIn = Math.round(SR * 0.01);
  const tail = plan.duration - plan.bodyEnd;
  const fadeOut = Math.max(Math.round(SR * 0.05), Math.round(SR * Math.min(tail * 0.65, 3)));
  for (const ch of out) {
    for (let i = 0; i < Math.min(fadeIn, length); i++) ch[i] *= i / fadeIn;
    for (let k = 0; k < Math.min(fadeOut, length); k++) {
      const i = length - 1 - k;
      // Meia-cosseno: some suave, sem "degrau".
      ch[i] *= 0.5 - 0.5 * Math.cos((Math.PI * k) / fadeOut);
    }
  }
}
