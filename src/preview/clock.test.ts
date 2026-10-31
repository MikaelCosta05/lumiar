import { describe, expect, it } from 'vitest';
import { playheadAt, reachedEnd } from './clock';

describe('relógio do player', () => {
  it('anda na velocidade pedida', () => {
    expect(playheadAt(2, 1000, 1500, 1)).toBeCloseTo(2.5);
    expect(playheadAt(2, 1000, 1500, 2)).toBeCloseTo(3);
    expect(playheadAt(2, 1000, 1500, -1)).toBeCloseTo(1.5);
  });

  it('quadro com horário anterior ao play não volta o tempo (nem para o player no zero)', () => {
    const t = playheadAt(0, 1000, 990, 1);
    expect(t).toBe(0);
    expect(reachedEnd(t, 60, 1)).toBe(false);
  });

  it('para no fim indo para a frente e no zero só indo para trás', () => {
    expect(reachedEnd(60, 60, 1)).toBe(true);
    expect(reachedEnd(0, 60, -1)).toBe(true);
    expect(reachedEnd(0, 60, 1)).toBe(false);
  });
});
