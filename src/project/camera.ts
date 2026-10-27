import { evaluateNumber, type Easing, type Keyframe, type KeyframeMap } from '../engine/keyframes';

/**
 * Enquadramento da "câmera virtual" sobre a imagem do clipe.
 * x/y = centro da vista dentro da imagem (0 a 1, y de cima para baixo);
 * zoom 1 = imagem inteira; rotation em graus.
 */
export interface CameraTransform {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
}

/** Posição do alvo (rosto ou ponto) num instante do arquivo de vídeo. */
export interface TrackPoint {
  /** Tempo dentro do arquivo (segundos) */
  t: number;
  x: number;
  y: number;
  /** Largura do rosto em fração da imagem (0 para pontos). */
  size: number;
}

export interface CameraFollow {
  kind: 'face' | 'point';
  points: TrackPoint[];
  /** Zoom usado enquanto segue */
  zoom: number;
  /** Segundos de suavização (quanto maior, mais calma a câmera) */
  smoothness: number;
  /** center = mantém o alvo no centro; lock = estabiliza (o alvo fica onde estava). */
  mode: 'center' | 'lock';
  /** Tempo de referência para o modo "lock" */
  anchorTime: number;
}

export interface Camera {
  base: CameraTransform;
  /** Keyframes de zoom, x, y e rotation (tempo do clipe) */
  keyframes: KeyframeMap;
  /** Ampliar a imagem para cobrir a tela toda (sem barras pretas). */
  fill: boolean;
  follow: CameraFollow | null;
}

export const IDENTITY: CameraTransform = { zoom: 1, x: 0.5, y: 0.5, rotation: 0 };

export function createCamera(): Camera {
  return { base: { ...IDENTITY }, keyframes: {}, fill: false, follow: null };
}

/** Média ponderada (gaussiana) dos pontos perto do instante t: tira o tremido do rastreamento. */
function sampleTrack(points: TrackPoint[], t: number, smoothness: number): { x: number; y: number } | null {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0];
  const sigma = Math.max(0.02, smoothness);
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (const p of points) {
    const d = p.t - t;
    if (Math.abs(d) > sigma * 3) continue;
    const w = Math.exp(-(d * d) / (2 * sigma * sigma));
    sx += p.x * w;
    sy += p.y * w;
    sw += w;
  }
  if (sw > 1e-6) return { x: sx / sw, y: sy / sw };
  // Fora da área rastreada: usa o ponto mais próximo.
  let nearest = points[0];
  for (const p of points) if (Math.abs(p.t - t) < Math.abs(nearest.t - t)) nearest = p;
  return nearest;
}

/** Enquadramento final no instante: keyframes + seguir rosto/ponto. */
export function evaluateCamera(camera: Camera | undefined, clipTime: number, sourceTime: number): CameraTransform {
  if (!camera) return IDENTITY;
  const k = camera.keyframes;
  const manual: CameraTransform = {
    zoom: evaluateNumber(k.zoom, clipTime, camera.base.zoom),
    x: evaluateNumber(k.x, clipTime, camera.base.x),
    y: evaluateNumber(k.y, clipTime, camera.base.y),
    rotation: evaluateNumber(k.rotation, clipTime, camera.base.rotation),
  };
  const follow = camera.follow;
  if (!follow) return manual;
  const target = sampleTrack(follow.points, sourceTime, follow.smoothness);
  if (!target) return manual;
  const zoom = manual.zoom * follow.zoom;
  // x/y manuais viram um ajuste fino do enquadramento (ex.: deixar o rosto no terço de cima).
  const offsetX = manual.x - 0.5;
  const offsetY = manual.y - 0.5;
  if (follow.mode === 'center') return { ...manual, zoom, x: target.x - offsetX, y: target.y - offsetY };
  const anchor = sampleTrack(follow.points, follow.anchorTime, follow.smoothness) ?? target;
  return { ...manual, zoom, x: 0.5 + target.x - anchor.x - offsetX, y: 0.5 + target.y - anchor.y - offsetY };
}

// ---------------------------------------------------------------- Animações prontas

type Frame = [number, Partial<CameraTransform>, Easing?];

export interface CameraPreset {
  id: string;
  name: string;
  /** Keyframes em fração da duração do clipe (0 a 1), ou segundos absolutos quando `seconds`. */
  frames: Frame[];
  seconds?: boolean;
}

