import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';

/** Batidas encontradas num trecho de áudio. */
export interface BeatAnalysis {
  /** Instantes (s) dentro do arquivo */
  beats: number[];
  bpm: number;
}

/** Resolução da análise: um valor a cada 10 ms. */
const RATE = 100;

/** Batidas que o Lumiar já sabe sem ouvir (a música que ele mesmo compôs). */
const known = new WeakMap<File, BeatAnalysis>();

/** Guarda as batidas exatas de um arquivo: detectBeats devolve essas em vez de adivinhar. */
export function rememberBeats(file: File, analysis: BeatAnalysis): void {
  known.set(file, analysis);
}

/**
 * Encontra as batidas da música no trecho [from, to] do arquivo.
 * 1. Mede a energia a cada 10 ms (graves pesam mais: bumbo e baixo marcam o ritmo).
 * 2. Os "ataques" são as subidas bruscas de energia.
 * 3. O andamento (BPM) sai da autocorrelação dos ataques, preferindo a faixa de 90 a 140.
 * 4. As batidas seguem esse andamento, cada uma ajustada ao ataque mais forte por perto
 *    (a música pode acelerar ou atrasar um pouco).
 */
export async function detectBeats(file: File, from: number, to: number): Promise<BeatAnalysis> {
  const exact = known.get(file);
  if (exact) return { beats: exact.beats.filter((b) => b >= from - 1e-6 && b <= to + 1e-6), bpm: exact.bpm };
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const length = Math.max(1, Math.ceil((to - from) * RATE));
  const low = new Float32Array(length);
  const full = new Float32Array(length);
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return { beats: [], bpm: 0 };
    const sink = new AudioBufferSink(track);
    // Filtro passa-baixa simples (~150 Hz), contínuo entre os pedaços de áudio.
    let lp = 0;
    for await (const { buffer, timestamp } of sink.buffers(from, to)) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
      const alpha = 1 - Math.exp((-2 * Math.PI * 150) / buffer.sampleRate);
      const perHop = buffer.sampleRate / RATE;
      for (let i = 0; i < buffer.length; i++) {
        let v = 0;
        for (const data of channels) v += data[i];
        v /= channels.length;
        lp += alpha * (v - lp);
        const index = Math.floor((timestamp - from) * RATE + i / perHop);
        if (index < 0 || index >= length) continue;
        low[index] += lp * lp;
        full[index] += v * v;
      }
    }
  } finally {
    input.dispose();
  }

  // Ataques: quanto a energia (em escala de log) subiu em relação ao instante anterior.
  const onset = new Float32Array(length);
  let total = 0;
  for (let i = 1; i < length; i++) {
    const dl = Math.log1p(low[i] * 1000) - Math.log1p(low[i - 1] * 1000);
    const df = Math.log1p(full[i] * 1000) - Math.log1p(full[i - 1] * 1000);
    onset[i] = Math.max(0, dl) * 0.65 + Math.max(0, df) * 0.35;
    total += onset[i];
  }
  if (total / length < 1e-4) return { beats: [], bpm: 0 };
  // Tira a média local: sobra o que se destaca do resto da música.
  const prefix = new Float64Array(length + 1);
  for (let i = 0; i < length; i++) prefix[i + 1] = prefix[i] + onset[i];
  const flux = new Float32Array(length);
  const win = 25;
  for (let i = 0; i < length; i++) {
    const lo = Math.max(0, i - win);
    const hi = Math.min(length, i + win + 1);
    flux[i] = Math.max(0, onset[i] - (prefix[hi] - prefix[lo]) / (hi - lo));
  }

  // Andamento: o atraso em que os ataques mais se repetem (60 a 200 BPM).
  let bestLag = 50;
  let bestScore = -1;
  const scores = new Map<number, number>();
  for (let lag = 30; lag <= 100; lag++) {
    let s = 0;
    for (let i = lag; i < length; i++) s += flux[i] * flux[i - lag];
    const bpm = (60 * RATE) / lag;
    // Leve preferência pelos andamentos mais comuns (evita achar o dobro ou a metade).
    const weight = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 118) / 0.6, 2));
    const score = (s / (length - lag)) * weight;
    scores.set(lag, score);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  // Refina entre dois atrasos vizinhos (parábola).
  const a = scores.get(bestLag - 1) ?? bestScore;
  const c = scores.get(bestLag + 1) ?? bestScore;
  const denom = a - 2 * bestScore + c;
  const period = bestLag + (denom < 0 ? (0.5 * (a - c)) / denom : 0);

  // Fase: onde a grade de batidas pega mais ataques.
  let phase = 0;
  let phaseScore = -1;
  for (let p = 0; p < period; p++) {
    let s = 0;
    for (let x = p; x < length; x += period) s += flux[Math.round(x)] ?? 0;
    if (s > phaseScore) {
      phaseScore = s;
      phase = p;
    }
  }

  // Segue a grade, deixando cada batida escorregar até ±8% do período para o ataque mais forte.
  const beats: number[] = [];
  const reach = Math.max(2, Math.round(period * 0.08));
  let x = phase;
  while (x < length) {
    const center = Math.round(x);
    let best = center;
    for (let i = Math.max(0, center - reach); i <= Math.min(length - 1, center + reach); i++) {
      if (flux[i] > flux[best] * 1.0001) best = i;
    }
    const strong = flux[best] > 0;
    const at = strong ? best : center;
    beats.push(from + at / RATE);
    x = at + period;
  }
  return { beats: beats.filter((b) => b <= to), bpm: Math.round(((60 * RATE) / period) * 10) / 10 };
}
