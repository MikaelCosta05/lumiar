import { useMemo, useSyncExternalStore } from 'react';
import { assetUrl } from '../assetUrl';
import { defaultParams, getPlugin, plugins } from '../engine/registry';
import { Renderer, type LayerInput } from '../engine/renderer';
import { pluginInputs } from '../engine/shaders';
import { depthFrame } from '../media/depthVideo';
import { onSegmenterReady, segmentFrame } from '../media/segment';
import type { PreviewMedia, ShaderPlugin } from '../engine/types';
import { createProject, layoutProject, resolveFrame, toFrameInput } from '../project/model';
import { createPackClip, type PackTemplate } from '../project/packs';
import { fingerprint, PREVIEW_ENGINE, readThumbs, writeThumbs, type StoredThumb } from './previewCache';
import { PREVIEW_SOURCES, packMedia, pluginMedia, secondMedia } from './previewMedia';

const WIDTH = 256;
const HEIGHT = 144;

/**
 * Cenas desenhadas no canvas, só enquanto as mídias reais carregam (sem gente: a pessoa das
 * prévias é sempre o vídeo real). 0 = paisagem de dia, 1 = cidade neon à noite,
 * 2 = fundo abstrato no lugar dos vídeos com pessoa.
 */
function drawScene(variant: 0 | 1 | 2): HTMLCanvasElement {
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

  if (variant === 2) {
    // Fundo de estúdio escuro com manchas de luz coloridas (vermelho, verde, azul, tom de pele):
    // os filtros de cor ainda mostram a diferença enquanto o vídeo da pessoa carrega.
    ctx.fillStyle = gradient(['#1d2433', '#141821', '#0c0e13']);
    ctx.fillRect(0, 0, W, H);
    for (const [x, y, r, c] of [
      [0.5, 0.55, 0.55, '224,160,120'],
      [0.18, 0.3, 0.35, '64,140,255'],
      [0.84, 0.28, 0.32, '255,80,90'],
      [0.75, 0.85, 0.3, '80,210,120'],
      [0.25, 0.85, 0.28, '255,210,90'],
    ] as const) {
      const g = ctx.createRadialGradient(x * W, y * H, 1, x * W, y * H, r * H);
      g.addColorStop(0, `rgba(${c},0.85)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // Pontinhos de luz desfocados, para os efeitos de borda e brilho terem detalhe.
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.4})`;
      ctx.beginPath();
      ctx.arc(rand() * W, rand() * H, 1 + rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return canvas;
  }

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

// ---------------------------------------------------------------- Mídias de exemplo

/**
 * Vídeos e fotos reais (do Pexels, em /public/previews, ver CREDITOS.md). Cada um só
 * carrega quando alguma miniatura pede. Dos vídeos sai uma sequência curta de quadros parados que
 * termina no quadro da miniatura: os efeitos que olham para o passado (clones, rastro, eco…) têm
 * movimento de verdade para mostrar. Ao passar o mouse, o vídeo toca em loop.
 */
const SEQUENCE = 16;
const STEP = 1 / 15;
/** Máscaras da prévia ao vivo: uma a cada 1/12 s do vídeo (depois da primeira volta, nada é recalculado). */
const LIVE_RATE = 12;

interface Sample {
  state: 'idle' | 'loading' | 'ready' | 'failed';
  /** Tentativas de carregar (o vídeo pode demorar enquanto o app ainda abre) */
  tries: number;
  /** Quadros parados (WIDTH×HEIGHT); as fotos têm um só */
  stills: HTMLCanvasElement[] | null;
  /** Vídeo tocando em loop (prévia ao passar o mouse) */
  video: HTMLVideoElement | null;
  /** Máscara da pessoa e profundidade de cada quadro já analisado */
  masks: Map<string, HTMLCanvasElement>;
  depths: Map<string, HTMLCanvasElement>;
  /** O carregamento em andamento (para quem precisa esperar por ele) */
  pending?: Promise<void>;
}

const samples = new Map<PreviewMedia, Sample>();
const fallbacks = new Map<number, HTMLCanvasElement>();
let version = 0;
const listeners = new Set<() => void>();

function sample(media: PreviewMedia): Sample {
  let found = samples.get(media);
  if (!found) {
    found = { state: 'idle', tries: 0, stills: null, video: null, masks: new Map(), depths: new Map() };
    samples.set(media, found);
  }
  return found;
}

/** Cena desenhada que fica no lugar da mídia enquanto ela carrega. */
function fallbackScene(media: PreviewMedia): HTMLCanvasElement {
  const variant = media === 'paisagem' || media === 'drone' ? 0 : media === 'cidade' ? 1 : 2;
  if (!fallbacks.has(variant)) fallbacks.set(variant, drawScene(variant));
  return fallbacks.get(variant)!;
}

/** Quadros parados da mídia (null enquanto carregam; o carregamento começa no primeiro pedido). */
function stillsOf(media: PreviewMedia): HTMLCanvasElement[] | null {
  const s = sample(media);
  if (s.state === 'idle') s.pending = loadStills(media);
  return s.stills;
}

/** Espera todas as mídias de exemplo carregarem (as que falharem ficam com a cena desenhada). */
export async function loadPreviewMedia(): Promise<void> {
  const all = Object.keys(PREVIEW_SOURCES) as PreviewMedia[];
  for (let round = 0; round < 3; round++) {
    all.forEach((media) => stillsOf(media));
    await Promise.all(all.map((media) => sample(media).pending));
    if (all.every((media) => sample(media).state !== 'idle')) return;
  }
}

/** O quadro das miniaturas paradas (ou a cena desenhada enquanto carrega). */
export function sampleImage(media: PreviewMedia): HTMLCanvasElement {
  const stills = stillsOf(media);
  return stills ? stills[stills.length - 1] : fallbackScene(media);
}

/** Cena de exemplo (0 = paisagem, 1 = cidade à noite), para fundos de miniaturas de texto. */
export function sceneCanvas(variant: 0 | 1): HTMLCanvasElement {
  return sampleImage(variant === 0 ? 'paisagem' : 'cidade');
}

/** Para a interface redesenhar as miniaturas quando as mídias reais (ou o recorte da pessoa) chegarem. */
export const previewStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getVersion: () => version,
};

/** Recorta a imagem no formato das miniaturas (preenchendo, sem barras). `focusY` = altura que fica no centro. */
function coverCanvas(image: CanvasImageSource, width: number, height: number, focusY = 0.5): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const scale = Math.max(WIDTH / width, HEIGHT / height);
  const w = width * scale;
  const h = height * scale;
  const y = Math.min(0, Math.max(HEIGHT - h, HEIGHT / 2 - focusY * h));
  canvas.getContext('2d')!.drawImage(image, (WIDTH - w) / 2, y, w, h);
  return canvas;
}

function hiddenVideo(): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(video);
  return video;
}

/** Espera o evento (ou desiste depois de `ms`, para um vídeo travado não segurar as miniaturas). */
function once(target: HTMLMediaElement, event: string, ms = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error(`[Lumiar] prévia: ${event} demorou demais`)), ms);
    const ok = () => done();
    const fail = () => done(new Error('[Lumiar] prévia: vídeo indisponível'));
    const done = (error?: Error) => {
      clearTimeout(timer);
      target.removeEventListener(event, ok);
      target.removeEventListener('error', fail);
      if (error) reject(error);
      else resolve();
    };
    target.addEventListener(event, ok);
    target.addEventListener('error', fail);
  });
}

