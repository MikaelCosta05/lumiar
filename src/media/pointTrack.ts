/**
 * Seguir vários pontos ao mesmo tempo, quadro a quadro (cantos de uma tela, pontos de um objeto).
 * Conta pura sobre imagens em tons de cinza: sem DOM, dá para testar no Node.
 *
 * É o mesmo jeito do "seguir ponto" (tracking.ts): um pedaço da imagem em volta do ponto vira um
 * molde e é procurado no quadro seguinte. Aqui com mais cuidado, porque os cantos de uma tela trocada
 * precisam ficar firmes: o molde ignora o brilho médio (luz mudando), a posição tem fração de pixel e,
 * quando um ponto se perde (saiu da imagem, ficou tampado), ele anda junto com os outros do grupo.
 */
import type { Gray } from './motion';

export interface TrackFrame {
  /** Instante do arquivo (s) */
  t: number;
  img: Gray;
}

export interface PointTrackOptions {
  /** Raio do molde (px) */
  patch?: number;
  /** Quanto um ponto pode andar entre dois quadros (px) */
  search?: number;
  /** Pontos perdidos acompanham o movimento dos outros (cantos de uma mesma tela) */
  group?: boolean;
}

/** Posição de cada ponto (0 a 1) num quadro; `lost` = estimada pelos outros pontos (ou parada). */
export interface TrackedPoint {
  x: number;
  y: number;
  lost: boolean;
}

/** Semelhança mínima (correlação) para aceitar a posição achada. */
const MIN_SCORE = 0.55;

interface Mold {
  data: Float32Array;
  original: Float32Array;
  energy: number;
}

/**
 * Pedaço em volta de (cx, cy) sem o brilho médio; null se não couber na imagem.
 * Lido com fração de pixel (bilinear): o molde fica centrado exatamente no ponto, senão o erro
 * de arredondamento se acumula quadro a quadro e o ponto escorrega.
 */
function cut(img: Gray, cx: number, cy: number, r: number): Float32Array | null {
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  if (x0 - r < 0 || y0 - r < 0 || x0 + r + 1 >= img.width || y0 + r + 1 >= img.height) return null;
  const fx = cx - x0;
  const fy = cy - y0;
  const size = r * 2 + 1;
  const out = new Float32Array(size * size);
  let mean = 0;
  for (let y = 0; y < size; y++) {
    const row = (y0 - r + y) * img.width + x0 - r;
    const below = row + img.width;
    for (let x = 0; x < size; x++) {
      const a = img.data[row + x] + (img.data[row + x + 1] - img.data[row + x]) * fx;
      const b = img.data[below + x] + (img.data[below + x + 1] - img.data[below + x]) * fx;
      const v = a + (b - a) * fy;
      out[y * size + x] = v;
      mean += v;
    }
  }
  mean /= out.length;
  for (let i = 0; i < out.length; i++) out[i] -= mean;
  return out;
}

function energyOf(data: Float32Array): number {
  let e = 0;
  for (let i = 0; i < data.length; i++) e += data[i] * data[i];
  return e;
}

/**
 * Diferença entre o molde (já sem a média) e o pedaço em (px, py), ignorando o brilho médio do pedaço:
 * Σ(c − t)² − n·média(c)². Infinity se o pedaço não couber.
 */
function zssd(img: Gray, mold: Float32Array, px: number, py: number, r: number): number {
  if (px - r < 0 || py - r < 0 || px + r >= img.width || py + r >= img.height) return Infinity;
  const size = r * 2 + 1;
  let sum = 0;
  let sumC = 0;
  for (let y = 0; y < size; y++) {
    const row = (py - r + y) * img.width + px - r;
    const m = y * size;
    for (let x = 0; x < size; x++) {
      const c = img.data[row + x];
      const d = c - mold[m + x];
      sum += d * d;
      sumC += c;
    }
  }
  const n = size * size;
  return sum - (sumC * sumC) / n;
}

/** Correlação (−1 a 1) entre o molde e o pedaço em (px, py). */
function score(img: Gray, mold: Mold, px: number, py: number, r: number): number {
  const patch = cut(img, px, py, r);
  if (!patch) return -1;
  let dot = 0;
  for (let i = 0; i < patch.length; i++) dot += patch[i] * mold.data[i];
  const e = energyOf(patch) * energyOf(mold.data);
  return e > 1e-6 ? dot / Math.sqrt(e) : -1;
}

function parabola(left: number, center: number, right: number): number {
  const curve = left - 2 * center + right;
  if (!Number.isFinite(curve) || curve <= 1e-9) return 0;
  return Math.max(-0.5, Math.min(0.5, (left - right) / (2 * curve)));
}