export const CAMERA_PRESETS: CameraPreset[] = [
  { id: 'zoom-in', name: 'Aproximar', frames: [[0, { zoom: 1 }], [1, { zoom: 1.35 }]] },
  { id: 'zoom-out', name: 'Afastar', frames: [[0, { zoom: 1.35 }], [1, { zoom: 1 }]] },
  { id: 'pan-right', name: 'Panorâmica →', frames: [[0, { zoom: 1.25, x: 0.4 }], [1, { zoom: 1.25, x: 0.6 }]] },
  { id: 'pan-left', name: 'Panorâmica ←', frames: [[0, { zoom: 1.25, x: 0.6 }], [1, { zoom: 1.25, x: 0.4 }]] },
  { id: 'tilt-up', name: 'Subir câmera', frames: [[0, { zoom: 1.25, y: 0.6 }], [1, { zoom: 1.25, y: 0.4 }]] },
  {
    id: 'ken-burns',
    name: 'Ken Burns',
    frames: [[0, { zoom: 1.1, x: 0.45, y: 0.55 }, 'linear'], [1, { zoom: 1.4, x: 0.57, y: 0.45 }]],
  },
  {
    id: 'punch-in',
    name: 'Zoom de impacto',
    seconds: true,
    frames: [[0, { zoom: 1 }, 'ease-out'], [0.18, { zoom: 1.45 }, 'hold']],
  },
  {
    id: 'double-punch',
    name: 'Zoom duplo',
    seconds: true,
    frames: [[0, { zoom: 1 }, 'ease-out'], [0.15, { zoom: 1.3 }, 'hold'], [0.9, { zoom: 1.3 }, 'ease-out'], [1.05, { zoom: 1.7 }, 'hold']],
  },
  {
    id: 'drone',
    name: 'Drone',
    frames: [[0, { zoom: 1.15, x: 0.45, rotation: -3 }, 'linear'], [1, { zoom: 1.4, x: 0.55, rotation: 3 }]],
  },
  {
    id: 'spin-in',
    name: 'Entrada girando',
    seconds: true,
    frames: [[0, { zoom: 1.6, rotation: -25 }, 'ease-out'], [0.8, { zoom: 1.1, rotation: 0 }, 'linear']],
  },
  {
    id: 'breathe',
    name: 'Respiração',
    seconds: true,
    frames: [[0, { zoom: 1.04 }], [1.5, { zoom: 1.12 }], [3, { zoom: 1.04 }], [4.5, { zoom: 1.12 }], [6, { zoom: 1.04 }], [7.5, { zoom: 1.12 }]],
  },
  {
    id: 'vertigo',
    name: 'Vertigem',
    frames: [[0, { zoom: 1.6, rotation: 0 }, 'ease-in'], [0.5, { zoom: 1.15, rotation: 4 }, 'ease-out'], [1, { zoom: 1.5, rotation: -4 }]],
  },
];

/** Gera os keyframes de uma animação pronta para um clipe com essa duração. */
export function presetKeyframes(preset: CameraPreset, clipLength: number): KeyframeMap {
  const map: KeyframeMap = {};
  for (const [at, values, easing] of preset.frames) {
    const time = preset.seconds ? at : at * clipLength;
    if (time > clipLength + 1e-6) continue;
    for (const [key, value] of Object.entries(values) as [keyof CameraTransform, number][]) {
      const k: Keyframe = { time, value, easing: easing ?? 'ease' };
      (map[key] ??= []).push(k);
    }
  }
  return map;
}

/**
 * Converte um ponto clicado na tela (0 a 1) para a posição na imagem do clipe,
 * desfazendo o encaixe e a câmera. Mesmo cálculo do shader de origem.
 */
export function screenToSource(
  screen: { x: number; y: number },
  view: CameraTransform & { fill: boolean },
  output: { width: number; height: number },
  media: { width: number; height: number },
): { x: number; y: number } {
  const ratio = output.width / output.height;
  const mediaRatio = media.width / media.height || ratio;
  const scale = mediaRatio > ratio ? [1, ratio / mediaRatio] : [mediaRatio / ratio, 1];
  const zoom = view.zoom * (view.fill ? 1 / Math.min(scale[0], scale[1]) : 1);
  // Na tela: y para cima, como no shader.
  let sx = (screen.x - 0.5) * ratio;
  let sy = 0.5 - screen.y;
  const r = (view.rotation * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  [sx, sy] = [c * sx - s * sy, s * sx + c * sy];
  sx /= zoom;
  sy /= zoom;
  const { x: cx, y: cyUp } = clampCenter(view.x, 1 - view.y, zoom, scale);
  const px = sx / ratio / scale[0] + cx;
  const pyUp = sy / scale[1] + cyUp;
  return { x: px, y: 1 - pyUp };
}

/** A vista não pode sair da imagem (senão apareceriam bordas pretas). Igual ao shader. */
function clampCenter(x: number, yUp: number, zoom: number, scale: number[]) {
  const hx = 0.5 / (zoom * scale[0]);
  const hy = 0.5 / (zoom * scale[1]);
  const clamp = (v: number, h: number) => Math.min(Math.max(v, Math.min(h, 0.5)), Math.max(1 - h, 0.5));
  return { x: clamp(x, hx), y: clamp(yUp, hy) };
}
