import type { CameraTransform } from './camera';

/**
 * Estabilização: tira o tremido da câmera sem perder o movimento que a pessoa quis fazer.
 *
 * 1. A análise (media/stabilize.ts) mede quanto a imagem andou e girou de um quadro para o seguinte.
 * 2. Somando esses passos sai o caminho da câmera; uma média gaussiana desse caminho é o movimento
 *    "de propósito" (panorâmica, caminhada). A diferença entre os dois é o tremido.
 * 3. Em cada quadro a câmera virtual anda o tremido junto com a imagem (e gira ao contrário),
 *    então o que aparece na tela segue só o caminho suave. Um zoom fixo esconde as bordas.
 *
 * O resultado fica em `camera.stabilize`, no tempo do arquivo: continua certo se o clipe for
 * cortado, dividido ou mudar de velocidade, e se soma aos keyframes e ao "seguir rosto/ponto".
 */

export type StabilizeStrength = 'suave' | 'media' | 'forte';

/** Quanto do caminho é considerado "de propósito": desvio da média gaussiana, em segundos. */
export const STRENGTH_SIGMA: Record<StabilizeStrength, number> = { suave: 0.15, media: 0.5, forte: 1.5 };

/** Zoom máximo para esconder as bordas. Tremido maior que isso fica só em parte corrigido. */
export const MAX_STABILIZE_ZOOM = 1.25;

/** Movimento da imagem do quadro anterior até este (px da imagem analisada, em volta do centro). */
export interface FrameMotion {
  /** Instante do quadro no arquivo (s) */
  t: number;
  dx: number;
  dy: number;
  /** Radianos, com y para baixo (positivo = horário na tela) */
  angle: number;
}

export interface Stabilization {
  strength: StabilizeStrength;
  /** Zoom fixo que esconde as bordas (multiplica o zoom da câmera) */
  zoom: number;
  /** Instantes do arquivo (s), em ordem */
  times: number[];
  /** Quanto o centro da vista anda em cada instante (fração da imagem, y para baixo) */
  x: number[];
  y: number[];
  /** Giro da câmera em cada instante (graus, como CameraTransform.rotation) */
  rotation: number[];
}

/** Posição acumulada da câmera: a imagem do primeiro quadro, levada até este, gira `angle` e anda (x, y). */
export interface Pose {
  x: number;
  y: number;
  angle: number;
}

/** Correção de um quadro, já no jeito da câmera virtual. */
export interface Correction {
  x: number;
  y: number;
  rotation: number;
}

/** Soma os passos de quadro a quadro (compondo os giros direito, não só somando deslocamentos). */
export function accumulatePath(motions: FrameMotion[]): Pose[] {
  const path: Pose[] = [];
  let x = 0;
  let y = 0;
  let angle = 0;
  motions.forEach((m, i) => {
    if (i > 0) {
      const c = Math.cos(m.angle);
      const s = Math.sin(m.angle);
      [x, y] = [c * x - s * y + m.dx, s * x + c * y + m.dy];
      angle += m.angle;
    }
    path.push({ x, y, angle });
  });
  return path;
}

/** Valor da reta que melhor passa pelos `count` primeiros pontos, no primeiro deles. */
function lineStart(values: number[], count: number): number {
  const m = Math.min(values.length, count);
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < m; i++) {
    sx += i;
    sy += values[i];
    sxx += i * i;
    sxy += i * values[i];
  }
  const den = m * sxx - sx * sx;
  return den > 1e-9 ? (sy * sxx - sx * sxy) / den : sy / m;
}

/**
 * Média gaussiana (desvio `sigma` em quadros). Nas pontas o caminho é "espelhado" em volta da reta
 * que passa pelos pontos de lá: uma panorâmica reta continua reta (sem puxar para dentro), e a
 * ponta não fica presa ao primeiro quadro, que também pode estar tremido.
 */
