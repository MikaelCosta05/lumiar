import { describe, expect, it } from 'vitest';
import {
  createAudioClip,
  createProject,
  createVideoClip,
  DEFAULT_TRANSITION_ID,
  layoutProject,
  placeAudioClip,
  type MediaItem,
  type OverlayClip,
  type Project,
  type VideoClip,
} from './model';
import type { PackClip } from './packs';
import type { TextClip } from './text';
import {
  coveredBy,
  entryAt,
  evictionFor,
  mergeSpans,
  nextEntryAfter,
  normalizeSpan,
  prerenderFingerprint,
  prerenderSpanFor,
  stable,
  type PrerenderSpan,
  type Span,
} from './prerender';

// ---------------------------------------------------------------- Fábricas para os testes

function media(id: string, duration = 10): MediaItem {
  return { id, kind: 'video', name: `${id}.mp4`, file: {} as File, url: `blob:${id}`, thumbnail: null, duration, width: 1920, height: 1080, hasAudio: true };
}

function clip(m: MediaItem, trimIn: number, trimOut: number, id: string, extra: Partial<VideoClip> = {}): VideoClip {
  return { ...createVideoClip(m), id, trimIn, trimOut, ...extra };
}

function overlay(m: MediaItem, start: number, length: number, id: string, extra: Partial<OverlayClip> = {}): OverlayClip {
  return {
    ...clip(m, 0, length, id),
    start,
    transform: { x: 0.5, y: 0.5, scale: 0.4, rotation: 0, opacity: 1, blend: 'normal', chroma: null, radius: 0 },
    fadeIn: 0,
    fadeOut: 0,
    ...extra,
  };
}

function pack(start: number, duration: number, id: string, extra: Partial<PackClip> = {}): PackClip {
  return { id, packId: 'packs/teste', name: 'Teste', color: '#fff', start, duration, intensity: 1, fadeIn: 0, fadeOut: 0, effects: [], filter: null, camera: null, ...extra } as PackClip;
}

function text(start: number, duration: number, id: string, extra: Partial<TextClip> = {}): TextClip {
  return { id, start, duration, text: 'Olá', x: 0.5, y: 0.5, rotation: 0, ...extra } as TextClip;
}

const A = media('a', 20);
const B = media('b', 20);

/** Três clipes de 4 s (0–4, 4–8, 8–12), uma camada em 5–7, um pacote em 9–11 e um texto em 1–3. */
function base(): Project {
  const p = createProject();
  return {
    ...p,
    media: [A, B],
    clips: [clip(A, 0, 4, 'c1'), clip(B, 0, 4, 'c2'), clip(A, 10, 14, 'c3')],
    transitions: [null, null],
    videoTracks: [{ id: 'v1', name: 'Vídeo 2', hidden: false, muted: false, clips: [overlay(B, 5, 2, 'o1')] }],
    packTracks: [{ ...p.packTracks[0], clips: [pack(9, 2, 'p1')] }],
    textTracks: [{ ...p.textTracks[0], clips: [text(1, 2, 't1')] }],
  };
}

const code = () => 'shader';
const print = (p: Project, span: Span, pluginCode = code) => prerenderFingerprint(p, layoutProject(p), span, pluginCode);

const mapClip = (p: Project, id: string, fn: (c: VideoClip) => VideoClip): Project => ({ ...p, clips: p.clips.map((c) => (c.id === id ? fn(c) : c)) });

// ---------------------------------------------------------------- Impressão digital

