import { useMemo, useSyncExternalStore } from 'react';
import { assetUrl } from '../assetUrl';
import { defaultParams, plugins } from '../engine/registry';
import { Renderer, type LayerInput } from '../engine/renderer';
import type { ShaderPlugin } from '../engine/types';

const WIDTH = 256;
const HEIGHT = 144;

/**
 * Cenas de exemplo desenhadas no canvas, com detalhes, texturas e todas as cores
 * (verde, azul, vermelho, pele...) para que cada efeito e filtro mostre a diferença.
 * 0 = paisagem de dia, 1 = cidade neon à noite (o "próximo clipe" das transições).
 */
function drawScene(variant: 0 | 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const W = WIDTH;
  const H = HEIGHT;
  // Pseudoaleatório fixo, para a cena ser sempre igual.
  let seed = variant === 0 ? 7 : 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const polygon = (color: string | CanvasGradient, points: [number, number][]) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
    ctx.fill();
  };
  const gradient = (stops: string[], y0 = 0, y1 = H) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  };

  if (variant === 0) {
    ctx.fillStyle = gradient(['#2f6fd6', '#7fb6f0', '#ffd6a8']);
    ctx.fillRect(0, 0, W, H);
    // Sol com halo
    const halo = ctx.createRadialGradient(W * 0.72, H * 0.3, 2, W * 0.72, H * 0.3, H * 0.35);
    halo.addColorStop(0, 'rgba(255,245,200,0.9)');
    halo.addColorStop(1, 'rgba(255,245,200,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath();
    ctx.arc(W * 0.72, H * 0.3, H * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // Nuvens
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [cx, cy, s] of [[0.2, 0.18, 1], [0.45, 0.12, 0.7], [0.9, 0.2, 0.8]]) {
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse((cx + (i - 2) * 0.03 * s) * W, (cy + (i % 2) * 0.02) * H, 12 * s, 7 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Montanhas com neve
    polygon(gradient(['#8a7fc0', '#5d5a99'], H * 0.25, H * 0.65), [[0, 0.65], [0.15, 0.38], [0.28, 0.5], [0.45, 0.28], [0.62, 0.52], [0.78, 0.36], [1, 0.6], [1, 0.7], [0, 0.7]]);
    polygon('#f4f6ff', [[0.45, 0.28], [0.41, 0.35], [0.45, 0.33], [0.49, 0.36]]);
    polygon('#f4f6ff', [[0.15, 0.38], [0.12, 0.43], [0.15, 0.42], [0.18, 0.44]]);
    // Colinas verdes
    polygon(gradient(['#5fbf4a', '#2f8a3a'], H * 0.55, H * 0.8), [[0, 0.62], [0.2, 0.56], [0.4, 0.62], [0.65, 0.57], [1, 0.63], [1, 0.8], [0, 0.8]]);
    // Lago com reflexos
    ctx.fillStyle = gradient(['#3c8fd8', '#1d4f8f'], H * 0.74, H);
    ctx.fillRect(0, H * 0.76, W, H * 0.24);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 14; i++) ctx.fillRect(rand() * W, H * (0.8 + rand() * 0.18), 6 + rand() * 18, 1);
    // Casinha vermelha
    ctx.fillStyle = '#d63a2f';
    ctx.fillRect(W * 0.3, H * 0.6, W * 0.06, H * 0.08);
    polygon('#7a2a1c', [[0.295, 0.6], [0.33, 0.53], [0.365, 0.6]]);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(W * 0.315, H * 0.62, W * 0.012, H * 0.025);
    // Pinheiros
    for (let i = 0; i < 9; i++) {
      const x = i < 5 ? 0.04 + i * 0.045 : 0.7 + (i - 5) * 0.07;
      const h = 0.12 + rand() * 0.08;
      const base = 0.74 + rand() * 0.03;
      polygon(i % 2 ? '#1f6b34' : '#28803e', [[x - 0.025, base], [x, base - h], [x + 0.025, base]]);
    }
  } else {
    ctx.fillStyle = gradient(['#07051f', '#3a0f5c', '#ff4f9a']);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) ctx.fillRect(rand() * W, rand() * H * 0.45, 1, 1);
    // Sol retrô listrado
    const sun = ctx.createLinearGradient(0, H * 0.25, 0, H * 0.65);
    sun.addColorStop(0, '#ffe36b');
    sun.addColorStop(1, '#ff4f9a');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, H * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a0f5c';
    for (let i = 0; i < 4; i++) ctx.fillRect(W * 0.3, H * (0.52 + i * 0.04), W * 0.4, 1 + i);
    // Prédios com janelas acesas
    for (let i = 0; i < 14; i++) {
      const x = (i / 14) * W + rand() * 4;
      const w = W / 14 - 2;
      const h = H * (0.15 + rand() * 0.3);
      ctx.fillStyle = i % 2 ? '#140a33' : '#1c0f45';
      ctx.fillRect(x, H * 0.72 - h, w, h);
      ctx.fillStyle = i % 3 ? '#3ff0ff' : '#ffd36b';
      for (let wy = H * 0.72 - h + 3; wy < H * 0.7; wy += 5) {
        for (let wx = x + 2; wx < x + w - 2; wx += 4) if (rand() > 0.55) ctx.fillRect(wx, wy, 2, 2);
      }
    }
    // Chão quadriculado neon
    ctx.fillStyle = '#12082e';
    ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.strokeStyle = 'rgba(255, 79, 163, 0.8)';
    ctx.lineWidth = 1;
    for (let x = -W; x < W * 2; x += 20) {
      ctx.beginPath();
      ctx.moveTo(W / 2, H * 0.72);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let i = 1; i < 6; i++) {
      const y = H * 0.72 + Math.pow(i / 6, 2) * H * 0.28;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }
  return canvas;
}

// ---------------------------------------------------------------- Cenas de exemplo

/**
 * Fotos e vídeo reais (domínio público/CC0, em /public/samples) usados nas miniaturas.
 * Enquanto carregam, as cenas desenhadas acima ficam no lugar.
 */
const PHOTOS: Record<0 | 1, string> = { 0: 'samples/paisagem.jpg', 1: 'samples/cidade.jpg' };
const SAMPLE_VIDEO = 'samples/drone.webm';

const scenes = new Map<number, HTMLCanvasElement>();
let photosLoaded = false;
let version = 0;
const listeners = new Set<() => void>();

/** Cena de exemplo (0 = paisagem, 1 = cidade à noite). */
export function sceneCanvas(variant: 0 | 1): HTMLCanvasElement {
  if (!scenes.has(variant)) scenes.set(variant, drawScene(variant));
  return scenes.get(variant)!;
}

/** Para a interface redesenhar as miniaturas quando as fotos reais chegarem. */
export const previewStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getVersion: () => version,
};

