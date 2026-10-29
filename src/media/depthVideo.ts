import { estimateDepth } from './ai';

/**
 * Profundidade dos quadros de vídeo (efeitos de céu, foco e neblina), pela mesma IA da Foto 3D.
 * Cada quadro leva um tempo: no preview, enquanto o quadro novo é calculado, vale o último do
 * mesmo clipe; na exportação, cada instante espera o seu (com um cálculo a cada 1/10 s).
 */

/** Lado maior da imagem enviada à IA (menor = mais rápido; a profundidade não precisa de detalhe). */
const INPUT = 384;

const cache = new Map<string, HTMLCanvasElement>();
/** Último mapa pronto de cada clipe (usado enquanto o do instante atual não fica pronto) */
const latest = new Map<string, HTMLCanvasElement>();
const listeners = new Set<() => void>();
let busy = false;
let waiting: { key: string; clip: string; image: ImageData } | null = null;
let failed = false;

/** Avisa quando um mapa novo fica pronto (para redesenhar o quadro). */
export function onDepthReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function toImageData(source: CanvasImageSource, width: number, height: number): ImageData {
  const scale = Math.min(1, INPUT / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(16, Math.round(width * scale));
  canvas.height = Math.max(16, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function toCanvas(depth: { data: Uint8Array; width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = depth.width;
  canvas.height = depth.height;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(depth.width, depth.height);
  for (let i = 0; i < depth.data.length; i++) {
    const v = depth.data[i];
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function remember(key: string, clip: string, canvas: HTMLCanvasElement): void {
  cache.set(key, canvas);
  latest.set(clip, canvas);
  if (cache.size > 120) cache.delete(cache.keys().next().value!);
}

async function work(): Promise<void> {
  if (busy || !waiting || failed) return;
  busy = true;
  const job = waiting;
  waiting = null;
  try {
    const depth = await estimateDepth(job.image);
    remember(job.key, job.clip, toCanvas(depth));
    listeners.forEach((l) => l());
  } catch (error) {
    // Sem internet na primeira vez ou modelo indisponível: os efeitos usam a estimativa simples.
    console.warn('[Lumiar] profundidade indisponível', error);
    failed = true;
  } finally {
    busy = false;
    void work();
  }
}

/**
 * Mapa de profundidade do quadro (preview): o do instante, se já existe; senão o último do clipe
 * (ou null) e o cálculo começa em segundo plano. Só o pedido mais recente é atendido.
 */
export function depthFrame(source: CanvasImageSource, width: number, height: number, clip: string, key: string): HTMLCanvasElement | null {
  const found = cache.get(key);
  if (found) return found;
  if (!failed && waiting?.key !== key) {
    waiting = { key, clip, image: toImageData(source, width, height) };
    void work();
  }
  return latest.get(clip) ?? null;
}

/** Mapa de profundidade do quadro, esperando o cálculo (exportação). */
export async function depthFrameNow(source: CanvasImageSource, width: number, height: number, clip: string, key: string): Promise<HTMLCanvasElement | null> {
  const found = cache.get(key);
  if (found) return found;
  if (failed) return latest.get(clip) ?? null;
  try {
    const canvas = toCanvas(await estimateDepth(toImageData(source, width, height)));
    remember(key, clip, canvas);
    return canvas;
  } catch (error) {
    console.warn('[Lumiar] profundidade indisponível', error);
    failed = true;
    return latest.get(clip) ?? null;
  }
}
