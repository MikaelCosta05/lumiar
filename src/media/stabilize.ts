import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { MediaItem } from '../project/model';
import type { FrameMotion } from '../project/stabilize';
import { blockMotion, estimateRigid, grayFromRgba, pyramid, type Pyramid } from './motion';
import type { Progress } from './tracking';

/** Largura da imagem analisada (px). Pequena para ser rápido; a fração de pixel compensa a precisão. */
const WIDTH = 320;

export interface CameraMotion {
  /** Um item por quadro do trecho, o primeiro sem movimento */
  motions: FrameMotion[];
  width: number;
  height: number;
  /** Quadros em que não deu para medir (ficaram parados) */
  unreliable: number;
}

/**
 * Mede o movimento da câmera em cada quadro do trecho [from, to] do arquivo, quadro a quadro
 * (todos os quadros, para a correção bater com o que o player mostra).
 */
export async function analyzeCameraMotion(media: MediaItem, from: number, to: number, onProgress?: Progress): Promise<CameraMotion> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media.file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return { motions: [], width: WIDTH, height: 0, unreliable: 0 };
    const width = WIDTH;
    const height = Math.max(32, Math.round((width * track.displayHeight) / track.displayWidth));
    const sink = new CanvasSink(track, { width, height, fit: 'fill', poolSize: 2 });
    const motions: FrameMotion[] = [];
    let previous: Pyramid | null = null;
    let lastTime = -Infinity;
    let unreliable = 0;
    // O quadro que já está na tela no começo do trecho também conta.
    const first = Math.max(0, from - 0.1);
    for await (const frame of sink.canvases(first, to)) {
      // Quadros que já acabaram antes do trecho não aparecem no clipe.
      if (frame.timestamp + frame.duration <= from || frame.timestamp <= lastTime + 1e-6) continue;
      lastTime = frame.timestamp;
      const ctx = frame.canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      const current = pyramid(grayFromRgba(ctx.getImageData(0, 0, width, height).data, width, height));
      if (!previous) {
        motions.push({ t: frame.timestamp, dx: 0, dy: 0, angle: 0 });
      } else {
        const motion = estimateRigid(blockMotion(previous, current), width, height);
        if (!motion) unreliable++;
        motions.push({ t: frame.timestamp, dx: motion?.dx ?? 0, dy: motion?.dy ?? 0, angle: motion?.angle ?? 0 });
      }
      previous = current;
      onProgress?.(Math.min(1, (frame.timestamp - from) / Math.max(0.01, to - from)));
    }
    return { motions, width, height, unreliable };
  } finally {
    input.dispose();
  }
}
