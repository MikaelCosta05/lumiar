import type { Caption } from './captions';
import { clipLength, createVideoClip, insertVideoClips, layoutProject, type MediaItem, type Project } from './model';
import { packTracksOf } from './packs';
import { removeTimeRanges } from './ripple';

/**
 * Clipe composto: um trecho da timeline (trilha principal + o que está por cima dele) vira um clipe só.
 * O trecho é guardado como um "subprojeto" dentro da mídia e renderizado num vídeo; o clipe usa esse
 * vídeo, então aceita um efeito, um filtro ou uma velocidade para tudo de uma vez. Abrir o clipe
 * composto troca a timeline pelo subprojeto; ao voltar, o vídeo é renderizado de novo.
 */
export type CompoundSource = Omit<Project, 'media'>;

const EPS = 1e-3;

/** O que fica dentro do trecho [from, to]: só o que cabe inteiro nele (o que atravessa as pontas fica de fora). */
function inside(start: number, end: number, from: number, to: number): boolean {
  return start >= from - EPS && end <= to + EPS;
}

export interface Extracted {
  sub: Project;
  /** Ids dos itens (sons, textos, camadas, pacotes) que foram para dentro */
  taken: Set<string>;
  from: number;
  to: number;
}

/** Copia o trecho [from, to] para um subprojeto que começa em 0. */
export function extractRange(project: Project, from: number, to: number): Extracted | null {
  const tl = layoutProject(project);
  to = Math.min(to, tl.videoDuration);
  from = Math.max(0, from);
  if (to - from < 0.2) return null;
  // Trilha principal: corta antes e depois (as outras trilhas não andam).
  const main = removeTimeRanges(project, [[to, tl.videoDuration + 1], [0, from]], false).project;
  const taken = new Set<string>();
  const take = <T extends { id: string }>(item: T) => (taken.add(item.id), item);
  const captions = project.captions && {
    ...project.captions,
    captions: project.captions.captions
      .filter((c) => inside(c.start, c.end, from, to))
      .map((c): Caption => ({ ...c, start: c.start - from, end: c.end - from, words: c.words?.map((w) => ({ ...w, start: w.start - from, end: w.end - from })) })),
  };
  const sub: Project = {
    ...main,
    videoTracks: project.videoTracks.map((t) => ({
      ...t,
      clips: t.clips.filter((c) => inside(c.start, c.start + clipLength(c), from, to)).map((c) => take({ ...c, start: c.start - from })),
    })),
    audioTracks: project.audioTracks.map((t) => ({
      ...t,
      clips: t.clips.filter((c) => inside(c.start, c.start + clipLength(c), from, to)).map((c) => take({ ...c, start: c.start - from })),
    })),
    textTracks: project.textTracks.map((t) => ({
      ...t,
      clips: t.clips
        .filter((c) => inside(c.start, c.start + c.duration, from, to))
        .map((c) => take({ ...c, start: c.start - from, follow: c.follow && { ...c.follow, points: c.follow.points.map((p) => ({ ...p, t: p.t - from })) } })),
    })),
    // Pacotes de velocidade mexem nos clipes da trilha principal: esses ficam no projeto de fora.
    packTracks: packTracksOf(project).map((t) => ({
      ...t,
      clips: t.clips.filter((c) => !c.speed && inside(c.start, c.start + c.duration, from, to)).map((c) => take({ ...c, start: c.start - from })),
    })),
    markers: project.markers.filter((m) => m.time >= from && m.time < to).map((m) => ({ ...m, time: m.time - from })),
    comments: project.comments?.filter((c) => c.time >= from && c.time < to).map((c) => ({ ...c, time: c.time - from })),
    beats: project.beats?.filter((b) => b >= from && b < to).map((b) => b - from),
    captions,
  };
  return { sub, taken, from, to };
}

