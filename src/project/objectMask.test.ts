import { describe, expect, it } from 'vitest';
import {
  blendPlan,
  chooseMask,
  decodeMask,
  deepestPoint,
  encodeMask,
  insideMask,
  isObjectSelection,
  maskFrame,
  maskIou,
  MASK_SIDE,
  maskSize,
  maskStats,
  MAX_POINTS,
  MAX_SAMPLES,
  propagationPrompt,
  renderBlend,
  sampleTimes,
  shiftMask,
  togglePoint,
  trackedAt,
  type ObjectPoint,
} from './objectMask';

/** Máscara com um retângulo [x0, x1) × [y0, y1) ligado. */
function rect(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const bits = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) bits[y * w + x] = 1;
  return bits;
}

describe('RLE das máscaras', () => {
  it('volta igual (vazia, cheia, retângulo, ruído)', () => {
    const w = 64;
    const h = 36;
    let seed = 7;
    const noise = Uint8Array.from({ length: w * h }, () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) % 3 === 0 ? 1 : 0));
    for (const bits of [new Uint8Array(w * h), new Uint8Array(w * h).fill(1), rect(w, h, 10, 5, 40, 30), noise]) {
      expect(decodeMask(encodeMask(bits), bits.length)).toEqual(bits);
    }
  });

  it('corridas longas (mais de 127 e de 16383 pixels) usam vários bytes', () => {
    const bits = new Uint8Array(40000);
    bits.fill(1, 20000, 39000);
    expect(decodeMask(encodeMask(bits), bits.length)).toEqual(bits);
  });

  it('é compacta para um objeto de uma peça só', () => {
    const { width, height } = maskSize(1920, 1080);
    const rle = encodeMask(rect(width, height, 60, 30, 180, 120));
    expect(rle.length).toBeLessThan(600);
  });

  it('texto estragado não quebra', () => {
    expect(decodeMask('%%%não é base64%%%', 10)).toEqual(new Uint8Array(10));
    expect(decodeMask('', 4)).toEqual(new Uint8Array(4));
    // Corridas que passam do tamanho são cortadas.
    expect(decodeMask(encodeMask(new Uint8Array(100).fill(1)), 10)).toEqual(new Uint8Array(10).fill(1));
  });
});

describe('medidas da máscara', () => {
  it('tamanho mantém a proporção com o lado maior fixo', () => {
    expect(maskSize(1920, 1080)).toEqual({ width: MASK_SIDE, height: 144 });
    expect(maskSize(1080, 1920)).toEqual({ width: 144, height: MASK_SIDE });
  });

  it('área, centro e caixa', () => {
    const s = maskStats(rect(10, 10, 2, 4, 6, 8), 10, 10);
    expect(s.area).toBeCloseTo(0.16);
    expect(s.cx).toBeCloseTo(0.4);
    expect(s.cy).toBeCloseTo(0.6);
    expect(s.box).toEqual([2, 4, 5, 7]);
    expect(maskStats(new Uint8Array(100), 10, 10).area).toBe(0);
  });

  it('ponto mais interno fica no meio do objeto, longe da borda da imagem', () => {
    const p = deepestPoint(rect(40, 20, 10, 2, 30, 18), 40, 20)!;
    expect(p.x).toBeGreaterThan(0.4);
    expect(p.x).toBeLessThan(0.6);
    expect(p.y).toBeCloseTo(0.5, 1);
    // Objeto encostado na borda: o ponto não fica na borda.
    const edge = deepestPoint(rect(40, 20, 0, 0, 12, 20), 40, 20)!;
    expect(edge.x * 40).toBeGreaterThan(3);
    expect(deepestPoint(new Uint8Array(800), 40, 20)).toBeNull();
  });

  it('deslocar e comparar', () => {
    const a = rect(20, 20, 2, 2, 8, 8);
    const moved = shiftMask(a, 20, 20, 6, 3);
    expect(moved).toEqual(rect(20, 20, 8, 5, 14, 11));
    expect(maskIou(a, shiftMask(a, 20, 20, 3, 0))).toBeCloseTo(0.5 / 1.5);
    expect(maskIou(a, a)).toBe(1);
    expect(maskIou(a, moved)).toBe(0);
    expect(maskIou(new Uint8Array(4), new Uint8Array(4))).toBe(0);
    // O que sai da imagem some.
    expect(maskStats(shiftMask(a, 20, 20, 30, 0), 20, 20).area).toBe(0);
  });

  it('ponto dentro, com tolerância na borda', () => {
    const a = rect(10, 10, 4, 4, 6, 6);
    expect(insideMask(a, 10, 10, { x: 0.45, y: 0.45 })).toBe(true);
    expect(insideMask(a, 10, 10, { x: 0.35, y: 0.45 })).toBe(false);
    expect(insideMask(a, 10, 10, { x: 0.35, y: 0.45 }, 1)).toBe(true);
    expect(insideMask(a, 10, 10, { x: 0.15, y: 0.45 }, 1)).toBe(false);
  });
});