describe('prerenderFingerprint', () => {
  const second = { start: 4, end: 8 };

  it('o mesmo projeto (ou uma cópia igual) dá a mesma impressão digital', () => {
    const p = base();
    expect(print(p, second)).toBe(print(p, second));
    expect(print(structuredClone(p), second)).toBe(print(p, second));
  });

  it('a ordem dos campos e os campos ausentes não importam', () => {
    const p = base();
    const reordered = mapClip(p, 'c2', (c) => {
      const { effects, ...rest } = c;
      return { ...rest, flipX: undefined, effects } as VideoClip;
    });
    expect(print(reordered, second)).toBe(print(p, second));
  });

  it('efeito, filtro, câmera ou cor de um clipe no trecho invalidam', () => {
    const p = base();
    const before = print(p, second);
    const effect = { uid: 'e1', pluginId: 'effects/glitch', enabled: true, params: { amount: 0.5 } };
    const withEffect = mapClip(p, 'c2', (c) => ({ ...c, effects: [effect] }));
    expect(print(withEffect, second)).not.toBe(before);
    const tweaked = mapClip(withEffect, 'c2', (c) => ({ ...c, effects: [{ ...effect, params: { amount: 0.6 } }] }));
    expect(print(tweaked, second)).not.toBe(print(withEffect, second));
    expect(print(mapClip(p, 'c2', (c) => ({ ...c, flipX: true })), second)).not.toBe(before);
    expect(print(mapClip(p, 'c2', (c) => ({ ...c, filter: { pluginId: 'filters/cinema', intensity: 1, params: {} } })), second)).not.toBe(before);
  });

  it('o que só muda o som não invalida', () => {
    const p = base();
    const before = print(p, second);
    expect(print(mapClip(p, 'c2', (c) => ({ ...c, volume: 0 })), second)).toBe(before);
    expect(print(mapClip(p, 'c2', (c) => ({ ...c, audioDetached: true })), second)).toBe(before);
    expect(print(placeAudioClip(p, createAudioClip(A, 5)), second)).toBe(before);
    expect(print({ ...p, markers: [{ id: 'm', time: 5, label: 'x', color: '#fff' }], comments: [{ id: 'k', time: 5, text: 'oi', done: false }] }, second)).toBe(before);
    expect(print({ ...p, duckLevel: 0.1, script: 'roteiro', name: 'outro nome' }, second)).toBe(before);
  });

  it('mudanças longe do trecho não invalidam', () => {
    const p = base();
    // c3 (8–12) começa no fim do trecho: não aparece nele.
    expect(print(mapClip(p, 'c3', (c) => ({ ...c, flipY: true })), second)).toBe(print(p, second));
  });

  it('o aquecimento de 1 s antes do trecho também conta', () => {
    const p = base();
    // c1 (0–4) termina logo antes do trecho 4–8: os efeitos com o passado olham para ele.
    expect(print(mapClip(p, 'c1', (c) => ({ ...c, flipY: true })), second)).not.toBe(print(p, second));
    // Com o trecho começando 2 s depois do fim de c1, ele não conta mais.
    const later = { start: 6, end: 8 };
    expect(print(mapClip(p, 'c1', (c) => ({ ...c, flipY: true })), later)).toBe(print(p, later));
  });

  it('cortar antes do trecho (tudo anda) invalida', () => {
    const p = base();
    const trimmed = mapClip(p, 'c1', (c) => ({ ...c, trimOut: 3 }));
    expect(print(trimmed, { start: 9, end: 11 })).not.toBe(print(p, { start: 9, end: 11 }));
  });

  it('tamanho, fps e fundo do projeto invalidam', () => {
    const p = base();
    const before = print(p, second);
    expect(print({ ...p, width: 1080, height: 1920 }, second)).not.toBe(before);
    expect(print({ ...p, fps: 60 }, second)).not.toBe(before);
    expect(print({ ...p, background: { kind: 'blur', color: '#000000' } }, second)).not.toBe(before);
  });

  it('trocar o arquivo da mídia invalida', () => {
    const p = base();
    const swapped = { ...p, media: p.media.map((m) => (m.id === 'b' ? { ...m, url: 'blob:novo' } : m)) };
    expect(print(swapped, second)).not.toBe(print(p, second));
  });

  it('transição entre clipes do trecho invalida', () => {
    const p = base();
    const withTransition = { ...p, transitions: [{ pluginId: DEFAULT_TRANSITION_ID, duration: 0.8, params: {} }, null] };
    expect(print(withTransition, second)).not.toBe(print(p, second));
  });

  it('camadas: posição e esconder a trilha invalidam', () => {
    const p = base();
    const before = print(p, second);
    const moved = { ...p, videoTracks: p.videoTracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, transform: { ...c.transform, x: 0.2 } })) })) };
    expect(print(moved, second)).not.toBe(before);
    const hidden = { ...p, videoTracks: p.videoTracks.map((t) => ({ ...t, hidden: true })) };
    expect(print(hidden, second)).not.toBe(before);
    // O som da trilha não muda a imagem.
    const muted = { ...p, videoTracks: p.videoTracks.map((t) => ({ ...t, muted: true })) };
    expect(print(muted, second)).toBe(before);
  });

  it('pacotes: o bloco no trecho conta, o nome e a cor não', () => {
    const p = base();
    const span = { start: 8, end: 12 };
    const before = print(p, span);
    const setPack = (patch: Partial<PackClip>) => ({ ...p, packTracks: p.packTracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, ...patch })) })) });
    expect(print(setPack({ intensity: 0.5 }), span)).not.toBe(before);
    expect(print(setPack({ name: 'Outro', color: '#000' }), span)).toBe(before);
    expect(print({ ...p, packTracks: p.packTracks.map((t) => ({ ...t, hidden: true })) }, span)).not.toBe(before);
    // Longe do pacote (9–11), mexer nele não muda nada.
    expect(print(setPack({ intensity: 0.5 }), { start: 1, end: 3 })).toBe(print(p, { start: 1, end: 3 }));
  });

  it('textos e legendas no trecho invalidam', () => {
    const p = base();
    const span = { start: 1, end: 3 };
    const before = print(p, span);
    const edited = { ...p, textTracks: p.textTracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, text: 'Tchau' })) })) };
    expect(print(edited, span)).not.toBe(before);
    const captions = (start: number) => ({
      enabled: true,
      maxWords: 6,
      style: { mode: 'line' } as never,
      captions: [{ id: 'l1', start, end: start + 1, text: 'legenda' }],
    });
    const withCaption = { ...p, captions: captions(2) };
    expect(print(withCaption, span)).not.toBe(before);
    expect(print({ ...withCaption, captions: { ...withCaption.captions, enabled: false } }, span)).not.toBe(print(withCaption, span));
    // Legenda bem depois do trecho: só o estilo conta, a frase não.
    const far = { ...p, captions: captions(15) };
    const farEdited = { ...far, captions: { ...far.captions, captions: [{ ...far.captions.captions[0], text: 'outra' }] } };
    expect(print(farEdited, span)).toBe(print(far, span));
  });

  it('elementos animados (onda do som, progresso) também dependem do som e da duração', () => {
    const p = base();
    const span = { start: 1, end: 3 };
    const wave = { ...p, textTracks: p.textTracks.map((t) => ({ ...t, clips: [text(1, 2, 't1', { shape: 'audiowave' } as Partial<TextClip>)] })) };
    expect(print(placeAudioClip(wave, createAudioClip(A, 15)), span)).not.toBe(print(wave, span));
  });

  it('mudar o código do shader invalida (editor de efeitos)', () => {
    const p = mapClip(base(), 'c2', (c) => ({ ...c, effects: [{ uid: 'e1', pluginId: 'effects/meu', enabled: true, params: {} }] }));
    expect(print(p, second, () => 'versão 1')).not.toBe(print(p, second, () => 'versão 2'));
  });

  it('LUT usada no trecho invalida quando muda', () => {
    const lut = { id: 'l1', name: 'Filme', size: 2, data: 'AAAA' };
    const p = { ...mapClip(base(), 'c2', (c) => ({ ...c, lut: { id: 'l1', amount: 1 } })), luts: [lut] };
    expect(print({ ...p, luts: [{ ...lut, data: 'BBBB' }] }, second)).not.toBe(print(p, second));
  });

  it('depois do fim do vídeo vale o último quadro parado', () => {
    const p = base();
    const tail = { start: 13, end: 14 };
    expect(print(mapClip(p, 'c3', (c) => ({ ...c, flipX: true })), tail)).not.toBe(print(p, tail));
  });
});