export function gaussianSmooth(values: number[], sigma: number): number[] {
  const n = values.length;
  if (n < 3 || sigma < 0.5) return [...values];
  const radius = Math.ceil(sigma * 3);
  const weights = Array.from({ length: radius * 2 + 1 }, (_, k) => Math.exp(-((k - radius) ** 2) / (2 * sigma * sigma)));
  const total = weights.reduce((a, b) => a + b, 0);
  const span = Math.ceil(sigma * 2) + 1;
  const head = lineStart(values, span);
  const tail = lineStart([...values].reverse(), span);
  const at = (j: number): number => {
    if (j < 0) return 2 * head - values[Math.min(n - 1, -j)];
    if (j >= n) return 2 * tail - values[Math.max(0, 2 * (n - 1) - j)];
    return values[j];
  };
  return values.map((_, i) => {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += weights[k + radius] * at(i + k);
    return sum / total;
  });
}

export function smoothPath(path: Pose[], sigmaFrames: number): Pose[] {
  const x = gaussianSmooth(path.map((p) => p.x), sigmaFrames);
  const y = gaussianSmooth(path.map((p) => p.y), sigmaFrames);
  const angle = gaussianSmooth(path.map((p) => p.angle), sigmaFrames);
  return path.map((_, i) => ({ x: x[i], y: y[i], angle: angle[i] }));
}

/**
 * Correção de cada quadro: o tremido = caminho real "menos" o suave (como transformação: real ∘ suave⁻¹).
 * A vista anda o deslocamento do tremido junto com a imagem e gira ao contrário dele.
 * width/height = tamanho da imagem analisada (px), para virar fração da imagem.
 */
export function corrections(path: Pose[], smooth: Pose[], width: number, height: number): Correction[] {
  return path.map((real, i) => {
    const target = smooth[i];
    const angle = real.angle - target.angle;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const dx = real.x - (c * target.x - s * target.y);
    const dy = real.y - (s * target.x + c * target.y);
    return { x: dx / width, y: dy / height, rotation: (-angle * 180) / Math.PI };
  });
}

/**
 * Do jeito do arquivo para o jeito que o clipe aparece (girado em 90° / espelhado), igual ao shader:
 * a câmera trabalha na imagem já girada. Espelhar inverte o sentido do giro.
 */
export function orientCorrection(c: Correction, turn: number, flipX: boolean, flipY: boolean): Correction {
  let x = c.x;
  let y = c.y;
  if (turn === 90) [x, y] = [-c.y, c.x];
  else if (turn === 180) [x, y] = [-c.x, -c.y];
  else if (turn === 270) [x, y] = [c.y, -c.x];
  if (flipX) x = -x;
  if (flipY) y = -y;
  return { x, y, rotation: flipX !== flipY ? -c.rotation : c.rotation };
}

/**
 * Zoom que esconde as bordas neste quadro: a tela girada e deslocada precisa caber dentro da imagem.
 * `aspect` = largura / altura da imagem como aparece.
 */
export function frameZoom(c: Correction, aspect: number): number {
  const r = Math.abs((c.rotation * Math.PI) / 180);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const zx = (cos + sin / aspect) / (1 - 2 * Math.abs(c.x));
  const zy = (cos + sin * aspect) / (1 - 2 * Math.abs(c.y));
  const z = Math.max(zx, zy);
  return Math.abs(c.x) >= 0.5 || Math.abs(c.y) >= 0.5 || !Number.isFinite(z) ? Infinity : Math.max(1, z);
}

/**
 * Um zoom só para o clipe todo (zoom que muda "respira" e chama atenção). Usa o quadro mais exigente,
 * ignorando os 2% piores (um solavanco isolado não deve ampliar o vídeo inteiro), até o máximo.
 */
export function chooseZoom(list: Correction[], aspect: number, max = MAX_STABILIZE_ZOOM): { zoom: number; capped: boolean } {
  if (list.length === 0) return { zoom: 1, capped: false };
  const zooms = list.map((c) => frameZoom(c, aspect)).sort((a, b) => a - b);
  const needed = zooms[Math.min(zooms.length - 1, Math.floor(zooms.length * 0.98))];
  return needed > max ? { zoom: max, capped: true } : { zoom: Math.max(1, needed), capped: false };
}