async function loadStills(media: PreviewMedia): Promise<void> {
  const s = sample(media);
  const source = PREVIEW_SOURCES[media];
  s.state = 'loading';
  s.tries++;
  try {
    if (!source.video) {
      const blob = await (await fetch(assetUrl(source.file))).blob();
      const bitmap = await createImageBitmap(blob);
      s.stills = [coverCanvas(bitmap, bitmap.width, bitmap.height, source.focusY)];
      bitmap.close();
    } else {
      // Um vídeo só para tirar os quadros (o da prévia ao vivo fica tocando sem ser interrompido).
      const video = hiddenVideo();
      video.preload = 'auto';
      try {
        video.src = assetUrl(source.file);
        await once(video, 'loadeddata');
        const stills: HTMLCanvasElement[] = [];
        for (let i = 0; i < SEQUENCE; i++) {
          video.currentTime = Math.max(0, (source.still ?? 0) - (SEQUENCE - 1 - i) * STEP);
          await once(video, 'seeked');
          stills.push(coverCanvas(video, video.videoWidth, video.videoHeight));
        }
        s.stills = stills;
      } finally {
        video.removeAttribute('src');
        video.load();
        video.remove();
      }
    }
    s.state = 'ready';
    refresh();
  } catch (error) {
    // Tenta de novo daqui a pouco; depois de três vezes, fica a cena desenhada.
    s.state = s.tries < 3 ? 'idle' : 'failed';
    if (s.state === 'idle') setTimeout(() => stillsOf(media), 3000);
    else console.warn(`[Lumiar] mídia de exemplo indisponível (${media}); usando a cena desenhada`, error);
  }
}

