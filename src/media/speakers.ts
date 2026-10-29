import { t } from '../i18n';
import type { Caption } from '../project/captions';
import { layoutProject, type Project } from '../project/model';
import { fft } from './denoise';
import { mixAudio } from './exporter';

const RATE = 16000;
const FRAME = 512;
const HOP = 256;
const BANDS = 24;
const CEPSTRA = 12;

/**
 * Separa quem fala em cada legenda pela "cor" da voz: o timbre (coeficientes cepstrais, como os
 * usados em reconhecimento de voz) e a altura (frequência fundamental). As legendas parecidas viram
 * a mesma pessoa (k-means). Funciona bem com 2 a 4 pessoas em microfones parecidos.
 *
 * `count` = quantas pessoas falam (null = descobrir sozinho, de 1 a 4).
 * Devolve, para cada legenda, o índice da pessoa.
 */
export async function separateSpeakers(
  project: Project,
  captions: Caption[],
  count: number | null,
  onProgress: (stage: string) => void,
): Promise<{ speakerOf: number[]; count: number }> {
  onProgress(t('Preparando o áudio'));
  const mixed = await mixAudio(project, layoutProject(project));
  if (!mixed) throw new Error(t('Este projeto não tem áudio.'));
  const context = new OfflineAudioContext(1, Math.ceil(mixed.duration * RATE), RATE);
  const source = context.createBufferSource();
  source.buffer = mixed;
  source.connect(context.destination);
  source.start();
  const audio = (await context.startRendering()).getChannelData(0);

  onProgress(t('Ouvindo as vozes'));
  const filters = melFilters();
  const features = captions.map((c) => voiceprint(audio, c.start, c.end, filters));
  const valid = features.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  if (valid.length < 2) return { speakerOf: captions.map(() => 0), count: 1 };

  // Cada característica na mesma escala (média 0, desvio 1).
  const dims = features[valid[0]]!.length;
  const rows = valid.map((i) => Float64Array.from(features[i]!));
  for (let d = 0; d < dims; d++) {
    let mean = 0;
    for (const r of rows) mean += r[d];
    mean /= rows.length;
    let sd = 0;
    for (const r of rows) sd += (r[d] - mean) ** 2;
    sd = Math.sqrt(sd / rows.length) || 1;
    for (const r of rows) r[d] = (r[d] - mean) / sd;
  }
  // A altura da voz é o que mais separa pessoas: pesa mais.
  for (const r of rows) r[dims - 1] *= 2;

  onProgress(t('Separando as pessoas'));
  let best: { labels: number[]; k: number; score: number } | null = null;
  const options = count ? [count] : [2, 3, 4];
  for (const k of options) {
    if (k > rows.length) continue;
    const labels = kmeans(rows, k);
    // Descobrindo sozinho: um "grupo" de uma ou duas falas soltas não é uma pessoa nova, e mais
    // pessoas só valem se separarem claramente melhor.
    const smallest = Math.min(...Array.from({ length: k }, (_, c) => labels.filter((l) => l === c).length));
    if (!count && smallest < Math.max(2, rows.length * 0.08)) continue;
    const score = silhouette(rows, labels, k) - (count ? 0 : (k - 2) * 0.05);
    if (!best || score > best.score) best = { labels, k, score };
  }
  // Pouca diferença entre os grupos: é uma voz só.
  if (!best || (!count && best.score < 0.12)) return { speakerOf: captions.map(() => 0), count: 1 };

  // Pessoa 1 = quem fala primeiro.
  const order: number[] = [];
  for (const l of best.labels) if (!order.includes(l)) order.push(l);
  const speakerOf = captions.map(() => -1);
  valid.forEach((ci, r) => (speakerOf[ci] = order.indexOf(best!.labels[r])));
  // Legendas curtas demais para ouvir ficam com quem falou logo antes (ou logo depois).
  for (let i = 0; i < speakerOf.length; i++) if (speakerOf[i] < 0) speakerOf[i] = speakerOf[i - 1] ?? -1;
  for (let i = speakerOf.length - 1; i >= 0; i--) if (speakerOf[i] < 0) speakerOf[i] = speakerOf[i + 1] ?? 0;
  return { speakerOf, count: best.k };
}

/** Filtros mel (24 faixas entre 80 Hz e 7,6 kHz) sobre o espectro de FRAME pontos. */
function melFilters(): Float64Array[] {
  const mel = (f: number) => 2595 * Math.log10(1 + f / 700);
  const hz = (m: number) => 700 * (10 ** (m / 2595) - 1);
  const lo = mel(80);
  const hi = mel(7600);
  const edges = Array.from({ length: BANDS + 2 }, (_, i) => Math.floor((hz(lo + ((hi - lo) * i) / (BANDS + 1)) / RATE) * FRAME));
  return Array.from({ length: BANDS }, (_, b) => {
    const filter = new Float64Array(FRAME / 2 + 1);
    const [a, c, e] = [edges[b], edges[b + 1], edges[b + 2]];
    for (let k = a; k < c; k++) filter[k] = (k - a) / Math.max(1, c - a);
    for (let k = c; k <= e; k++) filter[k] = (e - k) / Math.max(1, e - c);
    return filter;
  });
}

