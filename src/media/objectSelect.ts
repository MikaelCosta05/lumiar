import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { t } from '../i18n';
import type { MediaItem, VideoClip } from '../project/model';
import {
  blendPlan,
  chooseMask,
  decodeMask,
  deepestPoint,
  maskFrame,
  maskIou,
  maskSize,
  maskStats,
  propagationPrompt,
  renderBlend,
  sampleTimes,
  shiftMask,
  trackedAt,
  isObjectSelection,
  type ObjectMaskFrame,
  type ObjectPoint,
  type ObjectSelection,
} from '../project/objectMask';
import { segmentObject, type AiProgress } from './ai';
import { assets } from './assets';
import { trackPoint } from './tracking';

/**
 * Selecionar um objeto com cliques: o quadro para a IA, a máscara de cada clique e o objeto seguido
 * ao longo do clipe. Depois de pronta, a máscara entra no lugar da pessoa (player e exportação).
 */

/** Lado maior do quadro enviado à IA (ela trabalha em 1024). */
const FRAME_SIDE = 1024;
/** Clipes mais longos que isso não passam pelo rastreador de pontos (ele guarda todos os quadros na memória). */
const TRACK_LIMIT = 30;

// ---------------------------------------------------------------- Máscara no player e na exportação

/** O clipe usa o objeto selecionado no lugar da pessoa? */
export function usesObjectMask(clip: Pick<VideoClip, 'object' | 'mediaId'>): boolean {
  const o = clip.object;
  return !!o?.use && isObjectSelection(o) && o.frames.length > 0 && (!o.mediaId || o.mediaId === clip.mediaId);
}

/** Máscaras já abertas (RLE → pixels), por seleção: abrir é rápido, mas não precisa ser a cada quadro. */
const decoded = new WeakMap<ObjectSelection, Map<number, Uint8Array>>();
/** Últimas máscaras montadas, por seleção e instante (pausado, o quadro não é montado de novo). */
const built = new WeakMap<ObjectSelection, Map<number, HTMLCanvasElement>>();

function bitsOf(selection: ObjectSelection, index: number): Uint8Array {
  let map = decoded.get(selection);
  if (!map) decoded.set(selection, (map = new Map()));
  let bits = map.get(index);
  if (!bits) {
    bits = decodeMask(selection.frames[index].rle, selection.width * selection.height);
    map.set(index, bits);
    // Clipes longos: guarda só as mais recentes.
    if (map.size > 64) map.delete(map.keys().next().value!);
  }
  return bits;
}

