import { describe, expect, it } from 'vitest';
import { cubicBezierAt, DEFAULT_BEZIER, normalizeBezier, reverseBezier, type CubicBezier } from './cubicBezier';
import { applyEasing, bezierFor, EASINGS, evaluate, PRESET_BEZIERS, withEasing, type Keyframe } from './keyframes';

/** Referência lenta e independente: bisseção longa no tempo da curva. */
function reference([x1, y1, x2, y2]: CubicBezier, x: number): number {
  const bez = (a: number, b: number, t: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const m = (lo + hi) / 2;
    if (bez(x1, x2, m) < x) lo = m;
    else hi = m;
  }
  return bez(y1, y2, (lo + hi) / 2);
}

describe('cubicBezierAt', () => {
  it('bate com os valores conhecidos do cubic-bezier do CSS', () => {
    // ease = cubic-bezier(0.25, 0.1, 0.25, 1)
    expect(cubicBezierAt([0.25, 0.1, 0.25, 1], 0.5)).toBeCloseTo(0.8024033877, 6);
    expect(cubicBezierAt([0.25, 0.1, 0.25, 1], 0.25)).toBeCloseTo(0.4085105914, 6);
    expect(cubicBezierAt([0.25, 0.1, 0.25, 1], 0.9)).toBeCloseTo(0.9943164775, 6);
    // ease-in, ease-out e ease-in-out
    expect(cubicBezierAt([0.42, 0, 1, 1], 0.5)).toBeCloseTo(0.3153568126, 6);
    expect(cubicBezierAt([0, 0, 0.58, 1], 0.5)).toBeCloseTo(0.6846431874, 6);
    expect(cubicBezierAt([0.42, 0, 0.58, 1], 0.5)).toBeCloseTo(0.5, 9);
    expect(cubicBezierAt([0.42, 0, 0.58, 1], 0.1)).toBeCloseTo(0.0197224535, 6);
    // linear
    expect(cubicBezierAt([0, 0, 1, 1], 0.37)).toBeCloseTo(0.37, 9);
  });

  it('passa do ponto quando as alças saem de 0..1', () => {
    expect(cubicBezierAt([0.34, 1.56, 0.64, 1], 0.5)).toBeCloseTo(1.0874006702, 6);
    const under = cubicBezierAt([0.6, -0.5, 0.7, 1], 0.15);
    expect(under).toBeLessThan(0);
  });

  it('começa em 0, termina em 1 e não sai do lugar fora de 0..1', () => {
    for (const curve of [DEFAULT_BEZIER, [0.9, -1, 0.1, 2] as CubicBezier, [0, 1, 1, 0] as CubicBezier]) {
      expect(cubicBezierAt(curve, 0)).toBe(0);
      expect(cubicBezierAt(curve, 1)).toBe(1);
      expect(cubicBezierAt(curve, -0.2)).toBe(0);
      expect(cubicBezierAt(curve, 1.5)).toBe(1);
    }
  });

  it('acerta também nas curvas difíceis para o Newton (alças quase verticais)', () => {
    const curves: CubicBezier[] = [
      [0, 0, 0, 1],
      [1, 0, 1, 1],
      [0, 1, 1, 0],
      [1, 0, 0, 1],
      [0.99, -0.8, 0.01, 1.9],
      [0.5, 0.5, 0.5, 0.5],
    ];
    for (const curve of curves) {
      for (let i = 1; i < 50; i++) {
        const x = i / 50;
        expect(cubicBezierAt(curve, x), `${curve} em ${x}`).toBeCloseTo(reference(curve, x), 4);
      }
    }
  });

  it('é rápida: 1 milhão de avaliações bem abaixo de um segundo', () => {
    const start = performance.now();
    let sum = 0;
    for (let i = 0; i < 1_000_000; i++) sum += cubicBezierAt([0.25, 0.1, 0.25, 1], (i % 1000) / 1000);
    expect(sum).toBeGreaterThan(0);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it('normalizeBezier recusa o que não é curva e prende as alças no tempo', () => {
    expect(normalizeBezier(undefined)).toBeNull();
    expect(normalizeBezier([0.1, 0.2, 0.3])).toBeNull();
    expect(normalizeBezier([0.1, 'a', 0.3, 1])).toBeNull();
    expect(normalizeBezier([0.1, NaN, 0.3, 1])).toBeNull();
    expect(normalizeBezier([-0.5, 0.2, 1.4, 1])).toEqual([0, 0.2, 1, 1]);
    expect(normalizeBezier([0.2, 9, 0.4, -9])).toEqual([0.2, 2, 0.4, -1]);
  });

  it('reverseBezier é a curva tocada de trás para frente', () => {
    const curve: CubicBezier = [0.2, 1.4, 0.7, 0.9];
    const back = reverseBezier(curve);
    for (const q of [0.1, 0.3, 0.6, 0.9]) expect(cubicBezierAt(back, q)).toBeCloseTo(1 - cubicBezierAt(curve, 1 - q), 6);
  });
});

describe('curva personalizada nos keyframes', () => {
  const kf = (time: number, value: number, easing: Keyframe['easing'] = 'linear', bezier?: CubicBezier): Keyframe => ({ time, value, easing, ...(bezier ? { bezier } : {}) });

  it('evaluate usa a Bézier do keyframe', () => {
    const keys = [kf(0, 0, 'custom', [0.25, 0.1, 0.25, 1]), kf(2, 10)];
    expect(evaluate(keys, 1, 0) as number).toBeCloseTo(8.024033877, 5);
    expect(evaluate(keys, 0, 0)).toBe(0);
    expect(evaluate(keys, 2, 0)).toBe(10);
  });

  it('curva personalizada sem alças (ou estragadas) vira o ease do CSS, sem NaN', () => {
    expect(applyEasing('custom', 0.5)).toBeCloseTo(0.8024033877, 6);
    const broken = [{ time: 0, value: 0, easing: 'custom', bezier: ['x', 1] } as unknown as Keyframe, kf(1, 1)];
    expect(evaluate(broken, 0.5, 0) as number).toBeCloseTo(0.8024033877, 6);
  });

  it('curva desconhecida (versão mais nova) anda em linha reta', () => {
    expect(applyEasing('mola-nova' as Keyframe['easing'], 0.3)).toBeCloseTo(0.3);
  });

  it('as aproximações das curvas prontas são exatas nas cúbicas e próximas nas outras', () => {
    for (const id of ['linear', 'ease', 'ease-in', 'ease-out'] as const) {
      for (const p of [0.1, 0.4, 0.75]) expect(cubicBezierAt(PRESET_BEZIERS[id]!, p), id).toBeCloseTo(applyEasing(id, p), 5);
    }
    for (const id of ['smooth', 'expo-in', 'expo-out', 'expo-in-out', 'back'] as const) {
      for (const p of [0.2, 0.5, 0.8]) expect(Math.abs(cubicBezierAt(PRESET_BEZIERS[id]!, p) - applyEasing(id, p)), `${id} em ${p}`).toBeLessThan(0.08);
    }
    expect(EASINGS.some((e) => e.id === 'custom')).toBe(false);
  });

  it('withEasing: a personalizada começa na forma da curva atual; voltar a uma pronta tira as alças', () => {
    const custom = withEasing(kf(0, 0, 'ease-out'), 'custom');
    expect(custom).toEqual({ time: 0, value: 0, easing: 'custom', bezier: PRESET_BEZIERS['ease-out'] });
    expect(withEasing(kf(0, 0, 'bounce'), 'custom').bezier).toEqual(DEFAULT_BEZIER);
    expect(withEasing(custom, 'custom', [0.1, 1.5, 0.2, 1]).bezier).toEqual([0.1, 1.5, 0.2, 1]);
    const back = withEasing(custom, 'ease');
    expect(back).toEqual({ time: 0, value: 0, easing: 'ease' });
    expect('bezier' in back).toBe(false);
    expect(bezierFor(custom)).toEqual(PRESET_BEZIERS['ease-out']);
  });
});
