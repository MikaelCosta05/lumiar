import type { Project } from '../project/model';
import { exposureTimes, motionBlurOf, textBlurAmount, textMoving, textSamples, type BlurQuality } from '../project/motionBlur';
import { drawTexts } from './textRender';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Canvas de apoio (um para cada vista, outro para somar), reaproveitados entre os quadros. */
const scratch = new Map<string, AnyCanvas>();

function canvasFor(name: string, width: number, height: number): AnyCanvas {
  let c = scratch.get(name);
  if (!c) {
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
    scratch.set(name, c);
  }
  if (c.width !== width || c.height !== height) {
    c.width = width;
    c.height = height;
  }
  return c;
}

const ctx2d = (c: AnyCanvas) => c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Igual a drawTexts, mas os textos que estão se mexendo (entrando deslizando, girando, quicando…)
 * saem com desfoque de movimento: são desenhados em vários instantes da exposição e somados.
 * Os parados (e as legendas) são desenhados uma vez só, por cima ficam os borrados.
 */
export function drawTextsWithMotionBlur(
  canvas: AnyCanvas,
  project: Project,
  t: number,
  fps: number,
  quality: BlurQuality,
  layer: 'front' | 'behind' = 'front',
): boolean {
  const amount = textBlurAmount(motionBlurOf(project));
  const behind = layer === 'behind';
  const moving = new Set<string>();
  if (amount > 0.001 && fps > 0) {
    for (const track of project.textTracks) {
      for (const clip of track.clips) if (!!clip.behind === behind && textMoving(clip, t - clip.start)) moving.add(clip.id);
    }
  }
  if (!moving.size) return drawTexts(canvas, project, t, layer);

  const only = (keep: (id: string) => boolean): Project => ({
    ...project,
    textTracks: project.textTracks.map((track) => ({ ...track, clips: track.clips.filter((c) => keep(c.id)) })),
  });
  const drewStill = drawTexts(canvas, only((id) => !moving.has(id)), t, layer);
  if (!drewStill) {
    canvas.width = project.width;
    canvas.height = project.height;
    ctx2d(canvas).clearRect(0, 0, canvas.width, canvas.height);
  }
  // Só os textos que andam, sem legendas nem o cursor das gravações de tela (esses já foram).
  const movers: Project = {
    ...only((id) => moving.has(id)),
    captions: undefined,
    clips: project.clips.map((c) => (c.cursorFx ? { ...c, cursorFx: undefined } : c)),
  };
  const { width, height } = canvas;
  const view = canvasFor('vista', width, height);
  const sum = canvasFor('soma', width, height);
  const sumCtx = ctx2d(sum);
  sumCtx.clearRect(0, 0, width, height);
  const times = exposureTimes(t, amount / fps, textSamples(quality));
  // "lighter" soma as cores (com o alfa já multiplicado): com 1/n em cada vista, sai a média.
  sumCtx.globalCompositeOperation = 'lighter';
  sumCtx.globalAlpha = 1 / times.length;
  for (const time of times) if (drawTexts(view, movers, time, layer)) sumCtx.drawImage(view, 0, 0);
  sumCtx.globalCompositeOperation = 'source-over';
  sumCtx.globalAlpha = 1;
  ctx2d(canvas).drawImage(sum, 0, 0);
  return true;
}
