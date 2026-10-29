import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { assetUrl } from '../assetUrl';
import { t } from '../i18n';
import { analysisFps, eyesFromLandmarks, faceCenter, smoothGaze, type GazeFrame } from '../project/gaze';
import type { MediaItem } from '../project/model';
import { blockTelemetry, videoFrames } from './tracking';

/**
 * Olhar para a câmera: acha os olhos em cada quadro com o Face Landmarker do MediaPipe (478 pontos do
 * rosto, com a íris e as pálpebras). Roda no computador, como o detector de rostos.
 */

let landmarker: Promise<FaceLandmarker> | null = null;
/** O MediaPipe exige tempos sempre crescentes, mesmo entre análises diferentes. */
let clock = 0;

function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarker) {
    blockTelemetry();
    landmarker = FilesetResolver.forVisionTasks(assetUrl('mediapipe'))
      .then((fileset) =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: assetUrl('models/face_landmarker.task') },
          runningMode: 'VIDEO',
          numFaces: 3,
          outputFaceBlendshapes: true,
          minFaceDetectionConfidence: 0.4,
          minFacePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        }),
      )
      .catch((error) => {
        landmarker = null;
        throw error;
      });
  }
  return landmarker;
}

/** Os olhos não ficam menores que isso na análise: o modelo recorta o rosto, mas precisa de detalhe. */
const ANALYSIS_WIDTH = 1280;

/**
 * Os olhos do rosto principal em cada quadro do trecho [from, to] do arquivo. Com várias pessoas,
 * segue a que estiver mais perto da anterior (no começo, a maior).
 */
export async function analyzeGaze(
  media: MediaItem,
  from: number,
  to: number,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<GazeFrame[]> {
  const model = await getLandmarker();
  const fps = analysisFps(to - from);
  const width = Math.min(ANALYSIS_WIDTH, Math.max(320, media.width || ANALYSIS_WIDTH));
  const total = media.kind === 'image' ? 1 : Math.max(1, Math.ceil((to - from) * fps));
  const frames: GazeFrame[] = [];
  let last: { x: number; y: number; size: number } | null = null;
  let count = 0;
  for await (const { t: time, canvas } of videoFrames(media, from, to, fps, width)) {
    if (signal?.aborted) throw new DOMException(t('Cancelado.'), 'AbortError');
    clock += 40;
    const result = model.detectForVideo(canvas as HTMLCanvasElement, clock);
    const faces = result.faceLandmarks.map((points, i) => ({ points, center: faceCenter(points), i }));
    if (faces.length) {
      const prev: { x: number; y: number; size: number } | null = last;
      const best: (typeof faces)[number] = prev
        ? faces.reduce((a, b) => (Math.hypot(a.center.x - prev.x, a.center.y - prev.y) <= Math.hypot(b.center.x - prev.x, b.center.y - prev.y) ? a : b))
        : faces.reduce((a, b) => (a.center.size >= b.center.size ? a : b));
      const shapes = result.faceBlendshapes[best.i]?.categories ?? [];
      const blink = Math.max(0, ...shapes.filter((c) => c.categoryName === 'eyeBlinkLeft' || c.categoryName === 'eyeBlinkRight').map((c) => c.score));
      const eyes = eyesFromLandmarks(best.points, canvas.width, canvas.height, blink);
      if (eyes) frames.push({ t: Math.round(time * 1000) / 1000, eyes });
      last = best.center;
    }
    onProgress(Math.min(1, ++count / total));
  }
  return smoothGaze(frames, 1 / fps);
}
