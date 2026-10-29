import { describe, expect, it } from 'vitest';
import type { EffectInstance } from '../engine/types';
import { copyLook, copySelection, duplicate, pasteAt, pasteLook, visualClip } from './clipboard';
import { createAudioClip, createOverlayClip, createProject, createVideoClip, layoutProject, type MediaItem, type Project } from './model';
import type { PackClip } from './packs';
import { createTextClip, TEXT_PRESETS } from './text';

const video: MediaItem = { id: 'v', kind: 'video', name: 'v.mp4', file: {} as File, url: '', thumbnail: null, duration: 4, width: 1920, height: 1080, hasAudio: true };
const song: MediaItem = { ...video, id: 's', kind: 'audio', name: 's.mp3', duration: 3 };
const glow: EffectInstance = { uid: 'e1', pluginId: 'effects/brilho', enabled: true, params: { forca: 0.5 } };

function build(): Project {
  const base = createProject();
  const main = [
    { ...createVideoClip(video), id: 'c1', effects: [glow] },
    { ...createVideoClip(video), id: 'c2', filter: { pluginId: 'filters/cinema', intensity: 0.7, params: {} } },
  ];
  const pack: PackClip = {
    id: 'k1', packId: 'p', name: 'Pacote', color: '#fff', start: 1, duration: 2, intensity: 1, fadeIn: 0, fadeOut: 0,
    effects: [glow], filter: null, camera: null, timing: 'edges', attached: ['t1'],
  };
  return {
    ...base,
    media: [video, song],
    clips: main,
    transitions: [null],
    audioTracks: [{ ...base.audioTracks[0], clips: [{ ...createAudioClip(song, 2), id: 'a1' }] }],
    textTracks: [{ ...base.textTracks[0], clips: [{ ...createTextClip(TEXT_PRESETS[0], 1, 2), id: 't1' }] }],
    videoTracks: [{ id: 'vt', name: 'Vídeo 2', hidden: false, muted: false, clips: [{ ...createOverlayClip(video, 0), id: 'o1' }] }],
    packTracks: [{ ...base.packTracks[0], clips: [pack] }],
  };
}

describe('copiar', () => {
  it('copySelection pega o item certo de cada tipo', () => {
    const p = build();
    expect(copySelection(p, { kind: 'clip', id: 'c1' })).toMatchObject({ kind: 'clip', clip: { id: 'c1' } });
    expect(copySelection(p, { kind: 'audio', id: 'a1' })).toMatchObject({ kind: 'audio', clip: { id: 'a1' } });
    expect(copySelection(p, { kind: 'text', id: 't1' })).toMatchObject({ kind: 'text', clip: { id: 't1' } });
    expect(copySelection(p, { kind: 'overlay', id: 'o1' })).toMatchObject({ kind: 'overlay', clip: { id: 'o1' } });
    expect(copySelection(p, { kind: 'pack', id: 'k1' })).toMatchObject({ kind: 'pack', clip: { id: 'k1' } });
  });

  it('nada selecionado, transição ou id que não existe: nada copiado', () => {
    const p = build();
    expect(copySelection(p, null)).toBeNull();
    expect(copySelection(p, { kind: 'transition', index: 0 })).toBeNull();
    expect(copySelection(p, { kind: 'clip', id: 'nada' })).toBeNull();
  });

  it('copyLook só vale para clipes de vídeo', () => {
    const p = build();
    expect(copyLook(p, { kind: 'clip', id: 'c2' })).toEqual({ kind: 'look', filter: p.clips[1].filter, effects: [] });
    expect(copyLook(p, { kind: 'audio', id: 'a1' })).toBeNull();
    expect(visualClip(p, { kind: 'overlay', id: 'o1' })?.id).toBe('o1');
  });
});

