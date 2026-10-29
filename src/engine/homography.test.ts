import { describe, expect, it } from 'vitest';
import { homography, invert, isConvexQuad, project, screenToLayerMatrix, UNIT_SQUARE } from './homography';

const close = (a: { x: number; y: number }, x: number, y: number) => {
  expect(a.x).toBeCloseTo(x, 6);
  expect(a.y).toBeCloseTo(y, 6);
};

describe('homografia', () => {
  it('leva cada canto do quadrado ao canto pedido', () => {
    const quad = [0.2, 0.1, 0.85, 0.2, 0.8, 0.9, 0.15, 0.75];
    const h = homography(UNIT_SQUARE, quad)!;
    for (let k = 0; k < 4; k++) close(project(h, UNIT_SQUARE[k * 2], UNIT_SQUARE[k * 2 + 1]), quad[k * 2], quad[k * 2 + 1]);
  });

  it('de quadrado para quadrado igual é a identidade', () => {
    const h = homography(UNIT_SQUARE, UNIT_SQUARE)!;
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(h[i]).toBeCloseTo(v, 9));
  });

  it('retângulo vira escala + deslocamento (sem perspectiva)', () => {
    const h = homography(UNIT_SQUARE, [10, 20, 30, 20, 30, 60, 10, 60])!;
    close(project(h, 0.5, 0.5), 20, 40);
    expect(h[6]).toBeCloseTo(0, 9);
    expect(h[7]).toBeCloseTo(0, 9);
  });

  it('em perspectiva, o centro do quadrado cai no cruzamento das diagonais (não na média dos cantos)', () => {
    // Trapézio: o lado de cima é menor (como uma tela vista de baixo).
    const quad = [0.4, 0.2, 0.6, 0.2, 0.9, 0.8, 0.1, 0.8];
    const center = project(homography(UNIT_SQUARE, quad)!, 0.5, 0.5);
    // Diagonais (0.4,0.2)→(0.9,0.8) e (0.6,0.2)→(0.1,0.8): x = 0.4 + 0.5·s = 0.6 − 0.5·s → s = 0.2, y = 0.2 + 0.6·0.2.
    expect(center.x).toBeCloseTo(0.5, 6);
    expect(center.y).toBeCloseTo(0.32, 6);
    // A média dos cantos ficaria em y=0.5: a perspectiva puxa o centro para o lado pequeno.
    expect(center.y).toBeLessThan(0.5);
  });

  it('a inversa desfaz a homografia', () => {
    const quad = [0.3, 0.05, 0.95, 0.3, 0.7, 0.95, 0.05, 0.6];
    const h = homography(UNIT_SQUARE, quad)!;
    const back = invert(h)!;
    for (const [x, y] of [[0.1, 0.2], [0.5, 0.5], [0.9, 0.7]]) {
      const p = project(h, x, y);
      close(project(back, p.x, p.y), x, y);
    }
  });

  it('cantos alinhados ou cruzados não servem', () => {
    expect(homography(UNIT_SQUARE, [0, 0, 0.5, 0, 1, 0, 0.2, 0])).toBeNull();
    expect(isConvexQuad([0, 0, 1, 0, 1, 1, 0, 1])).toBe(true);
    expect(isConvexQuad([0, 0, 1, 1, 1, 0, 0, 1])).toBe(false); // cruzado (ampulheta)
    expect(isConvexQuad([0, 0, 1, 0, 0.3, 0.3, 0, 1])).toBe(false); // côncavo
    expect(screenToLayerMatrix([0, 0, 1, 1, 1, 0, 0, 1])).toBeNull();
  });

  it('a matriz do shader (colunas) leva a tela de volta à camada', () => {
    const quad = [0.2, 0.1, 0.85, 0.2, 0.8, 0.9, 0.15, 0.75];
    const m = screenToLayerMatrix(quad)!;
    // m em colunas: vec3 r = m * (x, y, 1)
    const apply = (x: number, y: number) => {
      const rx = m[0] * x + m[3] * y + m[6];
      const ry = m[1] * x + m[4] * y + m[7];
      const rz = m[2] * x + m[5] * y + m[8];
      return { x: rx / rz, y: ry / rz };
    };
    close(apply(0.2, 0.1), 0, 0);
    close(apply(0.8, 0.9), 1, 1);
    close(apply(0.15, 0.75), 0, 1);
  });
});
