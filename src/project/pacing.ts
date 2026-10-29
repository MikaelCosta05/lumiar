import { keyframeTimes } from '../engine/keyframes';
import { clipLength, type Project, type TimelineLayout } from './model';
import { packTracksOf } from './packs';

/**
 * Medidor de ritmo: trechos em que nada muda na tela por muito tempo (sem corte, zoom, texto,
 * sobreposição ou pacote). São os pontos onde quem assiste costuma desistir.
 * Devolve os trechos [início, fim] com pelo menos `still` segundos parados.
 */
export function stillStretches(project: Project, timeline: TimelineLayout, still = 7): [number, number][] {
  const end = timeline.duration;
  if (end <= 0) return [];
  const events: number[] = [0, end];
  for (const l of timeline.clips) {
    events.push(l.start);
    // Movimentos de câmera e efeitos animados do clipe também contam como mudança.
    for (const t of keyframeTimes(l.clip.camera?.keyframes, ...l.clip.effects.map((e) => e.keyframes))) events.push(l.start + t);
  }
  for (const l of timeline.overlays) events.push(l.start, l.start + l.length);
  for (const t of project.textTracks) for (const c of t.clips) events.push(c.start, c.start + c.duration);
  for (const t of packTracksOf(project)) for (const c of t.clips) events.push(c.start, c.start + Math.min(c.duration, 1.5));
  for (const t of project.videoTracks) for (const c of t.clips) if (c.multicam) events.push(c.start, c.start + clipLength(c));
  const sorted = [...new Set(events.filter((t) => t >= 0 && t <= end).map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
  const stretches: [number, number][] = [];
  for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] >= still) stretches.push([sorted[i - 1], sorted[i]]);
  return stretches;
}

/** Cortes por minuto (média do vídeo todo): referência para comparar. */
export function cutsPerMinute(timeline: TimelineLayout): number {
  return timeline.duration > 0 ? (timeline.clips.length / timeline.duration) * 60 : 0;
}
