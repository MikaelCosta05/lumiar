/**
 * Homografia (transformação de perspectiva) entre dois quadriláteros: o que faz uma imagem retangular
 * "deitar" dentro de quatro cantos quaisquer (a tela de um celular, um quadro na parede, uma placa).
 * Conta pura, sem DOM: dá para testar no Node.
 *
 * A matriz 3×3 vai em ordem de linhas [a, b, c, d, e, f, g, h, i]:
 *   x' = (a·x + b·y + c) / (g·x + h·y + i),  y' = (d·x + e·y + f) / (g·x + h·y + i)
 */

export type Mat3 = number[];

/** Os quatro cantos [x, y, x, y, …]: superior esquerdo, superior direito, inferior direito, inferior esquerdo. */
export type Quad = number[];

/** O quadrado de 0 a 1 na mesma ordem dos cantos. */
export const UNIT_SQUARE: Quad = [0, 0, 1, 0, 1, 1, 0, 1];

/** Resolve A·x = b (8×8) por eliminação de Gauss com pivô parcial. null = sistema sem solução (cantos alinhados). */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const k = m[r][col] / m[col][col];
      if (k === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= k * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** A homografia que leva os cantos `from` aos cantos `to` (null se algum dos quadriláteros for degenerado). */
export function homography(from: Quad, to: Quad): Mat3 | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let k = 0; k < 4; k++) {
    const x = from[k * 2];
    const y = from[k * 2 + 1];
    const u = to[k * 2];
    const v = to[k * 2 + 1];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solve(a, b);
  if (!h || h.some((v) => !Number.isFinite(v))) return null;
  return [...h, 1];
}

/** Matriz inversa (null se não tiver). */
export function invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) return null;
  const k = 1 / det;
  return [
    A * k,
    -(b * i - c * h) * k,
    (b * f - c * e) * k,
    B * k,
    (a * i - c * g) * k,
    -(a * f - c * d) * k,
    C * k,
    -(a * h - b * g) * k,
    (a * e - b * d) * k,
  ];
}

/** Aplica a homografia num ponto. */
export function project(m: Mat3, x: number, y: number): { x: number; y: number } {
  const w = m[6] * x + m[7] * y + m[8];
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
}

/**
 * Os cantos formam um quadrilátero que dá para preencher (convexo, sem se cruzar e com área)?
 * Cantos cruzados ou côncavos viram uma imagem "dobrada", que não faz sentido.
 */
export function isConvexQuad(q: Quad): boolean {
  let sign = 0;
  for (let k = 0; k < 4; k++) {
    const ax = q[k * 2];
    const ay = q[k * 2 + 1];
    const bx = q[((k + 1) % 4) * 2];
    const by = q[((k + 1) % 4) * 2 + 1];
    const cx = q[((k + 2) % 4) * 2];
    const cy = q[((k + 2) % 4) * 2 + 1];
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

/**
 * Para o shader: a matriz que leva um ponto da tela (0 a 1, y para baixo) ao ponto da camada (0 a 1)
 * quando a camada é desenhada dentro dos cantos. Em ordem de colunas (como o WebGL espera). null = cantos inválidos.
 */
export function screenToLayerMatrix(corners: Quad): Float32Array | null {
  if (corners.length < 8 || !isConvexQuad(corners)) return null;
  const forward = homography(UNIT_SQUARE, corners);
  const inverse = forward && invert(forward);
  if (!inverse) return null;
  const [a, b, c, d, e, f, g, h, i] = inverse;
  return new Float32Array([a, d, g, b, e, h, c, f, i]);
}
