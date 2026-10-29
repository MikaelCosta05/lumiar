import type { AdjustInput, CameraBlur, FrameInput, LayerCamera, PlaceBlur, PlacedLayer } from '../engine/renderer';
import { screenToSource, sourceToScreen } from './camera';
import { resolveFrame, toFrameInput, type Project, type TimelineLayout } from './model';
import type { TextClip } from './text';

/**
 * Desfoque de movimento de verdade: como numa câmera com o obturador aberto por um tempo, o que anda
 * rápido (câmera do clipe, pacotes com câmera, sobreposições e textos animados) fica borrado na direção
 * do movimento, proporcional à velocidade. A imagem é a média de várias vistas entre o começo e o fim
 * da "exposição" (centrada no instante do quadro).
 */

/** off = nada; packs = só os pacotes com câmera (padrão); all = tudo o que se move. */
export type MotionBlurMode = 'off' | 'packs' | 'all';

export interface MotionBlurSettings {
  mode: MotionBlurMode;
  /** Fração do intervalo entre dois quadros em que o "obturador" fica aberto (0.5 = 180°, o do cinema) */
  amount: number;
}

/** Projetos sem a opção (inclusive os antigos): só os pacotes de câmera, com intensidade moderada. */
export const DEFAULT_MOTION_BLUR: MotionBlurSettings = { mode: 'packs', amount: 0.5 };
/** Até onde vai a intensidade (1 = o obturador fica aberto o quadro inteiro; acima disso, estilizado). */
export const MAX_BLUR_AMOUNT = 1.5;

export type BlurQuality = 'preview' | 'export';

/** No preview, poucas amostras e mais espaçadas (leve); na exportação, uma a cada pixel e meio de movimento. */
const QUALITY: Record<BlurQuality, { step: number; max: number; text: number }> = {
  preview: { step: 3, max: 12, text: 3 },
  export: { step: 1.5, max: 32, text: 10 },
};

/** Abaixo disso (em pixels) o movimento não aparece: nada de amostras extras. */
const MIN_SHIFT = 0.75;

export function motionBlurOf(project: Pick<Project, 'motionBlur'>): MotionBlurSettings {
  const saved = project.motionBlur;
  if (!saved) return DEFAULT_MOTION_BLUR;
  return { mode: saved.mode ?? DEFAULT_MOTION_BLUR.mode, amount: clampAmount(saved.amount ?? DEFAULT_MOTION_BLUR.amount) };
}

function clampAmount(v: number): number {
  return Number.isFinite(v) ? Math.min(MAX_BLUR_AMOUNT, Math.max(0, v)) : 0;
}

/** Intensidade de um clipe (vídeo principal ou sobreposição): o próprio ajuste da câmera dele ou o do projeto. */
export function clipBlurAmount(settings: MotionBlurSettings, clip: { camera?: { motionBlur?: number } | null }): number {
  const own = clip.camera?.motionBlur;
  if (own !== undefined) return clampAmount(own);
  return settings.mode === 'all' ? settings.amount : 0;
}

/** Pacotes com câmera ficam borrados por padrão (o movimento deles costuma ser rápido: zoom de impacto, chicote…). */
export function packBlurAmount(settings: MotionBlurSettings, pack: { camera: { motionBlur?: number } | null }): number {
  if (!pack.camera) return 0;
  const own = pack.camera.motionBlur;
  if (own !== undefined) return clampAmount(own);
  return settings.mode === 'off' ? 0 : settings.amount;
}

/** Textos animados entram no desfoque só com "Tudo". */
export function textBlurAmount(settings: MotionBlurSettings): number {
  return settings.mode === 'all' ? settings.amount : 0;
}

