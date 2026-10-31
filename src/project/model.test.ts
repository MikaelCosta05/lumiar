import { describe, expect, it } from 'vitest';
import {
  audioAt,
  clipLength,
  createAudioClip,
  createProject,
  createVideoClip,
  DEFAULT_TRANSITION_ID,
  duckFactor,
  DUCK_RAMP,
  editPoints,
  fadeGain,
  fitToBeats,
  insertVideoClips,
  keepRanges,
  layoutProject,
  maskAt,
  placeAudioClip,
  removeClip,
  resolveFrame,
  splitVideoClip,
  trimVideoClip,
  turnClip,
  voiceIntervals,
  volumeAt,
  type AudioTrack,
  type MediaItem,
  type MediaKind,
  type Project,
  type TransitionInstance,
  type VideoClip,
} from './model';

// ---------------------------------------------------------------- Fábricas para os testes

function media(id: string, duration = 10, kind: MediaKind = 'video', hasAudio = true): MediaItem {
  return { id, kind, name: `${id}.mp4`, file: {} as File, url: '', thumbnail: null, duration, width: 1920, height: 1080, hasAudio };
}

function clip(m: MediaItem, trimIn: number, trimOut: number, extra: Partial<VideoClip> = {}): VideoClip {
  return { ...createVideoClip(m), trimIn, trimOut, ...extra };
}

const dissolve = (duration: number): TransitionInstance => ({ pluginId: DEFAULT_TRANSITION_ID, duration, params: {} });

/** Projeto com a trilha principal montada à mão (transições null = cortes secos). */
function project(clips: VideoClip[], items: MediaItem[], transitions: (TransitionInstance | null)[] = clips.slice(1).map(() => null)): Project {
  return { ...createProject(), media: items, clips, transitions };
}

describe('layoutProject', () => {
  it('projeto vazio tem duração zero', () => {
    const tl = layoutProject(createProject());
    expect(tl.clips).toEqual([]);
    expect(tl.overlays).toEqual([]);
    expect(tl.videoDuration).toBe(0);
    expect(tl.duration).toBe(0);
  });

  it('clipes com corte seco ficam um depois do outro', () => {
    const a = media('a');
    const p = project([clip(a, 0, 4), clip(a, 2, 8), clip(a, 5, 7)], [a]);
    const tl = layoutProject(p);
    expect(tl.clips.map((l) => l.start)).toEqual([0, 4, 10]);
    expect(tl.clips.map((l) => l.length)).toEqual([4, 6, 2]);
    expect(tl.videoDuration).toBe(12);
  });

  it('a transição sobrepõe os clipes e fica limitada à metade do menor', () => {
    const a = media('a');
    const p = project([clip(a, 0, 4), clip(a, 0, 6), clip(a, 0, 6)], [a], [dissolve(5), dissolve(1)]);
    const tl = layoutProject(p);
    // 5 s pedidos, mas o primeiro clipe tem 4 s: a sobreposição vira 2 s.
    expect(tl.clips[0].transitionOut).toBe(2);
    expect(tl.clips[1].transitionIn).toBe(2);
    expect(tl.clips[1].start).toBe(2);
    expect(tl.clips[2].start).toBe(7);
    expect(tl.videoDuration).toBe(13);
  });

  it('velocidade muda a duração na timeline', () => {
    const a = media('a');
    const tl = layoutProject(project([clip(a, 0, 10, { speed: 2 })], [a]));
    expect(tl.videoDuration).toBe(5);
    expect(clipLength({ trimIn: 0, trimOut: 10, speed: 0.5 })).toBe(20);
    // Velocidade inválida conta como 1.
    expect(clipLength({ trimIn: 0, trimOut: 10, speed: 0 })).toBe(10);
  });

  it('clipes com mídia que não existe mais são ignorados', () => {
    const a = media('a');
    const ghost = media('sumiu');
    const tl = layoutProject(project([clip(a, 0, 3), clip(ghost, 0, 5)], [a]));
    expect(tl.clips).toHaveLength(1);
    expect(tl.videoDuration).toBe(3);
  });

  it('a duração total inclui áudio, textos e legendas depois do vídeo', () => {
    const a = media('a');
    const music = media('musica', 30, 'audio');
    let p = project([clip(a, 0, 5)], [a, music]);
    p = placeAudioClip(p, { ...createAudioClip(music, 2), trimOut: 10 });
    expect(layoutProject(p).duration).toBe(12);
    p = { ...p, captions: { enabled: true, maxWords: 6, style: {} as never, captions: [{ id: 'c', start: 14, end: 15, text: 'oi' }] } };
    expect(layoutProject(p).duration).toBe(15);
    expect(layoutProject(p).videoDuration).toBe(5);
  });
});