describe('escolher a máscara da IA', () => {
  const w = 20;
  const h = 20;
  const object = rect(w, h, 5, 5, 15, 15);
  const all = new Uint8Array(w * h).fill(1);
  const part = rect(w, h, 5, 5, 9, 9);

  it('a imagem toda perde, mesmo com nota maior', () => {
    const points: ObjectPoint[] = [{ x: 0.5, y: 0.5, include: true }];
    expect(chooseMask([{ score: 1.02, bits: all }, { score: 0.95, bits: object }], w, h, points)).toBe(1);
  });

  it('pontos de incluir dentro e de excluir fora', () => {
    const points: ObjectPoint[] = [
      { x: 0.6, y: 0.6, include: true },
      { x: 0.1, y: 0.1, include: false },
    ];
    // "part" não contém o ponto de incluir.
    expect(chooseMask([{ score: 0.99, bits: part }, { score: 0.9, bits: object }], w, h, points)).toBe(1);
  });

  it('na propagação, a que bate com a previsão ganha', () => {
    const points: ObjectPoint[] = [{ x: 0.3, y: 0.3, include: true }];
    expect(chooseMask([{ score: 0.97, bits: part }, { score: 0.9, bits: object }], w, h, points, object)).toBe(1);
  });
});

describe('pontos', () => {
  it('clique em cima de um ponto tira, longe acrescenta, com limite', () => {
    let points: ObjectPoint[] = [];
    points = togglePoint(points, { x: 0.5, y: 0.5, include: true });
    points = togglePoint(points, { x: 0.2, y: 0.2, include: false });
    expect(points).toHaveLength(2);
    expect(points[1].include).toBe(false);
    points = togglePoint(points, { x: 0.505, y: 0.5, include: false });
    expect(points).toEqual([{ x: 0.2, y: 0.2, include: false }]);
    for (let i = 0; i < 40; i++) points = togglePoint(points, { x: (i % 8) / 8, y: Math.floor(i / 8) / 8 + 0.01, include: true });
    expect(points.length).toBe(MAX_POINTS);
    // Fora da imagem vira a borda.
    expect(togglePoint([], { x: 1.2, y: -0.1, include: true })[0]).toEqual({ x: 1, y: 0, include: true });
  });

  it('prompt da propagação: ponto interno, ponto rastreado e exclusões fora do objeto', () => {
    const predicted = rect(40, 40, 10, 10, 30, 30);
    const prompt = propagationPrompt(predicted, 40, 40, { x: 0.3, y: 0.3 }, [
      { x: 0.5, y: 0.5 }, // caiu dentro do objeto: sai
      { x: 0.05, y: 0.05 },
      { x: 1.5, y: 0.5 }, // fora da imagem: sai
    ]);
    const includes = prompt.filter((p) => p.include);
    const excludes = prompt.filter((p) => !p.include);
    expect(includes).toHaveLength(2);
    expect(excludes).toEqual([{ x: 0.05, y: 0.05, include: false }]);
    // Rastreador perdido (fora da previsão): só o ponto interno.
    expect(propagationPrompt(predicted, 40, 40, { x: 0.9, y: 0.9 }, []).filter((p) => p.include)).toHaveLength(1);
    // Sem previsão (objeto sumiu): usa o rastreado.
    expect(propagationPrompt(new Uint8Array(1600), 40, 40, { x: 0.9, y: 0.9 }, [])).toEqual([{ x: 0.9, y: 0.9, include: true }]);
  });

  it('posição rastreada entre dois quadros', () => {
    const track = [
      { t: 1, x: 0.2, y: 0.2 },
      { t: 2, x: 0.4, y: 0.6 },
    ];
    const mid = trackedAt(track, 1.5)!;
    expect(mid.x).toBeCloseTo(0.3);
    expect(mid.y).toBeCloseTo(0.4);
    expect(trackedAt(track, 2)).toEqual({ x: 0.4, y: 0.6 });
    expect(trackedAt(track, 5)).toBeNull();
    expect(trackedAt([], 1)).toBeNull();
  });
});

