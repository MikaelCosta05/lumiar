import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { assetUrl } from '../assetUrl';
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { TrackPoint } from '../project/camera';
import type { MediaItem } from '../project/model';
import { assets } from './assets';

export type Progress = (fraction: number) => void;

let detector: Promise<FaceDetector> | null = null;
/** O detector exige tempos sempre crescentes, mesmo entre análises diferentes. */
let detectorClock = 0;

/**
 * O MediaPipe envia estatísticas de uso para o Google (sem opção para desligar).
 * O Lumiar funciona offline e não manda nada para fora: a resposta falsa faz o MediaPipe desistir de enviar.
 */
function blockTelemetry() {
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith('https://odml.pa.googleapis.com/')) return Promise.resolve(new Response(null, { status: 204 }));
    return original(input, init);
  };
}

function getFaceDetector(): Promise<FaceDetector> {
  if (!detector) blockTelemetry();
  detector ??= FilesetResolver.forVisionTasks(assetUrl('mediapipe')).then((fileset) =>
    FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: assetUrl('models/blaze_face_short_range.tflite') },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.45,
    }),
  );
  return detector;
}

/** Quadros do vídeo (reduzidos) em intervalos regulares, para análise. */
async function* frames(media: MediaItem, from: number, to: number, fps: number, width: number) {
  if (media.kind === 'image') {
    const bitmap = assets.bitmaps.get(media.id);
    if (!bitmap) return;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((width * bitmap.height) / bitmap.width);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    yield { t: from, canvas };
    return;
  }
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media.file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return;
    const first = await track.getFirstTimestamp();
    const height = Math.round((width * track.displayHeight) / track.displayWidth);
    const sink = new CanvasSink(track, { width, height, fit: 'fill' });
    const times: number[] = [];
    for (let t = Math.max(from, first); t <= to; t += 1 / fps) times.push(t);
    for await (const frame of sink.canvasesAtTimestamps(times)) {
      // O instante real do quadro (pode ser um pouco antes do pedido).
      if (frame) yield { t: frame.timestamp, canvas: frame.canvas };
    }
  } finally {
    input.dispose();
  }
}

/**
 * Encontra o rosto principal em cada momento do trecho [from, to] do arquivo.
 * Quando há vários rostos, segue o que estiver mais perto do anterior.
 */
export async function trackFace(media: MediaItem, from: number, to: number, onProgress?: Progress): Promise<TrackPoint[]> {
  const face = await getFaceDetector();
  const fps = 8;
  const total = Math.max(1, Math.ceil((to - from) * fps));
  const points: TrackPoint[] = [];
  let last: TrackPoint | null = null;
  let count = 0;
  for await (const { t, canvas } of frames(media, from, to, fps, 480)) {
    detectorClock += 50;
    const result = face.detectForVideo(canvas as HTMLCanvasElement, detectorClock);
    const candidates = result.detections
      .map((d) => d.boundingBox)
      .filter((b): b is NonNullable<typeof b> => !!b)
      .map((b) => ({
        t,
        x: (b.originX + b.width / 2) / canvas.width,
        // Mira um pouco acima do centro da caixa: os olhos ficam mais bem enquadrados.
        y: (b.originY + b.height * 0.42) / canvas.height,
        size: b.width / canvas.width,
      }));
    if (candidates.length) {
      const prev: TrackPoint | null = last;
      const best: TrackPoint = prev
        ? candidates.reduce((a, b) => (Math.hypot(a.x - prev.x, a.y - prev.y) < Math.hypot(b.x - prev.x, b.y - prev.y) ? a : b))
        : candidates.reduce((a, b) => (a.size > b.size ? a : b));
      points.push(best);
      last = best;
    }
    onProgress?.(++count / total);
  }
  return points;
}

// ---------------------------------------------------------------- Rastrear um ponto

interface Gray {
  data: Float32Array;
  width: number;
  height: number;
}

