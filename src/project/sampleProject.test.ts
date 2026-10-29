import { describe, expect, it } from 'vitest';
import { layoutProject, type MediaItem } from './model';
import { buildSampleProject } from './sampleProject';

const base: Omit<MediaItem, 'id' | 'kind' | 'name' | 'duration' | 'hasAudio'> = { file: {} as File, url: '', thumbnail: null, width: 1280, height: 720 };
const media = {
  landscape: { ...base, id: 'p', kind: 'image', name: 'paisagem.jpg', duration: 0, hasAudio: false },
  drone: { ...base, id: 'd', kind: 'video', name: 'drone.webm', duration: 27.7, width: 854, height: 481, hasAudio: false },
  city: { ...base, id: 'c', kind: 'image', name: 'cidade.jpg', duration: 0, hasAudio: false },
} satisfies Record<string, MediaItem>;

describe('projeto de exemplo', () => {
  const project = buildSampleProject(media, (id) => `<${id}>`);
  const layout = layoutProject(project);

  it('tem entre 20 e 30 s, com as três mídias', () => {
    expect(layout.duration).toBeGreaterThan(20);
    expect(layout.duration).toBeLessThan(30);
    expect(project.media.map((m) => m.id)).toEqual(['p', 'd', 'c']);
    expect(project.clips).toHaveLength(4);
  });

  it('vem com filtros, transições, título, pacote e marcadores', () => {
    expect(project.clips.filter((c) => c.filter).length).toBeGreaterThanOrEqual(3);
    expect(project.transitions.every(Boolean)).toBe(true);
    expect(project.textTracks.flatMap((t) => t.clips)).toHaveLength(2);
    expect(project.packTracks.flatMap((t) => t.clips)).toHaveLength(1);
    expect(project.markers.map((m) => m.label)).toEqual(['Drone', 'Cidade à noite', 'Final']);
  });

  it('as dicas nos comentários usam o atalho atual, dentro do vídeo', () => {
    const comments = project.comments ?? [];
    expect(comments.length).toBeGreaterThanOrEqual(5);
    expect(comments.some((c) => c.text.includes('<split>'))).toBe(true);
    expect(comments.some((c) => c.text.includes('<undo>'))).toBe(true);
    expect(comments.every((c) => !c.done && c.time >= 0 && c.time <= layout.duration)).toBe(true);
    expect(comments.map((c) => c.time)).toEqual([...comments.map((c) => c.time)].sort((a, b) => a - b));
  });

  it('sem atalho, a dica não fica com um buraco', () => {
    const none = buildSampleProject(media, () => '');
    expect(none.comments?.some((c) => c.text.includes('(sem atalho)'))).toBe(true);
  });
});
