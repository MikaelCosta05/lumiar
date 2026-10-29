import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import { fft } from './denoise';

/** Resolução das análises de som: 100 valores por segundo. */
export const ENVELOPE_RATE = 100;

/** Volume (RMS) do trecho [from, to] do arquivo, 100 vezes por segundo. */
export async function loudness(file: File, from: number, to: number): Promise<Float32Array> {
  const length = Math.max(1, Math.ceil((to - from) * ENVELOPE_RATE));
  const sum = new Float64Array(length);
  const count = new Uint32Array(length);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return new Float32Array(length);
    const sink = new AudioBufferSink(track);
    for await (const { buffer, timestamp } of sink.buffers(from, to)) {
      const data = buffer.getChannelData(0);
      const perHop = buffer.sampleRate / ENVELOPE_RATE;
      for (let i = 0; i < data.length; i++) {
        const index = Math.floor((timestamp - from) * ENVELOPE_RATE + i / perHop);
        if (index < 0 || index >= length) continue;
        sum[index] += data[i] * data[i];
        count[index]++;
      }
    }
  } finally {
    input.dispose();
  }
  return Float32Array.from(sum, (s, i) => Math.sqrt(s / Math.max(1, count[i])));
}

/** "Ataques" do som (subidas de volume): o que dá para comparar entre dois microfones diferentes. */
function onsets(env: Float32Array): Float64Array {
  const out = new Float64Array(env.length);
  for (let i = 1; i < env.length; i++) out[i] = Math.max(0, Math.log1p(env[i] * 200) - Math.log1p(env[i - 1] * 200));
  const mean = out.reduce((a, b) => a + b, 0) / Math.max(1, out.length);
  for (let i = 0; i < out.length; i++) out[i] -= mean;
  return out;
}

/**
 * Onde o som B começa em relação ao som A (segundos; negativo = B começou antes),
 * comparando os ataques dos dois (correlação cruzada pela FFT).
 * `confidence`: o quanto o melhor encaixe se destaca dos outros (abaixo de ~3 é duvidoso).
 */
export function findOffset(a: Float32Array, b: Float32Array): { offset: number; confidence: number } {
  const x = onsets(a);
  const y = onsets(b);
  let size = 1;
  while (size < x.length + y.length) size <<= 1;
  const ar = new Float64Array(size);
  const ai = new Float64Array(size);
  const br = new Float64Array(size);
  const bi = new Float64Array(size);
  ar.set(x);
  br.set(y);
  fft(ar, ai, false);
  fft(br, bi, false);
  // A · conj(B)
  for (let k = 0; k < size; k++) {
    const re = ar[k] * br[k] + ai[k] * bi[k];
    const im = ai[k] * br[k] - ar[k] * bi[k];
    ar[k] = re;
    ai[k] = im;
  }
  fft(ar, ai, true);
  let best = 0;
  let bestValue = -Infinity;
  let sum = 0;
  let sumSq = 0;
  for (let k = 0; k < size; k++) {
    const lag = k < size / 2 ? k : k - size;
    // Só atrasos possíveis (os dois sons precisam se sobrepor).
    if (lag > x.length || -lag > y.length) continue;
    const v = ar[k];
    sum += v;
    sumSq += v * v;
    if (v > bestValue) {
      bestValue = v;
      best = lag;
    }
  }
  const n = size;
  const std = Math.sqrt(Math.max(1e-12, sumSq / n - (sum / n) ** 2));
  return { offset: best / ENVELOPE_RATE, confidence: (bestValue - sum / n) / std };
}
