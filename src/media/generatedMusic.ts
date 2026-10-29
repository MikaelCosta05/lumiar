import { t } from '../i18n';
import { renderMusic, type MusicOptions, type MusicPlan, type MusicStyle, type RenderedMusic } from './musicGen';
import { encodeWav } from './wav';

/**
 * Gera a música (num worker, para a tela não travar) e devolve o WAV. A última música gerada fica
 * guardada: ouvir e depois "Pôr na timeline" com as mesmas opções não compõe tudo de novo.
 */

export interface GeneratedMusic {
  file: File;
  plan: MusicPlan;
  lufs: number;
  peak: number;
}

/** Nomes dos estilos (para o nome do arquivo e a tela). */
export const MUSIC_STYLE_NAMES: Record<MusicStyle, string> = {
  lofi: t('Lo-fi'),
  tensao: t('Tensão / suspense'),
  epico: t('Épico / trailer'),
  terror: t('Terror analógico'),
  alegre: t('Alegre / vlog'),
  eletronico: t('Eletrônico'),
};

let worker: Worker | null = null;
let nextId = 1;
const cache = new Map<string, Promise<GeneratedMusic>>();

const keyOf = (o: MusicOptions) => [o.style, o.duration.toFixed(3), Math.round(o.bpm), o.intensity.toFixed(2), o.seed].join('|');

function inWorker(options: MusicOptions, onProgress: (fraction: number) => void): Promise<RenderedMusic> {
  if (typeof Worker === 'undefined') return renderMusic(options, onProgress);
  worker ??= new Worker(new URL('./musicGen.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const listen = (event: MessageEvent<{ id: number; progress?: number; music?: RenderedMusic; error?: string }>) => {
      const msg = event.data;
      if (msg.id !== id) return;
      if (msg.progress !== undefined) onProgress(msg.progress);
      else {
        w.removeEventListener('message', listen);
        if (msg.music) resolve(msg.music);
        else reject(new Error(msg.error ?? '?'));
      }
    };
    w.addEventListener('message', listen);
    w.postMessage({ id, options });
  });
}

export function generateMusic(options: MusicOptions, onProgress: (fraction: number) => void = () => {}): Promise<GeneratedMusic> {
  const key = keyOf(options);
  const cached = cache.get(key);
  if (cached) return cached;
  const job = inWorker(options, onProgress).then((music) => {
    const name = t('Música {style} {n}', { style: MUSIC_STYLE_NAMES[options.style].replace(/\s*\/\s*/g, ' - '), n: options.seed });
    return { file: encodeWav(music.channels, music.sampleRate, `${name}.wav`), plan: music.plan, lufs: music.lufs, peak: music.peak };
  });
  // Só a última fica guardada (cada música ocupa alguns MB).
  cache.clear();
  cache.set(key, job);
  job.catch(() => cache.delete(key));
  return job;
}
