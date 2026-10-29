/**
 * Máscara que acompanha: a forma da camada (desenhada à mão ou pronta) anda junto com um ponto
 * rastreado no próprio vídeo da camada, ou com o objeto escolhido em "Selecionar objeto".
 * Opcionalmente cresce/diminui e gira junto.
 *
 * A forma continua guardada como foi desenhada (no instante `at`); o movimento é aplicado na hora de
 * desenhar. Conta pura (sem DOM): dá para testar no Node.
 */
import type { LayerMask } from '../engine/renderer';
import type { TrackedPoint } from '../media/pointTrack';
import { evaluateCamera, screenToSource, sourceToScreen } from './camera';
import type { MediaItem, VideoClip } from './model';

export interface MaskFollowSample {
  /** Instante do arquivo (s) */
  t: number;
  /** Ponto seguido na imagem da mídia (0 a 1) */
  x: number;
  y: number;
  /** Tamanho e giro (radianos) em relação ao instante `at` */
  s: number;
  a: number;
}

export interface MaskFollow {
  /** point = ponto rastreado no vídeo da camada; object = o objeto de "Selecionar objeto" */
  kind: 'point' | 'object';
  /** Instante do arquivo em que a forma vale como foi desenhada */
  at: number;
  /** Acompanhar também o tamanho */
  scale: boolean;
  /** Acompanhar também o giro (só a forma desenhada à mão) */
  rotate: boolean;
  /** Rastro do ponto (kind = point), em ordem de tempo */
  track?: MaskFollowSample[];
}

/** Onde o ponto seguido está, com o tamanho e o giro (em relação ao instante de referência). */
interface Pose {
  x: number;
  y: number;
  s: number;
  a: number;
}

/** Movimento da forma: o ponto `from` (camada, 0 a 1) vai para `to`, com escala e giro em volta dele. */
export interface MaskMotion {
  from: { x: number; y: number };
  to: { x: number; y: number };
  s: number;
  a: number;
  /** Largura ÷ altura da camada (o giro é feito em pixels, senão a forma entorta) */
  aspect: number;
}

function lerpTrack(track: MaskFollowSample[], t: number): Pose | null {
  if (!track.length) return null;
  if (t <= track[0].t) return track[0];
  const last = track[track.length - 1];
  if (t >= last.t) return last;
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const p = track[lo];
  const q = track[hi];
  const k = (t - p.t) / Math.max(1e-6, q.t - p.t);
  return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, s: p.s + (q.s - p.s) * k, a: p.a + (q.a - p.a) * k };
}

/** Centro e tamanho do objeto selecionado no instante (entre duas amostras, em linha reta; onde ele some, a última vista). */
export function objectPose(frames: { t: number; area: number; cx: number; cy: number }[], t: number): { x: number; y: number; area: number } | null {
  const seen = frames.filter((f) => f.area > 0);
  if (!seen.length) return null;
  if (t <= seen[0].t) return { x: seen[0].cx, y: seen[0].cy, area: seen[0].area };
  const last = seen[seen.length - 1];
  if (t >= last.t) return { x: last.cx, y: last.cy, area: last.area };
  const i = seen.findIndex((f) => f.t > t);
  const p = seen[i - 1];
  const q = seen[i];
  const k = (t - p.t) / Math.max(1e-6, q.t - p.t);
  return { x: p.cx + (q.cx - p.cx) * k, y: p.cy + (q.cy - p.cy) * k, area: p.area + (q.area - p.area) * k };
}

/** Pose no instante e no de referência, na imagem da mídia. */
function poses(follow: MaskFollow, clip: Pick<VideoClip, 'object'>, t: number): { ref: Pose; now: Pose } | null {
  if (follow.kind === 'point') {
    const ref = lerpTrack(follow.track ?? [], follow.at);
    const now = lerpTrack(follow.track ?? [], t);
    return ref && now ? { ref, now } : null;
  }
  const frames = clip.object?.frames ?? [];
  const ref = objectPose(frames, follow.at);
  const now = objectPose(frames, t);
  if (!ref || !now) return null;
  return { ref: { x: ref.x, y: ref.y, s: 1, a: 0 }, now: { x: now.x, y: now.y, s: Math.sqrt(now.area / Math.max(1e-6, ref.area)), a: 0 } };
}

/** Da imagem da mídia para a camada (a câmera do clipe e o espelho mudam onde as coisas aparecem). */
function toLayer(p: { x: number; y: number }, clip: Pick<VideoClip, 'camera' | 'flipX' | 'flipY' | 'trimIn' | 'speed'>, media: MediaItem, sourceTime: number) {
  let q = p;
  if (clip.camera) {
    const clipTime = (sourceTime - clip.trimIn) / (clip.speed ?? 1);
    const view = { ...evaluateCamera(clip.camera, clipTime, sourceTime), fill: clip.camera.fill };
    q = sourceToScreen(p, view, media, media);
  }
  return { x: clip.flipX ? 1 - q.x : q.x, y: clip.flipY ? 1 - q.y : q.y };
}

/** O contrário de toLayer: de um ponto da camada para a imagem da mídia (para rastrear onde a pessoa clicou). */
export function layerToSource(p: { x: number; y: number }, clip: Pick<VideoClip, 'camera' | 'flipX' | 'flipY' | 'trimIn' | 'speed'>, media: MediaItem, sourceTime: number) {
  const q = { x: clip.flipX ? 1 - p.x : p.x, y: clip.flipY ? 1 - p.y : p.y };
  if (!clip.camera) return q;
  const clipTime = (sourceTime - clip.trimIn) / (clip.speed ?? 1);
  const view = { ...evaluateCamera(clip.camera, clipTime, sourceTime), fill: clip.camera.fill };
  return screenToSource(q, view, media, media);
}

