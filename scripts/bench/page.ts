// Bancada de qualidade dos plugins: desenha filtros, efeitos e transições em alta resolução sobre as mídias de
// exemplo (public/previews), pelo mesmo motor do editor, e devolve os quadros em JPEG (ou PNG). Quem chama é
// scripts/bench/run.cjs (Electron), que salva os arquivos e monta as folhas de contato, ou scripts/bench/visual.cjs,
// que compara com as imagens de referência.
import { ALL_FORMATS, CanvasSink, Input, UrlSource, type WrappedCanvas } from 'mediabunny';
import { assetUrl } from '../../src/assetUrl';
import { defaultParams, getPlugin, plugins } from '../../src/engine/registry';
import { Renderer, type LayerInput } from '../../src/engine/renderer';
import { pluginInputs } from '../../src/engine/shaders';
import type { ParamValues, PreviewMedia, ShaderPlugin } from '../../src/engine/types';
import { depthFrameNow } from '../../src/media/depthVideo';
import { loadSegmenter, segmentFrame } from '../../src/media/segment';
import { createProject, layoutProject, resolveFrame, toFrameInput } from '../../src/project/model';
import { PACKS } from '../../src/project/packLibrary';
import { createPackClip, type PackTemplate } from '../../src/project/packs';
import { ADJUSTMENT_TEMPLATE } from '../../src/project/adjustmentBlock';
import { createGrade } from '../../src/project/grade';
import { PREVIEW_SOURCES, packMedia, pluginMedia, secondMedia } from '../../src/ui/previewMedia';

export interface BenchOptions {
  /** Ids dos plugins ("effects/brilho"…) ou prefixos ("effects/", "" = todos) */
  ids: string[];
  width: number;
  height: number;
  /** Instantes (s) dos efeitos e progresso (0 a 1) das transições */
  times: number[];
  progress: number[];
  /** Calcular a máscara da pessoa e a profundidade (mais lento) */
  ai: boolean;
  quality: number;
  /** PNG não soma o ruído do JPEG: é o que o teste visual compara (padrão: jpeg) */
  format?: 'jpeg' | 'png';
  /** Montar a faixa com os quadros lado a lado (padrão: sim) */
  strip?: boolean;
  /** Valores trocados por plugin ({ "effects/desfoque": { radius: 9 } }): para conferir que o teste visual acusa */
  params?: Record<string, ParamValues>;
  /**
   * Quadros do vídeo decodificados um a um (mediabunny) em vez de buscar no <video>: a busca às vezes entrega o
   * quadro vizinho, e o teste visual precisa da mesma imagem em toda rodada (padrão: não)
   */
  exactFrames?: boolean;
  /** Quantos quadros (com pessoa e profundidade) guardar na memória; os mais antigos saem (padrão: todos) */
  maxFrames?: number;
}

export interface BenchShot {
  id: string;
  label: string;
  /** data URL (JPEG ou PNG) */
  image: string;
}

export interface BenchResult {
  shots: BenchShot[];
  errors: { id: string; message: string }[];
  millis: Record<string, number>;
}

interface Frame {
  source: HTMLCanvasElement;
  person: HTMLCanvasElement | null;
  depth: HTMLCanvasElement | null;
}

const videos = new Map<PreviewMedia, HTMLVideoElement>();
const stills = new Map<PreviewMedia, HTMLCanvasElement>();
const frameCache = new Map<string, Frame>();

function cover(image: CanvasImageSource, iw: number, ih: number, width: number, height: number, focusY = 0.5): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const scale = Math.max(width / iw, height / ih);
  const w = iw * scale;
  const h = ih * scale;
  const y = Math.min(0, Math.max(height - h, height / 2 - focusY * h));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, (width - w) / 2, y, w, h);
  return canvas;
}

async function videoOf(media: PreviewMedia): Promise<HTMLVideoElement> {
  let video = videos.get(media);
  if (!video) {
    video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = assetUrl(PREVIEW_SOURCES[media].file);
    await new Promise<void>((resolve, reject) => {
      video!.addEventListener('loadeddata', () => resolve(), { once: true });
      video!.addEventListener('error', () => reject(new Error(`vídeo ${media} indisponível`)), { once: true });
    });
    videos.set(media, video);
  }
  return video;
}

/** Leitor dos quadros de um vídeo, andando para a frente (voltar ou pular longe recomeça perto do instante). */
interface Cursor {
  sink: CanvasSink;
  first: number;
  duration: number;
  frames: AsyncGenerator<WrappedCanvas, void, unknown> | null;
  current: WrappedCanvas | null;
  next: WrappedCanvas | null;
}

