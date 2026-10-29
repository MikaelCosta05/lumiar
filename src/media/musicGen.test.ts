import { describe, expect, it } from 'vitest';
import { measureLufs } from './loudness';
import { MUSIC_STYLE_SPECS, planMusic, renderMusic, styleSpec, type MusicStyle } from './musicGen';
import { SR } from './synth';

/**
 * Não dá para "ouvir" num teste: confere o sinal. Duração exata, sem estourar (pico abaixo de -1 dB),
 * volume no alvo (LUFS), começo e fim sem estalo, introdução mais calma que o refrão, a mesma semente
 * dando a mesma música e as batidas informadas caindo onde o bumbo bate.
 */

const asBuffer = (channels: Float32Array[]) =>
  ({ sampleRate: SR, numberOfChannels: channels.length, length: channels[0].length, getChannelData: (c: number) => channels[c] }) as unknown as AudioBuffer;

function rms(data: Float32Array, from: number, to: number): number {
  const a = Math.max(0, Math.round(from * SR));
  const b = Math.min(data.length, Math.round(to * SR));
  let s = 0;
  for (let i = a; i < b; i++) s += data[i] * data[i];
  return Math.sqrt(s / Math.max(1, b - a));
}

describe('estrutura da música gerada', () => {
  const styles = MUSIC_STYLE_SPECS.map((s) => s.id);
  for (const style of styles) {
    it(`${style}: compassos inteiros e o acorde final terminando no tempo pedido`, () => {
      for (const duration of [3, 7.5, 15, 30, 61.3, 180, 600]) {
        const spec = styleSpec(style);
        const plan = planMusic({ style, duration, bpm: spec.bpm });
        expect(plan.duration).toBe(duration);
        expect(Number.isInteger(plan.bars)).toBe(true);
        const tail = duration - plan.bodyEnd;
        expect(tail).toBeGreaterThan(0.5);
        expect(tail).toBeLessThanOrEqual(5.5 + 1e-9);
        expect(plan.bodyEnd).toBeCloseTo(plan.bars * plan.bar, 9);
        // Andamento perto do pedido (em músicas de tamanho normal).
        if (duration >= 15) expect(Math.abs(plan.bpm - spec.bpm) / spec.bpm).toBeLessThan(0.08);
        // As partes cobrem todos os compassos, em ordem.
        expect(plan.sections[0].from).toBe(0);
        expect(plan.sections[plan.sections.length - 1].to).toBe(plan.bars);
        for (let i = 1; i < plan.sections.length; i++) expect(plan.sections[i].from).toBe(plan.sections[i - 1].to);
        if (plan.bars >= 8) {
          expect(plan.sections[0].kind).toBe('intro');
          expect(plan.sections[plan.sections.length - 1].kind).toBe('outro');
          // O clímax vem logo antes do final.
          expect(plan.sections[plan.sections.length - 2].kind).toBe('b');
        }
        expect(plan.beats.length).toBe(plan.bars * plan.beatsPerBar + 1);
        expect(plan.beats[plan.beats.length - 1]).toBeCloseTo(plan.bodyEnd, 9);
      }
    });
  }

  it('mantém o andamento pedido quando o rabo do acorde final consegue absorver a sobra', () => {
    const plan = planMusic({ style: 'eletronico', duration: 60, bpm: 124 });
    expect(plan.bpm).toBeCloseTo(124, 6);
  });
});

