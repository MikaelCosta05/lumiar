import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from './brand';
import { createCaptionTrack, type Caption, type CaptionTrack } from './captions';
import { createProject } from './model';
import { addSpeakerNames, firstAppearances } from './speakerNames';

let n = 0;
const cap = (start: number, end: number, speaker?: number): Caption => ({ id: `c${n++}`, start, end, text: 'fala', speaker });

function trackWith(captions: Caption[], names = ['Pessoa 1', 'Pessoa 2', 'Pessoa 3']): CaptionTrack {
  return { ...createCaptionTrack(), captions, speakers: names.map((name) => ({ name, color: '#fff' })) };
}

describe('primeira fala de cada pessoa', () => {
  it('acha a primeira legenda de cada voz, mesmo fora de ordem', () => {
    const list = firstAppearances([cap(30, 32, 0), cap(10, 12, 1), cap(2, 4, 0), cap(50, 52, 2), cap(11, 13, 1)], 3);
    expect(list.map((a) => [a.speaker, a.start])).toEqual([
      [0, 2],
      [1, 10],
      [2, 50],
    ]);
  });

  it('ignora legendas sem pessoa', () => {
    expect(firstAppearances([cap(0, 1), cap(5, 7, 1)], 4)).toEqual([{ speaker: 1, start: 5, end: 9 }]);
  });

  it('o nome fica a duração pedida, mesmo se a primeira fala for curtinha', () => {
    expect(firstAppearances([cap(1, 1.4, 0), cap(20, 22, 0)], 4)[0]).toEqual({ speaker: 0, start: 1, end: 5 });
    expect(firstAppearances([cap(1, 1.4, 0)], 6)[0].end).toBe(7);
  });

  it('duas faixas não aparecem juntas: a primeira sai antes da próxima entrar', () => {
    const list = firstAppearances([cap(0, 3, 0), cap(2, 6, 1)], 4);
    expect(list[0].end).toBeLessThanOrEqual(list[1].start - 0.1 + 1e-9);
    // Se a segunda pessoa fala logo em seguida, a faixa dela espera a primeira ficar pelo menos 1,5 s.
    const tight = firstAppearances([cap(0, 3, 0), cap(0.5, 4, 1)], 4);
    expect(tight[0].end - tight[0].start).toBeCloseTo(1.5);
    expect(tight[1].start).toBeCloseTo(1.6);
  });
});

describe('pôr o nome de cada pessoa na tela', () => {
  const captions = () => [cap(1, 3, 0), cap(4, 6, 1), cap(7, 9, 0)];

  it('cria uma faixa de nome para cada pessoa com nome, no instante em que ela fala pela primeira vez', () => {
    const track = trackWith(captions());
    const { project, count } = addSpeakerNames(createProject(), track, [{ name: 'Ana Souza', role: 'Bióloga' }, { name: 'Rui' }], 3, null);
    expect(count).toBe(2);
    const texts = project.textTracks.flatMap((t) => t.clips).sort((a, b) => a.start - b.start);
    expect(texts.map((c) => [c.text, c.start])).toEqual([
      ['Ana Souza\nBióloga', 1],
      ['Rui', 4],
    ]);
    // Estilo "Faixa de nome": caixa colorida, alinhada à esquerda, no terço de baixo e acima da legenda.
    expect(texts[0].style.box).toBe(true);
    expect(texts[0].style.align).toBe('left');
    expect(texts[0].y).toBeGreaterThan(0.6);
    expect(texts[0].y).toBeLessThan(track.style.y);
    expect(texts[0].x - 0.06).toBeGreaterThan(0);
  });

  it('pula quem ficou sem nome e usa o Kit da marca', () => {
    const brand = { ...DEFAULT_BRAND, titleFont: 'Bebas Neue', colors: ['#111111', '#ff0055', '#00ff00'] as [string, string, string] };
    const { project, count } = addSpeakerNames(createProject(), trackWith(captions()), [{ name: '' }, { name: 'Rui' }], 4, brand);
    expect(count).toBe(1);
    const [clip] = project.textTracks.flatMap((t) => t.clips);
    expect(clip.text).toBe('Rui');
    expect(clip.style.font).toBe('Bebas Neue');
    expect(clip.style.boxColor).toBe('#ff0055');
    expect(clip.style.color).toBe('#111111');
  });

  it('rodar de novo troca as faixas antigas (não duplica)', () => {
    const first = addSpeakerNames(createProject(), trackWith(captions()), [{ name: 'Ana' }, { name: 'Rui' }], 4, null).project;
    const track = trackWith(captions(), ['Ana', 'Rui']);
    const again = addSpeakerNames(first, track, [{ name: 'Ana Souza' }, { name: 'Rui' }], 4, null).project;
    expect(again.textTracks.flatMap((t) => t.clips.map((c) => c.text)).sort()).toEqual(['Ana Souza', 'Rui']);
  });

  it('num vídeo vertical a faixa continua dentro da tela', () => {
    const vertical = { ...createProject(), width: 1080, height: 1920 };
    const { project } = addSpeakerNames(vertical, trackWith(captions()), [{ name: 'Maria' }], 4, null);
    const [clip] = project.textTracks.flatMap((t) => t.clips);
    expect(clip.x).toBeLessThanOrEqual(0.5);
    expect(clip.x).toBeGreaterThan(0.06);
  });
});
