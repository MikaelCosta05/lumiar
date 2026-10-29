import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import { t } from '../i18n';
import type { MediaItem } from '../project/model';

/**
 * Limpar o áudio: tira o ruído de fundo constante (chiado, ventilador, ar-condicionado, vento leve).
 * 1. Um filtro corta o ronco grave (abaixo de ~80 Hz), onde não há voz.
 * 2. O som é dividido em pedacinhos de frequência (FFT). O "perfil do ruído" é o nível de cada frequência
 *    nos trechos mais baixos; o que está perto desse nível é abaixado (subtração espectral).
 * 3. O ganho de cada frequência muda devagar, para não criar o som "metálico" típico desse método.
 * Gera um WAV novo; o arquivo original não é alterado.
 */

const SIZE = 2048;
const HOP = SIZE / 4;

/** FFT complexa no lugar (raiz 2). */
export function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

async function readChannels(file: File, from: number, to: number): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error(t('este arquivo não tem áudio'));
    const sink = new AudioBufferSink(track);
    const parts: AudioBuffer[] = [];
    let sampleRate = 48000;
    let first = -1;
    for await (const { buffer, timestamp } of sink.buffers(from, to)) {
      if (first < 0) first = timestamp;
      sampleRate = buffer.sampleRate;
      parts.push(buffer);
    }
    const count = Math.min(2, Math.max(1, parts[0]?.numberOfChannels ?? 1));
    const total = Math.max(1, Math.round((to - from) * sampleRate));
    const channels = Array.from({ length: count }, () => new Float32Array(total));
    let offset = Math.round((first - from) * sampleRate);
    for (const part of parts) {
      for (let c = 0; c < count; c++) {
        const data = part.getChannelData(Math.min(c, part.numberOfChannels - 1));
        for (let i = 0; i < data.length; i++) {
          const at = offset + i;
          if (at >= 0 && at < total) channels[c][at] = data[i];
        }
      }
      offset += part.length;
    }
    return { channels, sampleRate };
  } finally {
    input.dispose();
  }
}

/** Corta abaixo de ~80 Hz (ronco, vento, batidas no microfone). */
function highpass(data: Float32Array, sampleRate: number): void {
  const rc = 1 / (2 * Math.PI * 80);
  const a = rc / (rc + 1 / sampleRate);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < data.length; i++) {
    const out = a * (prevOut + data[i] - prevIn);
    prevIn = data[i];
    data[i] = out;
    prevOut = out;
  }
}

function denoiseChannel(data: Float32Array, strength: number, onProgress: (f: number) => void): Float32Array {
  const window = new Float64Array(SIZE).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SIZE));
  const frames = Math.max(1, Math.ceil((data.length - SIZE) / HOP) + 1);
  const bins = SIZE / 2 + 1;
  // 1ª passada: magnitude de cada quadro e frequência.
  const mags = new Float32Array(frames * bins);
  const energy = new Float64Array(frames);
  const re = new Float64Array(SIZE);
  const im = new Float64Array(SIZE);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < SIZE; i++) {
      re[i] = (data[f * HOP + i] ?? 0) * window[i];
      im[i] = 0;
    }
    fft(re, im, false);
    for (let k = 0; k < bins; k++) {
      const m = Math.hypot(re[k], im[k]);
      mags[f * bins + k] = m;
      energy[f] += m * m;
    }
  }
  // Perfil do ruído: média dos 10% de quadros mais baixos (onde só há o fundo).
  const order = [...energy.keys()].sort((a, b) => energy[a] - energy[b]);
  const quiet = order.slice(0, Math.max(1, Math.floor(frames * 0.1)));
  const noise = new Float64Array(bins);
  for (const f of quiet) for (let k = 0; k < bins; k++) noise[k] += mags[f * bins + k] / quiet.length;

  // 2ª passada: ganho por frequência (suavizado no tempo) e reconstrução.
  const out = new Float32Array(data.length);
  const norm = new Float32Array(data.length);
  const gains = new Float64Array(bins).fill(1);
  const over = 1 + strength * 2.5;
  const floor = Math.max(0.03, 0.25 - strength * 0.2);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < SIZE; i++) {
      re[i] = (data[f * HOP + i] ?? 0) * window[i];
      im[i] = 0;
    }
    fft(re, im, false);
    for (let k = 0; k < bins; k++) {
      const m = mags[f * bins + k];
      const target = Math.max(floor, 1 - (over * noise[k]) / Math.max(1e-9, m));
      // Sobe rápido (não come o começo das palavras) e desce devagar.
      gains[k] += (target - gains[k]) * (target > gains[k] ? 0.6 : 0.2);
      re[k] *= gains[k];
      im[k] *= gains[k];
      if (k > 0 && k < SIZE / 2) {
        re[SIZE - k] = re[k];
        im[SIZE - k] = -im[k];
      }
    }
    fft(re, im, true);
    for (let i = 0; i < SIZE; i++) {
      const at = f * HOP + i;
      if (at >= out.length) break;
      out[at] += re[i] * window[i];
      norm[at] += window[i] * window[i];
    }
    if (f % 200 === 0) onProgress(f / frames);
  }
  for (let i = 0; i < out.length; i++) out[i] = norm[i] > 1e-6 ? out[i] / norm[i] : 0;
  return out;
}

function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const frames = channels[0].length;
  const count = channels.length;
  const buffer = new ArrayBuffer(44 + frames * count * 2);
  const view = new DataView(buffer);
  const text = (o: number, s: string) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * count * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * count * 2, true);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      view.setInt16(o, Math.max(-1, Math.min(1, channels[c][i])) * 32767, true);
      o += 2;
    }
  }
  return buffer;
}

/** Limpa o trecho [from, to] do áudio da mídia. strength: 0.3 leve, 0.6 médio, 1 forte. */
export async function denoiseMedia(
  media: MediaItem,
  from: number,
  to: number,
  strength: number,
  onProgress: (fraction: number) => void,
): Promise<File> {
  onProgress(0);
  const { channels, sampleRate } = await readChannels(media.file, from, to);
  const cleaned: Float32Array[] = [];
  for (const [c, data] of channels.entries()) {
    highpass(data, sampleRate);
    cleaned.push(denoiseChannel(data, strength, (f) => onProgress((c + f) / channels.length)));
    // Deixa a interface respirar entre os canais.
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress(1);
  const name = t('{name} (limpo).wav', { name: media.name.replace(/\.[^.]+$/, '') });
  return new File([encodeWav(cleaned, sampleRate)], name, { type: 'audio/wav' });
}