/** Quantas vistas para cobrir um deslocamento de `shift` pixels (1 = sem desfoque). */
export function blurSamples(shift: number, quality: BlurQuality): number {
  if (!(shift > MIN_SHIFT)) return 1;
  const q = QUALITY[quality];
  return Math.max(2, Math.min(q.max, Math.ceil(shift / q.step) + 1));
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** A câmera aproximada a uma fração k do caminho até `other` (para encurtar a exposição de cada camada). */
function towardsCamera(current: LayerCamera, other: LayerCamera, k: number): LayerCamera {
  return {
    zoom: lerp(current.zoom, other.zoom, k),
    x: lerp(current.x, other.x, k),
    y: lerp(current.y, other.y, k),
    rotation: lerp(current.rotation, other.rotation, k),
    fill: current.fill,
  };
}

type Place = PlaceBlur['from'];

function towardsPlace(current: Place, other: Place, k: number): Place {
  return {
    x: lerp(current.x, other.x, k),
    y: lerp(current.y, other.y, k),
    scale: lerp(current.scale, other.scale, k),
    rotation: lerp(current.rotation, other.rotation, k),
  };
}

const GRID = [0.1, 0.5, 0.9];

/**
 * Quanto (em pixels da tela) a imagem anda entre as duas câmeras: o maior deslocamento entre
 * nove pontos da tela. Usa as mesmas contas do shader (inclusive o limite que não deixa a vista sair da imagem).
 */
export function cameraShift(
  from: LayerCamera,
  to: LayerCamera,
  media: { width: number; height: number },
  screen: { width: number; height: number },
): number {
  let max = 0;
  for (const y of GRID) {
    for (const x of GRID) {
      const source = screenToSource({ x, y }, to, screen, media);
      const back = sourceToScreen(source, from, screen, media);
      max = Math.max(max, Math.hypot((back.x - x) * screen.width, (back.y - y) * screen.height));
    }
  }
  return max;
}

/** Quanto (em pixels) os cantos de uma camada sobreposta andam entre as duas posições. */
export function placeShift(from: Place, to: Place, size: { width: number; height: number }, screen: { width: number; height: number }): number {
  const corners = (p: Place) => {
    const a = (p.rotation * Math.PI) / 180;
    const hw = (size.width * p.scale * screen.width) / 2;
    const hh = (size.height * p.scale * screen.height) / 2;
    const cx = p.x * screen.width;
    const cy = p.y * screen.height;
    return [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([dx, dy]) => [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]);
  };
  const a = corners(from);
  const b = corners(to);
  return Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
}

/** Tamanho da mídia encaixada na tela (fração da largura e da altura), igual ao renderizador. */
function fitSize(media: { width: number; height: number }, screen: { width: number; height: number }) {
  const output = screen.width / screen.height;
  const ratio = media.width / media.height || output;
  return ratio > output ? { width: 1, height: output / ratio } : { width: ratio / output, height: 1 };
}

/** O quadro sem as mídias (só câmeras e posições), para comparar com o começo e o fim da exposição. */
function poseAt(project: Project, timeline: TimelineLayout, t: number): FrameInput {
  return toFrameInput(resolveFrame(project, timeline, Math.max(0, t)), () => ({ source: null }));
}

function cameraBlur(
  cam: LayerCamera | null | undefined,
  media: { width: number; height: number },
  before: LayerCamera | null | undefined,
  after: LayerCamera | null | undefined,
  k: number,
  quality: BlurQuality,
  screen: { width: number; height: number },
): CameraBlur | null {
  if (!cam || k <= 0) return null;
  const from = before ? towardsCamera(cam, before, k) : cam;
  const to = after ? towardsCamera(cam, after, k) : cam;
  const samples = blurSamples(cameraShift(from, to, media, screen), quality);
  return samples > 1 ? { from, to, samples } : null;
}

/**
 * Acrescenta o desfoque de movimento ao quadro já montado (`frame`, do instante t). `fps` é o da saída:
 * a exposição dura `intensidade / fps` segundos. `screen` é o tamanho em pixels do quadro desenhado.
 */
export function addMotionBlur(
  frame: FrameInput,
  project: Project,
  timeline: TimelineLayout,
  t: number,
  fps: number,
  quality: BlurQuality,
  screen: { width: number; height: number },
): void {
  const settings = motionBlurOf(project);
  const mainClips = new Map([...project.clips, ...project.videoTracks.flatMap((tr) => tr.clips)].map((c) => [c.id, c]));
  const packClips = new Map(project.packTracks.flatMap((tr) => tr.clips).map((c) => [`pacote:${c.id}`, c]));
  // Cada camada tem a sua intensidade: as poses das pontas usam a maior e cada uma encurta o caminho.
  const amounts = new Map<string, number>();
  for (const layer of [frame.a, frame.b, ...(frame.layers ?? [])]) {
    const clip = layer && mainClips.get(layer.key);
    if (clip) amounts.set(layer!.key, clipBlurAmount(settings, clip));
  }
  for (const adjust of frame.adjust ?? []) {
    const pack = adjust.key ? packClips.get(adjust.key) : undefined;
    if (pack) amounts.set(adjust.key!, packBlurAmount(settings, pack));
  }
  const top = Math.max(0, ...amounts.values());
  if (top <= 0.001 || !(fps > 0)) return;

  const half = top / fps / 2;
  const before = poseAt(project, timeline, t - half);
  const after = poseAt(project, timeline, t + half);
  const find = (pose: FrameInput, key: string) => [pose.a, pose.b, ...(pose.layers ?? [])].find((l) => l?.key === key) ?? undefined;

  for (const layer of [frame.a, frame.b]) {
    if (!layer) continue;
    const k = (amounts.get(layer.key) ?? 0) / top;
    layer.motionBlur = cameraBlur(layer.camera, layer, find(before, layer.key)?.camera, find(after, layer.key)?.camera, k, quality, screen);
  }

  for (const layer of frame.layers ?? []) {
    const k = (amounts.get(layer.key) ?? 0) / top;
    if (k <= 0) continue;
    const size = fitSize(layer, screen);
    const onScreen = { width: size.width * layer.place.scale * screen.width, height: size.height * layer.place.scale * screen.height };
    const b = find(before, layer.key) as PlacedLayer | undefined;
    const a = find(after, layer.key) as PlacedLayer | undefined;
    // A camada é desenhada esticada no próprio retângulo: a câmera dela anda nesse tamanho.
    layer.motionBlur = cameraBlur(layer.camera, onScreen, b?.camera, a?.camera, k, quality, onScreen);
    const from = b?.place ? towardsPlace(layer.place, b.place, k) : layer.place;
    const to = a?.place ? towardsPlace(layer.place, a.place, k) : layer.place;
    const samples = blurSamples(placeShift(from, to, size, screen), quality);
    layer.placeBlur = samples > 1 ? { from: pick(from), to: pick(to), samples } : null;
  }

  for (const adjust of frame.adjust ?? []) {
    if (!adjust.key || !adjust.camera) continue;
    const k = (amounts.get(adjust.key) ?? 0) / top;
    const match = (pose: FrameInput): AdjustInput | undefined => pose.adjust?.find((x) => x.key === adjust.key);
    // A imagem montada ocupa a tela toda: a "mídia" do pacote tem o tamanho da tela.
    adjust.motionBlur = cameraBlur(adjust.camera, screen, match(before)?.camera, match(after)?.camera, k, quality, screen);
  }
}

const pick = (p: Place): Place => ({ x: p.x, y: p.y, scale: p.scale, rotation: p.rotation });

// ---------------------------------------------------------------- Textos

const MOVING_ANIMS = new Set(['slide-up', 'slide-down', 'slide-left', 'zoom', 'pop', 'spin', 'drop', 'stretch']);
const MOVING_LOOPS = new Set(['wave', 'pulse', 'float', 'swing', 'bounce', 'spin', 'nudge', 'heartbeat']);

/** O texto está se mexendo no instante `local` (desde o início dele)? Só esses recebem o desfoque. */
export function textMoving(clip: Pick<TextClip, 'duration' | 'animIn' | 'animOut' | 'animDuration' | 'loop' | 'follow'>, local: number): boolean {
  if (local < 0 || local >= clip.duration) return false;
  const d = Math.min(clip.animDuration, clip.duration / 2);
  if (d > 0 && local < d && MOVING_ANIMS.has(clip.animIn)) return true;
  if (d > 0 && clip.duration - local < d && MOVING_ANIMS.has(clip.animOut)) return true;
  if (MOVING_LOOPS.has(clip.loop)) return true;
  const points = clip.follow?.points;
  return !!points && points.length > 1;
}

/** Quantas vistas para os textos que se movem (o texto é desenhado no processador: custa mais). */
export function textSamples(quality: BlurQuality): number {
  return QUALITY[quality].text;
}

/** Instantes de cada vista, espalhados por igual na exposição centrada em t. */
export function exposureTimes(t: number, duration: number, samples: number): number[] {
  if (samples <= 1 || duration <= 0) return [t];
  return Array.from({ length: samples }, (_, i) => t + duration * (i / (samples - 1) - 0.5));
}