describe('trilha principal: inserir, remover e cortar', () => {
  it('insertVideoClips dá a transição padrão para as junções novas', () => {
    const a = media('a');
    const p = insertVideoClips(project([], [a]), [clip(a, 0, 2), clip(a, 0, 2), clip(a, 0, 2)]);
    expect(p.clips).toHaveLength(3);
    expect(p.transitions).toHaveLength(2);
    expect(p.transitions.every((t) => t?.pluginId === DEFAULT_TRANSITION_ID)).toBe(true);
  });

  it('insertVideoClips sem clipes devolve o mesmo projeto', () => {
    const p = createProject();
    expect(insertVideoClips(p, [])).toBe(p);
  });

  it('removeClip tira o clipe e uma transição', () => {
    const a = media('a');
    const c = [clip(a, 0, 2), clip(a, 0, 2), clip(a, 0, 2)];
    const p = removeClip(project(c, [a], [dissolve(0.5), null]), c[1].id);
    expect(p.clips.map((x) => x.id)).toEqual([c[0].id, c[2].id]);
    expect(p.transitions).toHaveLength(1);
    expect(removeClip(p, 'nao-existe')).toBe(p);
  });

  it('splitVideoClip divide no instante certo e põe corte seco no meio', () => {
    const a = media('a');
    const c = clip(a, 1, 9);
    const result = splitVideoClip(project([c], [a]), c.id, 3)!;
    expect(result).not.toBeNull();
    const [first, second] = result.project.clips;
    expect(first.id).toBe(c.id);
    expect([first.trimIn, first.trimOut]).toEqual([1, 4]);
    expect([second.trimIn, second.trimOut]).toEqual([4, 9]);
    expect(second.id).toBe(result.newId);
    expect(result.project.transitions).toEqual([null]);
  });

  it('splitVideoClip respeita a velocidade do clipe', () => {
    const a = media('a', 20);
    const c = clip(a, 0, 20, { speed: 2 });
    const result = splitVideoClip(project([c], [a]), c.id, 2)!;
    expect(result.project.clips[0].trimOut).toBe(4);
  });

  // Limite conhecido: com um clipe "órfão" (mídia que não existe mais) na trilha principal, layoutProject
  // pula o clipe, ClipLayout.index vira a posição entre os válidos e splitVideoClip usa esse índice direto
  // em project.clips: apaga o órfão e duplica o clipe cortado. Por isso storage.ts (revive) tira os clipes
  // das mídias que não voltaram ao abrir o projeto, e órfãos não chegam aqui.
  it.fails('splitVideoClip com um clipe de mídia que sumiu antes dele corta o clipe certo', () => {
    const a = media('a');
    const ghost = clip(media('sumiu'), 0, 5);
    const c = clip(a, 0, 10);
    const result = splitVideoClip(project([ghost, c], [a]), c.id, 3)!;
    expect(result.project.clips.map((x) => [x.mediaId, x.trimIn, x.trimOut])).toEqual([
      ['sumiu', 0, 5],
      ['a', 0, 3],
      ['a', 3, 10],
    ]);
  });

  it('splitVideoClip recusa cortar colado nas pontas', () => {
    const a = media('a');
    const c = clip(a, 0, 5);
    const p = project([c], [a]);
    expect(splitVideoClip(p, c.id, 0.05)).toBeNull();
    expect(splitVideoClip(p, c.id, 4.95)).toBeNull();
    expect(splitVideoClip(p, 'nao-existe', 2)).toBeNull();
  });

  it('splitVideoClip leva os keyframes da segunda parte para o começo dela', () => {
    const a = media('a');
    const c = clip(a, 0, 10, {
      effects: [{ uid: 'e1', pluginId: 'effects/x', enabled: true, params: {}, keyframes: { forca: [{ time: 1, value: 0, easing: 'linear' }, { time: 6, value: 1, easing: 'linear' }] } }],
    });
    const second = splitVideoClip(project([c], [a]), c.id, 4)!.project.clips[1];
    // O keyframe de 1 s ficou antes do corte e sai; o de 6 s vira 2 s.
    expect(second.effects[0].keyframes!.forca).toEqual([{ time: 2, value: 1, easing: 'linear' }]);
    expect(second.effects[0].uid).not.toBe('e1');
  });

  it('keepRanges deixa só os trechos pedidos e diz quanto saiu', () => {
    const a = media('a');
    const c = clip(a, 0, 10);
    const result = keepRanges(project([c], [a]), c.id, [[0, 2], [5, 8]])!;
    expect(result.removed).toBe(5);
    expect(result.project.clips.map((x) => [x.trimIn, x.trimOut])).toEqual([[0, 2], [5, 8]]);
    expect(result.project.clips[0].id).toBe(c.id);
    expect(result.project.transitions).toEqual([null]);
    expect(layoutProject(result.project).videoDuration).toBe(5);
  });

  it('keepRanges limita os trechos ao corte do clipe e ignora pedaços minúsculos', () => {
    const a = media('a');
    const c = clip(a, 2, 8);
    const result = keepRanges(project([c], [a]), c.id, [[0, 4], [6, 6.05], [7, 20]])!;
    expect(result.project.clips.map((x) => [x.trimIn, x.trimOut])).toEqual([[2, 4], [7, 8]]);
    expect(result.removed).toBeCloseTo(3);
    expect(keepRanges(project([c], [a]), c.id, [[3, 3.05]])).toBeNull();
  });

  it('trimVideoClip não passa dos limites da mídia', () => {
    const a = media('a', 10);
    const c = clip(a, 2, 8);
    const p = project([c], [a]);
    expect(trimVideoClip(p, c.id, 'out', 50).clips[0].trimOut).toBe(10);
    expect(trimVideoClip(p, c.id, 'in', -3).clips[0].trimIn).toBe(0);
    // A entrada não pode passar da saída (fica pelo menos 0,1 s).
    expect(trimVideoClip(p, c.id, 'in', 9).clips[0].trimIn).toBeCloseTo(7.9);
  });

  it('turnClip gira nos dois sentidos sem sair de 0 a 270', () => {
    const a = media('a');
    const c = clip(a, 0, 1);
    expect(turnClip(c, -90).turn).toBe(270);
    expect(turnClip(turnClip(c, 90), 90).turn).toBe(180);
    expect(turnClip({ ...c, turn: 270 }, 90).turn).toBe(0);
  });
});

