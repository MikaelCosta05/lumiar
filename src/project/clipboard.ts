import type { EffectInstance, FilterInstance } from '../engine/types';
import type { Selection } from '../ui/selection';
import {
  clipLength,
  findAudioClip,
  findOverlayClip,
  insertVideoClips,
  layoutProject,
  placeAudioClip,
  placeOverlayClip,
  uid,
  updateClip,
  updateOverlayClip,
  type AudioClip,
  type OverlayClip,
  type Project,
  type VideoClip,
} from './model';
import { findPackClip, placePackClip, type PackClip } from './packs';
import { findTextClip, placeTextClip, type TextClip } from './text';

/** O que está copiado (Ctrl+C). "look" = só o filtro e os efeitos de um clipe. */
export type CopiedItem =
  | { kind: 'clip'; clip: VideoClip }
  | { kind: 'overlay'; clip: OverlayClip }
  | { kind: 'audio'; clip: AudioClip }
  | { kind: 'text'; clip: TextClip }
  | { kind: 'pack'; clip: PackClip }
  | { kind: 'look'; filter: FilterInstance | null; effects: EffectInstance[] };

export interface EditResult {
  project: Project;
  selection: Selection;
}

export function copySelection(project: Project, selection: Selection): CopiedItem | null {
  if (selection?.kind === 'clip') {
    const clip = project.clips.find((c) => c.id === selection.id);
    return clip ? { kind: 'clip', clip } : null;
  }
  if (selection?.kind === 'overlay') {
    const found = findOverlayClip(project, selection.id);
    return found ? { kind: 'overlay', clip: found.clip } : null;
  }
  if (selection?.kind === 'audio') {
    const found = findAudioClip(project, selection.id);
    return found ? { kind: 'audio', clip: found.clip } : null;
  }
  if (selection?.kind === 'text') {
    const found = findTextClip(project, selection.id);
    return found ? { kind: 'text', clip: found.clip } : null;
  }
  if (selection?.kind === 'pack') {
    const found = findPackClip(project, selection.id);
    return found ? { kind: 'pack', clip: found.clip } : null;
  }
  return null;
}

/** Filtro e efeitos de um clipe de vídeo (principal ou sobreposto). */
export function copyLook(project: Project, selection: Selection): CopiedItem | null {
  const clip = visualClip(project, selection);
  return clip ? { kind: 'look', filter: clip.filter, effects: clip.effects } : null;
}

export function visualClip(project: Project, selection: Selection): VideoClip | null {
  if (selection?.kind === 'clip') return project.clips.find((c) => c.id === selection.id) ?? null;
  if (selection?.kind === 'overlay') return findOverlayClip(project, selection.id)?.clip ?? null;
  return null;
}

/** Aplica filtro e efeitos copiados num clipe (substitui os que ele tinha). */
export function pasteLook(project: Project, selection: Selection, item: CopiedItem): Project {
  if (item.kind !== 'look') return project;
  const look = (c: VideoClip) => ({ ...c, filter: item.filter && { ...item.filter }, effects: freshEffects(item.effects) });
  if (selection?.kind === 'clip') return updateClip(project, selection.id, look);
  if (selection?.kind === 'overlay') return updateOverlayClip(project, selection.id, (c) => ({ ...c, ...look(c) }));
  return project;
}

/** Cola no instante t (clipes de vídeo da trilha principal entram na junção mais próxima). */
export function pasteAt(project: Project, item: CopiedItem, t: number): EditResult | null {
  const id = uid();
  switch (item.kind) {
    case 'clip': {
      const clip: VideoClip = { ...item.clip, id, effects: freshEffects(item.clip.effects) };
      const index = layoutProject(project).clips.filter((l) => l.start + l.length / 2 < t).length;
      return { project: insertVideoClips(project, [clip], index), selection: { kind: 'clip', id } };
    }
    case 'overlay': {
      const clip: OverlayClip = { ...item.clip, id, start: t, effects: freshEffects(item.clip.effects) };
      const track = findOverlayClip(project, item.clip.id)?.trackIndex ?? 0;
      return { project: placeOverlayClip(project, clip, track), selection: { kind: 'overlay', id } };
    }
    case 'audio': {
      const track = findAudioClip(project, item.clip.id)?.trackIndex ?? 0;
      return { project: placeAudioClip(project, { ...item.clip, id, start: t }, track), selection: { kind: 'audio', id } };
    }
    case 'text':
      return { project: placeTextClip(project, { ...item.clip, id, start: t }), selection: { kind: 'text', id } };
    case 'pack': {
      // A cópia leva só o visual: textos, sons e a câmera lenta continuam com o bloco original.
      const clip: PackClip = { ...item.clip, id, start: t, effects: freshEffects(item.clip.effects), attached: undefined, speed: undefined };
      const track = findPackClip(project, item.clip.id)?.trackIndex ?? 0;
      return { project: placePackClip(project, clip, track), selection: { kind: 'pack', id } };
    }
    default:
      return null;
  }
}

/** Cópia logo depois do original. */
export function duplicate(project: Project, selection: Selection): EditResult | null {
  const item = copySelection(project, selection);
  if (!item) return null;
  if (item.kind === 'clip') {
    const index = project.clips.findIndex((c) => c.id === item.clip.id);
    const id = uid();
    const clip: VideoClip = { ...item.clip, id, effects: freshEffects(item.clip.effects) };
    return { project: insertVideoClips(project, [clip], index + 1), selection: { kind: 'clip', id } };
  }
  const end =
    item.kind === 'text' || item.kind === 'pack' ? item.clip.start + item.clip.duration : item.kind === 'look' ? 0 : item.clip.start + clipLength(item.clip);
  return pasteAt(project, item, end);
}

function freshEffects(effects: EffectInstance[]): EffectInstance[] {
  return effects.map((e) => ({ ...e, uid: uid() }));
}
