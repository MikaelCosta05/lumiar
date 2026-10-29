import { describe, expect, it } from 'vitest';
import {
  createAudioClip,
  createOverlayClip,
  createProject,
  createVideoClip,
  layoutProject,
  MIN_LENGTH,
  type MediaItem,
  type Project,
  type TransitionInstance,
  type VideoClip,
} from './model';
import { applyTrim, beginTrim, rollEdit, rollTarget, slideClip, slipClip } from './trimTools';

function media(id: string, duration = 30, kind: MediaItem['kind'] = 'video'): MediaItem {
  return { id, kind, name: `${id}.mp4`, file: {} as File, url: '', thumbnail: null, duration, width: 1920, height: 1080, hasAudio: true };
}

const video = media('v');
const short = media('curto', 4);
const photo = media('foto', 3600, 'image');
const sound = media('som', 20, 'audio');

function clip(id: string, trimIn: number, trimOut: number, extra: Partial<VideoClip> = {}, m: MediaItem = video): VideoClip {
  return { ...createVideoClip(m), id, trimIn, trimOut, ...extra };
}

function dissolve(duration: number): TransitionInstance {
  return { pluginId: 'transitions/dissolver', duration, params: {} };
}

/** Trilha principal com cortes secos (ou as transições dadas). */
function build(clips: VideoClip[], transitions: (TransitionInstance | null)[] = clips.slice(1).map(() => null)): Project {
  return { ...createProject(), media: [video, short, photo, sound], clips, transitions };
}

const starts = (p: Project) => layoutProject(p).clips.map((l) => +l.start.toFixed(6));
const lengths = (p: Project) => layoutProject(p).clips.map((l) => +l.length.toFixed(6));
const duration = (p: Project) => +layoutProject(p).videoDuration.toFixed(6);
const trims = (p: Project, id: string) => {
  const c = p.clips.find((x) => x.id === id)!;
  return [+c.trimIn.toFixed(6), +c.trimOut.toFixed(6)];
};

describe('slip', () => {
  it('entrada e saída andam juntas; lugar e tamanho continuam', () => {
    const p = build([clip('a', 0, 5), clip('b', 10, 14), clip('c', 0, 3)]);
    const r = slipClip(p, 'b', 2)!;
    expect(trims(r.project, 'b')).toEqual([12, 16]);
    expect(starts(r.project)).toEqual(starts(p));
    expect(lengths(r.project)).toEqual(lengths(p));
    expect(r.left).toEqual({ mediaId: 'v', time: 12, edge: 'in' });
    expect(r.right).toEqual({ mediaId: 'v', time: 16, edge: 'out' });
  });

  it('para no começo e no fim do arquivo', () => {
    const p = build([clip('a', 3, 8)]);
    expect(slipClip(p, 'a', -10)!.delta).toBe(-3);
    expect(trims(slipClip(p, 'a', -10)!.project, 'a')).toEqual([0, 5]);
    expect(slipClip(p, 'a', 100)!.delta).toBe(22);
    expect(trims(slipClip(p, 'a', 100)!.project, 'a')).toEqual([25, 30]);
  });

  it('clipe que usa o arquivo inteiro não desliza', () => {
    const p = build([clip('a', 0, 30)]);
    expect(slipClip(p, 'a', 5)!.delta).toBe(0);
    expect(slipClip(p, 'a', -5)!.delta).toBe(0);
  });

  it('com velocidade, o arrasto na timeline vira segundos do arquivo', () => {
    const p = build([clip('a', 10, 14, { speed: 2 })]);
    const session = beginTrim(p, 'slip', 'a')!;
    // Arrastar 1 s para a direita mostra 2 s do arquivo que vinham antes.
    const r = applyTrim(p, session, 1)!;
    expect(r.delta).toBe(-2);
    expect(trims(r.project, 'a')).toEqual([8, 12]);
    expect(lengths(r.project)).toEqual([2]);
  });

  it('imagens não têm o que deslizar', () => {
    const p = build([clip('f', 0, 5, {}, photo)]);
    expect(slipClip(p, 'f', 1)).toBeNull();
    expect(beginTrim(p, 'slip', 'f')).toBeNull();
  });

  it('vale para sobreposições e áudios, sem mudar o início', () => {
    const base = build([clip('a', 0, 5)]);
    const overlay = { ...createOverlayClip(video, 2), id: 'o', trimIn: 1, trimOut: 4 };
    const audio = { ...createAudioClip(sound, 3), id: 's', trimIn: 15, trimOut: 19 };
    const p: Project = {
      ...base,
      videoTracks: [{ id: 'vt', name: 'Vídeo 2', hidden: false, muted: false, clips: [overlay] }],
      audioTracks: [{ ...base.audioTracks[0], clips: [audio] }],
    };
    const o = slipClip(p, 'o', -5)!.project.videoTracks[0].clips[0];
    expect([o.start, o.trimIn, o.trimOut]).toEqual([2, 0, 3]);
    const s = slipClip(p, 's', 5)!.project.audioTracks[0].clips[0];
    expect([s.start, s.trimIn, s.trimOut]).toEqual([3, 16, 20]);
  });

  it('clipe que não existe dá null', () => {
    expect(slipClip(build([]), 'x', 1)).toBeNull();
  });
});