describe('fitToBeats', () => {
  it('cada clipe dura `every` batidas e os cortes caem nas batidas', () => {
    const a = media('a');
    const b = media('b');
    const p = project([clip(a, 0, 10), clip(b, 0, 10)], [a, b]);
    const result = fitToBeats(p, [1, 2, 3, 4, 5, 6], 2, false)!;
    expect(result.cuts).toBe(2);
    const tl = layoutProject(result.project);
    expect(tl.clips.map((l) => [l.start, l.length])).toEqual([[0, 2], [2, 2]]);
    expect(result.project.transitions).toEqual([null]);
  });

  it('com `fill`, repete os clipes pegando o trecho seguinte do vídeo', () => {
    const a = media('a');
    const b = media('b');
    const ca = clip(a, 0, 10);
    const p = project([ca, clip(b, 0, 10)], [a, b]);
    const result = fitToBeats(p, [6, 5, 4, 3, 2, 1], 2, true)!;
    const clips = result.project.clips;
    expect(clips.map((c) => c.mediaId)).toEqual(['a', 'b', 'a']);
    // A segunda vez do clipe "a" continua de onde a primeira parou.
    expect([clips[2].trimIn, clips[2].trimOut]).toEqual([2, 4]);
    expect(clips[0].id).toBe(ca.id);
    expect(clips[2].id).not.toBe(ca.id);
    expect(layoutProject(result.project).videoDuration).toBe(6);
  });

  it('sem clipes ou sem batidas não faz nada', () => {
    const a = media('a');
    expect(fitToBeats(project([], [a]), [1, 2], 1, false)).toBeNull();
    expect(fitToBeats(project([clip(a, 0, 5)], [a]), [], 1, false)).toBeNull();
    // Batidas coladas no zero não contam.
    expect(fitToBeats(project([clip(a, 0, 5)], [a]), [0, 0.1], 1, false)).toBeNull();
  });
});

