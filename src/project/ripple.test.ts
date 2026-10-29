import { describe, expect, it } from 'vitest';
import type { Caption } from './captions';
import { createAudioClip, createProject, createVideoClip, layoutProject, type MediaItem, type Project, type VideoClip } from './model';
import { closeGap, closeGaps, deleteMainClip, removeTimeRanges } from './ripple';
import type { TextClip } from './text';

function media(id: string, duration = 30, kind: MediaItem['kind'] = 'video'): MediaItem {
  return { id, kind, name: `${id}.mp4`, file: {} as File, url: '', thumbnail: null, duration, width: 1920, height: 1080, hasAudio: true };
}

function clip(m: MediaItem, trimIn: number, trimOut: number): VideoClip {
  return { ...createVideoClip(m), trimIn, trimOut };
}

/** Projeto com trilha principal (cortes secos) e um áudio em cada um dos instantes `audioAt`. */
function build(clips: VideoClip[], audioAt: number[] = []): Project {
  const video = media('v');
  const sound = media('som', 1, 'audio');
  const base = createProject();
  return {
    ...base,
    media: [video, sound],
    clips,
    transitions: clips.slice(1).map(() => null),
    audioTracks: [{ ...base.audioTracks[0], clips: audioAt.map((t, i) => ({ ...createAudioClip(sound, t), id: `a${i}` })) }],
  };
}

const audioStarts = (p: Project) => p.audioTracks[0].clips.map((c) => c.start);

