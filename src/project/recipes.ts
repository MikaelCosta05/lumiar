import { findSpeech } from '../media/silence';
import { trackFace } from '../media/tracking';
import { createCamera, type CameraFollow } from './camera';
import { layoutProject, speedOf, type Project } from './model';
import { removeTimeRanges } from './ripple';

/** Progresso de 0 a 1 (com um texto do que está fazendo). */
export type RecipeProgress = (fraction: number) => void;

/**
 * Corta as pausas (silêncios) dos clipes da trilha principal. Usado pelo menu do clipe e pelo
 * processamento de vários vídeos.
 */
export async function cutSilencesIn(
  project: Project,
  clipIds: string[],
  ripple: boolean,
  onProgress: RecipeProgress = () => {},
): Promise<{ project: Project; removed: number; cuts: number; heard: number }> {
  const layouts = layoutProject(project).clips.filter((l) => clipIds.includes(l.clip.id) && l.media.hasAudio && !l.clip.audioDetached);
  const found = new Map<string, [number, number][]>();
  for (const [n, l] of layouts.entries()) {
    onProgress(n / Math.max(1, layouts.length));
    found.set(l.clip.id, await findSpeech(l.media.file, l.clip.trimIn, l.clip.trimOut));
  }
  return { ...removeSilences(project, found, ripple), heard: layouts.length };
}

/** As pausas viram trechos da timeline (o que fica entre as falas) e saem. */
export function removeSilences(project: Project, speech: Map<string, [number, number][]>, ripple: boolean): { project: Project; removed: number; cuts: number } {
  const ranges: [number, number][] = [];
  for (const layout of layoutProject(project).clips) {
    const keep = speech.get(layout.clip.id);
    if (!keep) continue;
    const speed = speedOf(layout.clip);
    const at = (source: number) => layout.start + (source - layout.clip.trimIn) / speed;
    let from = layout.clip.trimIn;
    for (const [a, b] of [...keep, [layout.clip.trimOut, layout.clip.trimOut] as [number, number]]) {
      if (a - from > 0.05) ranges.push([at(from), at(a)]);
      from = b;
    }
  }
  const result = removeTimeRanges(project, ranges, ripple);
  return { project: result.project, removed: result.removed, cuts: ranges.length };
}

/** Deixa o projeto vertical (9:16) com cada clipe acompanhando o rosto de quem aparece. */
export async function reframeToVertical(project: Project, onProgress: RecipeProgress = () => {}): Promise<{ project: Project; followed: number }> {
  const size = project.width > project.height ? { width: project.height, height: project.width } : { width: project.width, height: project.height };
  const layouts = layoutProject(project).clips;
  const follows = new Map<string, CameraFollow>();
  for (const [n, l] of layouts.entries()) {
    if (l.media.kind !== 'video') continue;
    onProgress(n / layouts.length);
    const points = await trackFace(l.media, l.clip.trimIn, l.clip.trimOut, (f) => onProgress((n + f) / layouts.length));
    if (points.length) follows.set(l.clip.id, { kind: 'face', points, zoom: 1, smoothness: 0.8, mode: 'center', anchorTime: l.clip.trimIn });
  }
  return {
    project: {
      ...project,
      ...size,
      clips: project.clips.map((c) => {
        const camera = c.camera ?? createCamera();
        return { ...c, camera: { ...camera, fill: true, follow: follows.get(c.id) ?? camera.follow } };
      }),
    },
    followed: follows.size,
  };
}
