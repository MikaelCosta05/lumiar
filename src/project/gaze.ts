/**
 * Olhar para a câmera: a parte pura (sem tela nem IA), para dar para testar.
 *
 * A análise (media/gaze.ts) acha os olhos em cada quadro com os pontos do rosto do MediaPipe e guarda
 * no clipe, como o "seguir rosto" guarda o rosto. Na hora de desenhar, o olho do instante vira um
 * efeito interno (engine/gazeShader.ts) que empurra a íris para onde ela estaria olhando para a lente,
 * só dentro da abertura do olho. Olho fechado ou piscando: peso 0, nada mexe.
 */
import { GAZE_PLUGIN } from '../engine/gazeShader';
import type { LayerCamera } from '../engine/renderer';
import type { EffectInstance, ParamValues } from '../engine/types';

/**
 * Um olho num quadro, em coordenadas da mídia (0 a 1, y para baixo), na ordem:
 * canto de dentro (x, y), canto de fora, meio da pálpebra de cima, meio da de baixo, centro da íris,
 * raio da íris (fração da largura do olho), alvo (onde a íris fica olhando para a lente) e peso (0 a 1).
 */
export const EYE_VALUES = 14;
const R = 10;
const W = 13;

export interface GazeFrame {
  /** Instante dentro do arquivo (segundos) */
  t: number;
  /** Os dois olhos, EYE_VALUES números cada */
  eyes: number[];
}

/** Correção do olhar guardada no clipe. */
export interface GazeCorrection {
  enabled: boolean;
  /** 0 a 1: quanto da distância até a lente a íris anda */
  strength: number;
  /** 0 a 1: quanto da correção vale na vertical (quem lê embaixo da câmera olha para baixo) */
  vertical: number;
  /** Mídia analisada (trocar a mídia do clipe desliga a correção) */
  mediaId?: string;
  /** Em ordem de tempo; quadros sem rosto ficam de fora */
  frames: GazeFrame[];
}

export const DEFAULT_STRENGTH = 0.8;
export const DEFAULT_VERTICAL = 1;

export function createGaze(mediaId: string, frames: GazeFrame[]): GazeCorrection {
  return { enabled: true, strength: DEFAULT_STRENGTH, vertical: DEFAULT_VERTICAL, mediaId, frames };
}

/** Projeto aberto de outra versão ou estragado: só vale uma correção com tudo no lugar. */
export function isGaze(value: unknown): value is GazeCorrection {
  const v = value as GazeCorrection | null;
  return !!v && typeof v === 'object' && Array.isArray(v.frames) && v.frames.every((f) => f && typeof f.t === 'number' && Array.isArray(f.eyes) && f.eyes.length === EYE_VALUES * 2);
}

// ---------------------------------------------------------------- Pontos do rosto → olhos

/** Índices dos 478 pontos do Face Landmarker: cantos e pálpebras de cada olho (as íris são 468 e 473, com 4 pontos em volta). */
const EYES = [
  { inner: 133, outer: 33, upper: [158, 159, 160], lower: [144, 145, 153] },
  { inner: 362, outer: 263, upper: [385, 386, 387], lower: [373, 374, 380] },
];
const FOREHEAD = 10;
const CHIN = 152;

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * Onde a íris fica quando a pessoa olha para a lente: na direção do centro do globo ocular (a pupila
 * fica na reta entre a lente e o centro do olho). O centro do globo fica um pouco atrás do meio dos
 * cantos; de frente, a íris olhando para a lente fica um pouco acima da linha dos cantos e um pouco
 * para o lado de fora (o canto de dentro é mais comprido). As duas medidas, em frações da largura do
 * olho, vieram de um vídeo e de uma foto de gente olhando para a câmera (public/previews). Variam de
 * pessoa para pessoa (uns 0,03): o shader não corrige o que estiver dentro dessa folga.
 */
const EYEBALL_DEPTH = 0.06;
const IRIS_UP = 0.074;
const IRIS_OUT = 0.037;

/** Abertura do olho (altura ÷ largura) abaixo da qual ele conta como fechado, e acima da qual, aberto. */
const CLOSED = 0.1;
const OPEN = 0.17;

const smoothstep = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * Os dois olhos de um rosto (EYE_VALUES × 2 números). `blink` = o maior "piscar" das expressões do
 * MediaPipe (0 a 1). Coordenadas de entrada 0 a 1 (z na escala do x), como o MediaPipe devolve.
 */