/** Procura o molde perto de (x, y): primeiro de 2 em 2 px, depois o pixel exato e a fração. */
function find(img: Gray, mold: Mold, x: number, y: number, r: number, search: number): { x: number; y: number; score: number } | null {
  const bx0 = Math.round(x);
  const by0 = Math.round(y);
  let best = Infinity;
  let bx = bx0;
  let by = by0;
  for (let dy = -search; dy <= search; dy += 2) {
    for (let dx = -search; dx <= search; dx += 2) {
      const e = zssd(img, mold.data, bx0 + dx, by0 + dy, r);
      if (e < best || (e === best && dx * dx + dy * dy < (bx - bx0) ** 2 + (by - by0) ** 2)) {
        best = e;
        bx = bx0 + dx;
        by = by0 + dy;
      }
    }
  }
  if (!Number.isFinite(best)) return null;
  // Refina em volta do palpite (a procura de 2 em 2 pode ter pulado o melhor pixel).
  let fx = bx;
  let fy = by;
  let fine = Infinity;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const e = zssd(img, mold.data, bx + dx, by + dy, r);
      if (e < fine) {
        fine = e;
        fx = bx + dx;
        fy = by + dy;
      }
    }
  }
  if (!Number.isFinite(fine)) return null;
  const at = (dx: number, dy: number) => zssd(img, mold.data, fx + dx, fy + dy, r);
  const sx = parabola(at(-1, 0), fine, at(1, 0));
  const sy = parabola(at(0, -1), fine, at(0, 1));
  return { x: fx + sx, y: fy + sy, score: score(img, mold, fx, fy, r) };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Segue os pontos (0 a 1 no quadro `start`) para frente e para trás em todos os quadros.
 * Devolve, para cada quadro, a posição de cada ponto. Pontos que não cabem um molde (bem na
 * borda) ficam "perdidos" desde o começo e só andam com o grupo.
 */
export function trackGrayPoints(
  frames: TrackFrame[],
  start: number,
  points: { x: number; y: number }[],
  options: PointTrackOptions = {},
  onStep?: (done: number, total: number) => void,
): TrackedPoint[][] {
  const r = options.patch ?? 10;
  const search = options.search ?? 20;
  const result: TrackedPoint[][] = frames.map(() => []);
  if (!frames.length) return result;
  const ref = frames[start].img;
  const molds: (Mold | null)[] = points.map((p) => {
    const data = cut(ref, p.x * ref.width, p.y * ref.height, r);
    return data ? { data: data.slice(), original: data, energy: energyOf(data) } : null;
  });
  result[start] = points.map((p) => ({ x: p.x, y: p.y, lost: false }));
  let done = 1;

  for (const direction of [1, -1]) {
    // Posição (px) e molde de cada ponto, a partir do quadro marcado.
    let pos = points.map((p) => ({ x: p.x * ref.width, y: p.y * ref.height }));
    const live = molds.map((m) => m && { data: m.data.slice(), original: m.original, energy: m.energy });
    for (let i = start + direction; i >= 0 && i < frames.length; i += direction) {
      const { img } = frames[i];
      const found = pos.map((p, k) => {
        const mold = live[k];
        if (!mold || mold.energy < 1e-3) return null;
        const hit = find(img, mold, p.x, p.y, r, search);
        return hit && hit.score >= MIN_SCORE ? hit : null;
      });
      // Quanto o grupo andou (mediana dos pontos achados): os perdidos andam igual.
      const moved = found.flatMap((f, k) => (f ? [{ dx: f.x - pos[k].x, dy: f.y - pos[k].y }] : []));
      const shift = options.group && moved.length ? { dx: median(moved.map((m) => m.dx)), dy: median(moved.map((m) => m.dy)) } : { dx: 0, dy: 0 };
      pos = pos.map((p, k) => {
        const f = found[k];
        return f ? { x: f.x, y: f.y } : { x: p.x + shift.dx, y: p.y + shift.dy };
      });
      result[i] = pos.map((p, k) => ({ x: p.x / img.width, y: p.y / img.height, lost: !found[k] }));
      // O molde se adapta devagar (o objeto gira, muda de tamanho), sem esquecer o original.
      found.forEach((f, k) => {
        const mold = live[k];
        if (!f || !mold) return;
        const current = cut(img, f.x, f.y, r);
        if (!current) return;
        for (let j = 0; j < mold.data.length; j++) mold.data[j] = mold.data[j] * 0.7 + current[j] * 0.2 + mold.original[j] * 0.1;
        mold.energy = energyOf(mold.data);
      });
      onStep?.(++done, frames.length);
    }
  }
  return result;
}

/** Tira o tremido do rastro: média com os vizinhos (pesos 1-2-1), só entre pontos achados. */
export function smoothTrack(track: TrackedPoint[][]): TrackedPoint[][] {
  return track.map((frame, i) =>
    frame.map((p, k) => {
      const prev = track[i - 1]?.[k];
      const next = track[i + 1]?.[k];
      if (!prev || !next) return p;
      return { ...p, x: (prev.x + 2 * p.x + next.x) / 4, y: (prev.y + 2 * p.y + next.y) / 4 };
    }),
  );
}