describe('amostras e mistura', () => {
  it('amostras saem do instante marcado para os dois lados, sem repetir', () => {
    const { forward, backward, step } = sampleTimes(0, 2, 1);
    expect(step).toBeCloseTo(1 / 3);
    expect(forward[0]).toBe(1);
    expect(forward[forward.length - 1]).toBeCloseTo(2, 2);
    expect(backward[backward.length - 1]).toBe(0);
    const all = [...backward, ...forward];
    expect(new Set(all).size).toBe(all.length);
    for (let i = 1; i < forward.length; i++) expect(forward[i]).toBeGreaterThan(forward[i - 1]);
    for (let i = 1; i < backward.length; i++) expect(backward[i]).toBeLessThan(backward[i - 1]);
    for (const t of backward) expect(t).toBeLessThan(1);
  });

  it('clipe longo tem amostras limitadas; marcado no começo não anda para trás', () => {
    const long = sampleTimes(0, 600, 0);
    expect(long.forward.length + long.backward.length).toBeLessThanOrEqual(MAX_SAMPLES + 2);
    expect(long.backward).toEqual([]);
    expect(sampleTimes(3, 5, 9).forward[0]).toBe(5);
  });

  it('plano: segura antes e depois, mistura no meio com o centro andando', () => {
    const frames = [
      { t: 0, area: 0.1, cx: 0.2, cy: 0.5 },
      { t: 1, area: 0.1, cx: 0.6, cy: 0.5 },
    ];
    expect(blendPlan([], 0)).toBeNull();
    expect(blendPlan(frames, -1)).toEqual({ a: 0, b: 0, k: 0, shiftA: [0, 0], shiftB: [0, 0] });
    expect(blendPlan(frames, 3)?.a).toBe(1);
    const mid = blendPlan(frames, 0.25)!;
    expect(mid.k).toBeCloseTo(0.25);
    expect(mid.shiftA[0]).toBeCloseTo(0.1);
    expect(mid.shiftB[0]).toBeCloseTo(-0.3);
    // Um lado sem objeto: só esmaece.
    expect(blendPlan([frames[0], { ...frames[1], area: 0 }], 0.5)!.shiftA).toEqual([0, 0]);
  });

  it('mistura desloca as máscaras para o meio do caminho', () => {
    const w = 40;
    const h = 10;
    const a = rect(w, h, 0, 0, 10, 10);
    const b = rect(w, h, 20, 0, 30, 10);
    const frames = [maskFrame(0, a, w, h), maskFrame(1, b, w, h)];
    const gray = renderBlend(blendPlan(frames, 0.5)!, a, b, w, h);
    // No meio do caminho, as duas cobrem as colunas 10 a 19 (sem fantasma nas pontas).
    expect(gray[5 * w + 15]).toBe(255);
    expect(gray[5 * w + 2]).toBe(0);
    expect(gray[5 * w + 25]).toBe(0);
    // Borda suave.
    expect(gray[5 * w + 10]).toBeGreaterThan(0);
    expect(gray[5 * w + 9]).toBeLessThan(255);
  });

  it('amostra guardada e seleção válida', () => {
    const f = maskFrame(1.23456, rect(10, 10, 0, 0, 5, 10), 10, 10);
    expect(f.t).toBe(1.235);
    expect(f.area).toBe(0.5);
    expect(decodeMask(f.rle, 100)).toEqual(rect(10, 10, 0, 0, 5, 10));
    expect(isObjectSelection({ use: true, at: 0, points: [], width: 10, height: 10, frames: [f] })).toBe(true);
    expect(isObjectSelection(null)).toBe(false);
    expect(isObjectSelection({ frames: 'x' })).toBe(false);
  });
});