function toGray(canvas: HTMLCanvasElement | OffscreenCanvas): Gray {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = new Float32Array(canvas.width * canvas.height);
  for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
  return { data: gray, width: canvas.width, height: canvas.height };
}

const PATCH = 9; // raio do pedaço de imagem usado como "molde"
const SEARCH = 14; // quanto o ponto pode andar entre dois quadros (px)

function patchAt(img: Gray, cx: number, cy: number): Float32Array | null {
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  if (x0 - PATCH < 0 || y0 - PATCH < 0 || x0 + PATCH >= img.width || y0 + PATCH >= img.height) return null;
  const size = PATCH * 2 + 1;
  const out = new Float32Array(size * size);
  let mean = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = img.data[(y0 - PATCH + y) * img.width + (x0 - PATCH + x)];
      out[y * size + x] = v;
      mean += v;
    }
  }
  mean /= out.length;
  for (let i = 0; i < out.length; i++) out[i] -= mean; // tira o brilho médio: tolera mudança de luz
  return out;
}

/** Procura o molde perto de (x, y): devolve a melhor posição nova. */
function match(img: Gray, template: Float32Array, x: number, y: number): { x: number; y: number; error: number } {
  let best = { x, y, error: Infinity };
  for (let dy = -SEARCH; dy <= SEARCH; dy++) {
    for (let dx = -SEARCH; dx <= SEARCH; dx++) {
      const candidate = patchAt(img, x + dx, y + dy);
      if (!candidate) continue;
      let error = 0;
      for (let i = 0; i < candidate.length && error < best.error; i++) {
        const d = candidate[i] - template[i];
        error += d * d;
      }
      if (error < best.error) best = { x: Math.round(x) + dx, y: Math.round(y) + dy, error };
    }
  }
  return best;
}

/**
 * Segue um ponto marcado pelo usuário (x, y de 0 a 1) a partir do instante `at`,
 * para frente e para trás, dentro do trecho [from, to] do arquivo.
 */
export async function trackPoint(
  media: MediaItem,
  at: number,
  point: { x: number; y: number },
  from: number,
  to: number,
  onProgress?: Progress,
): Promise<TrackPoint[]> {
  const fps = 15;
  const width = 320;
  const grays: { t: number; img: Gray }[] = [];
  const total = Math.max(1, Math.ceil((to - from) * fps));
  for await (const { t, canvas } of frames(media, from, to, fps, width)) {
    grays.push({ t, img: toGray(canvas) });
    onProgress?.((grays.length / total) * 0.6);
  }
  if (grays.length === 0) return [];

  let startIndex = 0;
  for (let i = 0; i < grays.length; i++) if (Math.abs(grays[i].t - at) < Math.abs(grays[startIndex].t - at)) startIndex = i;
  const ref = grays[startIndex].img;
  const sx = point.x * ref.width;
  const sy = point.y * ref.height;
  const original = patchAt(ref, sx, sy);
  if (!original) throw new Error('Escolha um ponto um pouco mais longe da borda da imagem.');

  const result = new Map<number, TrackPoint>();
  result.set(startIndex, { t: grays[startIndex].t, x: point.x, y: point.y, size: 0 });

  // Anda nas duas direções a partir do quadro marcado.
  for (const direction of [1, -1]) {
    let x = sx;
    let y = sy;
    let template = original;
    for (let i = startIndex + direction; i >= 0 && i < grays.length; i += direction) {
      const { img, t } = grays[i];
      const found = match(img, template, x, y);
      if (!Number.isFinite(found.error)) break;
      x = found.x;
      y = found.y;
      result.set(i, { t, x: x / img.width, y: y / img.height, size: 0 });
      // O molde se adapta devagar (o objeto pode girar ou mudar de tamanho), mas sem esquecer o original.
      const current = patchAt(img, x, y);
      if (current) template = template.map((v, k) => v * 0.7 + current[k] * 0.2 + original[k] * 0.1);
      onProgress?.(0.6 + (result.size / grays.length) * 0.4);
    }
  }
  return [...result.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}