/** O movimento da forma no instante do arquivo (null = não acompanha ou não há rastro). */
export function maskMotion(
  follow: MaskFollow | null | undefined,
  clip: Pick<VideoClip, 'object' | 'camera' | 'flipX' | 'flipY' | 'trimIn' | 'speed'>,
  media: MediaItem,
  sourceTime: number,
): MaskMotion | null {
  if (!follow) return null;
  const p = poses(follow, clip, sourceTime);
  if (!p) return null;
  const flip = (clip.flipX ? -1 : 1) * (clip.flipY ? -1 : 1);
  return {
    from: toLayer(p.ref, clip, media, follow.at),
    to: toLayer(p.now, clip, media, sourceTime),
    s: follow.scale ? p.now.s / Math.max(1e-6, p.ref.s) : 1,
    a: follow.rotate ? (p.now.a - p.ref.a) * flip : 0,
    aspect: media.width / Math.max(1, media.height) || 1,
  };
}

/** Aplica o movimento num ponto da camada. */
export function movePoint(m: MaskMotion, x: number, y: number): [number, number] {
  const dx = (x - m.from.x) * m.aspect;
  const dy = y - m.from.y;
  const c = Math.cos(m.a) * m.s;
  const s = Math.sin(m.a) * m.s;
  return [m.to.x + (c * dx - s * dy) / m.aspect, m.to.y + s * dx + c * dy];
}

/** O contrário de movePoint (para editar a forma num instante em que ela já andou). */
export function unmovePoint(m: MaskMotion, x: number, y: number): [number, number] {
  const dx = (x - m.to.x) * m.aspect;
  const dy = y - m.to.y;
  const k = 1 / Math.max(1e-6, m.s);
  const c = Math.cos(-m.a) * k;
  const s = Math.sin(-m.a) * k;
  return [m.from.x + (c * dx - s * dy) / m.aspect, m.from.y + s * dx + c * dy];
}

export function movePoints(m: MaskMotion, points: number[], back = false): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push(...(back ? unmovePoint : movePoint)(m, points[i], points[i + 1]));
  return out;
}

/** A forma (já no instante) andando com o movimento. Formas prontas só andam e mudam de tamanho. */
export function moveMask(mask: LayerMask, m: MaskMotion | null): LayerMask {
  if (!m) return mask;
  if (mask.shape === 'path') return { ...mask, points: movePoints(m, mask.points ?? []) };
  const [x, y] = movePoint({ ...m, a: 0 }, mask.x, mask.y);
  return { ...mask, x, y, width: mask.width * m.s, height: mask.height * m.s };
}

/** A forma da camada no instante do arquivo, já acompanhando o movimento. */
export function followMask(
  mask: LayerMask | null | undefined,
  follow: MaskFollow | null | undefined,
  clip: Pick<VideoClip, 'object' | 'camera' | 'flipX' | 'flipY' | 'trimIn' | 'speed'>,
  media: MediaItem,
  sourceTime: number,
): LayerMask | null | undefined {
  if (!mask || !follow) return mask;
  return moveMask(mask, maskMotion(follow, clip, media, sourceTime));
}

// ---------------------------------------------------------------- Do rastreamento para o rastro

/** Distância dos pontos de apoio até o ponto seguido (fração da largura): perto o bastante para estar no mesmo objeto. */
export const SATELLITE = 0.05;

/** O ponto seguido e quatro pontos de apoio em volta (para medir tamanho e giro). */
export function constellation(p: { x: number; y: number }, aspect: number): { x: number; y: number }[] {
  const r = SATELLITE;
  return [p, { x: p.x + r, y: p.y }, { x: p.x, y: p.y + r * aspect }, { x: p.x - r, y: p.y }, { x: p.x, y: p.y - r * aspect }];
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * O rastro da forma a partir dos pontos seguidos (o primeiro é o ponto, os outros os de apoio):
 * tamanho e giro = mediana entre os pontos de apoio achados (os perdidos não contam).
 */
export function followTrack(samples: { t: number; points: TrackedPoint[] }[], at: number, aspect: number): MaskFollowSample[] {
  if (!samples.length) return [];
  let refIndex = 0;
  samples.forEach((s, i) => Math.abs(s.t - at) < Math.abs(samples[refIndex].t - at) && (refIndex = i));
  const ref = samples[refIndex].points;
  const vector = (pts: TrackedPoint[], k: number) => ({ x: (pts[k].x - pts[0].x) * aspect, y: pts[k].y - pts[0].y });
  let lastA = 0;
  let lastS = 1;
  return samples.map(({ t, points }) => {
    const scales: number[] = [];
    const angles: number[] = [];
    for (let k = 1; k < points.length && k < ref.length; k++) {
      if (points[k].lost || points[0].lost) continue;
      const v0 = vector(ref, k);
      const v = vector(points, k);
      const l0 = Math.hypot(v0.x, v0.y);
      const l = Math.hypot(v.x, v.y);
      if (l0 < 1e-6 || l < 1e-6) continue;
      scales.push(l / l0);
      let a = Math.atan2(v.y, v.x) - Math.atan2(v0.y, v0.x);
      // Sem pular de +180° para −180°.
      while (a - lastA > Math.PI) a -= Math.PI * 2;
      while (a - lastA < -Math.PI) a += Math.PI * 2;
      angles.push(a);
    }
    // Quadro sem pontos de apoio: mantém o último tamanho e giro (sem pular).
    const s = scales.length ? median(scales) : lastS;
    const a = angles.length ? median(angles) : lastA;
    lastA = a;
    lastS = s;
    return { t, x: points[0].x, y: points[0].y, s, a };
  });
}
