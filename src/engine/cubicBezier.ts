/**
 * Curva Bézier cúbica de animação, como o cubic-bezier() do CSS: vai de (0, 0) a (1, 1) com as alças
 * (x1, y1) e (x2, y2). x é o tempo (fica entre 0 e 1 para a curva nunca voltar no tempo); y é o valor e pode
 * passar de 0..1 para "passar do ponto".
 */
export type CubicBezier = [x1: number, y1: number, x2: number, y2: number];

/** O "ease" do CSS: o ponto de partida quando não há curva guardada. */
export const DEFAULT_BEZIER: CubicBezier = [0.25, 0.1, 0.25, 1];

/** Até onde as alças podem ir no valor (mais que isso só faz a animação sair da tela). */
export const BEZIER_Y_RANGE: [number, number] = [-1, 2];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Curva válida (tempo das alças em 0..1, valor dentro do limite), ou null se não for uma curva. */
export function normalizeBezier(value: unknown): CubicBezier | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  const [x1, y1, x2, y2] = value as number[];
  const [lo, hi] = BEZIER_Y_RANGE;
  return [clamp(x1, 0, 1), clamp(y1, lo, hi), clamp(x2, 0, 1), clamp(y2, lo, hi)];
}

/**
 * Valor da curva no instante x (0 a 1). Como nos navegadores: acha o t da curva cujo x é o pedido
 * por Newton (rápido) e, se ele não convergir (alças quase verticais), por bisseção; depois lê o y.
 */
export function cubicBezierAt(curve: CubicBezier, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const x1 = clamp(curve[0], 0, 1);
  const x2 = clamp(curve[2], 0, 1);
  const [, y1, , y2] = curve;
  // Polinômio na forma a·t³ + b·t² + c·t (os pontos das pontas são 0 e 1).
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const epsilon = 1e-7;

  let t = x;
  let solved = false;
  for (let i = 0; i < 8; i++) {
    const error = sampleX(t) - x;
    if (Math.abs(error) < epsilon) {
      solved = true;
      break;
    }
    const slope = slopeX(t);
    if (Math.abs(slope) < 1e-6) break;
    t -= error / slope;
  }
  if (!solved || t < 0 || t > 1) {
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 60; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < epsilon) break;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
  }
  return ((ay * t + by) * t + cy) * t;
}

/** A curva tocada de trás para frente (para inverter um clipe). */
export function reverseBezier([x1, y1, x2, y2]: CubicBezier): CubicBezier {
  return [1 - x2, 1 - y2, 1 - x1, 1 - y1];
}
