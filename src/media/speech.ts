import { AudioBufferSource, BufferTarget, Output, WavOutputFormat } from 'mediabunny';
import { assetUrl } from '../assetUrl';
import type { SpeakMessage, SpeakRequest } from './tts.worker';

/** Vozes sintéticas guardadas no app (public/models/tts), funcionam sem internet. */
export const VOICES = [
  { id: 'Xenova/mms-tts-por', label: 'Português' },
  { id: 'Xenova/mms-tts-eng', label: 'English' },
  { id: 'Xenova/mms-tts-spa', label: 'Español' },
];

let worker: Worker | null = null;
/** Um pedido por vez (o worker responde na ordem). */
let queue: Promise<unknown> = Promise.resolve();

/** Transforma texto em fala e devolve um arquivo WAV. */
export function speak(text: string, model: string, onLoading?: (fraction: number) => void): Promise<File> {
  const run = async () => {
    worker ??= new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' });
    const w = worker;
    const { audio, sampleRate } = await new Promise<{ audio: Float32Array; sampleRate: number }>((resolve, reject) => {
      w.onmessage = (event: MessageEvent<SpeakMessage>) => {
        const msg = event.data;
        if (msg.type === 'loading') onLoading?.(msg.fraction);
        else if (msg.type === 'done') resolve(msg);
        else reject(new Error(msg.message));
      };
      const request: SpeakRequest = { text, model, baseUrl: assetUrl('') };
      w.postMessage(request);
    });
    return new File([await encodeWav(audio, sampleRate)], `${fileName(text)}.wav`, { type: 'audio/wav' });
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

function fileName(text: string): string {
  const words = text.replace(/[\\/:*?"<>|\n]+/g, ' ').trim().split(/\s+/).slice(0, 5).join(' ');
  return `Voz · ${words || 'texto'}`;
}

async function encodeWav(samples: Float32Array, sampleRate: number): Promise<Blob> {
  // Um respiro de 0,15 s antes e depois deixa os cortes mais naturais.
  const pad = Math.round(sampleRate * 0.15);
  const buffer = new AudioBuffer({ numberOfChannels: 1, length: samples.length + pad * 2, sampleRate });
  buffer.copyToChannel(normalize(samples), 0, pad);
  const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() });
  const source = new AudioBufferSource({ codec: 'pcm-s16', bitrate: 1 });
  output.addAudioTrack(source);
  await output.start();
  await source.add(buffer);
  source.close();
  await output.finalize();
  return new Blob([(output.target as BufferTarget).buffer!], { type: 'audio/wav' });
}

/** Deixa o pico em -1 dB (a voz sintética sai baixa). */
function normalize(samples: Float32Array): Float32Array<ArrayBuffer> {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.89 / peak : 1;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}