/** Já começa a carregar as mídias mais usadas (a pessoa e as fotos), antes de abrir a biblioteca. */
export async function loadSamplePhotos(): Promise<void> {
  for (const media of ['pessoa', 'retrato', 'paisagem', 'cidade'] as const) stillsOf(media);
}

/** Guarda no máximo `limit` itens (sai o mais antigo). */
function remember<T>(map: Map<string, T>, key: string, value: T, limit = 140): T {
  map.set(key, value);
  if (map.size > limit) map.delete(map.keys().next().value!);
  return value;
}

/** Vídeo da mídia tocando em loop (mudo), para a prévia ao passar o mouse. */
function sampleVideo(media: PreviewMedia): HTMLVideoElement | null {
  const s = sample(media);
  if (!s.video) {
    s.video = hiddenVideo();
    s.video.loop = true;
    s.video.src = assetUrl(PREVIEW_SOURCES[media].file);
  }
  keepPlaying(s.video);
  return s.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? s.video : null;
}

const lastUse = new WeakMap<HTMLVideoElement, number>();

/** Toca o vídeo enquanto alguma prévia está na tela; parado por um tempo, pausa para não gastar processamento. */
function keepPlaying(video: HTMLVideoElement): void {
  lastUse.set(video, performance.now());
  if (!video.paused) return;
  video.play().catch(() => {});
  const check = () => {
    if (performance.now() - (lastUse.get(video) ?? 0) > 400) video.pause();
    else setTimeout(check, 400);
  };
  setTimeout(check, 400);
}

// ---------------------------------------------------------------- Pessoa e profundidade

interface Needs {
  person: boolean;
  depth: boolean;
}

/** Um quadro pronto para o motor: a imagem, a máscara da pessoa e a profundidade (o que o plugin usa). */
interface Frame {
  source: TexImageSource;
  width: number;
  height: number;
  person: TexImageSource | null;
  depth: TexImageSource | null;
  /** false = falta algo (mídia ou recorte carregando): a miniatura é refeita quando chegar */
  ready: boolean;
}

let landscapeDepth: HTMLCanvasElement | null = null;

/**
 * Profundidade simples das paisagens (sem IA): céu longe em cima, o chão chegando perto embaixo.
 * Basta para trocar o céu, a neblina e o foco nas miniaturas.
 */