/** Troca o trecho pelo clipe composto (mesma duração: nada anda na timeline). */
export function replaceWithCompound(project: Project, extracted: Extracted, media: MediaItem): { project: Project; clipId: string } {
  const { from, to, taken } = extracted;
  let p = removeTimeRanges(project, [[from, to]], false).project;
  const keep = <T extends { id: string }>(c: T) => !taken.has(c.id);
  p = {
    ...p,
    videoTracks: p.videoTracks.map((t) => ({ ...t, clips: t.clips.filter(keep) })),
    audioTracks: p.audioTracks.map((t) => ({ ...t, clips: t.clips.filter(keep) })),
    textTracks: p.textTracks.map((t) => ({ ...t, clips: t.clips.filter(keep) })),
    packTracks: packTracksOf(p).map((t) => ({ ...t, clips: t.clips.filter(keep) })),
    markers: p.markers.filter((m) => m.time < from || m.time >= to),
    comments: p.comments?.filter((c) => c.time < from || c.time >= to),
    captions: p.captions && { ...p.captions, captions: p.captions.captions.filter((c) => !inside(c.start, c.end, from, to)) },
  };
  const layouts = layoutProject(p).clips;
  const found = layouts.findIndex((l) => l.start >= from - 0.01);
  const index = found < 0 ? p.clips.length : found;
  const clip = createVideoClip(media);
  p = insertVideoClips(p, [clip], index);
  // Sem transição nas emendas: o composto entra exatamente no lugar do trecho.
  const transitions = [...p.transitions];
  if (index > 0) transitions[index - 1] = null;
  if (index < transitions.length) transitions[index] = null;
  return { project: { ...p, transitions }, clipId: clip.id };
}

/** O subprojeto pronto para editar (as mídias são as do projeto de fora). */
export function openCompound(parent: Project, media: MediaItem): Project | null {
  if (!media.compound) return null;
  return { ...media.compound, media: parent.media };
}

/** Guarda o subprojeto na mídia (sem as mídias, que ficam no projeto de fora). */
export function compoundSource(sub: Project): CompoundSource {
  const { media: _media, ...rest } = sub;
  return rest;
}

/**
 * Volta para o projeto de fora com o composto atualizado: a mídia antiga dá lugar à nova
 * (renderizada de novo) e as mídias importadas lá dentro passam a existir aqui também.
 */
export function updateCompound(parent: Project, oldId: string, sub: Project, rendered: MediaItem | null): Project {
  const known = new Set(parent.media.map((m) => m.id));
  const added = sub.media.filter((m) => !known.has(m.id));
  const old = parent.media.find((m) => m.id === oldId);
  if (!old) return parent;
  const next = rendered ? { ...rendered, name: old.name, compound: compoundSource(sub) } : { ...old, compound: compoundSource(sub) };
  const swap = <T extends { mediaId: string; trimIn: number; trimOut: number }>(c: T): T =>
    c.mediaId === oldId ? { ...c, mediaId: next.id, trimOut: Math.min(c.trimOut, next.duration), trimIn: Math.min(c.trimIn, Math.max(0, next.duration - 0.1)) } : c;
  return {
    ...parent,
    media: [...parent.media.map((m) => (m.id === oldId ? next : m)), ...added],
    clips: parent.clips.map(swap),
    videoTracks: parent.videoTracks.map((t) => ({ ...t, clips: t.clips.map(swap) })),
  };
}

/** Mídias usadas dentro de clipes compostos (não podem ser apagadas como "sem uso"). */
export function compoundMediaIds(project: Project): Set<string> {
  const ids = new Set<string>();
  const walk = (p: CompoundSource) => {
    p.clips.forEach((c) => ids.add(c.mediaId));
    p.videoTracks.forEach((t) => t.clips.forEach((c) => ids.add(c.mediaId)));
    p.audioTracks.forEach((t) => t.clips.forEach((c) => ids.add(c.mediaId)));
  };
  for (const m of project.media) if (m.compound) walk(m.compound);
  // Compostos dentro de compostos: as mídias deles também estão na lista do projeto.
  for (const m of project.media) if (ids.has(m.id) && m.compound) walk(m.compound);
  return ids;
}
