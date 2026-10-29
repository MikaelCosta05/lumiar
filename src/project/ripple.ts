import type { Caption } from './captions';
import { keepRanges, layoutProject, removeClip, speedOf, type Project } from './model';
import { packTracksOf } from './packs';

/**
 * Edição "em cascata": quando um trecho sai da trilha principal, todo o resto (áudios, textos,
 * sobreposições, pacotes, marcadores, batidas e legendas) anda junto para fechar o buraco.
 * O que começava dentro do trecho removido vai para o começo dele.
 */
export function closeGap(project: Project, from: number, to: number): Project {
  const gap = to - from;
  if (gap <= 1e-6) return project;
  const shift = (start: number) => (start >= to ? start - gap : start >= from ? from : start);
  const captions = project.captions && {
    ...project.captions,
    captions: project.captions.captions.flatMap((c): Caption[] => {
      // Palavras faladas no trecho removido somem; as de depois andam junto.
      const words = c.words?.filter((w) => w.end <= from || w.start >= to).map((w) => ({ ...w, start: shift(w.start), end: shift(w.end) }));
      if (c.words && words && words.length === 0) return [];
      if (!c.words && c.start >= from && c.end <= to) return [];
      const start = words?.length ? words[0].start : shift(c.start);
      const end = words?.length ? words[words.length - 1].end : Math.max(start + 0.2, shift(c.end));
      return [{ ...c, start, end, words, text: words ? words.map((w) => w.text).join(' ') : c.text }];
    }),
  };
  return {
    ...project,
    audioTracks: project.audioTracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, start: shift(c.start) })) })),
    textTracks: project.textTracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => {
        const start = shift(c.start);
        const moved = start - c.start;
        return { ...c, start, follow: c.follow && { ...c.follow, points: c.follow.points.map((p) => ({ ...p, t: p.t + moved })) } };
      }),
    })),
    videoTracks: project.videoTracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, start: shift(c.start) })) })),
    packTracks: packTracksOf(project).map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, start: shift(c.start) })) })),
    markers: project.markers.map((m) => ({ ...m, time: shift(m.time) })),
    comments: project.comments?.map((c) => ({ ...c, time: shift(c.time) })),
    beats: project.beats?.filter((b) => b < from || b >= to).map(shift),
    captions,
  };
}

/** Fecha vários buracos (em tempos de antes da edição), do último para o primeiro. */
export function closeGaps(project: Project, gaps: [number, number][]): Project {
  return [...gaps].sort((a, b) => b[0] - a[0]).reduce((p, [a, b]) => closeGap(p, a, b), project);
}

/**
 * Tira da trilha principal os trechos [a, b] da timeline (cortar pelo texto, por exemplo).
 * Com `ripple`, o resto do projeto anda junto.
 */
export function removeTimeRanges(project: Project, ranges: [number, number][], ripple: boolean): { project: Project; removed: number } {
  let next = project;
  let removed = 0;
  // Do fim para o começo: os trechos anteriores continuam no mesmo lugar.
  for (const [a, b] of [...ranges].sort((x, y) => y[0] - x[0])) {
    if (b - a < 0.02) continue;
    const before = layoutProject(next);
    for (const layout of before.clips.filter((l) => l.start < b && l.start + l.length > a)) {
      const speed = speedOf(layout.clip);
      const cutIn = layout.clip.trimIn + (Math.max(a, layout.start) - layout.start) * speed;
      const cutOut = layout.clip.trimIn + (Math.min(b, layout.start + layout.length) - layout.start) * speed;
      const keep: [number, number][] = [
        [layout.clip.trimIn, cutIn],
        [cutOut, layout.clip.trimOut],
      ];
      const result = keepRanges(next, layout.clip.id, keep);
      next = result ? result.project : removeClip(next, layout.clip.id);
    }
    const cut = before.videoDuration - layoutProject(next).videoDuration;
    if (cut <= 1e-6) continue;
    removed += cut;
    if (ripple) next = closeGap(next, a, a + cut);
  }
  return { project: next, removed };
}

/** Exclui um clipe da trilha principal; com `ripple`, o resto do projeto fecha o buraco. */
export function deleteMainClip(project: Project, clipId: string, ripple: boolean): Project {
  const before = layoutProject(project);
  const layout = before.clips.find((l) => l.clip.id === clipId);
  const next = removeClip(project, clipId);
  if (!layout || !ripple) return next;
  const cut = before.videoDuration - layoutProject(next).videoDuration;
  return closeGap(next, layout.start, layout.start + cut);
}

