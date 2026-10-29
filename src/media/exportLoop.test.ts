import { describe, expect, it } from 'vitest';
import { crossfadeFrames, loopFrames, loopSamples } from './exportLoop';

describe('exportar em loop', () => {
  it('normal: cada quadro uma vez, em ordem', () => {
    expect(loopFrames('none', 4, 30).map((f) => f.main)).toEqual([0, 1, 2, 3]);
  });

  it('boomerang: vai e volta sem repetir as pontas', () => {
    expect(loopFrames('boomerang', 5, 30).map((f) => f.main)).toEqual([0, 1, 2, 3, 4, 3, 2, 1]);
  });

  it('loop perfeito: começa d quadros depois e os últimos dissolvem nos primeiros', () => {
    // 30 quadros a 10 fps: dissolve de 5 quadros (meio segundo).
    expect(crossfadeFrames(30, 10)).toBe(5);
    const plan = loopFrames('seamless', 30, 10);
    expect(plan).toHaveLength(25);
    expect(plan[0]).toEqual({ main: 5, over: null, alpha: 0 });
    expect(plan[19]).toEqual({ main: 24, over: null, alpha: 0 });
    expect(plan[20]).toEqual({ main: 25, over: 0, alpha: 1 / 6 });
    const last = plan[24];
    expect(last.main).toBe(29);
    expect(last.over).toBe(4);
    expect(last.alpha).toBeCloseTo(5 / 6, 6);
    // O próximo quadro do "loop" seria o 5 por inteiro = o primeiro do arquivo: a opacidade sobe sempre igual.
    const step = plan[21].alpha - plan[20].alpha;
    expect(1 - last.alpha).toBeCloseTo(step, 6);
  });

  it('trecho curto: o dissolve não passa de um terço', () => {
    expect(crossfadeFrames(6, 30)).toBe(2);
  });

  it('som do boomerang: ida e depois a volta invertida', () => {
    // 4 quadros a 1 fps, 2 amostras por quadro.
    const data = Float32Array.from([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([...loopSamples('boomerang', data, 2, 4, 1)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 5, 4, 3, 2]);
  });

  it('som do loop perfeito: mesma emenda da imagem', () => {
    // 9 quadros a 2 fps → dissolve de 1 quadro (meio segundo = 1 quadro), 1 amostra por quadro.
    const data = Float32Array.from([10, 0, 0, 0, 0, 0, 0, 0, 20]);
    const out = loopSamples('seamless', data, 2, 9, 2);
    expect(out).toHaveLength(8);
    // O último instante mistura o fim (20) com o começo (10), meio a meio.
    expect(out[7]).toBeCloseTo(15, 6);
    expect(out[0]).toBe(0);
    expect(loopSamples('none', data, 2, 9, 2)).toBe(data);
  });
});
