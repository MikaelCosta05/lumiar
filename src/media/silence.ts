import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';

/** Resolução da análise: um valor a cada 20 ms. */
const RATE = 50;

export interface SilenceOptions {
  /** Pausas menores que isso ficam (s) */
  minSilence?: number;
  /** Folga deixada antes e depois de cada fala (s), para não cortar o começo das palavras */
  padding?: number;
}

/**
 * Encontra os trechos com som (fala) em [from, to] do arquivo, para cortar as pausas.
 * O limite entre "silêncio" e "fala" se adapta ao arquivo: fica entre o ruído de fundo
 * (os 10% mais baixos) e a voz (os 10% mais altos).
 * Devolve os trechos que ficam, em segundos dentro do arquivo.
 */
export async function findSpeech(file: File, from: number, to: number, options: SilenceOptions = {}): Promise<[number, number][]> {
  const minSilence = options.minSilence ?? 0.5;
  const padding = options.padding ?? 0.12;
  const length = Math.max(1, Math.ceil((to - from) * RATE));
  const energy = new Float64Array(length);
  const counts = new Uint32Array(length);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return [[from, to]];
    const sink = new AudioBufferSink(track);
    for await (const { buffer, timestamp } of sink.buffers(from, to)) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
      const perHop = buffer.sampleRate / RATE;
      for (let i = 0; i < buffer.length; i++) {
        const index = Math.floor((timestamp - from) * RATE + i / perHop);
        if (index < 0 || index >= length) continue;
        let v = 0;
        for (const data of channels) v += data[i];
        v /= channels.length;
        energy[index] += v * v;
        counts[index]++;
      }
    }
  } finally {
    input.dispose();
  }

  // Volume em dB de cada janela.
  const db = Array.from(energy, (e, i) => 10 * Math.log10(e / Math.max(1, counts[i]) + 1e-10));
  const sorted = [...db].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const loud = sorted[Math.floor(sorted.length * 0.9)];
  // Áudio quase todo no mesmo nível (música, silêncio total): não há pausas para cortar.
  if (loud - floor < 10) return [[from, to]];
  const threshold = Math.max(-55, floor + (loud - floor) * 0.3);

  // Trechos com som; pausas curtas entre eles não contam.
  const ranges: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= length; i++) {
    const voiced = i < length && db[i] > threshold;
    if (voiced && start < 0) start = i;
    if (!voiced && start >= 0) {
      ranges.push([start / RATE, i / RATE]);
      start = -1;
    }
  }
  const kept: [number, number][] = [];
  for (const [a, b] of ranges) {
    const last = kept[kept.length - 1];
    if (last && a - last[1] < minSilence) last[1] = b;
    else kept.push([a, b]);
  }
  // Barulhinhos isolados (um clique, uma respiração) também saem.
  return kept
    .filter(([a, b]) => b - a >= 0.12)
    .map(([a, b]): [number, number] => [Math.max(from, from + a - padding), Math.min(to, from + b + padding)])
    .reduce<[number, number][]>((list, range) => {
      const last = list[list.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else list.push(range);
      return list;
    }, []);
}