describe('volume, fades e música que abaixa sozinha', () => {
  it('volumeAt interpola em linha reta e segura as pontas', () => {
    const keys = [
      { time: 1, value: 0 },
      { time: 3, value: 2 },
    ];
    expect(volumeAt(undefined, 5)).toBe(1);
    expect(volumeAt(keys, 0)).toBe(0);
    expect(volumeAt(keys, 2)).toBe(1);
    expect(volumeAt(keys, 10)).toBe(2);
  });

  it('fadeGain sobe na entrada e desce na saída', () => {
    const c = { trimIn: 0, trimOut: 10, fadeIn: 2, fadeOut: 4 };
    expect(fadeGain(c, 0)).toBe(0);
    expect(fadeGain(c, 1)).toBe(0.5);
    expect(fadeGain(c, 5)).toBe(1);
    expect(fadeGain(c, 8)).toBe(0.5);
    expect(fadeGain(c, 10)).toBe(0);
  });

  it('voiceIntervals junta falas com pausa curta e ignora trilhas mudas', () => {
    const v = media('voz', 10, 'audio');
    const voice: AudioTrack = {
      id: 't1',
      name: 'Narração',
      muted: false,
      kind: 'voice',
      clips: [
        { ...createAudioClip(v, 0), trimOut: 2 },
        { ...createAudioClip(v, 2.5), trimOut: 1 }, // pausa de 0,5 s < 2 × rampa: junta
        { ...createAudioClip(v, 10), trimOut: 1 },
      ],
    };
    const muted: AudioTrack = { id: 't2', name: 'x', muted: true, kind: 'voice', clips: [{ ...createAudioClip(v, 20), trimOut: 1 }] };
    const p = { ...createProject(), media: [v], audioTracks: [voice, muted] };
    expect(voiceIntervals(p)).toEqual([
      [0, 3.5],
      [10, 11],
    ]);
  });

  it('duckFactor abaixa na voz e sobe aos poucos na rampa', () => {
    const intervals: [number, number][] = [[2, 4]];
    expect(duckFactor(0.3, intervals, 3)).toBe(0.3);
    expect(duckFactor(0.3, intervals, 10)).toBe(1);
    expect(duckFactor(0.3, intervals, 4 + DUCK_RAMP / 2)).toBeCloseTo(0.65);
    expect(duckFactor(0.3, intervals, 2 - DUCK_RAMP / 2)).toBeCloseTo(0.65);
  });

  it('audioAt aplica o ducking na trilha de música enquanto há voz', () => {
    const music = media('musica', 60, 'audio');
    const voz = media('voz', 10, 'audio');
    const p: Project = {
      ...createProject(),
      media: [music, voz],
      duckLevel: 0.25,
      audioTracks: [
        { id: 'm', name: 'Música', muted: false, kind: 'music', clips: [{ ...createAudioClip(music, 0), volume: 0.8 }] },
        { id: 'v', name: 'Voz', muted: false, kind: 'voice', clips: [{ ...createAudioClip(voz, 5), trimOut: 3 }] },
      ],
    };
    const tl = layoutProject(p);
    const gainOf = (t: number) => audioAt(p, tl, t).find((s) => s.media.id === 'musica')!.gain;
    expect(gainOf(1)).toBeCloseTo(0.8);
    expect(gainOf(6)).toBeCloseTo(0.2);
    expect(audioAt(p, tl, 6)).toHaveLength(2);
  });

  it('placeAudioClip cria trilha nova quando a preferida está ocupada', () => {
    const m = media('m', 10, 'audio');
    let p = createProject();
    p = placeAudioClip(p, createAudioClip(m, 0));
    expect(p.audioTracks).toHaveLength(1);
    p = placeAudioClip(p, createAudioClip(m, 5));
    expect(p.audioTracks).toHaveLength(2);
    // Depois do fim do primeiro, cabe de novo na trilha 1.
    p = placeAudioClip(p, createAudioClip(m, 10));
    expect(p.audioTracks[0].clips).toHaveLength(2);
  });
});