const cursors = new Map<PreviewMedia, Promise<Cursor>>();

async function cursorOf(media: PreviewMedia): Promise<Cursor> {
  let cursor = cursors.get(media);
  if (!cursor) {
    cursor = (async () => {
      const input = new Input({ source: new UrlSource(assetUrl(PREVIEW_SOURCES[media].file)), formats: ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error(`vídeo ${media} sem imagem`);
      return { sink: new CanvasSink(track), first: await track.getFirstTimestamp(), duration: await input.computeDuration(), frames: null, current: null, next: null };
    })();
    cursors.set(media, cursor);
  }
  return cursor;
}

/** O último quadro que começa até `time` (s desde o começo do vídeo), como o <video> mostraria. */
async function exactFrame(media: PreviewMedia, time: number): Promise<CanvasImageSource & { width: number; height: number }> {
  const c = await cursorOf(media);
  const at = c.first + Math.max(0, Math.min(c.duration - 0.05, time));
  if (!c.frames || !c.current || at < c.current.timestamp || at > c.current.timestamp + 2) {
    await c.frames?.return();
    c.frames = c.sink.canvases(Math.max(c.first, at - 0.5));
    c.current = (await c.frames.next()).value ?? null;
    c.next = (await c.frames.next()).value ?? null;
  }
  while (c.next && c.next.timestamp <= at) {
    c.current = c.next;
    c.next = (await c.frames.next()).value ?? null;
  }
  if (!c.current) throw new Error(`vídeo ${media}: sem quadro em ${time.toFixed(3)} s`);
  return c.current.canvas;
}

async function seek(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 1e-3 && video.readyState >= 2) return;
  await new Promise<void>((resolve) => {
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = time;
  });
}

/** Quadro da mídia no instante `at` (s, contado a partir do quadro parado das miniaturas), com pessoa e profundidade. */
interface Needs {
  person: boolean;
  depth: boolean;
}

async function frameOf(media: PreviewMedia, at: number, opts: BenchOptions, needs: Needs): Promise<Frame> {
  const person_ = opts.ai && needs.person;
  const depth_ = opts.ai && needs.depth;
  const key = `${media}|${at.toFixed(3)}|${opts.width}x${opts.height}|${person_}|${depth_}|${!!opts.exactFrames}`;
  const cached = frameCache.get(key);
  if (cached) {
    // De volta para o fim da fila: quem sai quando enche é o que não foi usado há mais tempo.
    frameCache.delete(key);
    frameCache.set(key, cached);
    return cached;
  }
  const info = PREVIEW_SOURCES[media];
  let source: HTMLCanvasElement;
  if (info.video && opts.exactFrames) {
    const image = await exactFrame(media, (info.still ?? 1) + at);
    source = cover(image, image.width, image.height, opts.width, opts.height);
  } else if (info.video) {
    const video = await videoOf(media);
    await seek(video, Math.max(0, Math.min(video.duration - 0.05, (info.still ?? 1) + at)));
    source = cover(video, video.videoWidth, video.videoHeight, opts.width, opts.height);
  } else {
    let still = stills.get(media);
    if (!still) {
      const bitmap = await createImageBitmap(await (await fetch(assetUrl(info.file))).blob());
      still = cover(bitmap, bitmap.width, bitmap.height, opts.width, opts.height, info.focusY);
      bitmap.close();
      stills.set(media, still);
    }
    source = still;
  }
  let person: HTMLCanvasElement | null = null;
  let depth: HTMLCanvasElement | null = null;
  if (person_ && info.person) {
    await loadSegmenter();
    person = segmentFrame(source, source.width, source.height, `bench|${key}`, false);
  }
  if (depth_) depth = await depthFrameNow(source, source.width, source.height, `bench|${media}`, `bench|${key}`);
  const frame = { source, person, depth };
  frameCache.set(key, frame);
  if (opts.maxFrames && frameCache.size > opts.maxFrames) frameCache.delete(frameCache.keys().next().value!);
  return frame;
}

function layer(key: string, frame: Frame, time: number, extra: Partial<LayerInput> = {}): LayerInput {
  return {
    key,
    source: frame.source,
    width: frame.source.width,
    height: frame.source.height,
    time,
    duration: 4,
    effects: [],
    filter: null,
    camera: { zoom: 1, x: 0.5, y: 0.5, rotation: 0, fill: true },
    person: frame.person,
    depth: frame.depth,
    ...extra,
  };
}

function selected(ids: string[]): ShaderPlugin[] {
  return plugins.filter((p) => ids.some((id) => (id.endsWith('/') || id === '' ? p.id.startsWith(id) : p.id === id)));
}

/**
 * Pacotes só da bancada (ids "bancada/…"): o bloco de ajuste com cor manual, que não existe pronto no catálogo.
 * cor-manual = rodas e curva fortes; cor-lut = LUT que troca vermelho e azul; bloco-vazio = nada (igual ao original).
 */
const SWAP_LUT = { id: 'bancada-troca', name: 'Troca', size: 2, data: btoa(String.fromCharCode(0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 255, 255, 255, 0, 255, 255, 255)) };
const BENCH_PACKS: PackTemplate[] = [
  { ...ADJUSTMENT_TEMPLATE, id: 'bancada/bloco-vazio' },
  {
    ...ADJUSTMENT_TEMPLATE,
    id: 'bancada/cor-manual',
    grade: { ...createGrade(), saturation: 0.2, shadows: { x: -0.5, y: 0.4, level: -0.2 }, highlights: { x: 0.6, y: -0.3, level: 0.2 }, curves: { ...createGrade().curves, master: [[0, 0.08], [0.5, 0.62], [1, 1]] } },
  },
  { ...ADJUSTMENT_TEMPLATE, id: 'bancada/cor-lut', lut: { amount: 1, data: SWAP_LUT } },
];

function selectedPacks(ids: string[]) {
  return [...PACKS, ...BENCH_PACKS].filter((p) => ids.some((id) => (id.endsWith('/') ? p.id.startsWith(id) : p.id === id)));
}

/** Ids que run() desenharia para estes ids/prefixos, na mesma ordem (o teste visual divide em partes). */
export function list(ids: string[]): string[] {
  return [...selected(ids).map((p) => p.id), ...selectedPacks(ids).map((p) => p.id)];
}

export async function run(opts: BenchOptions): Promise<BenchResult> {
  const canvas = document.createElement('canvas');
  const renderer = new Renderer(canvas, opts.width, opts.height);
  const errors: BenchResult['errors'] = [];
  const shots: BenchShot[] = [];
  const millis: Record<string, number> = {};
  let current = '';
  renderer.onShaderError = (plugin, message) => errors.push({ id: plugin.id ?? current, message });
  // Cada quadro vai inteiro e também para a faixa do plugin (os quadros lado a lado, a 640 px de largura).
  let strip: HTMLCanvasElement[] = [];
  const snap = async (id: string, label: string) => {
    const data = opts.format === 'png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', opts.quality);
    shots.push({ id, label, image: data });
    if (opts.strip === false) return;
    // A faixa sai da imagem salva (o drawImage do canvas WebGL pode pegar o quadro anterior, ainda não apresentado).
    const image = new Image();
    image.src = data;
    await image.decode();
    const copy = document.createElement('canvas');
    copy.width = 640;
    copy.height = Math.round((640 * opts.height) / opts.width);
    const ctx = copy.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, copy.width, copy.height);
    ctx.font = '600 15px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, ctx.measureText(label).width + 12, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, 6, 16);
    strip.push(copy);
  };
  const flushStrip = (id: string) => {
    if (!strip.length) return;
    const out = document.createElement('canvas');
    out.width = strip.length * strip[0].width;
    out.height = strip[0].height;
    strip.forEach((c, i) => out.getContext('2d')!.drawImage(c, i * c.width, 0));
    shots.push({ id, label: 'faixa', image: out.toDataURL('image/jpeg', 0.85) });
    strip = [];
  };

  for (const plugin of selected(opts.ids)) {
    current = plugin.id;
    const params = { ...defaultParams(plugin), ...plugin.previewParams, ...opts.params?.[plugin.id] };
    const inputs = pluginInputs(plugin);
    const media = pluginMedia(plugin, inputs);
    // Efeitos com memória precisam dos quadros anteriores: 1 s antes, a 30 quadros por segundo.
    const memory = inputs.state || inputs.history || inputs.motion || inputs.background;
    const started = performance.now();
    try {
      if (plugin.kind === 'transition') {
        const a = await frameOf(media, 0, opts, inputs);
        const second = secondMedia(media);
        for (const progress of opts.progress) {
          const b = await frameOf(second, memory ? progress * 2 : 0, opts, inputs);
          renderer.render({ a: layer('a', a, 1), b: layer('b', b, 1), transition: { pluginId: plugin.id, params, progress } });
          await snap(plugin.id, `p=${progress}`);
        }
      } else {
        for (const time of opts.times) {
          const start = memory ? Math.max(0, time - 1) : time;
          for (let t = start; t <= time + 1e-6; t += 1 / 30) {
            const frame = await frameOf(media, t - time, opts, inputs);
            const extra =
              plugin.kind === 'effect'
                ? { effects: [{ uid: plugin.id, pluginId: plugin.id, enabled: true, params }] }
                : { filter: { pluginId: plugin.id, intensity: 1, params } };
            renderer.render({ a: layer('a', frame, t, extra), b: null, transition: null });
          }
          await snap(plugin.id, `t=${time}`);
        }
      }
    } catch (error) {
      errors.push({ id: plugin.id, message: error instanceof Error ? error.message : String(error) });
    }
    flushStrip(plugin.id);
    millis[plugin.id] = Math.round(performance.now() - started);
    if (!getPlugin(plugin.id)) errors.push({ id: plugin.id, message: 'sumiu do registro' });
  }

  // Pacotes: pelo mesmo caminho do player (modelo → quadro → motor), em 4 pontos do bloco, quadro a quadro
  // desde o começo (os efeitos com memória e o desfoque de movimento da câmera precisam dos anteriores).
  for (const template of selectedPacks(opts.ids)) {
    current = template.id;
    const started = performance.now();
    try {
      const clip = createPackClip(template, 0);
      const project = { ...createProject(), packTracks: [{ id: 'bancada', name: '', hidden: false, clips: [clip] }] };
      const layout = layoutProject(project);
      const media = packMedia(template);
      // Pessoa e profundidade só se algum efeito do pacote usa (a profundidade é lenta).
      const used = [...template.effects.map((e) => e.pluginId), template.filter?.pluginId].map((id) => (id ? getPlugin(id) : undefined));
      const needs = {
        person: used.some((p) => p && pluginInputs(p).person) || !!template.face,
        depth: used.some((p) => p && pluginInputs(p).depth),
      };
      const marks = [0.15, 0.4, 0.65, 0.9].map((f) => f * clip.duration);
      let next = 0;
      for (let t = 0; next < marks.length; t += 1 / 30) {
        const frame = await frameOf(media, Math.min(t, 6), opts, needs);
        const input = toFrameInput(resolveFrame(project, layout, Math.min(t, clip.duration - 0.001)), () => ({ source: null }), null, template.lut ? [template.lut.data] : undefined);
        input.a = layer('a', frame, t, { ...input.a, source: frame.source, width: frame.source.width, height: frame.source.height, person: frame.person, depth: frame.depth });
        renderer.render(input);
        if (t >= marks[next] - 1e-6) await snap(template.id, `t=${marks[next++].toFixed(2)}`);
      }
    } catch (error) {
      errors.push({ id: template.id, message: error instanceof Error ? error.message : String(error) });
    }
    flushStrip(template.id);
    millis[template.id] = Math.round(performance.now() - started);
  }
  renderer.dispose();
  return { shots, errors, millis };
}