/** Recorta a foto no formato das miniaturas (preenchendo, sem barras). */
function coverCanvas(image: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
  canvas
    .getContext('2d')!
    .drawImage(image, (WIDTH - image.width * scale) / 2, (HEIGHT - image.height * scale) / 2, image.width * scale, image.height * scale);
  return canvas;
}

/** Troca as cenas desenhadas pelas fotos reais e regenera as miniaturas. */
export async function loadSamplePhotos(): Promise<void> {
  if (photosLoaded) return;
  photosLoaded = true;
  try {
    for (const variant of [0, 1] as const) {
      const blob = await (await fetch(assetUrl(PHOTOS[variant]))).blob();
      const bitmap = await createImageBitmap(blob);
      scenes.set(variant, coverCanvas(bitmap));
      bitmap.close();
    }
    cache = null;
    version++;
    listeners.forEach((l) => l());
  } catch (error) {
    console.warn('[Lumiar] fotos de exemplo indisponíveis; usando cenas desenhadas', error);
  }
}

let sampleVideo: HTMLVideoElement | null = null;

/** Vídeo real tocando em loop (mudo), usado no preview ao passar o mouse. */
function getSampleVideo(): HTMLVideoElement | null {
  if (!sampleVideo) {
    sampleVideo = document.createElement('video');
    sampleVideo.src = assetUrl(SAMPLE_VIDEO);
    sampleVideo.muted = true;
    sampleVideo.loop = true;
    sampleVideo.playsInline = true;
    sampleVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(sampleVideo);
  }
  if (sampleVideo.paused) sampleVideo.play().catch(() => {});
  return sampleVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? sampleVideo : null;
}