describe('slide', () => {
  it('o clipe anda entre os vizinhos e a duração total fica a mesma', () => {
    const p = build([clip('a', 0, 5), clip('b', 10, 13), clip('c', 5, 10), clip('d', 0, 2)]);
    const r = slideClip(p, 'b', 1)!;
    expect(r.delta).toBe(1);
    expect(r.at).toBe(6);
    expect(trims(r.project, 'a')).toEqual([0, 6]);
    expect(trims(r.project, 'b')).toEqual([10, 13]);
    expect(trims(r.project, 'c')).toEqual([6, 10]);
    expect(starts(r.project)).toEqual([0, 6, 9, 13]);
    expect(duration(r.project)).toBe(duration(p));
    expect(r.left).toEqual({ mediaId: 'v', time: 6, edge: 'out' });
    expect(r.right).toEqual({ mediaId: 'v', time: 6, edge: 'in' });
  });

  it('para a esquerda: o anterior encolhe e o próximo começa antes', () => {
    const p = build([clip('a', 0, 5), clip('b', 10, 13), clip('c', 5, 10)]);
    const r = slideClip(p, 'b', -2)!;
    expect(trims(r.project, 'a')).toEqual([0, 3]);
    expect(trims(r.project, 'c')).toEqual([3, 10]);
    expect(duration(r.project)).toBe(duration(p));
  });

  it('o primeiro e o último clipe não deslizam (precisa de um vizinho de cada lado)', () => {
    const p = build([clip('a', 0, 5), clip('b', 0, 5), clip('c', 0, 5)]);
    expect(slideClip(p, 'a', 1)).toBeNull();
    expect(slideClip(p, 'c', 1)).toBeNull();
    expect(beginTrim(p, 'slide', 'a')).toBeNull();
    expect(slideClip(build([clip('a', 0, 5)]), 'a', 1)).toBeNull();
  });

  it('respeita o fim do arquivo do anterior e o começo do arquivo do próximo', () => {
    // O anterior já vai até o fim do arquivo; o próximo já começa no 0.
    const p = build([clip('a', 25, 30), clip('b', 0, 3), clip('c', 0, 5)]);
    expect(slideClip(p, 'b', 2)!.delta).toBe(0);
    expect(slideClip(p, 'b', -2)!.delta).toBe(0);
    const q = build([clip('a', 20, 28), clip('b', 0, 3), clip('c', 1.5, 6)]);
    expect(slideClip(q, 'b', 5)!.delta).toBe(2);
    expect(slideClip(q, 'b', -5)!.delta).toBe(-1.5);
  });

  it('nenhum vizinho fica menor que o mínimo', () => {
    const p = build([clip('a', 0, 1), clip('b', 10, 12), clip('c', 5, 6)]);
    expect(slideClip(p, 'b', 5)!.delta).toBeCloseTo(1 - MIN_LENGTH);
    expect(slideClip(p, 'b', -5)!.delta).toBeCloseTo(-(1 - MIN_LENGTH));
    expect(lengths(slideClip(p, 'b', -5)!.project)[0]).toBeCloseTo(MIN_LENGTH);
  });

  it('usa a velocidade de cada vizinho', () => {
    const p = build([clip('a', 0, 10, { speed: 2 }), clip('b', 10, 12), clip('c', 4, 10, { speed: 0.5 })]);
    const r = slideClip(p, 'b', 1)!;
    expect(trims(r.project, 'a')).toEqual([0, 12]);
    expect(trims(r.project, 'c')).toEqual([4.5, 10]);
    expect(duration(r.project)).toBe(duration(p));
  });

  it('o limite do arquivo com velocidade é em segundos da timeline', () => {
    // Faltam 2 s de arquivo no anterior, a 2×: dá para andar 1 s.
    const p = build([clip('a', 20, 28, { speed: 2 }), clip('b', 0, 2), clip('c', 5, 10)]);
    expect(slideClip(p, 'b', 3)!.delta).toBe(1);
  });

  it('com transições: a sobreposição continua e o vizinho não fica menor que ela', () => {
    const p = build([clip('a', 0, 5), clip('b', 10, 14), clip('c', 5, 10)], [dissolve(1), dissolve(1)]);
    const r = slideClip(p, 'b', 3)!;
    // O próximo (5 s) só pode encolher até 2 × 1 s da transição.
    expect(r.delta).toBe(3);
    expect(lengths(r.project)[2]).toBe(2);
    expect(slideClip(p, 'b', 10)!.delta).toBe(3);
    expect(layoutProject(r.project).clips.map((l) => l.transitionIn)).toEqual([0, 1, 1]);
    expect(duration(r.project)).toBe(duration(p));
    expect(starts(r.project)).toEqual([0, 7, 10]);
  });
});

