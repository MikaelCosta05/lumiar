import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { assetUrl } from '../assetUrl';
import { blockTelemetry } from './tracking';

/**
 * Remover o fundo: o MediaPipe separa a pessoa do resto em cada quadro (modelo "selfie", ~250 KB),
 * no computador, sem tela verde. A máscara volta como uma imagem pequena (branco = pessoa).
 */
let segmenter: ImageSegmenter | null = null;
let loading: Promise<ImageSegmenter> | null = null;
const listeners = new Set<() => void>();

export function loadSegmenter(): Promise<ImageSegmenter> {
  if (!loading) {
    blockTelemetry();
    loading = FilesetResolver.forVisionTasks(assetUrl('mediapipe')).then((fileset) =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: assetUrl('models/selfie_segmenter.tflite') },
        runningMode: 'IMAGE',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      }),
    );
    loading.then((s) => {
      segmenter = s;
      listeners.forEach((l) => l());
    }).catch(() => (loading = null));
  }
  return loading;
}

/** Avisa quando o modelo terminar de carregar (para redesenhar o quadro). */
export function onSegmenterReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tamanho da imagem enviada ao modelo (ele trabalha em 256×256). */
const INPUT = 256;

const input = document.createElement('canvas');
const inputCtx = input.getContext('2d', { willReadFrequently: true })!;

/** Últimas máscaras, por chave (clipe + instante): pausado, o quadro não é analisado de novo. */
const cache = new Map<string, HTMLCanvasElement>();

/**
 * Máscara da pessoa no quadro (null enquanto o modelo carrega).
 * `key` identifica o quadro (ex.: id do clipe + tempo) para reaproveitar.
 * `remember` = false não guarda no cache (as prévias guardam as delas, sem tirar o lugar das do editor).
 */
export function segmentFrame(source: CanvasImageSource, width: number, height: number, key: string, remember = true): HTMLCanvasElement | null {
  const cached = cache.get(key);
  if (cached) return cached;
  if (!segmenter) {
    void loadSegmenter();
    return null;
  }
  // A mídia é reduzida mantendo a proporção (a máscara depois volta ao tamanho dela).
  const scale = INPUT / Math.max(width, height);
  input.width = Math.max(16, Math.round(width * scale));
  input.height = Math.max(16, Math.round(height * scale));
  inputCtx.drawImage(source, 0, 0, input.width, input.height);
  const result = segmenter.segment(input);
  const mask = result.confidenceMasks?.[0];
  if (!mask) {
    result.close();
    return null;
  }
  const values = mask.getAsFloat32Array();
  const out = document.createElement('canvas');
  out.width = mask.width;
  out.height = mask.height;
  const ctx = out.getContext('2d')!;
  const image = ctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < values.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, values[i])) * 255);
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  result.close();
  if (!remember) return out;
  cache.set(key, out);
  if (cache.size > 90) cache.delete(cache.keys().next().value!);
  return out;
}
