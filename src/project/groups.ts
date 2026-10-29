import { clipLength, findAudioClip, findOverlayClip, uid, updateAudioClip, updateOverlayClip, type Project } from './model';
import { findPackClip, shiftAttached, updatePackClip } from './packs';
import { findTextClip, shiftText, updateTextClip } from './text';

/**
 * Grupos: textos, sons, sobreposições e blocos de pacote que andam juntos.
 * Arrastar um item do grupo leva os outros pelo mesmo tanto.
 */
interface Item {
  id: string;
  start: number;
  end: number;
  group?: string;
}

function items(project: Project): Item[] {
  return [
    ...project.audioTracks.flatMap((t) => t.clips.map((c) => ({ id: c.id, start: c.start, end: c.start + clipLength(c), group: c.group }))),
    ...project.textTracks.flatMap((t) => t.clips.map((c) => ({ id: c.id, start: c.start, end: c.start + c.duration, group: c.group }))),
    ...project.videoTracks.flatMap((t) => t.clips.map((c) => ({ id: c.id, start: c.start, end: c.start + clipLength(c), group: c.group }))),
    ...(project.packTracks ?? []).flatMap((t) => t.clips.map((c) => ({ id: c.id, start: c.start, end: c.start + c.duration, group: c.group }))),
  ];
}

export function groupOf(project: Project, id: string): string | undefined {
  return items(project).find((i) => i.id === id)?.group;
}

export function groupSize(project: Project, group: string): number {
  return items(project).filter((i) => i.group === group).length;
}

function setGroup(project: Project, id: string, group: string | undefined): Project {
  if (findTextClip(project, id)) return updateTextClip(project, id, (c) => ({ ...c, group }));
  if (findAudioClip(project, id)) return updateAudioClip(project, id, (c) => ({ ...c, group }));
  if (findOverlayClip(project, id)) return updateOverlayClip(project, id, (c) => ({ ...c, group }));
  if (findPackClip(project, id)) return updatePackClip(project, id, (c) => ({ ...c, group }));
  return project;
}

/** Agrupa o item com tudo o que está no mesmo trecho da timeline (fora da trilha principal). */
export function groupWithRange(project: Project, id: string): { project: Project; count: number } {
  const all = items(project);
  const me = all.find((i) => i.id === id);
  if (!me) return { project, count: 0 };
  const group = me.group ?? uid();
  const members = all.filter((i) => i.id === id || (i.start < me.end - 0.01 && i.end > me.start + 0.01));
  return { project: members.reduce((p, i) => setGroup(p, i.id, group), project), count: members.length };
}

export function ungroup(project: Project, group: string): Project {
  return items(project)
    .filter((i) => i.group === group)
    .reduce((p, i) => setGroup(p, i.id, undefined), project);
}

/** Leva os outros itens do grupo pelo mesmo tanto que o item arrastado andou. */
export function shiftGroup(project: Project, movedId: string, delta: number): Project {
  const group = groupOf(project, movedId);
  if (!group) return project;
  return shiftItems(
    project,
    items(project)
      .filter((i) => i.group === group && i.id !== movedId)
      .map((i) => i.id),
    delta,
  );
}

/** Junta os itens num grupo só (seleção de vários itens → Agrupar). */
export function groupItems(project: Project, ids: string[]): Project {
  const group = uid();
  return ids.reduce((p, id) => setGroup(p, id, group), project);
}

/** Leva os itens (textos, sons, sobreposições, pacotes) pelo mesmo tanto. */
export function shiftItems(project: Project, ids: string[], delta: number): Project {
  if (!ids.length || Math.abs(delta) < 1e-9) return project;
  let next = project;
  for (const item of items(project).filter((i) => ids.includes(i.id))) {
    const d = Math.max(-item.start, delta);
    if (findTextClip(next, item.id)) next = updateTextClip(next, item.id, (c) => shiftText(c, d));
    else if (findAudioClip(next, item.id)) next = updateAudioClip(next, item.id, (c) => ({ ...c, start: c.start + d }));
    else if (findOverlayClip(next, item.id)) next = updateOverlayClip(next, item.id, (c) => ({ ...c, start: c.start + d }));
    else {
      const pack = findPackClip(next, item.id)?.clip;
      if (pack) next = shiftAttached(updatePackClip(next, item.id, (c) => ({ ...c, start: c.start + d })), pack.attached, d);
    }
  }
  return next;
}

/** Onde o item começa agora (para saber quanto ele andou num arraste). */
export function itemStart(project: Project, id: string): number | undefined {
  return items(project).find((i) => i.id === id)?.start;
}
