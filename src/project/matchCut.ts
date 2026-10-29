/**
 * Corte casado (match cut): acha, no fim do clipe A e no começo do clipe B, os dois quadros com a
 * forma e a composição mais parecidas (uma bola que vira a lua, uma porta que vira outra porta) e,
 * se ajudar, aproxima/move a imagem de B para as formas caírem no mesmo lugar da tela.
 *
 * Cada quadro vira uma "assinatura" bem pequena (48×27): o brilho e as bordas, os dois desfocados
 * (tolera diferença de detalhe) e sem a média (tolera diferença de luz). Parecido = correlação alta.
 * Conta pura (sem DOM): dá para testar no Node.
 */

export const SIG_W = 48;
export const SIG_H = 27;

/** Quadro reduzido em tons de cinza (SIG_W × SIG_H, 0 a 255). */
export interface SmallGray {
  data: Float32Array;
  width: number;
  height: number;
}

export interface Signature {
  /** Brilho desfocado, sem a média e com norma 1 */
  lum: Float32Array;
  /** Força das bordas desfocada, sem a média e com norma 1 */
  edge: Float32Array;
}

export interface FrameSample {
  /** Instante do arquivo (s) */
  t: number;
  gray: SmallGray;
}

/** Desfoque 3×3 (caixa), repetido `times` vezes. */
function blur(data: Float32Array, w: number, h: number, times: number): Float32Array {
  let src = data;
  for (let n = 0; n < times; n++) {
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            sum += src[yy * w + xx];
            count++;
          }
        }
        out[y * w + x] = sum / count;
      }
    }
    src = out;
  }
  return src;
}

/** Tira a média e deixa com norma 1 (imagem lisa vira tudo 0). */
function normalize(data: Float32Array): Float32Array {
  let mean = 0;
  for (let i = 0; i < data.length; i++) mean += data[i];
  mean /= data.length;
  let norm = 0;
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] - mean;
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(norm);
  if (norm < 1e-6) return new Float32Array(data.length);
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

export function signature(gray: SmallGray): Signature {
  const { data, width: w, height: h } = gray;
  const edge = new Float32Array(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (xx: number, yy: number) => data[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))];
      const gx = at(x + 1, y) - at(x - 1, y);
      const gy = at(x, y + 1) - at(x, y - 1);
      edge[y * w + x] = Math.hypot(gx, gy);
    }
  }
  return { lum: normalize(blur(data, w, h, 1)), edge: normalize(blur(edge, w, h, 2)) };
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Quanto dois quadros se parecem na composição (−1 a 1; 1 = mesma forma no mesmo lugar). */
export function similarity(a: Signature, b: Signature): number {
  return 0.45 * dot(a.lum, b.lum) + 0.55 * dot(a.edge, b.edge);
}

/** Enquadramento de B (como a câmera do clipe): zoom ≥ 1 e o centro da vista na imagem (0 a 1). */
export interface MatchView {
  zoom: number;
  x: number;
  y: number;
}

/** O quadro como aparece com o enquadramento (bilinear; a vista nunca sai da imagem). */
export function reframe(gray: SmallGray, view: MatchView): SmallGray {
  const { width: w, height: h, data } = gray;
  const out = new Float32Array(w * h);
  const sample = (u: number, v: number) => {
    const x = Math.min(w - 1, Math.max(0, u * w - 0.5));
    const y = Math.min(h - 1, Math.max(0, v * h - 0.5));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(w - 1, x0 + 1);
    const y1 = Math.min(h - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const top = data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx;
    const bottom = data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx;
    return top * (1 - fy) + bottom * fy;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = view.x + ((x + 0.5) / w - 0.5) / view.zoom;
      const v = view.y + ((y + 0.5) / h - 0.5) / view.zoom;
      out[y * w + x] = sample(u, v);
    }
  }
  return { data: out, width: w, height: h };
}

export const ZOOMS = [1, 1.1, 1.2, 1.32, 1.45, 1.6];

/**
 * O enquadramento de B que mais casa com A: aproximar um pouco e mover a vista (sem sair da imagem,
 * então sem barras pretas). Devolve também a nota sem mexer (zoom 1, no centro).
 */
export function bestView(a: SmallGray, b: SmallGray): { view: MatchView; score: number; base: number } {
  const target = signature(a);
  const base = similarity(target, signature(b));
  let best = { view: { zoom: 1, x: 0.5, y: 0.5 }, score: base };
  const STEPS = 6;
  for (const zoom of ZOOMS.slice(1)) {
    const half = 0.5 / zoom;
    for (let i = 0; i <= STEPS; i++) {
      for (let j = 0; j <= STEPS; j++) {
        const view = { zoom, x: half + ((1 - 2 * half) * i) / STEPS, y: half + ((1 - 2 * half) * j) / STEPS };
        const score = similarity(target, signature(reframe(b, view)));
        if (score > best.score) best = { view, score };
      }
    }
  }
  // Refina em volta do melhor (passos menores de posição).
  if (best.view.zoom > 1) {
    const { zoom } = best.view;
    const half = 0.5 / zoom;
    const step = (1 - 2 * half) / STEPS / 3;
    const center = best.view;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const view = {
          zoom,
          x: Math.min(1 - half, Math.max(half, center.x + i * step)),
          y: Math.min(1 - half, Math.max(half, center.y + j * step)),
        };
        const score = similarity(target, signature(reframe(b, view)));
        if (score > best.score) best = { view, score };
      }
    }
  }
  return { ...best, base };
}

export interface MatchCutResult {
  /** Novo fim de A e novo começo de B (instantes dos arquivos) */
  aOut: number;
  bIn: number;
  /** Nota do par escolhido e do corte como estava */
  score: number;
  before: number;
}

/**
 * O melhor par de quadros (fim de A × começo de B). Mexer muito no corte custa um pouco
 * (`penalty` por segundo andado), para só sair do lugar quando o casamento compensa.
 * `aCut`/`bCut` = onde o corte está hoje.
 */
export function bestPair(aFrames: FrameSample[], bFrames: FrameSample[], aCut: number, bCut: number, penalty = 0.03): MatchCutResult | null {
  if (!aFrames.length || !bFrames.length) return null;
  const aSigs = aFrames.map((f) => signature(f.gray));
  const bSigs = bFrames.map((f) => signature(f.gray));
  const nearest = (frames: FrameSample[], t: number) => frames.reduce((best, f, i) => (Math.abs(f.t - t) < Math.abs(frames[best].t - t) ? i : best), 0);
  const before = similarity(aSigs[nearest(aFrames, aCut)], bSigs[nearest(bFrames, bCut)]);
  let best: MatchCutResult = { aOut: aCut, bIn: bCut, score: before, before };
  let bestValue = before;
  for (let i = 0; i < aFrames.length; i++) {
    for (let j = 0; j < bFrames.length; j++) {
      const score = similarity(aSigs[i], bSigs[j]);
      const value = score - penalty * (Math.abs(aFrames[i].t - aCut) + Math.abs(bFrames[j].t - bCut));
      if (value > bestValue) {
        bestValue = value;
        best = { aOut: aFrames[i].t, bIn: bFrames[j].t, score, before };
      }
    }
  }
  return best;
}
