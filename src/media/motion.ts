/**
 * Movimento da câmera entre dois quadros seguidos (para estabilizar o vídeo).
 * Tudo aqui é conta pura sobre imagens em tons de cinza: sem DOM, dá para testar no Node.
 *
 * Como funciona: uma grade de pedaços da imagem anterior é procurada na seguinte (primeiro numa
 * versão com metade do tamanho, que alcança movimentos maiores rápido, depois na resolução cheia,
 * com precisão de fração de pixel). Cada pedaço vira um par de pontos; `estimateRigid` acha o
 * deslocamento e o giro que melhor explicam a maioria dos pares, ignorando o que se mexe sozinho
 * (uma pessoa andando, um carro passando).
 */

export interface Gray {
  data: Float32Array;
  width: number;
  height: number;
}

/** Um pedaço da grade: onde estava (px, imagem anterior) e quanto andou até o quadro seguinte. */
export interface BlockMatch {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Movimento da imagem inteira: gira `angle` (radianos, y para baixo) em volta do centro e anda (dx, dy) px. */
export interface RigidMotion {
  dx: number;
  dy: number;
  angle: number;
  /** Quantos pedaços concordaram com o movimento */
  inliers: number;
}

export function grayFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Gray {
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
  return { data, width, height };
}

/** Metade do tamanho (média de 2×2). */
export function halve(img: Gray): Gray {
  const width = Math.floor(img.width / 2);
  const height = Math.floor(img.height / 2);
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const r0 = y * 2 * img.width;
    const r1 = r0 + img.width;
    for (let x = 0; x < width; x++) {
      const i = x * 2;
      data[y * width + x] = (img.data[r0 + i] + img.data[r0 + i + 1] + img.data[r1 + i] + img.data[r1 + i + 1]) * 0.25;
    }
  }
  return { data, width, height };
}

/** As duas resoluções usadas na procura. */
export interface Pyramid {
  full: Gray;
  half: Gray;
}

export function pyramid(img: Gray): Pyramid {
  return { full: img, half: halve(img) };
}

const BLOCK = 8; // raio do pedaço na resolução cheia (17×17 px)
const COARSE_BLOCK = 4; // raio na metade do tamanho (9×9)
const COARSE_SEARCH = 10; // até 20 px por quadro na resolução cheia
const FINE_SEARCH = 2;
const COLS = 10;
const ROWS = 6;

/** Diferença (soma dos quadrados) entre o pedaço em (ax, ay) de `a` e em (bx, by) de `b`; para cedo se passar de `limit`. */
function ssd(a: Gray, ax: number, ay: number, b: Gray, bx: number, by: number, radius: number, limit: number): number {
  if (bx - radius < 0 || by - radius < 0 || bx + radius >= b.width || by + radius >= b.height) return Infinity;
  let sum = 0;
  for (let y = -radius; y <= radius; y++) {
    const ra = (ay + y) * a.width + ax;
    const rb = (by + y) * b.width + bx;
    for (let x = -radius; x <= radius; x++) {
      const d = a.data[ra + x] - b.data[rb + x];
      sum += d * d;
    }
    if (sum >= limit) return sum;
  }
  return sum;
}

/**
 * Quanto o pedaço tem de "cantos" (menor autovalor do tensor de estrutura, por pixel).
 * Pedaço liso (céu, parede) ou só com uma linha reta não diz para onde a imagem andou.
 */
export function cornerness(img: Gray, cx: number, cy: number, radius: number): number {
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const i = y * img.width + x;
      const gx = (img.data[i + 1] - img.data[i - 1]) * 0.5;
      const gy = (img.data[i + img.width] - img.data[i - img.width]) * 0.5;
      xx += gx * gx;
      yy += gy * gy;
      xy += gx * gy;
    }
  }
  const n = (radius * 2 + 1) ** 2;
  const half = (xx + yy) / 2;
  return (half - Math.sqrt(Math.max(0, half * half - (xx * yy - xy * xy)))) / n;
}

/** Ajuste de parábola nos vizinhos do melhor ponto: a fração de pixel onde o erro é mínimo. */
function subpixel(left: number, center: number, right: number): number {
  const curve = left - 2 * center + right;
  if (!Number.isFinite(curve) || curve <= 1e-9) return 0;
  return Math.max(-0.5, Math.min(0.5, (left - right) / (2 * curve)));
}

