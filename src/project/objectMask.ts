/**
 * Selecionar um objeto com cliques: a parte pura (sem tela nem IA), para dar para testar.
 *
 * A máscara do objeto é guardada no próprio clipe, em instantes de amostra do arquivo (a IA roda
 * só nesses quadros). Cada máscara é binária, pequena (no máximo 256 px no lado maior) e vai em
 * RLE: as corridas de pixels iguais, alternando fora/dentro, em números de tamanho variável e depois
 * base64. Um objeto de uma peça só ocupa ~2 corridas por linha: algumas centenas de bytes por quadro.
 * Entre duas amostras, as duas máscaras são deslocadas até o centro previsto do objeto e misturadas.
 */

/** Ponto marcado pela pessoa (x, y de 0 a 1 na imagem da mídia): incluir ou excluir. */
export interface ObjectPoint {
  x: number;
  y: number;
  include: boolean;
}

/** Máscara num instante do arquivo, com a área e o centro (para acompanhar o movimento entre amostras). */
export interface ObjectMaskFrame {
  /** Instante dentro do arquivo (segundos) */
  t: number;
  rle: string;
  /** Fração da imagem coberta pelo objeto (0 = não aparece neste quadro) */
  area: number;
  /** Centro do objeto (0 a 1) */
  cx: number;
  cy: number;
}

/** O objeto selecionado num clipe. */
export interface ObjectSelection {
  /** Os efeitos de pessoa usam este objeto no lugar da pessoa (recorte "objeto selecionado") */
  use: boolean;
  /** Mídia em que o objeto foi seguido (trocar a mídia do clipe desliga a seleção) */
  mediaId?: string;
  /** Instante do arquivo em que os pontos foram marcados */
  at: number;
  points: ObjectPoint[];
  /** Tamanho das máscaras (px) */
  width: number;
  height: number;
  /** Em ordem de tempo */
  frames: ObjectMaskFrame[];
}

/** Lado maior das máscaras guardadas (como a máscara da pessoa, que também é pequena). */
export const MASK_SIDE = 256;
/** Pontos demais só atrapalham a IA (e ninguém marca tantos). */
export const MAX_POINTS = 16;

/** Tamanho da máscara para uma mídia, mantendo a proporção. */
export function maskSize(width: number, height: number): { width: number; height: number } {
  const scale = MASK_SIDE / Math.max(1, width, height);
  return { width: Math.max(8, Math.round(width * scale)), height: Math.max(8, Math.round(height * scale)) };
}

// ---------------------------------------------------------------- RLE

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Máscara binária (1 = objeto) → texto curto. A primeira corrida é sempre "fora" (pode ter tamanho 0). */
export function encodeMask(bits: Uint8Array): string {
  const bytes: number[] = [];
  const push = (n: number) => {
    // Número de tamanho variável: 7 bits por byte, o bit alto diz que continua.
    while (n >= 0x80) {
      bytes.push((n & 0x7f) | 0x80);
      n >>>= 7;
    }
    bytes.push(n);
  };
  let value = 0;
  let run = 0;
  for (let i = 0; i < bits.length; i++) {
    const v = bits[i] ? 1 : 0;
    if (v === value) run++;
    else {
      push(run);
      value = v;
      run = 1;
    }
  }
  push(run);
  return toBase64(Uint8Array.from(bytes));
}

/** Texto → máscara com `length` pixels. Texto curto ou estragado não quebra: o que faltar fica "fora". */
export function decodeMask(rle: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(rle);
  } catch {
    return out;
  }
  let pos = 0;
  let value = 0;
  let i = 0;
  while (i < bytes.length && pos < length) {
    let n = 0;
    let shift = 0;
    while (i < bytes.length) {
      const b = bytes[i++];
      n += (b & 0x7f) * 2 ** shift;
      shift += 7;
      if (!(b & 0x80)) break;
    }
    const end = Math.min(length, pos + n);
    if (value) out.fill(1, pos, end);
    pos = end;
    value ^= 1;
  }
  return out;
}

// ---------------------------------------------------------------- Medidas da máscara

export interface MaskStats {
  /** Fração coberta */
  area: number;
  /** Centro (0 a 1) */
  cx: number;
  cy: number;
  /** Caixa em volta, em pixels: [x0, y0, x1, y1] (vazia: tudo 0) */
  box: [number, number, number, number];
}

export function maskStats(bits: Uint8Array, width: number, height: number): MaskStats {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!bits[y * width + x]) continue;
      n++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (!n) return { area: 0, cx: 0.5, cy: 0.5, box: [0, 0, 0, 0] };
  return { area: n / (width * height), cx: (sx / n + 0.5) / width, cy: (sy / n + 0.5) / height, box: [x0, y0, x1, y1] };
}

