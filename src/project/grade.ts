import type { LayerColor } from '../engine/renderer';

/**
 * Correção de cor manual: três rodas (sombras, meios-tons e altas luzes), saturação e curvas.
 * Cada roda tem um ponto (x, y dentro do círculo: puxa a cor para aquele lado) e um nível (mais claro/escuro).
 */
export interface ColorWheel {
  x: number;
  y: number;
  /** -1 a 1 */
  level: number;
}

export type CurveChannel = 'master' | 'r' | 'g' | 'b';
/** Pontos [entrada, saída] de 0 a 1, em ordem; as pontas (0 e 1) sempre existem. */
export type CurvePoints = [number, number][];

export interface ColorGrade {
  shadows: ColorWheel;
  midtones: ColorWheel;
  highlights: ColorWheel;
  /** 0 = preto e branco, 1 = normal, 2 = o dobro */
  saturation: number;
  curves: Record<CurveChannel, CurvePoints>;
}

export const NEUTRAL_WHEEL: ColorWheel = { x: 0, y: 0, level: 0 };
export const STRAIGHT: CurvePoints = [
  [0, 0],
  [1, 1],
];

export function createGrade(): ColorGrade {
  return {
    shadows: { ...NEUTRAL_WHEEL },
    midtones: { ...NEUTRAL_WHEEL },
    highlights: { ...NEUTRAL_WHEEL },
    saturation: 1,
    curves: { master: STRAIGHT, r: STRAIGHT, g: STRAIGHT, b: STRAIGHT },
  };
}

const isStraight = (points: CurvePoints) => points.length === 2 && points[0][0] === 0 && points[0][1] === 0 && points[1][0] === 1 && points[1][1] === 1;
const isNeutral = (w: ColorWheel) => Math.abs(w.x) < 1e-3 && Math.abs(w.y) < 1e-3 && Math.abs(w.level) < 1e-3;

export function gradeIsNeutral(grade: ColorGrade | undefined): boolean {
  if (!grade) return true;
  return (
    isNeutral(grade.shadows) &&
    isNeutral(grade.midtones) &&
    isNeutral(grade.highlights) &&
    Math.abs(grade.saturation - 1) < 1e-3 &&
    Object.values(grade.curves).every(isStraight)
  );
}

/** Ponto da roda → desvio de cor em RGB (como o círculo de cores dos editores: vermelho em cima à direita…). */
export function wheelTint(w: ColorWheel): [number, number, number] {
  const u = w.x;
  const v = -w.y;
  return [v * 1.14, -0.395 * u - 0.581 * v, 2.03 * u].map((c) => c * 0.5) as [number, number, number];
}

/** Interpolação monotônica (Fritsch–Carlson): a curva passa pelos pontos sem "ondular". */
export function sampleCurve(points: CurvePoints, x: number): number {
  const p = points;
  if (x <= p[0][0]) return p[0][1];
  if (x >= p[p.length - 1][0]) return p[p.length - 1][1];
  const n = p.length;
  const dx = p.slice(0, -1).map((a, i) => Math.max(1e-6, p[i + 1][0] - a[0]));
  const slope = p.slice(0, -1).map((a, i) => (p[i + 1][1] - a[1]) / dx[i]);
  const m = p.map((_, i) => (i === 0 ? slope[0] : i === n - 1 ? slope[n - 2] : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(slope[i]) < 1e-9) m[i] = m[i + 1] = 0;
    else {
      const a = m[i] / slope[i];
      const b = m[i + 1] / slope[i];
      const h = a * a + b * b;
      if (h > 9) {
        const t = 3 / Math.sqrt(h);
        m[i] = t * a * slope[i];
        m[i + 1] = t * b * slope[i];
      }
    }
  }
  let i = 0;
  while (i < n - 2 && x > p[i + 1][0]) i++;
  const h = dx[i];
  const t = (x - p[i][0]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1];
}

const curveCache = new Map<string, { key: string; data: Uint8Array }>();

/** Tabela 256×4 (r, g, b, geral) para o renderizador; null se as curvas estão retas. */
function curveTable(curves: ColorGrade['curves']): LayerColor['curves'] {
  if (Object.values(curves).every(isStraight)) return null;
  const key = JSON.stringify(curves);
  let cached = curveCache.get(key);
  if (!cached) {
    const data = new Uint8Array(256 * 4);
    const channels: CurveChannel[] = ['r', 'g', 'b', 'master'];
    for (let i = 0; i < 256; i++) {
      channels.forEach((c, k) => {
        data[i * 4 + k] = Math.round(Math.min(1, Math.max(0, sampleCurve(curves[c], i / 255))) * 255);
      });
    }
    cached = { key, data };
    curveCache.set(key, cached);
    if (curveCache.size > 64) curveCache.delete(curveCache.keys().next().value!);
  }
  return cached;
}

/** O que o renderizador recebe: lift/gamma/gain prontos e a tabela das curvas. */
export function gradeInput(grade: ColorGrade | undefined): Pick<LayerColor, 'grade' | 'curves'> {
  if (gradeIsNeutral(grade)) return { grade: null, curves: null };
  const g = grade!;
  const add = (a: number[], b: number[], k: number) => a.map((v, i) => v + b[i] * k);
  const lift = add([0, 0, 0].map(() => g.shadows.level * 0.25), wheelTint(g.shadows), 0.25);
  const gamma = add([0, 0, 0].map(() => 1 + g.midtones.level * 0.6), wheelTint(g.midtones), 0.5);
  const gain = add([0, 0, 0].map(() => 1 + g.highlights.level * 0.6), wheelTint(g.highlights), 0.5);
  return { grade: { lift, gamma, gain, saturation: g.saturation }, curves: curveTable(g.curves) };
}
