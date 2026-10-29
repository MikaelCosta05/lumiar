import { t } from '../i18n';
import { addMedia, clipLength, createAudioClip, type AudioClip, type AudioTrack, type MediaItem, type Project, uid } from './model';

/**
 * Coloca a música gerada pelo Lumiar na trilha de música (a que abaixa sozinha quando há voz) e já
 * marca as batidas dela no projeto: o Lumiar compôs a música, então sabe exatamente onde cada
 * tempo cai (não precisa "ouvir" para descobrir).
 */
export function placeGeneratedMusic(project: Project, media: MediaItem, start: number, beats: number[], clip: AudioClip = createAudioClip(media, start)): Project {
  const end = start + clipLength(clip);
  let next = project.media.some((m) => m.id === media.id) ? project : addMedia(project, [media]);
  const free = next.audioTracks.findIndex((tr) => tr.kind === 'music' && !tr.clips.some((c) => start < c.start + clipLength(c) && end > c.start));
  if (free >= 0) {
    next = { ...next, audioTracks: next.audioTracks.map((tr, i) => (i === free ? { ...tr, clips: [...tr.clips, clip] } : tr)) };
  } else {
    const count = next.audioTracks.filter((tr) => tr.kind === 'music').length;
    const track: AudioTrack = { id: uid(), name: count ? t('Música {n}', { n: count + 1 }) : t('Música'), muted: false, kind: 'music', clips: [clip] };
    next = { ...next, audioTracks: [...next.audioTracks, track] };
  }
  // As batidas antigas desse trecho saem; as da música nova entram.
  const marks = beats.map((b) => start + b).filter((b) => b <= end + 1e-6);
  const kept = (next.beats ?? []).filter((b) => b < start - 1e-6 || b > end + 1e-6);
  return { ...next, beats: [...kept, ...marks].sort((a, b) => a - b) };
}
