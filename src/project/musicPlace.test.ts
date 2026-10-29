import { describe, expect, it } from 'vitest';
import { createAudioClip, createProject, type MediaItem, type Project } from './model';
import { placeGeneratedMusic } from './musicPlace';

const media = (id: string, duration: number): MediaItem => ({ id, kind: 'audio', name: `${id}.wav`, file: {} as File, url: '', thumbnail: null, duration, width: 0, height: 0, hasAudio: true });

describe('pôr a música gerada na timeline', () => {
  it('vai para uma trilha de música nova e marca as batidas no lugar certo', () => {
    const m = media('m', 10);
    const p = placeGeneratedMusic({ ...createProject(), beats: [1, 2, 3, 20, 30] }, m, 5, [0, 0.5, 1, 9.5]);
    const track = p.audioTracks.find((t) => t.kind === 'music')!;
    expect(track.clips).toHaveLength(1);
    expect(track.clips[0].start).toBe(5);
    expect(p.media.map((x) => x.id)).toContain('m');
    // As batidas de antes que caem fora da música ficam; as de dentro são trocadas pelas exatas.
    expect(p.beats).toEqual([1, 2, 3, 5, 5.5, 6, 14.5, 20, 30]);
  });

  it('usa uma trilha de música livre e cria outra se estiver ocupada', () => {
    const a = media('a', 10);
    let p: Project = placeGeneratedMusic(createProject(), a, 0, []);
    const b = media('b', 5);
    p = placeGeneratedMusic(p, b, 20, []);
    expect(p.audioTracks.filter((t) => t.kind === 'music')).toHaveLength(1);
    const c = media('c', 5);
    const clip = createAudioClip(c, 2);
    p = placeGeneratedMusic(p, c, 2, [], clip);
    const music = p.audioTracks.filter((t) => t.kind === 'music');
    expect(music).toHaveLength(2);
    expect(music[1].clips[0].id).toBe(clip.id);
  });
});
