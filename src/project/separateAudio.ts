import { t } from '../i18n';
import type { SeparateAudio } from '../media/screenRecorder';
import { addAudioTrack, createAudioClip, type AudioTrackKind, type MediaItem, type Project } from './model';

const TRACK_KIND: Record<SeparateAudio['source'], AudioTrackKind> = { app: 'voice', microphone: 'voice', computer: 'other' };

/**
 * Um som gravado à parte (o programa escolhido, o resto do computador ou o microfone) numa trilha nova com o nome
 * dele, alinhado com a gravação da tela que começa em `start`.
 */
export function placeSeparateAudio(project: Project, audio: SeparateAudio, media: MediaItem, start: number, app: string): Project {
  const name = { app, computer: t('Computador'), microphone: t('Microfone') }[audio.source] || t('Programa');
  const clip = createAudioClip(media, start + Math.max(0, audio.offset));
  // Começou antes da tela: corta o pedaço de antes.
  clip.trimIn = Math.min(Math.max(0, -audio.offset), clip.trimOut);
  // Usa uma trilha vazia (a "Áudio 1" de um projeto novo) antes de criar outra.
  const empty = project.audioTracks.findIndex((track) => track.clips.length === 0);
  const next = empty >= 0 ? project : addAudioTrack(project);
  const index = empty >= 0 ? empty : next.audioTracks.length - 1;
  return {
    ...next,
    audioTracks: next.audioTracks.map((track, i) => (i === index ? { ...track, name, kind: TRACK_KIND[audio.source], clips: [clip] } : track)),
  };
}
