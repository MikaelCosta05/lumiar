/**
 * Encaixar a música numa duração: em vez de cortar o fim no meio de uma frase musical, o Lumiar
 * tira (ou repete) um pedaço do meio, sempre emendando em cima de uma batida e onde o som antes e
 * depois da emenda é parecido. O começo e o final de verdade da música ficam.
 */

/** Trechos do arquivo a tocar em sequência. */
export type Segments = [number, number][];

export interface FitPlan {
  segments: Segments;
  /** Quanto a música ficou mais curta (negativo = mais longa) que a duração pedida (s) */
  error: number;
  /** Quantas emendas (0 = só cortou o final) */
  joins: number;
}

/** "Impressão digital" do som em volta de cada batida, para achar emendas que não se notam. */
export interface BeatFeatures {
  /** Instantes das batidas (s, tempo do arquivo) */
  beats: number[];
  /** Vetor do som logo depois de cada batida */
  after: Float32Array[];
  /** Vetor do som logo antes de cada batida */
  before: Float32Array[];
}

function cosine(a: Float32Array, b: Float32Array): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return ab / Math.sqrt(aa * bb + 1e-12);
}

/** Vetores (média do espectro) de meia batida antes e depois de cada batida. */
export function beatFeatures(beats: number[], spectrum: { data: Float32Array; frames: number; rate: number; bands: number }): BeatFeatures {
  const period = beats.length > 1 ? (beats[beats.length - 1] - beats[0]) / (beats.length - 1) : 0.5;
  const mean = (from: number, to: number) => {
    const out = new Float32Array(spectrum.bands);
    const a = Math.max(0, Math.floor(from * spectrum.rate));
    const b = Math.min(spectrum.frames, Math.max(a + 1, Math.ceil(to * spectrum.rate)));
    for (let f = a; f < b; f++) for (let k = 0; k < spectrum.bands; k++) out[k] += spectrum.data[f * spectrum.bands + k] / (b - a);
    return out;
  };
  return {
    beats,
    after: beats.map((t) => mean(t, t + period * 2)),
    before: beats.map((t) => mean(t - period * 2, t)),
  };
}

/** Uma emenda de a para b soa natural se o som antes e depois dos dois pontos se parece. */
function joinScore(f: BeatFeatures, i: number, j: number): number {
  const bars = (j - i) % 4 === 0 ? 0.15 : 0;
  return cosine(f.before[i], f.before[j]) + cosine(f.after[i], f.after[j]) + bars;
}

/**
 * Plano para a música [from, to] do arquivo durar `target` segundos.
 * Mais curta: tira um pedaço do meio (fica o começo e o final). Mais longa: repete um trecho do meio.
 */
export function planMusicFit(features: BeatFeatures, from: number, to: number, target: number): FitPlan {
  const length = to - from;
  const beats = features.beats.map((t, i) => ({ t, i })).filter((b) => b.t > from + 0.05 && b.t < to - 0.05);
  const period = beats.length > 1 ? (beats[beats.length - 1].t - beats[0].t) / (beats.length - 1) : 0.5;
  const tolerance = period * 0.55;

  // Sem batidas suficientes: corta o fim (o chamador põe um "sumir aos poucos").
  const fallback = (): FitPlan => ({ segments: [[from, from + Math.min(length, target)]], error: Math.max(0, target - length), joins: 0 });
  if (beats.length < 8) return fallback();

  if (length > target) {
    // Mais curta: fica [from, a] + [b, to]. O começo e o final precisam sobrar com algum tamanho.
    const minIntro = Math.min(target * 0.3, 8);
    const minOutro = Math.min(target * 0.25, 10);
    let best: { a: number; b: number; score: number; error: number } | null = null;
    for (let x = 0; x < beats.length; x++) {
      const a = beats[x];
      if (a.t - from < minIntro) continue;
      for (let y = x + 4; y < beats.length; y++) {
        const b = beats[y];
        if (to - b.t < minOutro) break;
        const kept = a.t - from + (to - b.t);
        const error = kept - target;
        if (Math.abs(error) > tolerance) continue;
        const score = joinScore(features, a.i, b.i) - Math.abs(error) / period * 0.1;
        if (!best || score > best.score) best = { a: a.t, b: b.t, score, error };
      }
    }
    if (!best) return fallback();
    return { segments: [[from, best.a], [best.b, to]], error: -best.error, joins: 1 };
  }

  if (length < target) {
    // Mais longa: toca até b, volta para a e repete [a, b] n vezes, depois segue até o final.
    const extra = target - length;
    let best: { a: number; b: number; n: number; score: number; error: number } | null = null;
    for (let x = 0; x < beats.length; x++) {
      const a = beats[x];
      if (a.t - from < length * 0.15) continue;
      for (let y = x + 8; y < beats.length; y += 4) {
        const b = beats[y];
        if (to - b.t < length * 0.1) break;
        const span = b.t - a.t;
        const n = Math.max(1, Math.round(extra / span));
        if (n > 12) continue;
        const error = n * span - extra;
        if (Math.abs(error) > tolerance) continue;
        const score = joinScore(features, a.i, b.i) - Math.abs(error) / period * 0.1 - n * 0.01;
        if (!best || score > best.score) best = { a: a.t, b: b.t, n, score, error };
      }
    }
    if (!best) return { segments: [[from, to]], error: target - length, joins: 0 };
    const segments: Segments = [[from, best.b]];
    for (let k = 0; k < best.n; k++) segments.push([best.a, best.b]);
    segments.push([best.b, to]);
    return { segments, error: -best.error, joins: best.n };
  }
  return { segments: [[from, to]], error: 0, joins: 0 };
}