function sceneDepth(): HTMLCanvasElement {
  if (landscapeDepth) return landscapeDepth;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  g.addColorStop(0, '#000');
  g.addColorStop(0.22, '#000');
  g.addColorStop(0.34, '#4a4a4a');
  g.addColorStop(0.6, '#8a8a8a');
  g.addColorStop(1, '#d0d0d0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  landscapeDepth = canvas;
  return canvas;
}

/** Profundidade a partir do recorte: a pessoa perto, o fundo longe (sem baixar o modelo de profundidade). */
function personDepth(mask: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, mask.height);
  g.addColorStop(0, '#0c0c0c');
  g.addColorStop(1, '#3c3c3c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, mask.width, mask.height);
  ctx.globalCompositeOperation = 'lighten';
  ctx.drawImage(mask, 0, 0);
  return canvas;
}

/**
 * Máscara e profundidade de um quadro da mídia de exemplo, guardadas por `key` (o quadro parado ou o
 * instante do vídeo): cada quadro é recortado uma vez só. Nada é calculado se o plugin não usa a pessoa.
 */
function analyzeSample(media: PreviewMedia, image: CanvasImageSource, width: number, height: number, key: string, needs: Needs): Omit<Frame, 'source' | 'width' | 'height'> {
  if (!needs.person && !needs.depth) return { person: null, depth: null, ready: true };
  if (!PREVIEW_SOURCES[media].person) return { person: null, depth: needs.depth ? sceneDepth() : null, ready: true };
  const s = sample(media);
  let mask = s.masks.get(key);
  if (!mask) {
    const found = segmentFrame(image, width, height, `prévia:${media}:${key}`, false);
    if (!found) return { person: null, depth: null, ready: false };
    mask = remember(s.masks, key, found);
  }
  const depth = needs.depth ? (s.depths.get(key) ?? remember(s.depths, key, personDepth(mask))) : null;
  return { person: needs.person ? mask : null, depth, ready: true };
}

/** Quadro parado `index` da sequência da mídia (miniaturas). */
function stillFrame(media: PreviewMedia, index: number, needs: Needs): Frame {
  const stills = stillsOf(media);
  if (!stills) {
    const depth = needs.depth && !PREVIEW_SOURCES[media].person ? sceneDepth() : null;
    return { source: fallbackScene(media), width: WIDTH, height: HEIGHT, person: null, depth, ready: false };
  }
  const i = Math.min(index, stills.length - 1);
  return { source: stills[i], width: WIDTH, height: HEIGHT, ...analyzeSample(media, stills[i], WIDTH, HEIGHT, `parado:${i}`, needs) };
}

/** Quadro da mídia agora (prévia ao passar o mouse): o vídeo tocando, a foto ou o quadro parado. */
function liveFrame(media: PreviewMedia, needs: Needs): Frame {
  const video = PREVIEW_SOURCES[media].video ? sampleVideo(media) : null;
  if (!video) return stillFrame(media, SEQUENCE - 1, needs);
  const { videoWidth: w, videoHeight: h } = video;
  const key = `t:${Math.round(video.currentTime * LIVE_RATE)}`;
  return { source: video, width: w, height: h, ...analyzeSample(media, video, w, h, key, needs) };
}

/** Miniaturas que foram feitas sem tudo pronto (refeitas quando a mídia ou o recorte chegam). */
const provisional = new Set<string>();
const packProvisional = new Set<string>();

function refresh(): void {
  if (cache) {
    for (const id of provisional) cache.delete(id);
    // Outro Map: quem guardou o anterior percebe a mudança.
    cache = new Map(cache);
  }
  for (const id of packProvisional) packCache.delete(id);
  provisional.clear();
  packProvisional.clear();
  version++;
  listeners.forEach((l) => l());
}

onSegmenterReady(refresh);

// ---------------------------------------------------------------- Clipe selecionado

/** Clipe selecionado na timeline: as prévias ao passar o mouse mostram o vídeo da pessoa. */
interface PreviewClip {
  key: string;
  url: string;
  image: ImageBitmap | null;
  from: number;
  to: number;
  width: number;
  height: number;
}

let previewClip: PreviewClip | null = null;
let clipVideo: HTMLVideoElement | null = null;

/** Troca o vídeo das prévias pelo trecho do clipe selecionado (null volta às mídias de exemplo). */
export function setPreviewClip(clip: PreviewClip | null): void {
  if (clip?.key === previewClip?.key && clip?.url === previewClip?.url) {
    previewClip = clip;
    return;
  }
  previewClip = clip;
  if (clipVideo) {
    clipVideo.pause();
    clipVideo.removeAttribute('src');
    clipVideo.load();
  }
  if (clip && !clip.image) {
    if (!clipVideo) {
      clipVideo = hiddenVideo();
      // Toca só o trecho do clipe, em loop.
      const video = clipVideo;
      video.addEventListener('timeupdate', () => {
        const clip = previewClip;
        if (clip && (video.currentTime >= clip.to - 0.05 || video.currentTime < clip.from - 0.5)) video.currentTime = clip.from;
      });
    }
    clipVideo.src = clip.url;
    clipVideo.currentTime = clip.from;
  }
}

/** A imagem do clipe selecionado agora (ou null para usar o exemplo). `at` = instante no clipe, para reaproveitar a análise. */
function clipSource(): { source: TexImageSource & CanvasImageSource; width: number; height: number; at: number } | null {
  const clip = previewClip;
  if (!clip) return null;
  if (clip.image) return { source: clip.image, width: clip.width, height: clip.height, at: 0 };
  const video = clipVideo;
  if (!video) return null;
  keepPlaying(video);
  return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? { source: video, width: clip.width, height: clip.height, at: video.currentTime } : null;
}

const clipMasks = new Map<string, HTMLCanvasElement>();

/** O clipe selecionado com a pessoa (recorte da IA) e a profundidade (modelo de profundidade) do próprio vídeo. */
function clipFrame(clip: NonNullable<ReturnType<typeof clipSource>>, needs: Needs): Frame {
  const key = `prévia:${previewClip?.key}:${Math.round(clip.at * LIVE_RATE)}`;
  let person: HTMLCanvasElement | null = null;
  if (needs.person) {
    person = clipMasks.get(key) ?? null;
    if (!person) {
      person = segmentFrame(clip.source, clip.width, clip.height, key, false);
      if (person) remember(clipMasks, key, person, 100);
    }
  }
  const depth = needs.depth ? depthFrame(clip.source, clip.width, clip.height, 'prévia', key) : null;
  return { source: clip.source, width: clip.width, height: clip.height, person, depth, ready: true };
}

// ---------------------------------------------------------------- Miniaturas dos plugins

let cache: Map<string, string> | null = null;

/** Refaz a miniatura de um plugin (efeito editado no editor de efeitos). */
export function forgetPluginPreview(id: string): void {
  cache?.delete(id);
}

const needsOf = (plugin: ShaderPlugin): Needs => {
  const inputs = pluginInputs(plugin);
  return { person: inputs.person, depth: inputs.depth };
};

/**
 * Miniatura de cada efeito/transição/filtro, gerada pelo próprio motor de efeitos
 * (o que se vê no card é exatamente o que o shader faz), na mídia de exemplo do plugin.
 */
export function getPluginPreviews(): Map<string, string> {
  if (cache && plugins.every((p) => cache!.has(p.id))) return cache;
  cache ??= new Map();
  const stage = getStage();
  if (!stage) return cache;
  for (const plugin of plugins) if (!cache.has(plugin.id)) renderPluginPreview(stage, cache, plugin);
  return cache;
}

/** Desenha a miniatura de um plugin e guarda em `into`; devolve se saiu com tudo pronto (mídia e recorte). */
function renderPluginPreview(stage: Stage, into: Map<string, string>, plugin: ShaderPlugin): boolean {
  const inputs = pluginInputs(plugin);
  const needs = needsOf(plugin);
  const media = pluginMedia(plugin, inputs);
  const transition = plugin.kind === 'transition';
  // Quem olha para o passado recebe a sequência inteira (o vídeo andando); os outros, só o último quadro.
  const first = inputs.history || inputs.state || inputs.motion || inputs.background ? 0 : SEQUENCE - 1;
  let ready = true;
  // O último quadro fica em 1,3 s do clipe (efeitos que começam num instante já aparecem).
  for (let i = first; i < SEQUENCE; i++) {
    const k = first === SEQUENCE - 1 ? 1 : i / (SEQUENCE - 1);
    const a = stillFrame(media, i, needs);
    const b = transition ? stillFrame(secondMedia(media), i, needs) : null;
    const value = transition ? (first === 0 ? 0.2 + k * 0.4 : 0.35) : 1;
    drawPlugin(stage, plugin, 1.3 - (SEQUENCE - 1 - i) * STEP, value, a, b);
    ready &&= a.ready && (b?.ready ?? true);
  }
  into.set(plugin.id, stage.canvas.toDataURL('image/jpeg', 0.85));
  if (ready) provisional.delete(plugin.id);
  else provisional.add(plugin.id);
  return ready;
}

/** O que muda a miniatura de um plugin: o código, os controles, a mídia de exemplo e o motor. */
const pluginPrint = (plugin: ShaderPlugin) =>
  fingerprint([PREVIEW_ENGINE, plugin.kind, plugin.category, plugin.previewMedia ?? '', plugin.glsl, JSON.stringify(plugin.params), JSON.stringify(plugin.previewParams)].join('|'));

/**
 * Deixa prontas as miniaturas de todos os plugins e pacotes antes de abrir a biblioteca (tela de carregamento):
 * as guardadas no disco que ainda valem voltam na hora, e as outras são desenhadas em pedaços (a tela não trava)
 * e guardadas. Melhor chamar depois de as mídias de exemplo e o recorte da pessoa estarem prontos: miniatura feita
 * sem eles é provisória e não vai para o disco.
 */
export async function warmPreviews(
  templates: PackTemplate[],
  onProgress: (done: number, total: number, stored: number) => void,
): Promise<void> {
  const stage = getStage();
  if (!stage) return;
  const stored = await readThumbs();
  const plugged = (cache ??= new Map());
  const prints = new Map(plugins.map((p) => [p.id, pluginPrint(p)]));
  // Um pacote depende dos plugins que usa: qualquer plugin mudou, os pacotes são refeitos.
  const allPlugins = fingerprint([...prints.values()].join(''));
  const total = plugins.length + templates.length;
  const fresh: StoredThumb[] = [];
  let done = 0;
  let hits = 0;
  let slice = performance.now();
  const step = async () => {
    onProgress(++done, total, hits);
    // A cada ~40 ms de trabalho, devolve a vez (a barra anda e a janela responde).
    if (performance.now() - slice > 40) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      slice = performance.now();
    }
  };
  for (const plugin of plugins) {
    const id = `p:${plugin.id}`;
    const hash = prints.get(plugin.id)!;
    const hit = stored.get(id);
    if (!plugged.has(plugin.id)) {
      if (hit?.hash === hash) (plugged.set(plugin.id, hit.url), hits++);
      else if (renderPluginPreview(stage, plugged, plugin)) fresh.push({ id, hash, url: plugged.get(plugin.id)! });
    }
    await step();
  }
  for (const template of templates) {
    const id = `k:${template.id}`;
    const hash = fingerprint(`${PREVIEW_ENGINE}|${allPlugins}|${JSON.stringify(template)}`);
    const hit = stored.get(id);
    if (!packCache.has(template.id)) {
      if (hit?.hash === hash) (packCache.set(template.id, hit.url), hits++);
      else {
        const url = getPackPreview(template);
        if (url && !packProvisional.has(template.id)) fresh.push({ id, hash, url });
      }
    }
    await step();
  }
  await writeThumbs(fresh);
  // Outro Map: quem já mostrava as miniaturas percebe que elas chegaram.
  cache = new Map(plugged);
  version++;
  listeners.forEach((l) => l());
}

