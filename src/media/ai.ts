import { assetUrl } from '../assetUrl';
import { t } from '../i18n';
import type { AiMessage, AiRequest, AiVars } from './ai.worker';
import type { SamRequest, SamResult } from './objectSam';
import { IDLE_DEFAULT, IdleResource } from './idleRelease';

/** As mensagens do worker chegam em português (lá não há dicionário): traduz aqui, junto com os valores em texto. */
const translate = (text: string, vars?: AiVars) =>
  t(text, vars && Object.fromEntries(Object.entries(vars).map(([key, value]) => [key, typeof value === 'string' ? t(value) : value])));

export type AiProgress = (stage: string, fraction: number | null) => void;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: AiProgress };

let nextId = 1;
const pending = new Map<number, Pending>();

/**
 * O worker guarda todos os modelos que já usou (tradução, CLIP, profundidade, separador de voz, SAM…), centenas de
 * MB no total. Parado, ele é desligado (o que libera tudo de verdade, até a memória do WebAssembly) e volta a
 * carregar sozinho no próximo pedido, do cache no disco.
 */
const workerResource = new IdleResource<Worker>({ create: createWorker, release: (w) => w.terminate(), idleMs: IDLE_DEFAULT });

/**
 * Quanto tempo o worker fica carregado depois de cada tarefa. A profundidade vem do preview a cada quadro novo e a
 * seleção de objeto, de cliques seguidos: ficam mais (recarregar no meio da edição atrasaria a imagem).
 */
const KEEP: Partial<Record<AiRequest['task'], number>> = { depth: 5 * 60_000, sam: 3 * 60_000 };

function createWorker(): Worker {
  const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<AiMessage>) => {
    const msg = event.data;
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'progress') p.onProgress?.(translate(msg.stage, msg.vars), msg.fraction);
    else {
      pending.delete(msg.id);
      if (msg.type === 'done') p.resolve(msg.result);
      else p.reject(new Error(translate(msg.message, msg.vars)));
    }
  };
  worker.onerror = (event) => {
    pending.forEach((p) => p.reject(new Error(event.message || t('Falha no modelo de IA.'))));
    pending.clear();
    workerResource.drop();
  };
  return worker;
}

type WithoutId<T> = T extends unknown ? Omit<T, 'id' | 'baseUrl'> : never;

function run<T>(request: WithoutId<AiRequest>, onProgress?: AiProgress, transfer: Transferable[] = []): Promise<T> {
  const id = nextId++;
  // O worker não é desligado enquanto houver pedido esperando resposta.
  return workerResource.use(
    (worker) =>
      new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
        worker.postMessage({ ...request, id, baseUrl: assetUrl('') } as AiRequest, transfer);
      }),
    KEEP[request.task] ?? IDLE_DEFAULT,
  );
}

/** Idiomas das legendas traduzidas (o modelo de tradução passa pelo inglês). */
export const TRANSLATE_LANGUAGES = [
  { id: 'en', label: t('Inglês') },
  { id: 'es', label: t('Espanhol') },
  { id: 'fr', label: t('Francês') },
  { id: 'it', label: t('Italiano') },
  { id: 'pt', label: t('Português') },
];

/**
 * Traduz frases. `from` = idioma da fala (pt, es, fr, it, en); o caminho passa pelo inglês quando os
 * dois idiomas não são o inglês (ex.: português → espanhol).
 */
export async function translateTexts(texts: string[], from: string, to: string, onProgress?: AiProgress): Promise<string[]> {
  if (from === to || !texts.length) return texts;
  const english = from === 'en' ? texts : await run<string[]>({ task: 'translate', texts, from: 'romance', to: 'en' }, onProgress);
  if (to === 'en') return english;
  return run<string[]>({ task: 'translate', texts: english, from: 'en', to }, onProgress);
}

/** Vetores (CLIP) de imagens: dá para comparar com textos ("praia", "cachorro"). */
export function embedImages(images: ImageData[], onProgress?: AiProgress): Promise<Float32Array[]> {
  return run<Float32Array[]>({ task: 'clip-image', images }, onProgress);
}

/** Vetores (CLIP) de textos em inglês. */
export function embedTexts(texts: string[], onProgress?: AiProgress): Promise<Float32Array[]> {
  return run<Float32Array[]>({ task: 'clip-text', texts }, onProgress);
}

/** Mapa de profundidade de uma foto (claro = perto), em tons de cinza. */
export function estimateDepth(image: ImageData, onProgress?: AiProgress): Promise<{ data: Uint8Array; width: number; height: number }> {
  return run({ task: 'depth', image }, onProgress);
}

/** Separa a voz do resto (música, ruído). Áudio estéreo a 44,1 kHz. */
export function separateVoice(left: Float32Array, right: Float32Array, onProgress?: AiProgress): Promise<{ voice: Float32Array[]; rest: Float32Array[] }> {
  return run({ task: 'separate', left, right }, onProgress, [left.buffer, right.buffer]);
}

/** Foto com o dobro da resolução (os detalhes são recriados pela IA). */
export function upscaleImage(image: ImageData, onProgress?: AiProgress): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  return run({ task: 'upscale', image }, onProgress);
}

/** Selecionar objeto (SlimSAM): as três máscaras candidatas para os pontos marcados no quadro. */
export function segmentObject(request: SamRequest, onProgress?: AiProgress): Promise<SamResult> {
  return run({ task: 'sam', ...request }, onProgress);
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