/** Procura a grade de pedaços do quadro anterior no seguinte. */
export function blockMotion(prev: Pyramid, next: Pyramid, minCorner = 2): BlockMatch[] {
  const { full } = prev;
  // Longe das bordas: bordas pretas, carimbo de data e vinheta não se mexem com a câmera.
  const marginX = BLOCK + 2 + Math.round(full.width * 0.04);
  const marginY = BLOCK + 2 + Math.round(full.height * 0.04);
  const matches: BlockMatch[] = [];
  const size = FINE_SEARCH * 2 + 1;
  const errors = new Float64Array(size * size);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cx = Math.round(marginX + ((full.width - 2 * marginX) * (col + 0.5)) / COLS);
      const cy = Math.round(marginY + ((full.height - 2 * marginY) * (row + 0.5)) / ROWS);
      if (cornerness(full, cx, cy, BLOCK) < minCorner) continue;

      // 1) Metade do tamanho: procura larga.
      const hx = Math.round(cx / 2);
      const hy = Math.round(cy / 2);
      if (hx - COARSE_BLOCK < 0 || hy - COARSE_BLOCK < 0 || hx + COARSE_BLOCK >= prev.half.width || hy + COARSE_BLOCK >= prev.half.height) continue;
      let best = Infinity;
      let bx = 0;
      let by = 0;
      for (let dy = -COARSE_SEARCH; dy <= COARSE_SEARCH; dy++) {
        for (let dx = -COARSE_SEARCH; dx <= COARSE_SEARCH; dx++) {
          const e = ssd(prev.half, hx, hy, next.half, hx + dx, hy + dy, COARSE_BLOCK, best);
          // Empate: fica com o menor deslocamento (mais provável entre dois quadros seguidos).
          if (e < best || (e === best && dx * dx + dy * dy < bx * bx + by * by)) {
            best = e;
            bx = dx;
            by = dy;
          }
        }
      }
      // Achou no limite da procura: o movimento pode ser maior que o alcance, não dá para confiar.
      if (!Number.isFinite(best) || Math.abs(bx) === COARSE_SEARCH || Math.abs(by) === COARSE_SEARCH) continue;

      // 2) Resolução cheia: refina em volta do palpite.
      const gx = cx + bx * 2;
      const gy = cy + by * 2;
      let fine = Infinity;
      let fx = 0;
      let fy = 0;
      for (let dy = -FINE_SEARCH; dy <= FINE_SEARCH; dy++) {
        for (let dx = -FINE_SEARCH; dx <= FINE_SEARCH; dx++) {
          const e = ssd(full, cx, cy, next.full, gx + dx, gy + dy, BLOCK, Infinity);
          errors[(dy + FINE_SEARCH) * size + dx + FINE_SEARCH] = e;
          if (e < fine) {
            fine = e;
            fx = dx;
            fy = dy;
          }
        }
      }
      if (!Number.isFinite(fine)) continue;
      const at = (dx: number, dy: number) =>
        Math.abs(dx) <= FINE_SEARCH && Math.abs(dy) <= FINE_SEARCH ? errors[(dy + FINE_SEARCH) * size + dx + FINE_SEARCH] : Infinity;
      const sx = subpixel(at(fx - 1, fy), fine, at(fx + 1, fy));
      const sy = subpixel(at(fx, fy - 1), fine, at(fx, fy + 1));
      matches.push({ x: cx, y: cy, dx: gx + fx + sx - cx, dy: gy + fy + sy - cy });
    }
  }
  return matches;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Giro + deslocamento que leva os pontos (relativos ao centro) do quadro anterior aos do seguinte:
 * p' = R(angle)·p + (dx, dy). Mínimos quadrados (Procrustes) só com os pares que concordam.
 */
function fitRigid(pairs: { qx: number; qy: number; px: number; py: number }[]): { dx: number; dy: number; angle: number } {
  let mqx = 0;
  let mqy = 0;
  let mpx = 0;
  let mpy = 0;
  for (const p of pairs) {
    mqx += p.qx;
    mqy += p.qy;
    mpx += p.px;
    mpy += p.py;
  }
  const n = pairs.length;
  mqx /= n;
  mqy /= n;
  mpx /= n;
  mpy /= n;
  let dot = 0;
  let cross = 0;
  for (const p of pairs) {
    const ax = p.qx - mqx;
    const ay = p.qy - mqy;
    const bx = p.px - mpx;
    const by = p.py - mpy;
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
  }
  const angle = n >= 2 && Math.abs(dot) + Math.abs(cross) > 1e-9 ? Math.atan2(cross, dot) : 0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { dx: mpx - (c * mqx - s * mqy), dy: mpy - (s * mqx + c * mqy), angle };
}

/**
 * Movimento da câmera a partir dos pares de pontos, sem se deixar levar pelos que discordam
 * (objetos que se mexem sozinhos). Começa pela mediana dos deslocamentos e refina só com quem
 * concorda. `null` = pontos demais discordam (cena sem textura, corte de cena…).
 */
export function estimateRigid(matches: BlockMatch[], width: number, height: number): RigidMotion | null {
  if (matches.length < 4) return null;
  const pairs = matches.map((m) => ({ qx: m.x - width / 2, qy: m.y - height / 2, px: m.x + m.dx - width / 2, py: m.y + m.dy - height / 2 }));
  let model = { dx: median(matches.map((m) => m.dx)), dy: median(matches.map((m) => m.dy)), angle: 0 };
  let inliers = pairs;
  for (let round = 0; round < 4; round++) {
    const c = Math.cos(model.angle);
    const s = Math.sin(model.angle);
    const residuals = pairs.map((p) => Math.hypot(c * p.qx - s * p.qy + model.dx - p.px, s * p.qx + c * p.qy + model.dy - p.py));
    // Limite que se adapta ao erro típico, entre meio pixel e 2 px (mais que isso já é outro movimento).
    const limit = Math.min(2, Math.max(0.5, median(residuals) * 2.5 * 1.4826));
    inliers = pairs.filter((_, i) => residuals[i] <= limit);
    if (inliers.length < Math.max(4, matches.length * 0.3)) return null;
    model = fitRigid(inliers);
  }
  return { ...model, inliers: inliers.length };
}
