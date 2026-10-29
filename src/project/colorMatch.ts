import { createGrade, type ColorGrade, type CurvePoints } from './grade';

/** Média e desvio de cada canal (0 a 1) de uma imagem pequena. */
export function colorStats(image: CanvasImageSource, width: number, height: number): { mean: number[]; std: number[] } {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = Math.max(1, Math.round((96 * height) / Math.max(1, width)));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const sum = [0, 0, 0];
  const sq = [0, 0, 0];
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c] / 255;
      sum[c] += v;
      sq[c] += v * v;
    }
  }
  const mean = sum.map((s) => s / n);
  return { mean, std: sq.map((s, c) => Math.sqrt(Math.max(1e-6, s / n - mean[c] ** 2))) };
}

/**
 * Igualar a cor: cada canal do clipe é esticado/deslocado para ter a mesma média e o mesmo contraste
 * do clipe de referência (vira uma curva por canal na correção manual, que dá para ajustar depois).
 */
export function matchGrade(current: ColorGrade | undefined, target: { mean: number[]; std: number[] }, reference: { mean: number[]; std: number[] }): ColorGrade {
  const grade = current ?? createGrade();
  const curve = (c: number): CurvePoints => {
    const a = Math.min(2, Math.max(0.5, reference.std[c] / target.std[c]));
    const b = reference.mean[c] - a * target.mean[c];
    const at = (x: number) => Math.min(1, Math.max(0, a * x + b));
    // Pontos em 0, nas médias e em 1: a reta fica exata onde a imagem tem mais informação.
    const xs = [0, Math.max(0.05, target.mean[c] - target.std[c]), target.mean[c], Math.min(0.95, target.mean[c] + target.std[c]), 1];
    return [...new Set(xs.map((x) => Math.round(x * 1000) / 1000))].sort((p, q) => p - q).map((x): [number, number] => [x, at(x)]);
  };
  return { ...grade, curves: { ...grade.curves, r: curve(0), g: curve(1), b: curve(2) } };
}
