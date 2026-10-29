import { t } from '../i18n';
import { trackPoints, videoFrames } from '../media/tracking';
import { shiftAfter } from '../project/brand';
import { evaluateCamera } from '../project/camera';
import { type CornerPin } from '../project/cornerPin';
import { constellation, followTrack, type MaskFollow } from '../project/maskFollow';
import { bestPair, bestView, reframe, SIG_H, SIG_W, type FrameSample, type SmallGray } from '../project/matchCut';
import {
  layoutProject,
  MIN_LENGTH,
  speedOf,
  updateClip,
  updateOverlayClip,
  type ClipLayout,
  type OverlayLayout,
  type Project,
} from '../project/model';
import { shortcutLabel } from './shortcuts';

/** O que os trabalhos de rastreamento usam do editor. */
export interface TrackingContext {
  /** O projeto mais recente (o trabalho é demorado: pode ter mudado no meio) */
  project: () => Project;
  setProject: (update: (p: Project) => Project) => void;
  notify: (text: string, error?: boolean) => void;
  /** "Trabalhando…" com a porcentagem (null tira) */
  progress: (text: string | null) => void;
  /** "Mover o resto junto": o que vem depois do corte anda junto quando a trilha principal muda de tamanho */
  ripple?: () => boolean;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Trecho do arquivo do clipe de baixo que fica embaixo da sobreposição (só ali precisa rastrear). */
export function belowRange(overlay: OverlayLayout, below: ClipLayout): { from: number; to: number } {
  const speed = speedOf(below.clip);
  const start = Math.max(overlay.start, below.start);
  const end = Math.min(overlay.start + overlay.length, below.start + below.length);
  if (end - start < 0.05) return { from: below.clip.trimIn, to: below.clip.trimOut };
  return { from: below.clip.trimIn + (start - below.start) * speed, to: below.clip.trimIn + (end - below.start) * speed };
}

/** Quadros por segundo do rastreamento: o do projeto (até 30), menos quando o trecho é longo (memória). */
function trackFps(project: Project, seconds: number): number {
  const fps = Math.min(30, project.fps || 30);
  return Math.max(5, Math.min(fps, 360 / Math.max(0.1, seconds)));
}

/**
 * Trocar a tela: segue os quatro cantos (marcados no instante `at` do clipe de baixo) quadro a quadro
 * e guarda o rastro na sobreposição.
 */
export async function trackCorners(ctx: TrackingContext, overlayId: string, belowId: string, at: number, corners: number[]): Promise<void> {
  const tl = layoutProject(ctx.project());
  const overlay = tl.overlays.find((l) => l.clip.id === overlayId);
  const below = tl.clips.find((l) => l.clip.id === belowId);
  if (!overlay || !below) return;
  const pin: CornerPin = { clipId: belowId, corners, at };
  if (below.media.kind !== 'video') {
    // Foto embaixo: não há o que rastrear, os cantos ficam parados.
    ctx.setProject((p) => updateOverlayClip(p, overlayId, (c) => ({ ...c, cornerPin: pin })));
    ctx.notify(t('Tela trocada. A imagem de baixo é uma foto: os cantos ficam parados.'));
    return;
  }
  const { from, to } = belowRange(overlay, below);
  const points = Array.from({ length: 4 }, (_, k) => ({ x: corners[k * 2], y: corners[k * 2 + 1] }));
  try {
    ctx.progress(t('Rastreando os cantos… {n}%', { n: 0 }));
    const samples = await trackPoints(below.media, at, points, from, to, (f) => ctx.progress(t('Rastreando os cantos… {n}%', { n: Math.round(f * 100) })), {
      fps: trackFps(ctx.project(), to - from),
      width: 480,
      group: true,
    });
    const track = samples.map((s) => ({ t: Math.round(s.t * 1000) / 1000, c: s.points.flatMap((p) => [p.x, p.y]) }));
    const lost = samples.filter((s) => s.points.some((p) => p.lost)).length;
    ctx.setProject((p) => updateOverlayClip(p, overlayId, (c) => ({ ...c, cornerPin: { ...pin, track } })));
    ctx.notify(
      lost > samples.length * 0.2
        ? t('Tela trocada, mas alguns cantos se perderam em {n} quadros (saíram da imagem ou ficaram tampados). Ajuste à mão onde precisar.', { n: lost })
        : t('Tela trocada: os cantos foram rastreados em {n} quadros.', { n: track.length }),
      lost > samples.length * 0.2,
    );
  } catch (error) {
    ctx.notify(t('Não foi possível rastrear os cantos: {error}', { error: errorText(error) }), true);
  } finally {
    ctx.progress(null);
  }
}

/**
 * Máscara que acompanha um ponto: segue o ponto (imagem da mídia, no instante `at` do arquivo) e
 * quatro pontos de apoio em volta dele, pelo clipe inteiro.
 */
export async function trackMaskPoint(ctx: TrackingContext, overlayId: string, at: number, point: { x: number; y: number }): Promise<void> {
  const layout = layoutProject(ctx.project()).overlays.find((l) => l.clip.id === overlayId);
  if (!layout || layout.media.kind !== 'video') {
    ctx.notify(t('Só dá para rastrear em vídeo.'), true);
    return;
  }
  const { clip, media } = layout;
  const aspect = media.width / Math.max(1, media.height);
  try {
    ctx.progress(t('Rastreando o ponto da forma… {n}%', { n: 0 }));
    const samples = await trackPoints(media, at, constellation(point, aspect), clip.trimIn, clip.trimOut, (f) =>
      ctx.progress(t('Rastreando o ponto da forma… {n}%', { n: Math.round(f * 100) })), {
      fps: trackFps(ctx.project(), clip.trimOut - clip.trimIn),
      width: 480,
      group: true,
    });
    if (!samples.length) throw new Error(t('Não foi possível ler esse quadro.'));
    ctx.setProject((p) =>
      updateOverlayClip(p, overlayId, (c) => {
        const before = c.transform.maskFollow;
        // A forma continua valendo como foi desenhada no mesmo instante de antes (sem pular).
        const ref = before && before.at >= c.trimIn && before.at <= c.trimOut ? before.at : at;
        const track = followTrack(samples, ref, aspect).map((s) => ({ ...s, t: Math.round(s.t * 1000) / 1000 }));
        const follow: MaskFollow = { kind: 'point', at: ref, scale: before?.scale ?? false, rotate: before?.rotate ?? false, track };
        return { ...c, transform: { ...c.transform, maskFollow: follow } };
      }),
    );
    ctx.notify(t('A forma agora acompanha o ponto ({n} quadros).', { n: samples.length }));
  } catch (error) {
    ctx.notify(t('Não foi possível rastrear: {error}', { error: errorText(error) }), true);
  } finally {
    ctx.progress(null);
  }
}

// ---------------------------------------------------------------- Corte casado

/** Quadros reduzidos (SIG_W × SIG_H, tons de cinza) do trecho do arquivo. */
async function smallFrames(layout: ClipLayout, from: number, to: number, fps: number): Promise<FrameSample[]> {
  const canvas = document.createElement('canvas');
  canvas.width = SIG_W;
  canvas.height = SIG_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const out: FrameSample[] = [];
  for await (const frame of videoFrames(layout.media, from, to, fps, 128)) {
    ctx.drawImage(frame.canvas as HTMLCanvasElement, 0, 0, SIG_W, SIG_H);
    const { data } = ctx.getImageData(0, 0, SIG_W, SIG_H);
    const gray = new Float32Array(SIG_W * SIG_H);
    for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
    out.push({ t: frame.t, gray: { data: gray, width: SIG_W, height: SIG_H } });
  }
  return out;
}

/** Como o quadro aparece com a câmera do clipe naquele instante (zoom e posição; o giro fica de fora). */
function onScreen(layout: ClipLayout, sample: FrameSample): SmallGray {
  const camera = layout.clip.camera;
  if (!camera) return sample.gray;
  const clipTime = (sample.t - layout.clip.trimIn) / speedOf(layout.clip);
  const view = evaluateCamera(camera, clipTime, sample.t);
  return view.zoom > 1.001 ? reframe(sample.gray, { zoom: view.zoom, x: view.x, y: view.y }) : sample.gray;
}

/** Quanto do fim de A e do começo de B entra na procura (segundos do arquivo). */
const WINDOW = 1.5;
/** O clipe nunca fica menor que isso por causa do corte casado (s). */
const KEEP = 0.5;

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;

/**
 * Corte casado entre o clipe `index` da trilha principal e o seguinte: muda o fim de A e o começo
 * de B para os quadros mais parecidos e, se ajudar, aproxima/move B. Uma edição só (Ctrl+Z desfaz).
 */
export async function matchCut(ctx: TrackingContext, index: number): Promise<void> {
  const tl = layoutProject(ctx.project());
  const a = tl.clips[index];
  const b = tl.clips[index + 1];
  if (!a || !b) {
    ctx.notify(t('O corte casado precisa de dois clipes seguidos na trilha principal.'), true);
    return;
  }
  const sa = speedOf(a.clip);
  const sb = speedOf(b.clip);
  const fps = 12;
  // Fim de A: um pouco antes do corte e, se o arquivo tiver mais, um pouco depois.
  const aFrom = Math.max(a.clip.trimIn + KEEP * sa, a.clip.trimOut - WINDOW * sa);
  const aTo = a.media.kind === 'video' ? Math.min(a.media.duration, a.clip.trimOut + WINDOW * 0.5 * sa) : a.clip.trimOut;
  const bFrom = b.media.kind === 'video' ? Math.max(0, b.clip.trimIn - WINDOW * 0.5 * sb) : b.clip.trimIn;
  const bTo = Math.min(b.clip.trimOut - KEEP * sb, b.clip.trimIn + WINDOW * sb);
  let aFrames: FrameSample[];
  let bFrames: FrameSample[];
  try {
    ctx.progress(t('Procurando os quadros mais parecidos…'));
    aFrames = a.media.kind === 'video' ? await smallFrames(a, aFrom, aTo, fps) : await smallFrames(a, a.clip.trimIn, a.clip.trimIn, 1);
    bFrames = b.media.kind === 'video' ? await smallFrames(b, bFrom, Math.max(bFrom, bTo), fps) : await smallFrames(b, b.clip.trimIn, b.clip.trimIn, 1);
  } catch (error) {
    ctx.progress(null);
    ctx.notify(t('Não foi possível analisar o vídeo: {error}', { error: errorText(error) }), true);
    return;
  }
  ctx.progress(null);
  if (!aFrames.length || !bFrames.length) {
    ctx.notify(t('Não foi possível ler os quadros desses clipes.'), true);
    return;
  }
  // Fotos têm um quadro só (o "instante" dele não muda o corte).
  const aCut = a.media.kind === 'video' ? a.clip.trimOut - 1 / fps : aFrames[0].t;
  const bCut = b.media.kind === 'video' ? b.clip.trimIn : bFrames[0].t;
  const screenA = aFrames.map((f) => ({ t: f.t, gray: onScreen(a, f) }));
  const pair = bestPair(screenA, bFrames, aCut, bCut)!;
  // Só mexe no corte quando o casamento melhora de verdade.
  const moveCut = pair.score > pair.before + 0.03;
  const aOut = moveCut && a.media.kind === 'video' ? Math.min(a.media.duration, pair.aOut + 1 / fps) : a.clip.trimOut;
  const bIn = moveCut && b.media.kind === 'video' ? pair.bIn : b.clip.trimIn;
  const aShown = screenA.reduce((best, f) => (Math.abs(f.t - (moveCut ? pair.aOut : aCut)) < Math.abs(best.t - (moveCut ? pair.aOut : aCut)) ? f : best));
  const bShown = bFrames.reduce((best, f) => (Math.abs(f.t - bIn) < Math.abs(best.t - bIn) ? f : best));
  // Alinhar B só se a câmera dele não estiver animada nem seguindo algo (senão a gente estragaria).
  const camera = b.clip.camera;
  const free = !camera || (!camera.follow && !camera.keyframes.zoom?.length && !camera.keyframes.x?.length && !camera.keyframes.y?.length);
  const fit = free ? bestView(aShown.gray, bShown.gray) : null;
  const align = fit && fit.view.zoom > 1.001 && fit.score > fit.base + 0.05 ? fit.view : null;

  const dA = (aOut - a.clip.trimOut) / sa;
  const dB = (bIn - b.clip.trimIn) / sb;
  if (Math.abs(dA) < 1e-3 && Math.abs(dB) < 1e-3 && !align) {
    ctx.notify(t('Os quadros do corte já são os mais parecidos: nada mudou.'));
    return;
  }
  ctx.setProject((p) => {
    let next = updateClip(p, a.clip.id, (c) => ({ ...c, trimOut: Math.max(c.trimIn + MIN_LENGTH, aOut) }));
    next = updateClip(next, b.clip.id, (c) => {
      const moved = { ...c, trimIn: Math.min(c.trimOut - MIN_LENGTH, bIn) };
      if (!align) return moved;
      const base = c.camera ?? { base: { zoom: 1, x: 0.5, y: 0.5, rotation: 0 }, keyframes: {}, fill: false, follow: null };
      return { ...moved, camera: { ...base, base: { ...base.base, zoom: Math.round(align.zoom * 100) / 100, x: align.x, y: align.y } } };
    });
    // A ficou dA mais longo e B dB mais curto: textos, sons e sobreposições depois do corte acompanham.
    const delta = dA - dB;
    return ctx.ripple?.() && Math.abs(delta) > 1e-6 ? shiftAfter(next, b.start, delta) : next;
  });
  const parts = [
    Math.abs(dA) >= 1e-3 || Math.abs(dB) >= 1e-3
      ? t('Corte casado: o fim de "{a}" mudou {da}s e o começo de "{b}" mudou {db}s.', { a: a.media.name, b: b.media.name, da: signed(dA), db: signed(dB) })
      : t('Corte casado: o corte já estava no melhor quadro.'),
    align ? t('"{b}" foi aproximado {zoom}× e movido para as formas caírem no mesmo lugar.', { b: b.media.name, zoom: align.zoom.toFixed(2) }) : '',
    t('Semelhança: {before}% → {after}%.', { before: Math.round(Math.max(0, pair.before) * 100), after: Math.round(Math.max(0, align ? fit!.score : pair.score) * 100) }),
    t('{key} desfaz.', { key: shortcutLabel('undo') || 'Ctrl+Z' }),
  ];
  ctx.notify(parts.filter(Boolean).join(' '));
}
