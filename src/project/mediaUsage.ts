import { compoundMediaIds } from './compound';
import type { MediaItem, Project } from './model';

/** Quantas vezes cada mídia é usada (clipes, camadas, sons e dentro de clipes compostos). */
export function mediaUsage(project: Project): Map<string, number> {
  const count = new Map<string, number>(project.media.map((m) => [m.id, 0]));
  const add = (id: string) => count.set(id, (count.get(id) ?? 0) + 1);
  project.clips.forEach((c) => add(c.mediaId));
  project.videoTracks.forEach((t) => t.clips.forEach((c) => add(c.mediaId)));
  project.audioTracks.forEach((t) => t.clips.forEach((c) => add(c.mediaId)));
  compoundMediaIds(project).forEach(add);
  return count;
}

/** Grupos de mídias repetidas (mesmo nome, tamanho e duração): a primeira fica, as outras sobram. */
export function duplicateGroups(project: Project): MediaItem[][] {
  const groups = new Map<string, MediaItem[]>();
  for (const m of project.media) {
    if (m.compound) continue;
    const key = `${m.name}|${m.file.size}|${m.duration.toFixed(2)}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Todos os clipes que usam `from` passam a usar `to` (cortes ajustados à duração nova). */
export function repointMedia(project: Project, fromId: string, to: MediaItem): Project {
  const fix = <T extends { mediaId: string; trimIn: number; trimOut: number }>(c: T): T => {
    if (c.mediaId !== fromId) return c;
    if (to.kind === 'image') return { ...c, mediaId: to.id };
    const trimOut = Math.min(c.trimOut, to.duration);
    return { ...c, mediaId: to.id, trimOut, trimIn: Math.min(c.trimIn, Math.max(0, trimOut - 0.1)) };
  };
  return {
    ...project,
    clips: project.clips.map(fix),
    videoTracks: project.videoTracks.map((t) => ({ ...t, clips: t.clips.map(fix) })),
    audioTracks: project.audioTracks.map((t) => ({ ...t, clips: t.clips.map(fix) })),
  };
}

/** Troca o arquivo de uma mídia em todo o projeto (ex.: versão melhor do mesmo vídeo). */
export function replaceMediaFile(project: Project, oldId: string, next: MediaItem): Project {
  const repointed = repointMedia({ ...project, media: [...project.media, next] }, oldId, next);
  return { ...repointed, media: repointed.media.filter((m) => m.id !== oldId) };
}

/** Junta as duplicadas: os clipes passam a usar a primeira de cada grupo e as outras saem. */
export function mergeDuplicates(project: Project): { project: Project; removed: number } {
  let p = project;
  let removed = 0;
  for (const [keep, ...others] of duplicateGroups(project)) {
    for (const o of others) {
      p = repointMedia(p, o.id, keep);
      p = { ...p, media: p.media.filter((m) => m.id !== o.id) };
      removed++;
    }
  }
  return { project: p, removed };
}
