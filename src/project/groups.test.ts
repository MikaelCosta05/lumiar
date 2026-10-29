import { describe, expect, it } from 'vitest';
import { groupItems, groupOf, groupSize, groupWithRange, itemStart, shiftGroup, shiftItems, ungroup } from './groups';
import { createAudioClip, createOverlayClip, createProject, type MediaItem, type Project } from './model';
import type { PackClip } from './packs';
import { createTextClip, TEXT_PRESETS } from './text';

const song: MediaItem = { id: 's', kind: 'audio', name: 's.mp3', file: {} as File, url: '', thumbnail: null, duration: 5, width: 0, height: 0, hasAudio: true };
const video: MediaItem = { ...song, id: 'v', kind: 'video', name: 'v.mp4', duration: 3, width: 1920, height: 1080 };

function pack(id: string, start: number, duration: number, attached?: string[]): PackClip {
  return { id, packId: 'p', name: 'Pacote', color: '#fff', start, duration, intensity: 1, fadeIn: 0, fadeOut: 0, effects: [], filter: null, camera: null, timing: 'edges', attached };
}

/** Som 0–5 s, texto 2–4 s, texto 10–12 s, sobreposição 3–6 s e pacote 20–21 s (que leva o texto "t3"). */
function build(): Project {
  const base = createProject();
  const text = (id: string, start: number, duration: number) => ({ ...createTextClip(TEXT_PRESETS[0], start, duration), id });
  return {
    ...base,
    media: [song, video],
    audioTracks: [{ ...base.audioTracks[0], clips: [{ ...createAudioClip(song, 0), id: 'a1' }] }],
    textTracks: [{ ...base.textTracks[0], clips: [text('t1', 2, 2), text('t2', 10, 2), text('t3', 20, 1)] }],
    videoTracks: [{ id: 'vt', name: 'Vídeo 2', hidden: false, muted: false, clips: [{ ...createOverlayClip(video, 3), id: 'o1' }] }],
    packTracks: [{ ...base.packTracks[0], clips: [pack('k1', 20, 1, ['t3'])] }],
  };
}

describe('groupWithRange', () => {
  it('agrupa o item com tudo o que está no mesmo trecho', () => {
    const { project, count } = groupWithRange(build(), 'a1');
    expect(count).toBe(3);
    const group = groupOf(project, 'a1')!;
    expect(group).toBeDefined();
    expect(groupOf(project, 't1')).toBe(group);
    expect(groupOf(project, 'o1')).toBe(group);
    expect(groupOf(project, 't2')).toBeUndefined();
    expect(groupSize(project, group)).toBe(3);
  });

  it('item sozinho no trecho forma um grupo só com ele; itens que só encostam não entram', () => {
    expect(groupWithRange(build(), 't2').count).toBe(1);
    // Texto colado no fim do som (5–6 s): encosta, mas não sobrepõe.
    const base = build();
    const touching = { ...base.textTracks[0].clips[0], id: 't4', start: 5, duration: 1 };
    const p = { ...base, videoTracks: [], textTracks: [{ ...base.textTracks[0], clips: [...base.textTracks[0].clips, touching] }] };
    const { project, count } = groupWithRange(p, 'a1');
    expect(count).toBe(2); // som + t1
    expect(groupOf(project, 't4')).toBeUndefined();
  });

  it('item que não existe: nada muda', () => {
    const p = build();
    expect(groupWithRange(p, 'nada')).toEqual({ project: p, count: 0 });
  });
});

describe('mover em grupo', () => {
  it('shiftGroup leva os outros itens do grupo pelo mesmo tanto', () => {
    const grouped = groupItems(build(), ['a1', 't2', 'o1']);
    const next = shiftGroup(grouped, 'a1', 3);
    expect(itemStart(next, 'a1')).toBe(0); // o arrastado já foi movido por quem chamou
    expect(itemStart(next, 't2')).toBe(13);
    expect(itemStart(next, 'o1')).toBe(6);
    expect(itemStart(next, 't1')).toBe(2); // fora do grupo
  });

  it('item sem grupo não leva ninguém', () => {
    const p = build();
    expect(shiftGroup(p, 'a1', 3)).toBe(p);
  });

  it('shiftItems não deixa nenhum item passar do zero', () => {
    const next = shiftItems(build(), ['t1', 't2'], -5);
    expect(itemStart(next, 't1')).toBe(0);
    expect(itemStart(next, 't2')).toBe(5);
  });

  it('mover um pacote leva junto o que veio com ele', () => {
    const next = shiftItems(build(), ['k1'], 2);
    expect(itemStart(next, 'k1')).toBe(22);
    expect(itemStart(next, 't3')).toBe(22);
  });

  it('deslocamento zero ou lista vazia devolve o mesmo projeto', () => {
    const p = build();
    expect(shiftItems(p, ['a1'], 0)).toBe(p);
    expect(shiftItems(p, [], 5)).toBe(p);
  });
});

describe('ungroup', () => {
  it('tira todos os itens do grupo', () => {
    const grouped = groupItems(build(), ['a1', 't1', 'k1']);
    const group = groupOf(grouped, 'k1')!;
    expect(groupSize(grouped, group)).toBe(3);
    const next = ungroup(grouped, group);
    expect(groupSize(next, group)).toBe(0);
    expect(groupOf(next, 'a1')).toBeUndefined();
  });
});
