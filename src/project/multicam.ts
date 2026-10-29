import { clipLength, DEFAULT_TRANSFORM, layoutProject, splitOverlayClip, updateOverlayClip, type Project } from './model';
import { createPackClip, placePackClip, type PackTemplate } from './packs';
import { t } from '../i18n';

/**
 * Multicâmera: cada câmera extra fica numa trilha de vídeo de cima, sincronizada pelo som e em tela cheia.
 * "Cortar para a câmera N" divide as câmeras no cursor e deixa só a escolhida visível dali em diante
 * (1 = a trilha principal; 2, 3… = as trilhas de cima, de baixo para cima).
 */
export function cameraClipsAt(project: Project, t: number) {
  return project.videoTracks
    .flatMap((track, trackIndex) => track.clips.map((clip) => ({ clip, trackIndex })))
    .filter(({ clip }) => clip.multicam && t >= clip.start && t < clip.start + clipLength(clip))
    .sort((a, b) => a.trackIndex - b.trackIndex);
}

export function hasMulticam(project: Project): boolean {
  return project.videoTracks.some((t) => t.clips.some((c) => c.multicam));
}

/** Quantas câmeras existem no total (a principal + as sincronizadas). */
export function cameraCount(project: Project): number {
  const tracks = new Set(project.videoTracks.flatMap((t, i) => (t.clips.some((c) => c.multicam) ? [i] : [])));
  return 1 + tracks.size;
}

export function switchCamera(project: Project, t: number, camera: number): Project {
  const tracks = [...new Set(project.videoTracks.flatMap((tr, i) => (tr.clips.some((c) => c.multicam) ? [i] : [])))].sort((a, b) => a - b);
  let next = project;
  for (const { clip, trackIndex } of cameraClipsAt(project, t)) {
    const visible = tracks.indexOf(trackIndex) + 2 === camera;
    let id = clip.id;
    // Divide no cursor (a não ser que já esteja numa ponta).
    if (t - clip.start > 0.05 && clip.start + clipLength(clip) - t > 0.05) {
      const split = splitOverlayClip(next, clip.id, t);
      if (split) {
        next = split.project;
        id = split.newId;
      }
    }
    next = updateOverlayClip(next, id, (c) => ({ ...c, fadeIn: 0, fadeOut: 0, transform: { ...c.transform, opacity: visible ? 1 : 0 } }));
  }
  return next;
}

/** Deixa um clipe sobreposto pronto para ser câmera: tela cheia, sem som, escondido. */
export function asCamera(project: Project, clipId: string, start: number): Project {
  return updateOverlayClip(project, clipId, (c) => ({
    ...c,
    start: Math.max(0, start),
    multicam: true,
    volume: 0,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...DEFAULT_TRANSFORM, opacity: 0 },
  }));
}

// ---------------------------------------------------------------- Zoom automático na fala

/**
 * Momentos de ênfase: picos de volume da fala (bem acima do normal), com pelo menos `spacing` segundos
 * entre um e outro. `envelope` é o volume 100× por segundo; devolve instantes (s) dentro do trecho.
 */
export function emphasisMoments(envelope: Float32Array, rate: number, spacing = 3.5): number[] {
  // Média móvel de ~0,3 s: tira os picos de uma sílaba só.
  const win = Math.round(rate * 0.15);
  const smooth = new Float32Array(envelope.length);
  let acc = 0;
  for (let i = 0; i < envelope.length; i++) {
    acc += envelope[i] - (envelope[i - 2 * win - 1] ?? 0);
    smooth[Math.max(0, i - win)] = acc / (2 * win + 1);
  }
  const sorted = [...smooth].filter((v) => v > 1e-4).sort((a, b) => a - b);
  if (sorted.length < rate) return [];
  const threshold = sorted[Math.floor(sorted.length * 0.86)];
  const peaks: { t: number; v: number }[] = [];
  const reach = Math.round(rate * 1);
  for (let i = reach; i < smooth.length - reach; i++) {
    const v = smooth[i];
    if (v < threshold) continue;
    let top = true;
    for (let j = i - reach; j <= i + reach && top; j++) if (smooth[j] > v) top = false;
    if (top) peaks.push({ t: i / rate, v });
  }
  // Os mais fortes primeiro, respeitando a distância mínima.
  const chosen: number[] = [];
  for (const p of peaks.sort((a, b) => b.v - a.v)) {
    if (chosen.every((c) => Math.abs(c - p.t) >= spacing)) chosen.push(p.t);
  }
  return chosen.sort((a, b) => a - b);
}

const PUNCH: PackTemplate = {
  id: 'auto/zoom-na-fala',
  name: t('Zoom na fala'),
  category: 'Automático',
  description: t('Zoom rápido num momento de ênfase.'),
  color: '#e11d48',
  duration: 1.6,
  timing: 'edges',
  anchor: 'cursor',
  intensity: 1,
  fadeIn: 0,
  fadeOut: 0,
  effects: [],
  filter: null,
  camera: { base: { zoom: 1.22, y: 0.45 }, keyframes: {} },
};

/** Põe um bloco "Zoom na fala" em cada momento (tempo da timeline), começando um pouco antes do pico. */
export function addPunchIns(project: Project, moments: number[], strength = 1.22): { project: Project; count: number } {
  let next = project;
  const end = layoutProject(project).duration;
  let count = 0;
  for (const t of moments) {
    const start = Math.max(0, t - 0.25);
    if (start + 0.6 > end) continue;
    const template = { ...PUNCH, camera: { base: { zoom: strength, y: 0.45 }, keyframes: {} } };
    next = placePackClip(next, createPackClip(template, start, Math.min(PUNCH.duration, end - start)));
    count++;
  }
  return { project: next, count };
}
