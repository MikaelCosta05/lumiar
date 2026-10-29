import { describe, expect, it } from 'vitest';
import { beatFeatures, planMusicFit, type BeatFeatures } from './musicFit';

/** Batidas a cada 0,5 s (120 BPM) e o som igual em todas: qualquer emenda serve. */
function uniform(from: number, to: number, period = 0.5): BeatFeatures {
  const beats: number[] = [];
  for (let t = from + period; t < to; t += period) beats.push(Math.round(t * 1000) / 1000);
  const v = () => new Float32Array([1, 2, 3]);
  return { beats, after: beats.map(v), before: beats.map(v) };
}

const total = (segments: [number, number][]) => segments.reduce((sum, [a, b]) => sum + b - a, 0);

describe('beatFeatures', () => {
  it('média do espectro antes e depois de cada batida (duas batidas de janela)', () => {
    // 1 banda, 10 quadros por segundo, o valor de cada quadro é o próprio índice.
    const data = Float32Array.from({ length: 100 }, (_, i) => i);
    const f = beatFeatures([1, 2, 3], { data, frames: 100, rate: 10, bands: 1 });
    expect(f.after[0][0]).toBeCloseTo(19.5); // quadros 10 a 29
    expect(f.before[0][0]).toBeCloseTo(4.5); // quadros 0 a 9 (o começo é cortado no zero)
    expect(f.before[2][0]).toBeCloseTo(19.5); // quadros 10 a 29
  });
});

describe('planMusicFit', () => {
  it('mais curta: fica o começo e o final, com uma emenda em cima de batidas', () => {
    const f = uniform(0, 60);
    const plan = planMusicFit(f, 0, 60, 30);
    expect(plan.joins).toBe(1);
    expect(plan.segments).toHaveLength(2);
    const [[a0, a1], [b0, b1]] = plan.segments;
    expect(a0).toBe(0);
    expect(b1).toBe(60);
    expect(f.beats).toContain(a1);
    expect(f.beats).toContain(b0);
    expect(Math.abs(total(plan.segments) - 30)).toBeLessThanOrEqual(0.5 * 0.55);
    // Começo e final com tamanho mínimo.
    expect(a1).toBeGreaterThanOrEqual(8);
    expect(60 - b0).toBeGreaterThanOrEqual(7.5);
    expect(plan.error).toBeCloseTo(30 - total(plan.segments));
  });

  it('mais longa: repete um trecho do meio quantas vezes precisar', () => {
    const f = uniform(0, 60);
    const plan = planMusicFit(f, 0, 60, 80);
    expect(plan.joins).toBeGreaterThanOrEqual(1);
    expect(plan.segments).toHaveLength(plan.joins + 2);
    expect(plan.segments[0][0]).toBe(0);
    expect(plan.segments[plan.segments.length - 1][1]).toBe(60);
    // Os segmentos se emendam: o fim de um é a batida onde o próximo começa (ou volta).
    const [a, b] = plan.segments[1];
    expect(plan.segments[0][1]).toBe(b);
    expect(plan.segments[plan.segments.length - 1][0]).toBe(b);
    expect(a).toBeLessThan(b);
    expect(Math.abs(total(plan.segments) - 80)).toBeLessThanOrEqual(0.5 * 0.55);
  });

  it('duração igual: toca inteira', () => {
    expect(planMusicFit(uniform(0, 60), 0, 60, 60)).toEqual({ segments: [[0, 60]], error: 0, joins: 0 });
  });

  it('com poucas batidas, só corta o final', () => {
    const f = uniform(0, 3); // 5 batidas
    expect(planMusicFit(f, 0, 3, 2)).toEqual({ segments: [[0, 2]], error: 0, joins: 0 });
    // Pedindo mais do que a música tem: toca tudo e avisa quanto faltou.
    expect(planMusicFit(f, 0, 3, 5)).toEqual({ segments: [[0, 3]], error: 2, joins: 0 });
  });

  it('respeita o trecho [from, to] do arquivo', () => {
    const f = uniform(0, 120);
    const plan = planMusicFit(f, 30, 90, 40);
    expect(plan.segments[0][0]).toBe(30);
    expect(plan.segments[plan.segments.length - 1][1]).toBe(90);
    for (const [a, b] of plan.segments) {
      expect(a).toBeGreaterThanOrEqual(30);
      expect(b).toBeLessThanOrEqual(90);
    }
  });

  it('prefere a emenda onde o som antes e depois se parece', () => {
    // Batidas a cada 1 s; o som é diferente em cada batida, menos em 20 s e 40 s (iguais).
    const beats = Array.from({ length: 59 }, (_, i) => i + 1);
    const vec = (t: number) => {
      const v = new Float32Array(64);
      v[t === 40 ? 20 : t] = 1;
      return v;
    };
    const f: BeatFeatures = { beats, after: beats.map(vec), before: beats.map(vec) };
    const plan = planMusicFit(f, 0, 60, 40);
    expect(plan.segments).toEqual([
      [0, 20],
      [40, 60],
    ]);
  });
});
