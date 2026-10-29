import { describe, expect, it } from 'vitest';
import { bestPair, bestView, reframe, SIG_H, SIG_W, signature, similarity, type FrameSample, type SmallGray } from './matchCut';

/** Quadro com um disco claro (centro e raio em fração da imagem) num fundo escuro. */
function disk(cx: number, cy: number, r: number, background = 30, fill = 220): SmallGray {
  const data = new Float32Array(SIG_W * SIG_H);
  for (let y = 0; y < SIG_H; y++) {
    for (let x = 0; x < SIG_W; x++) {
      // Distância em pixels (o disco fica redondo mesmo no quadro 16:9).
      const d = Math.hypot((x + 0.5) / SIG_W - cx, (((y + 0.5) / SIG_H - cy) * SIG_H) / SIG_W);
      data[y * SIG_W + x] = d < r ? fill : background;
    }
  }
  return { data, width: SIG_W, height: SIG_H };
}

/** Faixa vertical clara (outra forma, para comparar). */
function bar(cx: number): SmallGray {
  const data = new Float32Array(SIG_W * SIG_H).fill(30);
  for (let y = 0; y < SIG_H; y++) for (let x = 0; x < SIG_W; x++) if (Math.abs((x + 0.5) / SIG_W - cx) < 0.06) data[y * SIG_W + x] = 220;
  return { data, width: SIG_W, height: SIG_H };
}

describe('corte casado', () => {
  it('a mesma forma no mesmo lugar se parece mais que forma diferente ou em outro lugar', () => {
    const a = signature(disk(0.5, 0.5, 0.15));
    const same = signature(disk(0.5, 0.5, 0.15, 60, 180)); // outra luz
    const moved = signature(disk(0.2, 0.3, 0.15));
    const other = signature(bar(0.5));
    expect(similarity(a, same)).toBeGreaterThan(0.95);
    expect(similarity(a, same)).toBeGreaterThan(similarity(a, moved) + 0.3);
    expect(similarity(a, same)).toBeGreaterThan(similarity(a, other) + 0.3);
  });

  it('imagem lisa não casa com nada (e não quebra)', () => {
    const flat = signature({ data: new Float32Array(SIG_W * SIG_H).fill(100), width: SIG_W, height: SIG_H });
    expect(similarity(flat, signature(disk(0.5, 0.5, 0.2)))).toBe(0);
  });

  it('acha o par de quadros em que o disco de A e o de B ficam no mesmo lugar', () => {
    // A: o disco vai da esquerda para o meio; B: começa à direita e vai para a esquerda.
    const aFrames: FrameSample[] = Array.from({ length: 10 }, (_, i) => ({ t: 9 + i * 0.1, gray: disk(0.1 + i * 0.05, 0.5, 0.12) }));
    const bFrames: FrameSample[] = Array.from({ length: 10 }, (_, i) => ({ t: i * 0.1, gray: disk(0.9 - i * 0.07, 0.5, 0.12) }));
    // Hoje: A termina com o disco em 0,55 e B começa com ele em 0,9.
    const result = bestPair(aFrames, bFrames, 9.9, 0, 0.01)!;
    expect(result.score).toBeGreaterThan(result.before + 0.2);
    // No par escolhido os discos estão quase no mesmo x.
    const ax = 0.1 + Math.round((result.aOut - 9) / 0.1) * 0.05;
    const bx = 0.9 - Math.round(result.bIn / 0.1) * 0.07;
    expect(Math.abs(ax - bx)).toBeLessThan(0.05);
  });

  it('quando já casa, não mexe no corte', () => {
    const frames = (t0: number): FrameSample[] => Array.from({ length: 6 }, (_, i) => ({ t: t0 + i * 0.1, gray: disk(0.5, 0.5, 0.15) }));
    const result = bestPair(frames(5), frames(0), 5.5, 0)!;
    expect(result.aOut).toBe(5.5);
    expect(result.bIn).toBe(0);
  });

  it('aproxima e move B para o disco cair onde estava o de A', () => {
    // Em A o disco é maior e está à direita; em B é menor e está no meio.
    const a = disk(0.62, 0.55, 0.2);
    const b = disk(0.55, 0.53, 0.15);
    const { view, score, base } = bestView(a, b);
    expect(score).toBeGreaterThan(base + 0.1);
    expect(view.zoom).toBeGreaterThan(1.15);
    // Onde o disco de B aparece depois do enquadramento: perto do de A.
    const shown = signature(reframe(b, view));
    expect(similarity(signature(a), shown)).toBeCloseTo(score, 6);
    expect(score).toBeGreaterThan(0.8);
  });

  it('o enquadramento nunca sai da imagem', () => {
    const { view } = bestView(disk(0.05, 0.05, 0.3), disk(0.5, 0.5, 0.1));
    const half = 0.5 / view.zoom;
    expect(view.x).toBeGreaterThanOrEqual(half - 1e-9);
    expect(view.x).toBeLessThanOrEqual(1 - half + 1e-9);
    expect(view.y).toBeGreaterThanOrEqual(half - 1e-9);
    expect(view.y).toBeLessThanOrEqual(1 - half + 1e-9);
  });
});