export function eyesFromLandmarks(points: Landmark[], width: number, height: number, blink = 0): number[] | null {
  if (points.length < 478) return null;
  // Em pixels, para as distâncias valerem nas duas direções.
  const P = (i: number) => [points[i].x * width, points[i].y * height, points[i].z * width];
  const avg = (ids: number[]) => {
    const s = [0, 0, 0];
    for (const i of ids) P(i).forEach((v, k) => (s[k] += v / ids.length));
    return s;
  };
  // Direção do rosto (para trás da cabeça), pelo eixo dos olhos e o eixo testa-queixo.
  const right = sub(P(263), P(33));
  const down = sub(P(CHIN), P(FOREHEAD));
  let back = cross(right, down);
  const nb = Math.hypot(back[0], back[1], back[2]) || 1;
  back = back.map((v) => v / nb);
  if (back[2] < 0) back = back.map((v) => -v);
  // Rosto muito de lado: os olhos ficam estreitos e a correção não é confiável.
  const sideways = 1 - smoothstep(0.45, 0.7, Math.hypot(back[0], back[1]));
  const closedByBlink = 1 - smoothstep(0.35, 0.6, blink);

  const out: number[] = [];
  for (const eye of EYES) {
    const a = P(eye.inner);
    const b = P(eye.outer);
    const up = avg(eye.upper);
    const lo = avg(eye.lower);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // A íris mais perto do meio deste olho (a ordem dos pontos de íris muda entre versões do modelo).
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const iris = [468, 473]
      .map((c, k) => ({ c, ring: k ? [474, 475, 476, 477] : [469, 470, 471, 472] }))
      .reduce((p, q) => (dist2(P(q.c), mid) < dist2(P(p.c), mid) ? q : p));
    const ic = P(iris.c);
    const radius = iris.ring.reduce((s, i) => s + Math.hypot(P(i)[0] - ic[0], P(i)[1] - ic[1]), 0) / iris.ring.length;
    const open = len > 0 ? Math.hypot(up[0] - lo[0], up[1] - lo[1]) / len : 0;
    // Eixo do olho (de dentro para fora) e a perpendicular que aponta para a pálpebra de cima.
    const u = len > 0 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
    let v = [-u[1], u[0]];
    if ((up[0] - mid[0]) * v[0] + (up[1] - mid[1]) * v[1] < 0) v = [-v[0], -v[1]];
    const target = [0, 1].map((k) => mid[k] + (back[k] * EYEBALL_DEPTH + u[k] * IRIS_OUT + v[k] * IRIS_UP) * len);
    const weight = len < 3 ? 0 : smoothstep(CLOSED, OPEN, open) * sideways * closedByBlink;
    out.push(
      a[0] / width, a[1] / height,
      b[0] / width, b[1] / height,
      up[0] / width, up[1] / height,
      lo[0] / width, lo[1] / height,
      ic[0] / width, ic[1] / height,
      len > 0 ? radius / len : 0,
      target[0] / width, target[1] / height,
      weight,
    );
  }
  return out.map((v) => Math.round(v * 1e5) / 1e5);
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dist2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Centro do rosto (entre os olhos), para seguir sempre a mesma pessoa quando há várias. */
export function faceCenter(points: Landmark[]): { x: number; y: number; size: number } {
  const a = points[33];
  const b = points[263];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, size: Math.hypot(a.x - b.x, a.y - b.y) };
}

// ---------------------------------------------------------------- Suavizar no tempo

/**
 * Os pontos tremem um pouco de um quadro para o outro, e a íris tremendo vira um olho "fervendo":
 * cada número vira a média ponderada dos vizinhos (±2 quadros, sem atravessar buracos). O peso fica
 * com o menor dos vizinhos imediatos: perto de uma piscada, a correção já começa a sair.
 */
export function smoothGaze(frames: GazeFrame[], step: number): GazeFrame[] {
  const kernel = [0.12, 0.22, 0.32, 0.22, 0.12];
  const near = (i: number, j: number) => j >= 0 && j < frames.length && Math.abs(frames[j].t - frames[i].t) <= step * (Math.abs(i - j) + 0.6);
  return frames.map((f, i) => {
    const eyes = f.eyes.map((v, k) => {
      if (k % EYE_VALUES === W) {
        let w = v;
        for (const j of [i - 1, i + 1]) if (near(i, j)) w = Math.min(w, frames[j].eyes[k]);
        return w;
      }
      let sum = 0;
      let total = 0;
      for (let d = -2; d <= 2; d++) {
        const j = i + d;
        if (!near(i, j)) continue;
        sum += frames[j].eyes[k] * kernel[d + 2];
        total += kernel[d + 2];
      }
      return Math.round((sum / total) * 1e5) / 1e5;
    });
    return { t: f.t, eyes };
  });
}

// ---------------------------------------------------------------- Os olhos num instante