/** Timbre médio (12 cepstrais) + altura mediana da voz num trecho. null se não há voz suficiente. */
function voiceprint(audio: Float32Array, start: number, end: number, filters: Float64Array[]): number[] | null {
  const a = Math.max(0, Math.floor(start * RATE));
  const b = Math.min(audio.length - FRAME, Math.floor(end * RATE));
  if (b - a < RATE * 0.3) return null;
  const window = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  const frames: { energy: number; at: number }[] = [];
  for (let p = a; p + FRAME <= b; p += HOP) {
    let e = 0;
    for (let i = 0; i < FRAME; i++) e += audio[p + i] * audio[p + i];
    frames.push({ energy: e / FRAME, at: p });
  }
  const loudest = Math.max(...frames.map((f) => f.energy));
  // Só os quadros com voz (os mais fortes do trecho).
  const voiced = frames.filter((f) => f.energy > loudest * 0.15 && f.energy > 1e-6);
  if (voiced.length < 8) return null;

  const cep = new Float64Array(CEPSTRA);
  const pitches: number[] = [];
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  for (const f of voiced) {
    for (let i = 0; i < FRAME; i++) {
      re[i] = audio[f.at + i] * window[i];
      im[i] = 0;
    }
    fft(re, im, false);
    const logMel = filters.map((filter) => {
      let sum = 0;
      for (let k = 0; k < filter.length; k++) if (filter[k]) sum += filter[k] * (re[k] * re[k] + im[k] * im[k]);
      return Math.log(sum + 1e-10);
    });
    // DCT dos log-mel (sem o coeficiente 0, que é só o volume).
    for (let c = 1; c <= CEPSTRA; c++) {
      let sum = 0;
      for (let m = 0; m < BANDS; m++) sum += logMel[m] * Math.cos((Math.PI * c * (m + 0.5)) / BANDS);
      cep[c - 1] += sum / voiced.length;
    }
    const f0 = pitch(audio, f.at);
    if (f0) pitches.push(f0);
  }
  pitches.sort((x, y) => x - y);
  const f0 = pitches.length >= 3 ? pitches[Math.floor(pitches.length / 2)] : 160;
  return [...cep, Math.log2(f0)];
}

/** Frequência fundamental (70 a 400 Hz) por autocorrelação; null se o quadro não é voz "cantada". */
function pitch(audio: Float32Array, at: number): number | null {
  const minLag = Math.floor(RATE / 400);
  const maxLag = Math.floor(RATE / 70);
  const n = FRAME - maxLag;
  if (n < 64) return null;
  let zero = 0;
  for (let i = 0; i < n; i++) zero += audio[at + i] * audio[at + i];
  if (zero <= 0) return null;
  let bestLag = 0;
  let bestR = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    let e = 0;
    for (let i = 0; i < n; i++) {
      r += audio[at + i] * audio[at + i + lag];
      e += audio[at + i + lag] * audio[at + i + lag];
    }
    const norm = r / Math.sqrt(zero * e + 1e-12);
    if (norm > bestR) {
      bestR = norm;
      bestLag = lag;
    }
  }
  return bestR > 0.45 && bestLag ? RATE / bestLag : null;
}

const dist = (a: Float64Array, b: Float64Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
};

/** k-means com início k-means++ (várias tentativas; fica a de menor erro). */
export function kmeans(rows: Float64Array[], k: number, tries = 8): number[] {
  let best: { labels: number[]; error: number } | null = null;
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let t = 0; t < tries; t++) {
    const centers: Float64Array[] = [Float64Array.from(rows[Math.floor(random() * rows.length)])];
    while (centers.length < k) {
      const d = rows.map((r) => Math.min(...centers.map((c) => dist(r, c))));
      const total = d.reduce((a, b) => a + b, 0);
      let pick = random() * total;
      let i = 0;
      while (i < d.length - 1 && (pick -= d[i]) > 0) i++;
      centers.push(Float64Array.from(rows[i]));
    }
    const labels = rows.map(() => 0);
    for (let iter = 0; iter < 50; iter++) {
      let changed = false;
      rows.forEach((r, i) => {
        let bestC = 0;
        for (let c = 1; c < k; c++) if (dist(r, centers[c]) < dist(r, centers[bestC])) bestC = c;
        if (labels[i] !== bestC) {
          labels[i] = bestC;
          changed = true;
        }
      });
      for (let c = 0; c < k; c++) {
        const members = rows.filter((_, i) => labels[i] === c);
        if (!members.length) continue;
        centers[c].fill(0);
        for (const m of members) for (let d = 0; d < m.length; d++) centers[c][d] += m[d] / members.length;
      }
      if (!changed) break;
    }
    const error = rows.reduce((s, r, i) => s + dist(r, centers[labels[i]]), 0);
    if (!best || error < best.error) best = { labels, error };
  }
  return best!.labels;
}

/** Quão bem separados ficaram os grupos (-1 a 1; acima de ~0,15 já é uma separação real). */
function silhouette(rows: Float64Array[], labels: number[], k: number): number {
  let total = 0;
  rows.forEach((r, i) => {
    const mean = new Array<number>(k).fill(0);
    const n = new Array<number>(k).fill(0);
    rows.forEach((q, j) => {
      if (i === j) return;
      mean[labels[j]] += Math.sqrt(dist(r, q));
      n[labels[j]]++;
    });
    const a = n[labels[i]] ? mean[labels[i]] / n[labels[i]] : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== labels[i] && n[c]) b = Math.min(b, mean[c] / n[c]);
    if (Number.isFinite(b)) total += (b - a) / Math.max(a, b, 1e-9);
  });
  return total / rows.length;
}