/** Tempo (ms) de um quadro de cada plugin na resolução pedida (média de `repeat` quadros, depois de aquecer). */
export async function timing(opts: BenchOptions & { repeat: number }): Promise<Record<string, number>> {
  const canvas = document.createElement('canvas');
  const renderer = new Renderer(canvas, opts.width, opts.height);
  const gl = canvas.getContext('webgl2')!;
  const result: Record<string, number> = {};
  for (const plugin of selected(opts.ids)) {
    const params = { ...defaultParams(plugin), ...plugin.previewParams };
    const inputs = pluginInputs(plugin);
    const media = pluginMedia(plugin, inputs);
    const a = await frameOf(media, 0, opts, inputs);
    const b = await frameOf(secondMedia(media), 0, opts, inputs);
    const draw = (t: number) => {
      if (plugin.kind === 'transition') renderer.render({ a: layer('a', a, t), b: layer('b', b, t), transition: { pluginId: plugin.id, params, progress: 0.5 } });
      else
        renderer.render({
          a: layer('a', a, t, plugin.kind === 'effect' ? { effects: [{ uid: plugin.id, pluginId: plugin.id, enabled: true, params }] } : { filter: { pluginId: plugin.id, intensity: 1, params } }),
          b: null,
          transition: null,
        });
    };
    draw(0);
    const px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const started = performance.now();
    for (let i = 0; i < opts.repeat; i++) draw(1 + i / 30);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    result[plugin.id] = (performance.now() - started) / opts.repeat;
  }
  renderer.dispose();
  return result;
}