describe('colar', () => {
  it('clipe da trilha principal entra na junção mais perto do instante', () => {
    const p = build(); // c1: 0–4, c2: 4–8
    const item = copySelection(p, { kind: 'clip', id: 'c1' })!;
    const early = pasteAt(p, item, 1)!;
    expect(early.selection).toEqual({ kind: 'clip', id: early.project.clips[0].id });
    expect(early.project.clips[1].id).toBe('c1');
    const middle = pasteAt(p, item, 5)!;
    const ids = middle.project.clips.map((c) => c.id);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe('c1');
    expect(ids[2]).toBe('c2');
    expect(layoutProject(middle.project).clips).toHaveLength(3);
  });

  // Limite conhecido, o mesmo do splitVideoClip (ver model.test.ts): com um clipe órfão, pasteAt conta a
  // posição entre os clipes válidos mas insere em project.clips, e a cópia entra uma posição antes.
  // storage.ts (revive) tira esses clipes ao abrir o projeto, então isso não acontece no editor.
  it.fails('com um clipe de mídia que sumiu antes, a cópia entra na junção certa', () => {
    const p = build();
    const ghost = { ...p.clips[0], id: 'orfao', mediaId: 'sumiu' };
    const withGhost = { ...p, clips: [ghost, ...p.clips], transitions: [null, null] };
    // c1: 0–4, c2: 4–8. Colar em 5 = entre c1 e c2.
    const result = pasteAt(withGhost, copySelection(p, { kind: 'clip', id: 'c2' })!, 5)!;
    const ids = result.project.clips.map((c) => c.id);
    const pastedId = result.selection?.kind === 'clip' ? result.selection.id : '';
    expect(ids).toEqual(['orfao', 'c1', pastedId, 'c2']);
  });

  it('a cópia tem id novo e efeitos com uid novo', () => {
    const p = build();
    const result = pasteAt(p, copySelection(p, { kind: 'clip', id: 'c1' })!, 10)!;
    const pasted = result.project.clips[result.project.clips.length - 1];
    expect(pasted.id).not.toBe('c1');
    expect(pasted.effects[0].uid).not.toBe('e1');
    expect(pasted.effects[0].params).toEqual(glow.params);
  });

  it('áudio colado no instante pedido, na mesma trilha se estiver livre', () => {
    const p = build();
    const result = pasteAt(p, copySelection(p, { kind: 'audio', id: 'a1' })!, 10)!;
    expect(result.project.audioTracks).toHaveLength(1);
    expect(result.project.audioTracks[0].clips.map((c) => c.start)).toEqual([2, 10]);
  });

  it('pacote colado leva só o visual (sem os textos e a câmera lenta do original)', () => {
    const p = build();
    const result = pasteAt(p, copySelection(p, { kind: 'pack', id: 'k1' })!, 5)!;
    const pasted = result.project.packTracks[0].clips.find((c) => c.id !== 'k1')!;
    expect(pasted.start).toBe(5);
    expect(pasted.attached).toBeUndefined();
    expect(pasted.speed).toBeUndefined();
  });

  it('pasteLook troca o filtro e os efeitos do clipe', () => {
    const p = build();
    const look = copyLook(p, { kind: 'clip', id: 'c1' })!;
    const next = pasteLook(p, { kind: 'clip', id: 'c2' }, look);
    expect(next.clips[1].filter).toBeNull();
    expect(next.clips[1].effects.map((e) => e.pluginId)).toEqual(['effects/brilho']);
    expect(next.clips[1].effects[0].uid).not.toBe('e1');
    // Colar algo que não é "look" não muda nada.
    expect(pasteLook(p, { kind: 'clip', id: 'c2' }, copySelection(p, { kind: 'clip', id: 'c1' })!)).toBe(p);
  });
});

describe('duplicate', () => {
  it('clipe da trilha principal: a cópia entra logo depois do original', () => {
    const result = duplicate(build(), { kind: 'clip', id: 'c1' })!;
    const ids = result.project.clips.map((c) => c.id);
    expect(ids[0]).toBe('c1');
    expect(ids[2]).toBe('c2');
    expect(result.project.transitions).toHaveLength(2);
  });

  it('texto e áudio: a cópia começa onde o original termina', () => {
    const text = duplicate(build(), { kind: 'text', id: 't1' })!;
    expect(text.project.textTracks[0].clips.map((c) => c.start)).toEqual([1, 3]);
    const audio = duplicate(build(), { kind: 'audio', id: 'a1' })!;
    expect(audio.project.audioTracks[0].clips.map((c) => c.start)).toEqual([2, 5]);
  });

  it('nada selecionado: nada duplicado', () => {
    expect(duplicate(build(), null)).toBeNull();
  });
});