/**
 * Corta a correção para caber no zoom (sem bordas pretas): primeiro o giro, depois o deslocamento
 * com a folga que sobrar.
 */
export function fitCorrection(c: Correction, zoom: number, aspect: number): Correction {
  const k = Math.max(aspect, 1 / aspect);
  let r = Math.abs((c.rotation * Math.PI) / 180);
  // Maior giro em que a tela ainda cabe só com o zoom (cos r + k·sen r ≤ zoom).
  const limit = Math.max(0, Math.asin(Math.min(1, zoom / Math.hypot(1, k))) - Math.atan2(1, k));
  r = Math.min(r, limit);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const room = (need: number) => Math.max(0, (1 - need / zoom) / 2);
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  return {
    x: clamp(c.x, room(cos + sin / aspect)),
    y: clamp(c.y, room(cos + sin * aspect)),
    rotation: (Math.sign(c.rotation) * r * 180) / Math.PI,
  };
}

/** Desvio padrão em quadros, a partir dos segundos (pelo intervalo típico entre os quadros). */
export function sigmaInFrames(times: number[], seconds: number): number {
  if (times.length < 2) return 0;
  const steps = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0).sort((a, b) => a - b);
  const step = steps[steps.length >> 1] ?? 1 / 30;
  return seconds / step;
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Monta a estabilização a partir dos movimentos medidos. */
export function buildStabilization(
  motions: FrameMotion[],
  options: { strength: StabilizeStrength; width: number; height: number; turn?: number; flipX?: boolean; flipY?: boolean; maxZoom?: number },
): { stabilization: Stabilization; capped: boolean } {
  const { strength, width, height, turn = 0, flipX = false, flipY = false } = options;
  const times = motions.map((m) => m.t);
  const path = accumulatePath(motions);
  const smooth = smoothPath(path, sigmaInFrames(times, STRENGTH_SIGMA[strength]));
  const sideways = turn === 90 || turn === 270;
  const aspect = sideways ? height / width : width / height;
  const raw = corrections(path, smooth, width, height).map((c) => orientCorrection(c, turn, flipX, flipY));
  const { zoom, capped } = chooseZoom(raw, aspect, options.maxZoom);
  const fitted = raw.map((c) => fitCorrection(c, zoom, aspect));
  return {
    stabilization: {
      strength,
      zoom: round(zoom, 4),
      times: times.map((t) => round(t, 4)),
      x: fitted.map((c) => round(c.x, 5)),
      y: fitted.map((c) => round(c.y, 5)),
      rotation: fitted.map((c) => round(c.rotation, 3)),
    },
    capped,
  };
}

/**
 * Correção no instante do arquivo: a do último quadro que já começou (o mesmo quadro que o player
 * mostra nesse instante). Fora do trecho analisado vale a ponta mais próxima.
 */
export function sampleStabilization(stab: Stabilization, sourceTime: number): Correction {
  const { times } = stab;
  if (times.length === 0) return { x: 0, y: 0, rotation: 0 };
  let lo = 0;
  let hi = times.length - 1;
  // Folga de meio milissegundo: o tempo pedido pode vir um tiquinho antes do quadro, por arredondamento.
  const t = sourceTime + 5e-4;
  if (t < times[0]) return { x: stab.x[0], y: stab.y[0], rotation: stab.rotation[0] };
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return { x: stab.x[lo], y: stab.y[lo], rotation: stab.rotation[lo] };
}

/** Soma a estabilização ao enquadramento (keyframes / seguir). */
export function applyStabilization(view: CameraTransform, stab: Stabilization | undefined, sourceTime: number): CameraTransform {
  if (!stab) return view;
  const c = sampleStabilization(stab, sourceTime);
  return { zoom: view.zoom * stab.zoom, x: view.x + c.x, y: view.y + c.y, rotation: view.rotation + c.rotation };
}