describe('roll', () => {
  it('o corte anda: um cresce, o outro encolhe, o total fica igual', () => {
    const p = build([clip('a', 0, 5), clip('b', 10, 15), clip('c', 0, 3)]);
    const r = rollEdit(p, 'a', 1.5)!;
    expect(trims(r.project, 'a')).toEqual([0, 6.5]);
    expect(trims(r.project, 'b')).toEqual([11.5, 15]);
    expect(starts(r.project)).toEqual([0, 6.5, 10]);
    expect(duration(r.project)).toBe(duration(p));
    expect(r.at).toBe(6.5);
    expect(r.left).toEqual({ mediaId: 'v', time: 6.5, edge: 'out' });
    expect(r.right).toEqual({ mediaId: 'v', time: 11.5, edge: 'in' });
  });

  it('o último clipe não tem corte depois dele', () => {
    const p = build([clip('a', 0, 5), clip('b', 0, 5)]);
    expect(rollEdit(p, 'b', 1)).toBeNull();
    expect(beginTrim(p, 'roll', 'b')).toBeNull();
    expect(beginTrim(p, 'roll', 'a')).not.toBeNull();
  });

  it('para no fim do arquivo da esquerda, no começo da direita e no tamanho mínimo', () => {
    const p = build([clip('a', 0, 4, {}, short), clip('b', 2, 5), clip('c', 0, 3)]);
    // A esquerda usa o arquivo de 4 s inteiro: o corte não vai para a direita.
    expect(rollEdit(p, 'a', 1)!.delta).toBe(0);
    // A direita começa no 2 s do arquivo: o corte volta no máximo 2 s.
    expect(rollEdit(p, 'a', -10)!.delta).toBe(-2);
    // Entre b e c: c começa no 0 do arquivo e só pode encolher até o mínimo.
    expect(rollEdit(p, 'b', -10)!.delta).toBe(0);
    expect(rollEdit(p, 'b', 10)!.delta).toBeCloseTo(3 - MIN_LENGTH);
    // A esquerda também não fica menor que o mínimo.
    const q = build([clip('a', 0, 1), clip('b', 10, 20)]);
    expect(rollEdit(q, 'a', -10)!.delta).toBeCloseTo(-(1 - MIN_LENGTH));
  });

  it('usa a velocidade dos dois lados', () => {
    const p = build([clip('a', 0, 4, { speed: 2 }), clip('b', 4, 10, { speed: 0.5 })]);
    const r = rollEdit(p, 'a', 1)!;
    expect(trims(r.project, 'a')).toEqual([0, 6]);
    expect(trims(r.project, 'b')).toEqual([4.5, 10]);
    expect(duration(r.project)).toBe(duration(p));
  });

  it('imagens podem crescer até o máximo', () => {
    const p = build([clip('f', 0, 5, {}, photo), clip('b', 0, 30)]);
    const r = rollEdit(p, 'f', 10)!;
    expect(trims(r.project, 'f')).toEqual([0, 15]);
    expect(duration(r.project)).toBe(35);
  });

  it('o corte antes de uma imagem anda para a esquerda (a imagem cresce pelo fim)', () => {
    const p = build([clip('a', 0, 10), clip('f', 0, 5, {}, photo), clip('c', 0, 3)]);
    const r = rollEdit(p, 'a', -4)!;
    expect(r.delta).toBe(-4);
    expect(trims(r.project, 'a')).toEqual([0, 6]);
    expect(trims(r.project, 'f')).toEqual([0, 9]);
    expect(starts(r.project)).toEqual([0, 6, 15]);
    expect(duration(r.project)).toBe(duration(p));
    // Slide do clipe antes da foto para a esquerda: a foto cresce, o total fica igual.
    const s = slideClip(build([clip('x', 0, 5), clip('a', 0, 10), clip('f', 0, 5, {}, photo)]), 'a', -2)!;
    expect(s.delta).toBe(-2);
    expect(trims(s.project, 'f')).toEqual([0, 7]);
    expect(duration(s.project)).toBe(20);
  });

  it('transição que não cabia inteira fica com a duração que aparece (o total não muda ao crescer)', () => {
    // Transição de 2 s depois de um clipe de 2 s: só aparece 1 s (metade do clipe).
    const p = build([clip('a', 0, 2), clip('b', 10, 16)], [dissolve(2)]);
    expect(duration(p)).toBe(7);
    const r = rollEdit(p, 'a', 1)!;
    expect(r.delta).toBe(1);
    expect(r.project.transitions[0]!.duration).toBe(1);
    expect(layoutProject(r.project).clips[0].transitionOut).toBe(1);
    expect(duration(r.project)).toBe(7);
    // O clipe da esquerda não fica menor que 2 × 1 s; o da direita encolhe até 2 s.
    expect(rollEdit(p, 'a', -1)!.delta).toBe(0);
    expect(rollEdit(p, 'a', 10)!.delta).toBe(4);
  });

  it('uma transição que cabe não é alterada', () => {
    const p = build([clip('a', 0, 5), clip('b', 10, 15)], [dissolve(0.8)]);
    const r = rollEdit(p, 'a', 1)!;
    expect(r.project.transitions[0]).toBe(p.transitions[0]);
    expect(duration(r.project)).toBe(duration(p));
  });

  it('escolhe o corte da borda mais perto do clique', () => {
    const p = build([clip('a', 0, 5), clip('b', 0, 5), clip('c', 0, 5)]);
    const layout = layoutProject(p);
    expect(rollTarget(layout, 'b', true)).toBe('a');
    expect(rollTarget(layout, 'b', false)).toBe('b');
    expect(rollTarget(layout, 'a', true)).toBe('a');
    expect(rollTarget(layout, 'c', false)).toBe('b');
    expect(rollTarget(layoutProject(build([clip('a', 0, 5)])), 'a', true)).toBeNull();
  });
});