/** O pixel da máscara mais longe da borda dela (e da borda da imagem): o ponto mais seguro para marcar o objeto. */
export function deepestPoint(bits: Uint8Array, width: number, height: number): { x: number; y: number } | null {
  // Distância aproximada (chanfro 3-4) em duas passadas; fora da imagem conta como "fora".
  const d = new Float32Array(width * height);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : d[y * width + x]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      d[i] = bits[i] ? Math.min(at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4) : 0;
    }
  }
  let best = -1;
  let bx = 0;
  let by = 0;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!bits[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
      if (d[i] > best) {
        best = d[i];
        bx = x;
        by = y;
      }
    }
  }
  return best < 0 ? null : { x: (bx + 0.5) / width, y: (by + 0.5) / height };
}

/** A máscara andando (dx, dy) pixels; o que sai da imagem some. */
export function shiftMask(bits: Uint8Array, width: number, height: number, dx: number, dy: number): Uint8Array {
  const ox = Math.round(dx);
  const oy = Math.round(dy);
  if (!ox && !oy) return bits.slice();
  const out = new Uint8Array(bits.length);
  for (let y = 0; y < height; y++) {
    const sy = y - oy;
    if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < width; x++) {
      const sx = x - ox;
      if (sx >= 0 && sx < width) out[y * width + x] = bits[sy * width + sx];
    }
  }
  return out;
}

/** Quanto duas máscaras coincidem (interseção ÷ união; duas vazias = 0). */
export function maskIou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) union++;
  }
  return union ? inter / union : 0;
}

