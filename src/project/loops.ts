import type { Easing, Keyframe, KeyframeMap } from '../engine/keyframes';
import type { Camera } from './camera';
import {
  clipLength,
  DEFAULT_TRANSFORM,
  layoutProject,
  placeOverlayClip,
  removeClip,
  speedOf,
  splitVideoClip,
  uid,
  type MediaItem,
  type OverlayClip,
  type Project,
  type VideoClip,
} from './model';

/**
 * Loop perfeito e boomerang de um clipe da trilha principal.
 *
 * Loop perfeito: o fim emenda no começo sem pulo. Os primeiros segundos do clipe viram uma camada por cima
 * do fim, aparecendo aos poucos (dissolve): no último quadro a camada está inteira e mostra exatamente o
 * quadro em que o clipe (agora começando um pouco depois) começa. Repetido, não dá para ver a emenda.
 *
 * Boomerang: o clipe toca para frente e logo depois uma cópia invertida toca de volta.
 */

/** Duração padrão do dissolve da emenda (s). */
export const LOOP_FADE = 0.5;

export interface LoopResult {
  project: Project;
  /** O clipe da trilha principal (o que sobrou depois de tirar o começo) */
  clipId: string;
  /** A camada com o começo, por cima do fim */
  overlayId: string;
  /** Duração real do dissolve (s) */
  fade: number;
}

/** Quanto a camada precisa crescer para cobrir a tela como o clipe com "Preencher a tela". */
function coverScale(media: { width: number; height: number }, project: { width: number; height: number }): number {
  const output = project.width / project.height;
  const ratio = media.width / media.height || output;
  const fit = ratio > output ? [1, output / ratio] : [ratio / output, 1];
  return 1 / Math.min(fit[0], fit[1]);
}

export function makeSeamlessLoop(project: Project, clipId: string, fade = LOOP_FADE): LoopResult | null {
  const layout = layoutProject(project).clips.find((l) => l.clip.id === clipId);
  if (!layout || layout.media.kind !== 'video') return null;
  // O dissolve não passa de um terço do clipe (sobra um trecho limpo no meio).
  const d = Math.min(fade, layout.length / 3);
  if (d < 0.1) return null;
  const split = splitVideoClip(project, clipId, layout.start + d);
  if (!split) return null;
  const head = split.project.clips[layout.index];
  const rest = split.project.clips[layout.index + 1];
  let next = removeClip(split.project, head.id);
  const fill = head.camera?.fill ? coverScale(layout.media, project) : 1;
  const overlay: OverlayClip = {
    ...head,
    id: uid(),
    // O resto do clipe começa onde o original começava e dura `length - d`: o começo vai para os últimos d segundos.
    start: layout.start + layout.length - 2 * d,
    transform: { ...DEFAULT_TRANSFORM, scale: fill },
    fadeIn: d,
    fadeOut: 0,
    camera: head.camera && { ...head.camera, fill: false },
  };
  next = placeOverlayClip(next, overlay);
  return { project: next, clipId: rest.id, overlayId: overlay.id, fade: d };
}

const MIRRORED: Partial<Record<Easing, Easing>> = { 'ease-in': 'ease-out', 'ease-out': 'ease-in' };

/** Keyframes tocados de trás para frente num clipe de `length` segundos. */
export function mirrorKeyframes(map: KeyframeMap | undefined, length: number): KeyframeMap | undefined {
  if (!map) return map;
  return Object.fromEntries(
    Object.entries(map).map(([id, kfs]) => {
      const sorted = [...kfs].sort((a, b) => a.time - b.time);
      // A curva de um trecho fica no keyframe do começo dele: invertido, ela passa para o vizinho.
      const mirrored: Keyframe[] = sorted
        .map((k, i) => ({ time: Math.max(0, length - k.time), value: k.value, easing: (i > 0 ? MIRRORED[sorted[i - 1].easing] ?? sorted[i - 1].easing : k.easing) as Easing }))
        .reverse();
      return [id, mirrored];
    }),
  );
}

/** A câmera do clipe tocando ao contrário (o rastreio de rosto passa para o tempo do arquivo invertido). */
function mirrorCamera(camera: Camera | undefined, clip: VideoClip, length: number): Camera | undefined {
  if (!camera) return camera;
  const { stabilize: _stabilize, ...rest } = camera;
  return {
    ...rest,
    keyframes: mirrorKeyframes(camera.keyframes, length) ?? {},
    follow: camera.follow && {
      ...camera.follow,
      // No arquivo invertido, o instante s do original fica em trimOut - s.
      points: camera.follow.points.map((p) => ({ ...p, t: clip.trimOut - p.t })).reverse(),
      anchorTime: clip.trimOut - camera.follow.anchorTime,
    },
  };
}

/**
 * Boomerang: logo depois do clipe entra a cópia invertida (`reversed`, o trecho do clipe de trás para frente),
 * com a mesma cor, efeitos e câmera espelhada. Entre os dois, corte seco (o último quadro de um é o primeiro do outro).
 */
export function makeBoomerang(project: Project, clipId: string, reversed: MediaItem): { project: Project; id: string } | null {
  const index = project.clips.findIndex((c) => c.id === clipId);
  const clip = project.clips[index];
  if (!clip) return null;
  const length = clipLength(clip);
  const back: VideoClip = {
    ...clip,
    id: uid(),
    mediaId: reversed.id,
    trimIn: 0,
    trimOut: Math.min(reversed.duration, (clip.trimOut - clip.trimIn) || reversed.duration),
    speed: clip.speed,
    effects: clip.effects.map((e) => ({ ...e, uid: uid(), keyframes: mirrorKeyframes(e.keyframes, length) })),
    filter: clip.filter && { ...clip.filter, keyframes: mirrorKeyframes(clip.filter.keyframes, length) },
    camera: mirrorCamera(clip.camera, clip, length),
    // O som invertido sai junto no arquivo; o clipe de volta fica com o mesmo volume.
    audioDetached: false,
  };
  const clips = [...project.clips];
  clips.splice(index + 1, 0, back);
  const transitions = [...project.transitions];
  transitions.splice(index, 0, null);
  const withMedia = project.media.some((m) => m.id === reversed.id) ? project : { ...project, media: [...project.media, reversed] };
  return { project: { ...withMedia, clips, transitions }, id: back.id };
}

/** O clipe pode virar loop perfeito ou boomerang? (vídeo com pelo menos meio segundo) */
export function canLoop(clip: VideoClip, media: MediaItem | undefined): boolean {
  return !!media && media.kind === 'video' && (clip.trimOut - clip.trimIn) / speedOf(clip) >= 0.5;
}