describe('stable', () => {
  it('ordena as chaves e ignora campos ausentes', () => {
    expect(stable({ b: 1, a: [1, { d: undefined, c: 'x' }] })).toBe(stable({ a: [1, { c: 'x' }], b: 1 }));
    expect(stable({ a: 1, b: 2 }, new Set(['b']))).toBe(stable({ a: 1 }));
  });
});

// ---------------------------------------------------------------- Qual trecho

describe('prerenderSpanFor', () => {
  const p = base();
  const tl = layoutProject(p);

  it('clipe, camada, pacote e texto: o próprio item', () => {
    expect(prerenderSpanFor(p, tl, { kind: 'clip', id: 'c2' })).toEqual({ start: 4, end: 8 });
    expect(prerenderSpanFor(p, tl, { kind: 'overlay', id: 'o1' })).toEqual({ start: 5, end: 7 });
    expect(prerenderSpanFor(p, tl, { kind: 'pack', id: 'p1' })).toEqual({ start: 9, end: 11 });
    expect(prerenderSpanFor(p, tl, { kind: 'text', id: 't1' })).toEqual({ start: 1, end: 3 });
    expect(prerenderSpanFor(p, tl, { kind: 'clip', id: 'não existe' })).toBeNull();
  });

  it('transição: o encontro dos clipes com meio segundo de folga', () => {
    expect(prerenderSpanFor(p, tl, { kind: 'transition', index: 0 })).toEqual({ start: 3.5, end: 4.5 });
  });

  it('ponto vazio: o clipe principal daquele instante, senão o que estiver visível', () => {
    expect(prerenderSpanFor(p, tl, { kind: 'empty', time: 9.5 })).toEqual({ start: 8, end: 12 });
    const onlyOverlay: Project = { ...p, clips: [], transitions: [] };
    const tl2 = layoutProject(onlyOverlay);
    expect(prerenderSpanFor(onlyOverlay, tl2, { kind: 'empty', time: 6 })).toEqual({ start: 5, end: 7 });
    expect(prerenderSpanFor(onlyOverlay, tl2, { kind: 'empty', time: 4 })).toBeNull();
  });

  it('marcador: o que está no instante dele', () => {
    const marked = { ...p, markers: [{ id: 'm1', time: 2, label: 'x', color: '#fff' }] };
    expect(prerenderSpanFor(marked, tl, { kind: 'marker', id: 'm1' })).toEqual({ start: 0, end: 4 });
  });
});