let cache: Map<string, string> | null = null;

/**
 * Miniatura de cada efeito/transição/filtro, gerada pelo próprio motor de efeitos
 * (o que se vê no card é exatamente o que o shader faz).
 */
export function getPluginPreviews(): Map<string, string> {
  if (cache) return cache;
  cache = new Map();
  const stage = getStage();
  if (!stage) return cache;
  for (const plugin of plugins) {
    drawPlugin(stage, plugin, 1.3, plugin.kind === 'transition' ? 0.35 : 1, sceneCanvas(0));
    cache.set(plugin.id, stage.canvas.toDataURL('image/jpeg', 0.85));
  }
  return cache;
}

/**
 * Desenha um quadro animado do plugin num canvas 2D (preview ao passar o mouse),
 * por cima do vídeo de exemplo: efeitos correm no tempo, transições tocam do início
 * ao fim e filtros vão do original até a intensidade máxima e voltam.
 */
export function drawLivePreview(plugin: ShaderPlugin, seconds: number, target: CanvasRenderingContext2D): void {
  const stage = getStage();
  if (!stage) return;
  const cycle = 2.4;
  const phase = (seconds % cycle) / cycle;
  const value =
    plugin.kind === 'transition'
      ? smoothstep(0.15, 0.85, phase)
      : smoothstep(0.1, 0.9, 1 - Math.abs(phase * 2 - 1));
  const video = getSampleVideo();
  drawPlugin(stage, plugin, 1.3 + seconds, value, video ?? sceneCanvas(0), video ? 854 : WIDTH, video ? 480 : HEIGHT);
  target.drawImage(stage.canvas, 0, 0, target.canvas.width, target.canvas.height);
}

interface Stage {
  renderer: Renderer;
  canvas: HTMLCanvasElement;
}

let stage: Stage | null | undefined;

/** Um único contexto WebGL para todas as miniaturas (o navegador limita quantos podem existir). */
function getStage(): Stage | null {
  if (stage !== undefined) return stage;
  const canvas = document.createElement('canvas');
  try {
    stage = { renderer: new Renderer(canvas, WIDTH, HEIGHT), canvas };
  } catch {
    stage = null;
  }
  return stage;
}

/** `value` é o progresso (transições) ou a intensidade (filtros). */
function drawPlugin(
  stage: Stage,
  plugin: ShaderPlugin,
  time: number,
  value: number,
  sourceA: TexImageSource,
  widthA = WIDTH,
  heightA = HEIGHT,
): void {
  const params = { ...defaultParams(plugin), ...plugin.previewParams };
  const layer = (key: string, source: TexImageSource, w: number, h: number, extra: Partial<LayerInput> = {}): LayerInput => ({
    key,
    source,
    width: w,
    height: h,
    time,
    duration: 3,
    effects: [],
    filter: null,
    camera: { zoom: 1, x: 0.5, y: 0.5, rotation: 0, fill: true },
    ...extra,
  });
  const a = (extra: Partial<LayerInput> = {}) => layer('a', sourceA, widthA, heightA, extra);
  if (plugin.kind === 'effect') {
    const effect = { uid: plugin.id, pluginId: plugin.id, enabled: true, params };
    stage.renderer.render({ a: a({ effects: [effect] }), b: null, transition: null });
  } else if (plugin.kind === 'filter') {
    const filter = { pluginId: plugin.id, intensity: value, params };
    stage.renderer.render({ a: a({ filter }), b: null, transition: null });
  } else {
    stage.renderer.render({
      a: a(),
      b: layer('b', sceneCanvas(1), WIDTH, HEIGHT),
      transition: { pluginId: plugin.id, params, progress: value },
    });
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Miniaturas dos plugins, atualizadas quando as fotos reais terminam de carregar. */
export function usePluginPreviews(): Map<string, string> {
  const v = useSyncExternalStore(previewStore.subscribe, previewStore.getVersion);
  return useMemo(() => getPluginPreviews(), [v]);
}