/** O ponto (0 a 1) cai dentro da máscara? `margin` em pixels tolera cliques bem na borda. */
export function insideMask(bits: Uint8Array, width: number, height: number, p: { x: number; y: number }, margin = 0): boolean {
  const cx = Math.floor(p.x * width);
  const cy = Math.floor(p.y * height);
  for (let y = cy - margin; y <= cy + margin; y++) {
    for (let x = cx - margin; x <= cx + margin; x++) {
      if (x >= 0 && y >= 0 && x < width && y < height && bits[y * width + x]) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- Escolher entre as máscaras da IA

/**
 * A IA devolve três máscaras (um pedaço, o objeto, o objeto com o que está em volta) com uma nota
 * para cada. A nota sozinha às vezes escolhe "a imagem toda": aqui pesa também se os pontos de
 * incluir caem dentro, se os de excluir ficam fora e, na propagação, o quanto ela bate com a máscara
 * prevista (a anterior, andando junto com o objeto).
 */
export function chooseMask(
  candidates: { score: number; bits: Uint8Array }[],
  width: number,
  height: number,
  points: ObjectPoint[],
  predicted?: Uint8Array | null,
): number {
  let best = -1;
  let bestScore = -Infinity;
  candidates.forEach((c, i) => {
    const { area } = maskStats(c.bits, width, height);
    let s = c.score;
    if (area === 0) s -= 2;
    if (area > 0.9) s -= 1;
    for (const p of points) {
      const inside = insideMask(c.bits, width, height, p);
      if (p.include && !inside) s -= 0.5;
      if (!p.include && inside) s -= 0.5;
    }
    if (predicted) s += 1.5 * maskIou(predicted, c.bits);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
}

// ---------------------------------------------------------------- Pontos

/**
 * Clique no quadro: em cima de um ponto que já existe, tira o ponto; senão, acrescenta (incluir com
 * o botão esquerdo, excluir com o direito). `radius` = distância (0 a 1) que conta como "em cima".
 */
export function togglePoint(points: ObjectPoint[], p: ObjectPoint, radius = 0.015): ObjectPoint[] {
  const hit = points.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) <= radius);
  if (hit >= 0) return points.filter((_, i) => i !== hit);
  if (points.length >= MAX_POINTS) return points;
  return [...points, { x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)), include: p.include }];
}

/**
 * Pontos para a próxima amostra da propagação, a partir da máscara prevista (a anterior deslocada
 * pelo movimento): o ponto mais "dentro" dela, o ponto seguido pelo rastreador (se ainda cai nela) e
 * os pontos de excluir da pessoa que não caem nela (deslocados junto com o objeto).
 */
export function propagationPrompt(
  predicted: Uint8Array,
  width: number,
  height: number,
  tracked: { x: number; y: number } | null,
  excludes: { x: number; y: number }[],
): ObjectPoint[] {
  const out: ObjectPoint[] = [];
  const deep = deepestPoint(predicted, width, height);
  if (deep) out.push({ ...deep, include: true });
  if (tracked && insideMask(predicted, width, height, tracked) && (!deep || Math.hypot(tracked.x - deep.x, tracked.y - deep.y) > 0.02)) {
    out.push({ x: tracked.x, y: tracked.y, include: true });
  }
  if (!out.length && tracked) out.push({ x: tracked.x, y: tracked.y, include: true });
  for (const e of excludes) {
    if (e.x < 0 || e.y < 0 || e.x > 1 || e.y > 1) continue;
    if (!insideMask(predicted, width, height, e, 2)) out.push({ x: e.x, y: e.y, include: false });
  }
  return out;
}

/** Posição de um ponto rastreado no instante t (entre duas posições, em linha reta; fora do rastro, null). */
export function trackedAt(track: { t: number; x: number; y: number }[], t: number): { x: number; y: number } | null {
  if (!track.length || t < track[0].t - 0.1 || t > track[track.length - 1].t + 0.1) return null;
  if (t <= track[0].t) return { x: track[0].x, y: track[0].y };
  const last = track[track.length - 1];
  if (t >= last.t) return { x: last.x, y: last.y };
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

// ---------------------------------------------------------------- Amostras e mistura entre elas

/** Pelo menos este intervalo entre as amostras (s), e no máximo tantas amostras por clipe. */
export const SAMPLE_STEP = 1 / 3;
export const MAX_SAMPLES = 150;

/**
 * Instantes em que a IA roda: a partir de onde os pontos foram marcados (`at`), para frente até
 * `to` e para trás até `from`. O primeiro de `forward` é o próprio `at`. Clipe longo = amostras mais
 * espaçadas (o total fica limitado).
 */
export function sampleTimes(from: number, to: number, at: number): { forward: number[]; backward: number[]; step: number } {
  const start = Math.min(Math.max(at, from), to);
  const step = Math.max(SAMPLE_STEP, (to - from) / MAX_SAMPLES);
  const forward = [start];
  for (let t = start + step; t < to - step * 0.25; t += step) forward.push(round(t));
  if (to - forward[forward.length - 1] > step * 0.25) forward.push(round(to - 0.001));
  const backward: number[] = [];
  for (let t = start - step; t > from + step * 0.25; t -= step) backward.push(round(t));
  if (start - from > step * 0.25 && (backward[backward.length - 1] ?? start) - from > step * 0.25) backward.push(round(from));
  return { forward, backward, step };
}

const round = (t: number) => Math.round(t * 1000) / 1000;

/** Como montar a máscara do instante t: as duas amostras vizinhas, o peso da segunda e o deslocamento de cada uma (0 a 1). */
export interface BlendPlan {
  a: number;
  b: number;
  /** Peso da amostra b (0 = só a) */
  k: number;
  shiftA: [number, number];
  shiftB: [number, number];
}

export function blendPlan(frames: Pick<ObjectMaskFrame, 't' | 'area' | 'cx' | 'cy'>[], t: number): BlendPlan | null {
  if (!frames.length) return null;
  const still = (i: number): BlendPlan => ({ a: i, b: i, k: 0, shiftA: [0, 0], shiftB: [0, 0] });
  if (t <= frames[0].t) return still(0);
  const last = frames.length - 1;
  if (t >= frames[last].t) return still(last);
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const A = frames[lo];
  const B = frames[hi];
  const k = (t - A.t) / Math.max(1e-6, B.t - A.t);
  // Um dos lados sem objeto (saiu da imagem ou ficou escondido): só esmaece, sem andar.
  if (!A.area || !B.area) return { a: lo, b: hi, k, shiftA: [0, 0], shiftB: [0, 0] };
  const cx = A.cx + (B.cx - A.cx) * k;
  const cy = A.cy + (B.cy - A.cy) * k;
  return { a: lo, b: hi, k, shiftA: [cx - A.cx, cy - A.cy], shiftB: [cx - B.cx, cy - B.cy] };
}

/**
 * Máscara em tons de cinza (0 a 255) do plano: as duas amostras deslocadas e misturadas, com a borda
 * suavizada (média 3×3) para não aparecer o serrilhado dos pixels grandes.
 */
export function renderBlend(plan: BlendPlan, a: Uint8Array, b: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const mix = new Float32Array(width * height);
  const add = (bits: Uint8Array, shift: [number, number], weight: number) => {
    if (weight <= 0) return;
    const moved = shiftMask(bits, width, height, shift[0] * width, shift[1] * height);
    for (let i = 0; i < mix.length; i++) if (moved[i]) mix[i] += weight;
  };
  add(a, plan.shiftA, 1 - plan.k);
  add(b, plan.shiftB, plan.a === plan.b ? 0 : plan.k);
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += mix[yy * width + xx];
          n++;
        }
      }
      out[y * width + x] = Math.round((sum / n) * 255);
    }
  }
  return out;
}

/** Máscara binária → amostra guardada no clipe. */
export function maskFrame(t: number, bits: Uint8Array, width: number, height: number): ObjectMaskFrame {
  const { area, cx, cy } = maskStats(bits, width, height);
  return { t: round(t), rle: encodeMask(bits), area: Math.round(area * 1e4) / 1e4, cx: Math.round(cx * 1e4) / 1e4, cy: Math.round(cy * 1e4) / 1e4 };
}

/** Projeto aberto de outra versão ou estragado: só vale uma seleção com tudo no lugar. */
export function isObjectSelection(value: unknown): value is ObjectSelection {
  const v = value as ObjectSelection | null;
  return !!v && typeof v === 'object' && Array.isArray(v.frames) && Array.isArray(v.points) && v.width > 0 && v.height > 0;
}