describe('resolveFrame', () => {
  it('na transição devolve os dois clipes com o progresso', () => {
    const a = media('a');
    const c = [clip(a, 0, 4), clip(a, 10, 14)];
    const p = project(c, [a], [dissolve(1)]);
    const tl = layoutProject(p);
    const frame = resolveFrame(p, tl, 3.5);
    expect(frame.a?.layout.clip.id).toBe(c[0].id);
    expect(frame.b?.layout.clip.id).toBe(c[1].id);
    expect(frame.transition?.progress).toBeCloseTo(0.5);
    expect(frame.b?.sourceTime).toBeCloseTo(10.5);
  });

  it('fora da transição só há um clipe, e depois do fim fica o último quadro', () => {
    const a = media('a');
    const c = [clip(a, 0, 4), clip(a, 0, 4)];
    const p = project(c, [a]);
    const tl = layoutProject(p);
    expect(resolveFrame(p, tl, 5).b).toBeNull();
    expect(resolveFrame(p, tl, 5).a?.sourceTime).toBe(1);
    const after = resolveFrame(p, tl, 100);
    expect(after.a?.layout.clip.id).toBe(c[1].id);
    expect(after.a!.sourceTime).toBeCloseTo(4, 2);
    expect(resolveFrame(createProject(), layoutProject(createProject()), 0).a).toBeNull();
  });
});

describe('editPoints e maskAt', () => {
  it('editPoints junta pontas de clipes e marcadores sem repetir, em ordem', () => {
    const a = media('a');
    const p = { ...project([clip(a, 0, 3), clip(a, 0, 2)], [a]), markers: [{ id: 'm', time: 3, label: 'x', color: '#fff' }, { id: 'n', time: 1.5, label: 'y', color: '#fff' }] };
    expect(editPoints(p, layoutProject(p))).toEqual([0, 1.5, 3, 5]);
  });

  it('maskAt anda os pontos da forma em linha reta entre os keyframes', () => {
    const mask = {
      shape: 'path',
      points: [0, 0],
      keys: [
        { time: 2, points: [1, 1] },
        { time: 0, points: [0, 0] },
      ],
    } as never;
    expect((maskAt(mask, 1) as { points: number[] }).points).toEqual([0.5, 0.5]);
    expect((maskAt(mask, 5) as { points: number[] }).points).toEqual([1, 1]);
    expect(maskAt(null, 1)).toBeNull();
  });
});

describe('o que cada clipe precisa da IA', () => {
  it('um filtro que usa a pessoa ou a profundidade também pede o recorte e a profundidade', async () => {
    const { clipNeeds } = await import('./model');
    const m = media('a');
    expect(clipNeeds(clip(m, 0, 5))).toEqual({ person: false, depth: false });
    const skin = clip(m, 0, 5, { filter: { pluginId: 'filters/pele-suave', intensity: 1, params: {} } });
    expect(clipNeeds(skin).person).toBe(true);
    const fog = clip(m, 0, 5, { filter: { pluginId: 'filters/nevoa', intensity: 1, params: {} } });
    expect(clipNeeds(fog).depth).toBe(true);
    // Filtro desligado (intensidade 0) não custa nada.
    expect(clipNeeds({ ...skin, filter: { ...skin.filter!, intensity: 0 } })).toEqual({ person: false, depth: false });
  });
});