describe('arrastar', () => {
  it('é recalculado a partir do começo do arrasto e mantém o resto do projeto atual', () => {
    const p = build([clip('a', 0, 5), clip('b', 10, 15)]);
    const session = beginTrim(p, 'roll', 'a')!;
    let current = applyTrim(p, session, 1)!.project;
    // Algo mudou no meio do arrasto (um marcador): continua lá.
    current = { ...current, markers: [{ id: 'm', time: 1, label: 'x', color: '#fff' }] };
    current = applyTrim(current, session, 2)!.project;
    expect(trims(current, 'a')).toEqual([0, 7]);
    expect(current.markers).toHaveLength(1);
    // Voltar para o ponto de partida devolve os cortes originais.
    current = applyTrim(current, session, 0)!.project;
    expect(trims(current, 'a')).toEqual([0, 5]);
    expect(trims(current, 'b')).toEqual([10, 15]);
  });

  it('o áudio separado do clipe acompanha e continua sincronizado', () => {
    const base = build([clip('a', 0, 5), clip('b', 10, 15, { audioDetached: true }), clip('c', 0, 5)]);
    const detached = { ...createAudioClip(video, 5), id: 'sep', trimIn: 10, trimOut: 15, volumeKeys: [{ time: 1, value: 0.5 }] };
    const other = { ...createAudioClip(sound, 5), id: 'musica', trimIn: 0, trimOut: 5 };
    const p: Project = { ...base, audioTracks: [{ ...base.audioTracks[0], clips: [detached, other] }] };

    const slid = slideClip(p, 'b', 1)!.project.audioTracks[0].clips;
    expect([slid[0].start, slid[0].trimIn, slid[0].trimOut]).toEqual([6, 10, 15]);
    expect(slid[0].volumeKeys).toEqual([{ time: 0, value: 0.5 }]);
    expect(slid[1]).toBe(other);

    const slipped = slipClip(p, 'b', 2)!.project.audioTracks[0].clips[0];
    expect([slipped.start, slipped.trimIn, slipped.trimOut]).toEqual([5, 12, 17]);

    const rolled = rollEdit(p, 'a', 1)!.project.audioTracks[0].clips[0];
    expect([rolled.start, rolled.trimIn, rolled.trimOut]).toEqual([6, 11, 15]);
  });
});