describe('normalizeSpan', () => {
  it('acerta o fim em quadros inteiros', () => {
    const span = normalizeSpan({ start: 1, end: 2.01 }, 30, 10)!;
    expect(span.start).toBe(1);
    expect(Math.round((span.end - span.start) * 30)).toBe(30);
    expect(span.end).toBeCloseTo(2, 9);
  });

  it('fica dentro da timeline e recusa trechos curtos demais', () => {
    expect(normalizeSpan({ start: 8, end: 20 }, 30, 10)).toEqual({ start: 8, end: 10 });
    expect(normalizeSpan({ start: 5, end: 5.02 }, 30, 10)).toBeNull();
    expect(normalizeSpan({ start: 12, end: 14 }, 30, 10)).toBeNull();
  });
});

// ---------------------------------------------------------------- Trechos guardados

const entry = (id: string, start: number, end: number, createdAt: number, bytes = 100): PrerenderSpan => ({ id, start, end, createdAt, bytes });

describe('trechos guardados', () => {
  it('entryAt: o fim não conta e o mais novo vence', () => {
    const list = [entry('velho', 0, 10, 1), entry('novo', 4, 6, 2)];
    expect(entryAt(list, 2)?.id).toBe('velho');
    expect(entryAt(list, 5)?.id).toBe('novo');
    expect(entryAt(list, 10)).toBeNull();
    // O mais novo desatualizado não esconde o antigo válido.
    expect(entryAt(list, 5, (e) => e.id !== 'novo')?.id).toBe('velho');
  });

  it('nextEntryAfter: o mais próximo dentro do limite', () => {
    const list = [entry('a', 5, 6, 1), entry('b', 3, 4, 2), entry('c', 20, 21, 3)];
    expect(nextEntryAfter(list, 2.5, 1)?.id).toBe('b');
    expect(nextEntryAfter(list, 3.5, 1)).toBeNull();
    expect(nextEntryAfter(list, 4.5, 1)?.id).toBe('a');
  });

  it('coveredBy: só os que cabem inteiros no novo', () => {
    const list = [entry('dentro', 2, 3, 1), entry('igual', 1, 5, 2), entry('vaza', 4, 7, 3)];
    expect(coveredBy(list, { start: 1, end: 5 }).map((e) => e.id)).toEqual(['dentro', 'igual']);
  });

  it('evictionFor: desatualizados primeiro, depois os mais antigos, nunca o mais novo', () => {
    const list = [entry('a', 0, 1, 1), entry('b', 1, 2, 2), entry('c', 2, 3, 3), entry('d', 3, 4, 4)];
    expect(evictionFor(list, 400)).toEqual([]);
    expect(evictionFor(list, 250)).toEqual(['a', 'b']);
    expect(evictionFor(list, 300, (e) => e.id === 'c')).toEqual(['c']);
    // Um trecho sozinho maior que o limite fica (acabou de ficar pronto).
    expect(evictionFor([entry('enorme', 0, 1, 1, 1000)], 10)).toEqual([]);
    expect(evictionFor([entry('a', 0, 1, 1), entry('enorme', 1, 2, 2, 1000)], 10)).toEqual(['a']);
  });

  it('mergeSpans: junta encostados e sobrepostos', () => {
    expect(mergeSpans([{ start: 4, end: 6 }, { start: 0, end: 2 }, { start: 2, end: 3 }, { start: 5, end: 8 }])).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 8 },
    ]);
  });
});