describe('closeGap', () => {
  it('o que vem depois do buraco anda junto; o que começava dentro vai para o começo dele', () => {
    const p = build([], [1, 3, 10]);
    const next = closeGap(p, 2, 5);
    expect(audioStarts(next)).toEqual([1, 2, 7]);
  });

  it('buraco vazio (ou invertido) não muda nada', () => {
    const p = build([], [10]);
    expect(closeGap(p, 5, 5)).toBe(p);
    expect(closeGap(p, 6, 5)).toBe(p);
  });

  it('marcadores, comentários e batidas andam junto; batidas dentro do buraco somem', () => {
    const p: Project = {
      ...build([]),
      markers: [{ id: 'm', time: 8, label: 'x', color: '#fff' }],
      comments: [{ id: 'c', time: 9, text: 'trocar a música', done: false }],
      beats: [1, 2.5, 4, 6],
    };
    const next = closeGap(p, 2, 5);
    expect(next.markers[0].time).toBe(5);
    expect(next.comments![0].time).toBe(6);
    expect(next.beats).toEqual([1, 3]);
  });

  it('o texto que segue um ponto leva os pontos junto', () => {
    const base = build([]);
    const text = {
      id: 't',
      start: 10,
      duration: 2,
      follow: { points: [{ t: 10, x: 0.1, y: 0.1 }, { t: 11, x: 0.2, y: 0.2 }], anchor: { x: 0, y: 0 } },
    } as TextClip;
    const p: Project = { ...base, textTracks: [{ ...base.textTracks[0], clips: [text] }] };
    const moved = closeGap(p, 2, 5).textTracks[0].clips[0];
    expect(moved.start).toBe(7);
    expect(moved.follow!.points.map((q) => q.t)).toEqual([7, 8]);
  });

  it('legendas: as palavras faladas no buraco somem e o texto da legenda é refeito', () => {
    const withWords: Caption = {
      id: 'c1',
      start: 1,
      end: 6,
      text: 'eu fui hum no mercado',
      words: [
        { text: 'eu', start: 1, end: 1.5 },
        { text: 'fui', start: 1.5, end: 2 },
        { text: 'hum', start: 2.2, end: 4.5 },
        { text: 'no', start: 5, end: 5.5 },
        { text: 'mercado', start: 5.5, end: 6 },
      ],
    };
    const manualInside: Caption = { id: 'c2', start: 2.5, end: 4, text: 'some' };
    const manualAfter: Caption = { id: 'c3', start: 8, end: 9, text: 'fica' };
    const onlyGap: Caption = { id: 'c4', start: 2.1, end: 4.9, text: 'hum', words: [{ text: 'hum', start: 2.1, end: 4.9 }] };
    const p: Project = { ...build([]), captions: { enabled: true, maxWords: 6, style: {} as never, captions: [withWords, manualInside, manualAfter, onlyGap] } };
    const captions = closeGap(p, 2, 5).captions!.captions;
    expect(captions.map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(captions[0].text).toBe('eu fui no mercado');
    expect([captions[0].start, captions[0].end]).toEqual([1, 3]);
    expect(captions[0].words!.map((w) => w.start)).toEqual([1, 1.5, 2, 2.5]);
    expect([captions[1].start, captions[1].end]).toEqual([5, 6]);
  });
});

describe('closeGaps', () => {
  it('fecha vários buracos com os tempos de antes da edição, em qualquer ordem', () => {
    const p = build([], [1, 5, 10]);
    // Buracos de 1 s e 2 s: o que estava em 10 vai para 7, o que estava em 5 vai para 4.
    const next = closeGaps(p, [
      [6, 8],
      [2, 3],
    ]);
    expect(audioStarts(next)).toEqual([1, 4, 7]);
  });
});

describe('removeTimeRanges', () => {
  it('tira o trecho do clipe e, com ripple, puxa o resto do projeto', () => {
    const v = media('v');
    const p = build([clip(v, 0, 10)], [6]);
    const { project, removed } = removeTimeRanges(p, [[2, 4]], true);
    expect(removed).toBeCloseTo(2);
    expect(project.clips.map((c) => [c.trimIn, c.trimOut])).toEqual([[0, 2], [4, 10]]);
    expect(audioStarts(project)).toEqual([4]);
    expect(layoutProject(project).videoDuration).toBeCloseTo(8);
  });

  it('sem ripple, só a trilha principal muda', () => {
    const v = media('v');
    const { project } = removeTimeRanges(build([clip(v, 0, 10)], [6]), [[2, 4]], false);
    expect(audioStarts(project)).toEqual([6]);
    expect(layoutProject(project).videoDuration).toBeCloseTo(8);
  });

  it('um trecho que pega dois clipes corta os dois', () => {
    const v = media('v');
    const p = build([clip(v, 0, 5), clip(v, 10, 15)]);
    const { project, removed } = removeTimeRanges(p, [[4, 6]], true);
    expect(removed).toBeCloseTo(2);
    expect(project.clips.map((c) => [c.trimIn, c.trimOut])).toEqual([[0, 4], [11, 15]]);
  });

  it('vários trechos: os de antes continuam no lugar certo', () => {
    const v = media('v');
    const p = build([clip(v, 0, 20)], [15]);
    const { project, removed } = removeTimeRanges(p, [[2, 3], [10, 12]], true);
    expect(removed).toBeCloseTo(3);
    expect(project.clips.map((c) => [c.trimIn, c.trimOut])).toEqual([[0, 2], [3, 10], [12, 20]]);
    expect(audioStarts(project)[0]).toBeCloseTo(12);
  });

  it('trechos minúsculos ou fora do vídeo não mudam nada', () => {
    const v = media('v');
    const p = build([clip(v, 0, 10)], [6]);
    expect(removeTimeRanges(p, [[3, 3.01]], true)).toEqual({ project: p, removed: 0 });
    expect(removeTimeRanges(p, [[20, 30]], true).removed).toBe(0);
  });

  it('um trecho que cobre o clipe inteiro tira o clipe', () => {
    const v = media('v');
    const p = build([clip(v, 0, 3), clip(v, 0, 5)]);
    const { project, removed } = removeTimeRanges(p, [[0, 3]], true);
    expect(removed).toBeCloseTo(3);
    expect(project.clips).toHaveLength(1);
    expect(project.transitions).toEqual([]);
  });
});

describe('deleteMainClip', () => {
  it('com ripple, o resto do projeto fecha o buraco do clipe', () => {
    const v = media('v');
    const c = [clip(v, 0, 4), clip(v, 0, 6), clip(v, 0, 2)];
    const p = build(c, [2, 12]);
    const next = deleteMainClip(p, c[1].id, true);
    expect(next.clips.map((x) => x.id)).toEqual([c[0].id, c[2].id]);
    expect(audioStarts(next)).toEqual([2, 6]);
  });

  it('sem ripple, só o clipe sai', () => {
    const v = media('v');
    const c = [clip(v, 0, 4), clip(v, 0, 6)];
    const next = deleteMainClip(build(c, [12]), c[0].id, false);
    expect(next.clips).toHaveLength(1);
    expect(audioStarts(next)).toEqual([12]);
  });

  it('clipe que não existe: nada muda', () => {
    const p = build([clip(media('v'), 0, 4)], [5]);
    expect(deleteMainClip(p, 'nao-existe', true).clips).toHaveLength(1);
    expect(audioStarts(deleteMainClip(p, 'nao-existe', true))).toEqual([5]);
  });
});