/** Máscara do objeto no instante `sourceTime` do arquivo (branco = objeto), no formato da máscara da pessoa. */
export function objectMaskAt(selection: ObjectSelection, sourceTime: number): HTMLCanvasElement | null {
  const plan = blendPlan(selection.frames, sourceTime);
  if (!plan) return null;
  let cache = built.get(selection);
  if (!cache) built.set(selection, (cache = new Map()));
  const key = Math.round(sourceTime * 60);
  const cached = cache.get(key);
  if (cached) return cached;
  const { width, height } = selection;
  const gray = renderBlend(plan, bitsOf(selection, plan.a), bitsOf(selection, plan.b), width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(width, height);
  for (let i = 0; i < gray.length; i++) {
    image.data[i * 4] = gray[i];
    image.data[i * 4 + 1] = gray[i];
    image.data[i * 4 + 2] = gray[i];
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  cache.set(key, canvas);
  if (cache.size > 90) cache.delete(cache.keys().next().value!);
  return canvas;
}

/**
 * A máscara que os efeitos de pessoa recebem: a do objeto selecionado (se o clipe usa) ou a da pessoa.
 * `person` só é chamada quando é a pessoa (o modelo da pessoa nem precisa rodar).
 */
export function objectOrPerson<T>(clip: Pick<VideoClip, 'object' | 'mediaId'>, sourceTime: number, person: () => T): T | HTMLCanvasElement | null {
  return usesObjectMask(clip) ? objectMaskAt(clip.object!, sourceTime) : person();
}

// ---------------------------------------------------------------- Quadros para a IA

function frameSize(width: number, height: number) {
  const scale = Math.min(1, FRAME_SIDE / Math.max(1, width, height));
  return { width: Math.max(16, Math.round(width * scale)), height: Math.max(16, Math.round(height * scale)) };
}

function imageDataOf(canvas: HTMLCanvasElement | OffscreenCanvas): ImageData {
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** O quadro da mídia no instante `sourceTime`, no tamanho que a IA usa. */
export async function objectFrame(media: MediaItem, sourceTime: number): Promise<ImageData> {
  if (media.kind === 'image') {
    const bitmap = assets.bitmaps.get(media.id);
    if (!bitmap) throw new Error(t('A imagem ainda não carregou. Tente de novo.'));
    const size = frameSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d', { willReadFrequently: true })!.drawImage(bitmap, 0, 0, size.width, size.height);
    return imageDataOf(canvas);
  }
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media.file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error(t('Este arquivo não tem vídeo.'));
    const first = await track.getFirstTimestamp();
    const sink = new CanvasSink(track, { ...frameSize(track.displayWidth, track.displayHeight), fit: 'fill' });
    const frame = await sink.getCanvas(Math.max(first, sourceTime));
    if (!frame) throw new Error(t('Não foi possível ler esse quadro.'));
    return imageDataOf(frame.canvas);
  } finally {
    input.dispose();
  }
}

/** Melhor máscara da IA para os pontos (binária, no tamanho da máscara guardada). */
export async function maskForPoints(
  image: ImageData,
  key: string,
  points: ObjectPoint[],
  size: { width: number; height: number },
  predicted?: Uint8Array | null,
  onProgress?: AiProgress,
): Promise<Uint8Array> {
  const n = size.width * size.height;
  if (!points.some((p) => p.include)) return new Uint8Array(n);
  const result = await segmentObject({ key, image, points, width: size.width, height: size.height }, onProgress);
  const candidates = result.scores.map((score, i) => ({ score, bits: result.masks.subarray(i * n, (i + 1) * n) }));
  const best = chooseMask(candidates, size.width, size.height, points, predicted);
  return Uint8Array.from(candidates[Math.max(0, best)].bits);
}

// ---------------------------------------------------------------- Seguir o objeto pelo clipe

export interface PropagateStart {
  /** Instante do arquivo em que os pontos foram marcados */
  at: number;
  points: ObjectPoint[];
  /** Máscara aprovada pela pessoa nesse instante */
  bits: Uint8Array;
}

/**
 * Segue o objeto pelo trecho [from, to] do arquivo. Um ponto bem no meio do objeto é rastreado quadro
 * a quadro (o rastreador de pontos do Lumiar); em cada amostra, a máscara anterior anda junto com ele
 * (a "previsão"), a IA recebe o ponto mais interno da previsão e o ponto rastreado, e das três máscaras
 * que ela devolve fica a que mais bate com a previsão. Se nenhuma bate (o objeto sumiu atrás de algo),
 * vale a previsão. Para frente e para trás a partir do quadro marcado.
 */
export async function propagateObject(
  media: MediaItem,
  from: number,
  to: number,
  start: PropagateStart,
  onProgress: (stage: string, fraction: number | null) => void,
  signal: AbortSignal,
): Promise<ObjectSelection> {
  const size = maskSize(media.width, media.height);
  const { width, height } = size;
  const selection = (frames: ObjectMaskFrame[]): ObjectSelection => ({ use: true, mediaId: media.id, at: start.at, points: start.points, width, height, frames });
  const first = maskFrame(start.at, start.bits, width, height);
  if (media.kind !== 'video' || to - from < 0.05) return selection([first]);

  const { forward, backward } = sampleTimes(from, to, start.at);
  const total = forward.length - 1 + backward.length;
  let done = 0;
  const stop = () => {
    if (signal.aborted) throw new DOMException(t('Cancelado.'), 'AbortError');
  };

  // Ponto que o rastreador segue: o mais "dentro" do objeto (longe da borda dele e da imagem).
  const deep = deepestPoint(start.bits, width, height);
  let track: { t: number; x: number; y: number }[] = [];
  if (deep && to - from <= TRACK_LIMIT) {
    const anchor = { x: Math.min(0.95, Math.max(0.05, deep.x)), y: Math.min(0.95, Math.max(0.05, deep.y)) };
    try {
      track = await trackPoint(media, start.at, anchor, from, to, (f) => onProgress(t('Seguindo o objeto… {n}%', { n: Math.round(f * 100) }), f * 0.25));
    } catch {
      // Sem rastro (ponto na borda, vídeo difícil): a previsão fica parada e a IA corrige.
      track = [];
    }
    stop();
  }
  const base = trackedAt(track, start.at);
  const excludes = start.points.filter((p) => !p.include);

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media.file) });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error(t('Este arquivo não tem vídeo.'));
    const firstTimestamp = await videoTrack.getFirstTimestamp();
    const sink = new CanvasSink(videoTrack, { ...frameSize(videoTrack.displayWidth, videoTrack.displayHeight), fit: 'fill' });

    const pass = async (times: number[]): Promise<ObjectMaskFrame[]> => {
      const out: ObjectMaskFrame[] = [];
      let prev = { t: start.at, bits: start.bits };
      if (!times.length) return out;
      let i = 0;
      for await (const frame of sink.canvasesAtTimestamps(times.map((x) => Math.max(firstTimestamp, x)))) {
        stop();
        const time = times[i++];
        const now = trackedAt(track, time);
        const before = trackedAt(track, prev.t);
        const motion = now && before ? [(now.x - before.x) * width, (now.y - before.y) * height] : [0, 0];
        const predicted = shiftMask(prev.bits, width, height, motion[0], motion[1]);
        let bits = predicted;
        if (frame) {
          const shift = now && base ? { x: now.x - base.x, y: now.y - base.y } : { x: 0, y: 0 };
          const prompt = propagationPrompt(predicted, width, height, now, excludes.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })));
          if (prompt.some((p) => p.include)) {
            const image = imageDataOf(frame.canvas);
            const chosen = await maskForPoints(image, `objeto:${media.id}:${time}`, prompt, size, predicted);
            // Nada parecido com a previsão: o objeto provavelmente ficou escondido; segura a previsão.
            const hasPrediction = maskStats(predicted, width, height).area > 0;
            bits = !hasPrediction || maskIou(chosen, predicted) >= 0.15 ? chosen : predicted;
          }
        }
        out.push(maskFrame(time, bits, width, height));
        prev = { t: time, bits };
        done++;
        onProgress(t('Seguindo o objeto no clipe… {n}%', { n: Math.round((done / Math.max(1, total)) * 100) }), 0.25 + (done / Math.max(1, total)) * 0.75);
        if (i >= times.length) break;
      }
      return out;
    };

    const after = await pass(forward.slice(1));
    const before = await pass(backward);
    return selection([...before.reverse(), first, ...after]);
  } finally {
    input.dispose();
  }
}
