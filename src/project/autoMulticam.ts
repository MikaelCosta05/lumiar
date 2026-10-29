import type { Caption } from './captions';

/** Um corte: a partir de `time`, a câmera `camera` (1 = trilha principal). */
export interface CameraCut {
  time: number;
  camera: number;
}

export interface AutoCutOptions {
  /** Menor tempo numa câmera antes de trocar de novo (s) */
  minShot: number;
  /** Quanto tempo uma pessoa precisa falar mais alto para a câmera ir até ela (s) */
  react: number;
}

const DEFAULTS: AutoCutOptions = { minShot: 2, react: 0.5 };

/**
 * Quem fala, pelo volume: cada câmera grava o som de perto de quem ela filma, então a câmera
 * "mais alta" (em relação ao normal dela) é a de quem está falando. `envelopes[i]` = volume da
 * câmera i+1 ao longo da timeline, `rate` amostras por segundo a partir de `t0`.
 */
export function cutsFromLoudness(envelopes: (Float32Array | null)[], rate: number, t0: number, options: Partial<AutoCutOptions> = {}): CameraCut[] {
  const { minShot, react } = { ...DEFAULTS, ...options };
  const n = Math.max(0, ...envelopes.map((e) => e?.length ?? 0));
  if (n === 0) return [];
  // Cada câmera na sua escala: dividida pelo volume "de fala" típico dela (percentil 75), em dB.
  const relative = envelopes.map((env) => {
    if (!env) return null;
    const sorted = Float32Array.from(env).sort();
    const ref = sorted[Math.floor(sorted.length * 0.75)] || 1e-4;
    // Suaviza 0,3 s para não reagir a estalos.
    const win = Math.max(1, Math.round(rate * 0.3));
    const out = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += env[i] ?? 0;
      if (i >= win) sum -= env[i - win] ?? 0;
      out[i] = 20 * Math.log10(Math.max(1e-5, sum / Math.min(i + 1, win)) / ref);
    }
    return out;
  });

  const cuts: CameraCut[] = [];
  let current = -1;
  let since = -Infinity;
  let candidate = -1;
  let candidateSince = 0;
  for (let i = 0; i < n; i++) {
    let loudest = -1;
    for (let c = 0; c < relative.length; c++) {
      const r = relative[c];
      if (!r) continue;
      if (loudest < 0 || r[i] > relative[loudest]![i]) loudest = c;
    }
    if (loudest < 0) continue;
    // Só conta como "falando" com uma vantagem clara (3 dB) sobre a segunda câmera.
    const second = Math.max(-Infinity, ...relative.map((r, c) => (r && c !== loudest ? r[i] : -Infinity)));
    const clear = relative[loudest]![i] - second > 3 && relative[loudest]![i] > -12;
    const t = t0 + i / rate;
    if (current < 0 && clear) {
      current = loudest;
      since = t;
      cuts.push({ time: t0, camera: loudest + 1 });
      continue;
    }
    if (!clear || loudest === current) {
      candidate = -1;
      continue;
    }
    if (candidate !== loudest) {
      candidate = loudest;
      candidateSince = t;
    }
    if (t - candidateSince >= react && candidateSince - since >= minShot) {
      // O corte acontece um pouco antes de a pessoa começar a se destacar (soa natural).
      const time = Math.max(since + minShot, candidateSince - 0.15);
      cuts.push({ time, camera: candidate + 1 });
      current = candidate;
      since = time;
      candidate = -1;
    }
  }
  return cuts;
}

/**
 * Quem fala, pelas legendas com as vozes separadas: cada pessoa vai para a câmera onde a voz dela
 * soa mais alta. `cameraOfSpeaker[s]` = câmera da pessoa s.
 */
export function cutsFromSpeakers(captions: Caption[], cameraOfSpeaker: number[], options: Partial<AutoCutOptions> = {}): CameraCut[] {
  const { minShot } = { ...DEFAULTS, ...options };
  const cuts: CameraCut[] = [];
  for (const c of [...captions].sort((a, b) => a.start - b.start)) {
    if (c.speaker === undefined) continue;
    const camera = cameraOfSpeaker[c.speaker];
    if (!camera) continue;
    const last = cuts[cuts.length - 1];
    if (last?.camera === camera) continue;
    // Falas curtinhas no meio ("aham") não tiram a câmera de quem está falando.
    if (last && c.start - last.time < minShot) {
      if (c.end - c.start < 1.2) continue;
      cuts.push({ time: last.time + minShot, camera });
      continue;
    }
    cuts.push({ time: Math.max(0, c.start - 0.15), camera });
  }
  return cuts;
}

/** Para cada pessoa, a câmera onde a voz dela é mais alta (média do volume relativo nas falas dela). */
export function matchSpeakersToCameras(captions: Caption[], envelopes: (Float32Array | null)[], rate: number, t0: number, speakers: number): number[] {
  const scores = Array.from({ length: speakers }, () => envelopes.map(() => 0));
  const refs = envelopes.map((env) => {
    if (!env) return 1;
    const sorted = Float32Array.from(env).sort();
    return sorted[Math.floor(sorted.length * 0.75)] || 1e-4;
  });
  for (const c of captions) {
    if (c.speaker === undefined || c.speaker >= speakers) continue;
    const a = Math.max(0, Math.floor((c.start - t0) * rate));
    const b = Math.floor((c.end - t0) * rate);
    envelopes.forEach((env, cam) => {
      if (!env) return;
      let sum = 0;
      for (let i = a; i < Math.min(b, env.length); i++) sum += env[i];
      scores[c.speaker!][cam] += sum / Math.max(1, b - a) / refs[cam];
    });
  }
  // Cada pessoa numa câmera diferente (enquanto houver câmeras): os pares mais fortes primeiro.
  const result = new Array<number>(speakers).fill(0);
  const usedCameras = new Set<number>();
  const pairs = scores.flatMap((row, s) => row.map((score, cam) => ({ s, cam, score }))).sort((a, b) => b.score - a.score);
  for (const { s, cam } of pairs) {
    if (result[s] || (usedCameras.has(cam) && usedCameras.size < envelopes.filter(Boolean).length)) continue;
    result[s] = cam + 1;
    usedCameras.add(cam);
  }
  return result;
}