describe('som da música gerada', () => {
  const render = (style: MusicStyle, seed = 1, duration = 24, intensity = 0.6) => renderMusic({ style, duration, bpm: styleSpec(style).bpm, intensity, seed });

  for (const spec of MUSIC_STYLE_SPECS) {
    it(`${spec.id}: duração exata, sem estourar, volume no alvo e pontas sem estalo`, async () => {
      const music = await render(spec.id);
      const [l, r] = music.channels;
      expect(l.length).toBe(Math.round(24 * SR));
      expect(r.length).toBe(l.length);
      let peak = 0;
      let sum = 0;
      let diff = 0;
      for (let i = 0; i < l.length; i++) {
        expect(Number.isFinite(l[i]) && Number.isFinite(r[i])).toBe(true);
        peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
        sum += l[i] + r[i];
        diff += Math.abs(l[i] - r[i]);
      }
      // Pico abaixo de -1 dBFS (sem clipping), mas sem ficar baixinho.
      expect(peak).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-4);
      expect(peak).toBeGreaterThan(0.2);
      const lufs = measureLufs(asBuffer(music.channels));
      expect(Math.abs(lufs - spec.lufs)).toBeLessThan(1);
      // Sem DC (deslocamento da onda) e com estéreo de verdade.
      expect(Math.abs(sum / (2 * l.length))).toBeLessThan(0.002);
      expect(diff / l.length).toBeGreaterThan(0.002);
      // Começa e termina no zero (sem estalo) e os últimos 30 ms já estão em silêncio.
      expect(Math.abs(l[0])).toBe(0);
      expect(Math.abs(l[l.length - 1])).toBe(0);
      expect(rms(l, 24 - 0.03, 24)).toBeLessThan(0.003);
      // O acorde final ainda soa logo depois de "cair" (a música termina, não é cortada).
      expect(rms(l, music.plan.bodyEnd + 0.05, music.plan.bodyEnd + 0.5)).toBeGreaterThan(0.01);
      // A introdução é mais calma que o refrão.
      const b = music.plan.sections.find((s) => s.kind === 'b')!;
      const intro = music.plan.sections[0];
      expect(rms(l, intro.from * music.plan.bar, intro.to * music.plan.bar)).toBeLessThan(rms(l, b.from * music.plan.bar, b.to * music.plan.bar));
    }, 60000);
  }

  it('a mesma semente dá a mesma música; outra semente, outra', async () => {
    const a = await render('alegre', 5, 8);
    const b = await render('alegre', 5, 8);
    const c = await render('alegre', 6, 8);
    expect(a.channels[0]).toEqual(b.channels[0]);
    let diff = 0;
    for (let i = 0; i < a.channels[0].length; i++) diff += Math.abs(a.channels[0][i] - c.channels[0][i]);
    expect(diff / a.channels[0].length).toBeGreaterThan(0.01);
  }, 60000);

  it('as batidas informadas caem onde o bumbo bate', async () => {
    for (const style of ['eletronico', 'alegre'] as const) {
      const music = await render(style, 3, 20, 0.8);
      const data = music.channels[0];
      // Envelope da energia grave (suavizado em ~15 ms) e quanto ele sobe logo depois do instante.
      const env = new Float32Array(data.length);
      let lp = 0;
      let e = 0;
      const k = 1 - Math.exp((-2 * Math.PI * 150) / SR);
      const smooth = 1 - Math.exp(-1 / (SR * 0.015));
      for (let i = 0; i < data.length; i++) {
        lp += (data[i] - lp) * k;
        e += (lp * lp - e) * smooth;
        env[i] = e;
      }
      const at = (t: number) => env[Math.min(env.length - 1, Math.max(0, Math.round(t * SR)))];
      const rise = (t: number) => Math.max(0, at(t + 0.04) - at(t - 0.005));
      const kicks = music.plan.sections.filter((s) => s.kind === 'a' || s.kind === 'b').flatMap((s) => music.plan.beats.filter((t) => t >= s.from * music.plan.bar && t < s.to * music.plan.bar));
      const onBeat = kicks.reduce((s, t) => s + rise(t), 0) / kicks.length;
      const offBeat = kicks.reduce((s, t) => s + rise(t + music.plan.beat * 0.25), 0) / kicks.length;
      expect(onBeat).toBeGreaterThan(offBeat * 4);
    }
  }, 60000);

  it('gera alguns minutos de música em tempo razoável', async () => {
    const start = Date.now();
    const music = await render('lofi', 2, 90);
    expect(music.channels[0].length).toBe(90 * SR);
    expect(Date.now() - start).toBeLessThan(30000);
  }, 60000);
});
