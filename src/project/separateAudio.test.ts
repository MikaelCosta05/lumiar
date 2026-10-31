import { describe, expect, it } from 'vitest';
import type { SeparateAudio } from '../media/screenRecorder';
import { createProject, type MediaItem } from './model';
import { placeSeparateAudio } from './separateAudio';

function media(id: string, duration = 60): MediaItem {
  return { id, kind: 'audio', name: `${id}.wav`, file: {} as File, url: '', thumbnail: null, duration, width: 0, height: 0, hasAudio: true };
}

const sound = (source: SeparateAudio['source'], offset: number): SeparateAudio => ({ file: {} as File, source, offset });

describe('placeSeparateAudio', () => {
  it('cada som vai numa trilha com o nome dele, começando junto com a tela', () => {
    let project = createProject();
    project = placeSeparateAudio(project, sound('app', 0.2), media('discord'), 10, 'Discord');
    project = placeSeparateAudio(project, sound('computer', 0.25), media('resto'), 10, 'Discord');
    project = placeSeparateAudio(project, sound('microphone', 0), media('mic'), 10, 'Discord');
    expect(project.audioTracks.map((t) => t.name)).toEqual(['Discord', 'Computador', 'Microfone']);
    expect(project.audioTracks.map((t) => t.kind)).toEqual(['voice', 'other', 'voice']);
    const [discord] = project.audioTracks[0].clips;
    expect(discord.start).toBeCloseTo(10.2);
    expect(discord.trimIn).toBe(0);
    expect(project.audioTracks[2].clips[0].start).toBe(10);
  });

  it('som que começou antes da tela perde o pedaço de antes', () => {
    const project = placeSeparateAudio(createProject(), sound('app', -0.4), media('discord'), 3, 'Discord');
    const [clip] = project.audioTracks[0].clips;
    expect(clip.start).toBe(3);
    expect(clip.trimIn).toBeCloseTo(0.4);
    expect(clip.trimOut).toBe(60);
  });

  it('não ocupa uma trilha que já tem som', () => {
    let project = placeSeparateAudio(createProject(), sound('microphone', 0), media('mic'), 0, 'Discord');
    project = placeSeparateAudio(project, sound('app', 0), media('discord'), 0, 'Discord');
    expect(project.audioTracks).toHaveLength(2);
    expect(project.audioTracks[0].clips[0].mediaId).toBe('mic');
    expect(project.audioTracks[1].clips[0].mediaId).toBe('discord');
  });
});