/** Os dois olhos no instante t do arquivo (entre dois quadros, em linha reta). Fora dos quadros analisados, null. */
export function gazeAt(frames: GazeFrame[], t: number, step = 1 / 15): number[] | null {
  if (!frames.length) return null;
  // Foto: um quadro só, vale o tempo todo.
  if (frames.length === 1) return frames[0].eyes;
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (t < first.t - step || t > last.t + step) return null;
  if (t <= first.t) return first.eyes;
  if (t >= last.t) return last.eyes;
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  // Buraco grande (o rosto sumiu por um tempo): a correção some no meio.
  const gap = b.t - a.t > step * 3.5;
  return a.eyes.map((v, i) => {
    if (i % EYE_VALUES === W) return gap ? 0 : Math.min(v, b.eyes[i]);
    return v + (b.eyes[i] - v) * k;
  });
}

// ---------------------------------------------------------------- Efeito interno

// Importar o shader registra o efeito interno (o renderizador acha pelo id).
export const GAZE_PLUGIN_ID = GAZE_PLUGIN.id;

/** A correção vale para o clipe (ligada, da mesma mídia e com quadros)? */
export function usesGaze(clip: { gaze?: GazeCorrection; mediaId: string }): boolean {
  const g = clip.gaze;
  return !!g?.enabled && g.strength > 0 && isGaze(g) && g.frames.length > 0 && (!g.mediaId || g.mediaId === clip.mediaId);
}

/**
 * Ponto da mídia original (0 a 1, y para baixo) → como ele aparece depois de girar e espelhar, com
 * y para cima (o espaço do shader). O contrário do sourceUv do shader de origem.
 */
export function displayPoint(x: number, y: number, turn: number, flipX: boolean, flipY: boolean): [number, number] {
  let d: [number, number];
  if (turn === 90) d = [1 - y, x];
  else if (turn === 180) d = [1 - x, 1 - y];
  else if (turn === 270) d = [y, 1 - x];
  else d = [x, y];
  if (flipX) d[0] = 1 - d[0];
  if (flipY) d[1] = 1 - d[1];
  return [d[0], 1 - d[1]];
}

/** Os valores do shader para o instante (ou null: nada a corrigir agora). */
export function gazeParams(
  gaze: GazeCorrection,
  sourceTime: number,
  layer: { width: number; height: number; turn?: number; flipX?: boolean; flipY?: boolean; camera?: LayerCamera | null; stretch?: boolean },
): ParamValues | null {
  const eyes = gazeAt(gaze.frames, sourceTime);
  if (!eyes || !(eyes[W] > 0 || eyes[EYE_VALUES + W] > 0)) return null;
  const turn = layer.turn ?? 0;
  const point = (x: number, y: number) => displayPoint(x, y, turn, !!layer.flipX, !!layer.flipY);
  const cam = layer.camera;
  const params: ParamValues = {
    forca: Math.min(1, Math.max(0, gaze.strength)),
    vertical: Math.min(1, Math.max(0, gaze.vertical)),
    // width/height já vêm trocados quando gira 90°.
    aspecto: layer.width / Math.max(1, layer.height),
    encaixe: layer.stretch ? 0 : 1,
    camCentro: cam ? [cam.x, cam.y] : [0.5, 0.5],
    camZoom: cam ? Math.max(0.05, cam.zoom) : 1,
    camGiro: cam ? (cam.rotation * Math.PI) / 180 : 0,
    camEncher: cam?.fill ? 1 : 0,
  };
  for (let e = 0; e < 2; e++) {
    const v = eyes.slice(e * EYE_VALUES, (e + 1) * EYE_VALUES);
    params[`olho${e}a`] = point(v[0], v[1]);
    params[`olho${e}b`] = point(v[2], v[3]);
    params[`olho${e}c`] = point(v[4], v[5]);
    params[`olho${e}d`] = point(v[6], v[7]);
    params[`iris${e}`] = point(v[8], v[9]);
    params[`alvo${e}`] = point(v[11], v[12]);
    params[`extra${e}`] = [v[R], v[W]];
  }
  return params;
}

/** O efeito do instante, para entrar antes dos efeitos do clipe (a correção vale para a imagem original). */
export function gazeEffect(
  clip: { gaze?: GazeCorrection; mediaId: string; turn?: number; flipX?: boolean; flipY?: boolean },
  media: { width: number; height: number },
  sourceTime: number,
  camera: LayerCamera | null,
  stretch: boolean,
): EffectInstance | null {
  if (!usesGaze(clip)) return null;
  const sideways = clip.turn === 90 || clip.turn === 270;
  const params = gazeParams(clip.gaze!, sourceTime, {
    width: sideways ? media.height : media.width,
    height: sideways ? media.width : media.height,
    turn: clip.turn,
    flipX: clip.flipX,
    flipY: clip.flipY,
    camera,
    stretch,
  });
  return params ? { uid: 'olhar-para-camera', pluginId: GAZE_PLUGIN_ID, enabled: true, params } : null;
}

/** Quantos quadros por segundo analisar: até 30 (as piscadas são rápidas), menos em clipes longos. */
export function analysisFps(duration: number): number {
  return Math.max(8, Math.min(30, Math.floor(3600 / Math.max(1, duration))));
}