/**
 * Desenha um quadro animado do plugin num canvas 2D (preview ao passar o mouse), sobre o clipe
 * selecionado ou o vídeo de exemplo: efeitos correm no tempo, transições tocam do início
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
  const needs = needsOf(plugin);
  const media = pluginMedia(plugin, pluginInputs(plugin));
  const clip = clipSource();
  const a = clip ? clipFrame(clip, needs) : liveFrame(media, needs);
  const b = plugin.kind === 'transition' ? liveFrame(secondMedia(clip ? 'pessoa' : media), needs) : null;
  drawPlugin(stage, plugin, 1.3 + seconds, value, a, b);
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

/** A camada de um quadro de exemplo para o motor. */
function layerOf(key: string, frame: Frame, time: number, duration: number, extra: Partial<LayerInput> = {}): LayerInput {
  return {
    key,
    source: frame.source,
    width: frame.width,
    height: frame.height,
    time,
    duration,
    effects: [],
    filter: null,
    camera: { zoom: 1, x: 0.5, y: 0.5, rotation: 0, fill: true },
    person: frame.person,
    depth: frame.depth,
    ...extra,
  };
}

/** `value` é o progresso (transições) ou a intensidade (filtros). `b` = o próximo clipe das transições. */
function drawPlugin(stage: Stage, plugin: ShaderPlugin, time: number, value: number, a: Frame, b: Frame | null): void {
  const params = { ...defaultParams(plugin), ...plugin.previewParams };
  if (plugin.kind === 'effect') {
    const effect = { uid: plugin.id, pluginId: plugin.id, enabled: true, params };
    stage.renderer.render({ a: layerOf('a', a, time, 3, { effects: [effect] }), b: null, transition: null });
  } else if (plugin.kind === 'filter') {
    const filter = { pluginId: plugin.id, intensity: value, params };
    stage.renderer.render({ a: layerOf('a', a, time, 3, { filter }), b: null, transition: null });
  } else {
    stage.renderer.render({
      a: layerOf('a', a, time, 3),
      b: b ? layerOf('b', b, time, 3) : null,
      transition: { pluginId: plugin.id, params, progress: value },
    });
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- Pacotes de edição

const packCache = new Map<string, string>();

/** O que os efeitos e o filtro do pacote usam da pessoa e da profundidade. */
function packNeeds(template: PackTemplate): Needs {
  const needs: Needs = { person: false, depth: false };
  for (const id of [...template.effects.map((e) => e.pluginId), template.filter?.pluginId]) {
    const plugin = id ? getPlugin(id) : undefined;
    if (!plugin) continue;
    const inputs = pluginInputs(plugin);
    needs.person ||= inputs.person;
    needs.depth ||= inputs.depth;
  }
  return needs;
}

/**
 * Desenha o pacote sobre um quadro de exemplo no instante `time` do bloco,
 * pelo mesmo caminho do player (modelo → quadro → renderizador).
 */
function drawPack(stage: Stage, template: PackTemplate, time: number, source: Frame): void {
  const clip = createPackClip(template, 0);
  const project = { ...createProject(), packTracks: [{ id: 'preview', name: '', hidden: false, clips: [clip] }] };
  const local = Math.min(time, clip.duration - 0.001);
  // A LUT de "Meus pacotes" vem junto no pacote (não há projeto com ela aqui).
  const frame = toFrameInput(resolveFrame(project, layoutProject(project), local), () => ({ source: null }), null, template.lut ? [template.lut.data] : undefined);
  frame.a = layerOf('a', source, time, clip.duration);
  stage.renderer.render(frame);
}

/** Miniatura parada de um pacote, no momento em que ele mais aparece. */
export function getPackPreview(template: PackTemplate): string | null {
  const cached = packCache.get(template.id);
  if (cached) return cached;
  const stage = getStage();
  if (!stage) return null;
  // Batidas têm o pico logo no começo; passagens, no meio; os visuais, em qualquer ponto do meio.
  // Pacotes de velocidade: no meio do trecho lento, longe do flash de entrada.
  const at = template.speed
    ? template.duration * 0.6
    : template.timing === 'stretch'
      ? template.duration * (template.anchor === 'cut' ? 0.5 : 0.12)
      : template.duration * 0.5;
  const frame = stillFrame(packMedia(template), SEQUENCE - 1, packNeeds(template));
  drawPack(stage, template, at, frame);
  const url = stage.canvas.toDataURL('image/jpeg', 0.85);
  packCache.set(template.id, url);
  if (frame.ready) packProvisional.delete(template.id);
  else packProvisional.add(template.id);
  return url;
}

/** Quadro animado do pacote (ao passar o mouse): toca o bloco inteiro em loop. */
export function drawPackLive(template: PackTemplate, seconds: number, target: CanvasRenderingContext2D): void {
  const stage = getStage();
  if (!stage) return;
  // Uma pausa no fim do loop dá tempo de ver o efeito de novo.
  const cycle = Math.max(1.6, template.duration + (template.timing === 'stretch' ? 0.8 : 0.4));
  const needs = packNeeds(template);
  const clip = clipSource();
  drawPack(stage, template, seconds % cycle, clip ? clipFrame(clip, needs) : liveFrame(packMedia(template), needs));
  target.drawImage(stage.canvas, 0, 0, target.canvas.width, target.canvas.height);
}

/** Miniaturas dos plugins, atualizadas quando as mídias reais terminam de carregar. */
export function usePluginPreviews(): Map<string, string> {
  const v = useSyncExternalStore(previewStore.subscribe, previewStore.getVersion);
  return useMemo(() => getPluginPreviews(), [v]);
}

/** Muda quando as mídias de exemplo chegam (para refazer as miniaturas). */
export function usePreviewVersion(): number {
  return useSyncExternalStore(previewStore.subscribe, previewStore.getVersion);
}
