/**
 * Volume no padrão das plataformas: mede a sonoridade (LUFS, norma ITU-R BS.1770, a mesma que o
 * YouTube e o Spotify usam) e ajusta o ganho para o alvo, com um limitador que segura os picos
 * abaixo de -1 dB. Assim o vídeo não sai baixo nem é abaixado (e distorcido) pela plataforma.
 */

import { t } from '../i18n';

export type LoudnessTarget ='off' | 'youtube' | 'podcast' | 'broadcast';

export const LOUDNESS_TARGETS: Record<Exclude<LoudnessTarget, 'off'>, { lufs: number; label: string; hint: string }> = {
  youtube: { lufs: -14, label: t('Redes (-14)'), hint: 'YouTube, Instagram, TikTok, Spotify' },
  podcast: { lufs: -16, label: 'Podcast (-16)', hint: t('Apple Podcasts e plataformas de áudio falado') },
  broadcast: { lufs: -23, label: 'TV (-23)', hint: t('Padrão de televisão (EBU R128)') },
};

/**
 * Coeficientes dos dois estágios do filtro "K" (b = numerador, a = denominador sem o 1 inicial).
 * Também usados pelo medidor ao vivo do mixer (IIRFilterNode), para medir igual à exportação.
 */
export function kWeightStages(rate: number): { b: number[]; a: number[] }[] {
  // Estágio 1: prateleira de agudos (+4 dB acima de ~1,7 kHz).
  const shelf = (() => {
    const f0 = 1681.974450955533;
    const G = 3.999843853973347;
    const Q = 0.7071752369554196;
    const K = Math.tan((Math.PI * f0) / rate);
    const Vh = 10 ** (G / 20);
    const Vb = Vh ** 0.4996667741545416;
    const a0 = 1 + K / Q + K * K;
    return { b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0], a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  })();
  // Estágio 2: passa-altas em ~38 Hz.
  const highpass = (() => {
    const f0 = 38.13547087602444;
    const Q = 0.5003270373238773;
    const K = Math.tan((Math.PI * f0) / rate);
    const a0 = 1 + K / Q + K * K;
    return { b: [1, -2, 1], a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  })();
  return [shelf, highpass];
}

/** Sonoridade (LUFS) de um bloco, a partir da soma das médias dos quadrados de cada canal já filtrados. */
export function lufsOf(meanSquare: number): number {
  return meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -Infinity;
}

/** Filtro "K" da norma (realce dos agudos como o ouvido percebe + corte dos graves muito baixos). */
function kWeight(data: Float32Array, rate: number): Float32Array {
  const [shelf, highpass] = kWeightStages(rate);
  const out = new Float32Array(data.length);
  const biquad = (x: Float32Array, y: Float32Array, b: number[], a: number[]) => {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = v;
      y[i] = v;
    }
  };
  biquad(data, out, shelf.b, shelf.a);
  biquad(Float32Array.from(out), out, highpass.b, highpass.a);
  return out;
}

/** Sonoridade integrada (LUFS) do áudio, com os portões absoluto (-70) e relativo (-10 LU). */
export function measureLufs(buffer: AudioBuffer): number {
  const rate = buffer.sampleRate;
  const weighted = Array.from({ length: buffer.numberOfChannels }, (_, c) => kWeight(buffer.getChannelData(c), rate));
  const block = Math.round(rate * 0.4);
  const step = Math.round(rate * 0.1);
  const blocks: number[] = [];
  for (let start = 0; start + block <= buffer.length; start += step) {
    let sum = 0;
    for (const ch of weighted) {
      let s = 0;
      for (let i = start; i < start + block; i++) s += ch[i] * ch[i];
      sum += s / block;
    }
    blocks.push(sum);
  }
  const loud = (ms: number) => -0.691 + 10 * Math.log10(ms);
  const absolute = blocks.filter((ms) => loud(ms) > -70);
  if (!absolute.length) return -Infinity;
  const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
  const relativeGate = loud(mean(absolute)) - 10;
  const gated = absolute.filter((ms) => loud(ms) > relativeGate);
  return loud(mean(gated.length ? gated : absolute));
}

/**
 * Leva o áudio até `target` LUFS. Se o ganho fizer algum pico passar de -1 dB, um limitador com
 * antecipação de 5 ms abaixa só aquele trecho (sem estourar). Muda o buffer no lugar.
 */
export function normalizeLoudness(buffer: AudioBuffer, target: number): { before: number; gain: number } {
  const before = measureLufs(buffer);
  if (!Number.isFinite(before)) return { before, gain: 1 };
  const gain = 10 ** ((target - before) / 20);
  const ceiling = 10 ** (-1 / 20);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const n = buffer.length;
  // Ganho necessário em cada amostra para não passar do teto.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let peak = 0;
    for (const ch of channels) peak = Math.max(peak, Math.abs(ch[i]));
    need[i] = peak * gain > ceiling ? ceiling / (peak * gain) : 1;
  }
  // Antecipação (o ganho já desce antes do pico) e soltura suave depois dele.
  const look = Math.round(buffer.sampleRate * 0.005);
  const release = Math.exp(-1 / (buffer.sampleRate * 0.08));
  const env = new Float32Array(n);
  let g = 1;
  // Mínimo móvel na janela à frente (deque monotônico).
  const deque: number[] = [];
  let head = 0;
  for (let i = 0; i < n + look; i++) {
    if (i < n) {
      while (deque.length > head && need[deque[deque.length - 1]] >= need[i]) deque.pop();
      deque.push(i);
    }
    const j = i - look;
    if (j < 0) continue;
    while (deque[head] < j) head++;
    const target = need[deque[head]];
    g = target < g ? target : target - (target - g) * release;
    env[j] = g;
    if (head > 4096) {
      deque.splice(0, head);
      head = 0;
    }
  }
  for (const ch of channels) for (let i = 0; i < n; i++) ch[i] *= gain * env[i];
  return { before, gain };
}
