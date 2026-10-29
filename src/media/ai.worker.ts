/// <reference lib="webworker" />
// Modelos de IA baixados na primeira vez que são usados (e guardados no computador depois):
// tradução, busca por imagem (CLIP), profundidade de fotos e separação de voz e música.
// Ficam fora do instalador para ele não crescer centenas de MB.
import {
  AutoModelForSeq2SeqLM,
  AutoProcessor,
  AutoTokenizer,
  Tensor,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  env,
  pipeline,
  RawImage,
  type DepthEstimationPipeline,
  type ImageToImagePipeline,
  type PreTrainedModel,
  type Processor,
  type PreTrainedTokenizer,
  type TranslationPipeline,
} from '@huggingface/transformers';
// O mesmo onnxruntime que o transformers.js usa (motor em public/ort, nada duplicado no build).
import * as ort from 'onnxruntime-web/webgpu';
import { loadSam, segmentWithSam, type SamDevice, type SamRequest } from './objectSam';

export type AiRequest =
  | ({ id: number; task: 'sam'; baseUrl: string } & SamRequest)
  | { id: number; task: 'translate'; texts: string[]; from: 'romance' | 'en'; to: string; baseUrl: string }
  | { id: number; task: 'clip-image'; images: ImageData[]; baseUrl: string }
  | { id: number; task: 'clip-text'; texts: string[]; baseUrl: string }
  | { id: number; task: 'depth'; image: ImageData; baseUrl: string }
  | { id: number; task: 'separate'; left: Float32Array; right: Float32Array; baseUrl: string }
  | { id: number; task: 'upscale'; image: ImageData; baseUrl: string };

/** Valores dos {nomes} das mensagens. Aqui não há dicionário: o texto vai em português e ai.ts traduz. */
export type AiVars = Record<string, string | number>;

export type AiMessage =
  | { id: number; type: 'progress'; stage: string; fraction: number | null; vars?: AiVars }
  | { id: number; type: 'done'; result: unknown }
  | { id: number; type: 'error'; message: string; vars?: AiVars };

/** Erro com {nomes}, para ser traduzido do lado da página. */
class AiError extends Error {
  constructor(
    message: string,
    readonly vars: AiVars,
  ) {
    super(message);
  }
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
let current = 0;
const post = (message: AiMessage, transfer: Transferable[] = []) => scope.postMessage(message, transfer);
const progress = (stage: string, fraction: number | null, vars?: AiVars) => post({ id: current, type: 'progress', stage, fraction, vars });

function setup(baseUrl: string) {
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const wasm = env.backends.onnx.wasm;
  if (wasm) wasm.wasmPaths = new URL('ort/', baseUrl).href;
  ort.env.wasm.wasmPaths = new URL('ort/', baseUrl).href;
}

/** Progresso do download (somando os arquivos do modelo). */
function downloadProgress(label: string) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file || !p.total) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    let a = 0;
    let b = 0;
    files.forEach((f) => ((a += f.loaded), (b += f.total)));
    progress('Baixando {label} (só na primeira vez)', b ? a / b : null, { label });
  };
}

const cache = new Map<string, Promise<unknown>>();
function once<T>(key: string, make: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, make().catch((e) => (cache.delete(key), Promise.reject(e))));
  return cache.get(key) as Promise<T>;
}

// ---------------------------------------------------------------- Tradução (Opus-MT)

/** Línguas latinas → inglês. */
const toEnglish = () =>
  once('translate-romance', () =>
    pipeline('translation', 'Xenova/opus-mt-ROMANCE-en', { dtype: 'q8', progress_callback: downloadProgress('o tradutor') }) as Promise<TranslationPipeline>,
  );

/** Inglês → línguas latinas: o idioma de saída é uma marca (>>es<<, >>pt_br<<…) no começo da entrada. */
const fromEnglish = () =>
  once('translate-en', async () => ({
    tokenizer: (await AutoTokenizer.from_pretrained('Xenova/opus-mt-en-ROMANCE')) as PreTrainedTokenizer,
    model: (await AutoModelForSeq2SeqLM.from_pretrained('Xenova/opus-mt-en-ROMANCE', { dtype: 'q8', progress_callback: downloadProgress('o tradutor') })) as PreTrainedModel,
  }));

async function translate(texts: string[], from: 'romance' | 'en', to: string): Promise<string[]> {
  const out: string[] = [];
  if (from === 'romance') {
    const t = await toEnglish();
    for (let i = 0; i < texts.length; i++) {
      progress('Traduzindo', i / texts.length);
      const result = (await t(texts[i], { max_new_tokens: 256 })) as { translation_text: string }[];
      out.push(result[0]?.translation_text ?? texts[i]);
    }
    return out;
  }
  const { tokenizer, model } = await fromEnglish();
  // A marca precisa entrar como um token só (o tokenizador sozinho a quebra em pedaços).
  const code = to === 'pt' ? 'pt_br' : to;
  const lang = (tokenizer as unknown as { convert_tokens_to_ids(t: string[]): number[] }).convert_tokens_to_ids([`>>${code}<<`])[0];
  for (let i = 0; i < texts.length; i++) {
    progress('Traduzindo', i / texts.length);
    const ids = Array.from((tokenizer(texts[i]).input_ids as Tensor).data as BigInt64Array);
    const input_ids = new Tensor('int64', BigInt64Array.from([BigInt(lang), ...ids]), [1, ids.length + 1]);
    const attention_mask = new Tensor('int64', new BigInt64Array(ids.length + 1).fill(1n), [1, ids.length + 1]);
    const generated = (await model.generate({ input_ids, attention_mask, max_new_tokens: 256 } as never)) as Tensor;
    out.push(tokenizer.decode(Array.from((generated as Tensor).data as BigInt64Array).map(Number), { skip_special_tokens: true }));
  }
  return out;
}

// ---------------------------------------------------------------- CLIP (imagem ↔ texto)

const CLIP = 'Xenova/clip-vit-base-patch32';
const clipVision = () =>
  once('clip-vision', async () => ({
    processor: (await AutoProcessor.from_pretrained(CLIP)) as Processor,
    model: (await CLIPVisionModelWithProjection.from_pretrained(CLIP, { dtype: 'q8', progress_callback: downloadProgress('o modelo de imagens') })) as PreTrainedModel,
  }));
const clipText = () =>
  once('clip-text', async () => ({
    tokenizer: (await AutoTokenizer.from_pretrained(CLIP)) as PreTrainedTokenizer,
    model: (await CLIPTextModelWithProjection.from_pretrained(CLIP, { dtype: 'q8', progress_callback: downloadProgress('o modelo de texto') })) as PreTrainedModel,
  }));

function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

async function clipImages(images: ImageData[]): Promise<Float32Array[]> {
  const { processor, model } = await clipVision();
  const out: Float32Array[] = [];
  for (let i = 0; i < images.length; i++) {
    progress('Olhando os vídeos', i / images.length);
    const img = new RawImage(images[i].data, images[i].width, images[i].height, 4);
    const inputs = await processor(img);
    const { image_embeds } = (await model(inputs)) as { image_embeds: { data: Float32Array } };
    out.push(normalize(Float32Array.from(image_embeds.data)));
  }
  return out;
}

async function clipTexts(texts: string[]): Promise<Float32Array[]> {
  const { tokenizer, model } = await clipText();
  const inputs = tokenizer(texts, { padding: true, truncation: true });
  const { text_embeds } = (await model(inputs)) as { text_embeds: { data: Float32Array; dims: number[] } };
  const dim = text_embeds.dims[1];
  return texts.map((_, i) => normalize(Float32Array.from(text_embeds.data.slice(i * dim, (i + 1) * dim))));
}

// ---------------------------------------------------------------- Profundidade (foto 3D)

const depthModel = () =>
  once('depth', () => pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'q8', progress_callback: downloadProgress('o modelo de profundidade') }) as Promise<DepthEstimationPipeline>);

async function depth(image: ImageData): Promise<{ data: Uint8Array; width: number; height: number }> {
  const estimator = await depthModel();
  progress('Calculando a profundidade', null);
  const result = (await estimator(new RawImage(image.data, image.width, image.height, 4))) as unknown as { depth: RawImage };
  const d = result.depth;
  return { data: Uint8Array.from(d.data as Uint8Array), width: d.width, height: d.height };
}

// ---------------------------------------------------------------- Aumentar a resolução (fotos)

const upscaler = () =>
  once('upscale', () => pipeline('image-to-image', 'Xenova/swin2SR-classical-sr-x2-64', { dtype: 'q8', progress_callback: downloadProgress('o modelo de resolução') }) as Promise<ImageToImagePipeline>);

/** Dobra a resolução de uma foto, recriando os detalhes (em pedaços, para caber na memória). */
async function upscale(image: ImageData): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const model = await upscaler();
  const TILE = 192;
  const width = image.width * 2;
  const height = image.height * 2;
  const out = new Uint8ClampedArray(width * height * 4);
  const tiles: [number, number][] = [];
  for (let y = 0; y < image.height; y += TILE) for (let x = 0; x < image.width; x += TILE) tiles.push([x, y]);
  for (const [k, [x0, y0]] of tiles.entries()) {
    progress('Aumentando a resolução', k / tiles.length);
    // Cada pedaço leva uma margem, para as emendas não aparecerem.
    const pad = 8;
    const ax = Math.max(0, x0 - pad);
    const ay = Math.max(0, y0 - pad);
    const bx = Math.min(image.width, x0 + TILE + pad);
    const by = Math.min(image.height, y0 + TILE + pad);
    const tw = bx - ax;
    const th = by - ay;
    const tile = new Uint8ClampedArray(tw * th * 4);
    for (let y = 0; y < th; y++) tile.set(image.data.subarray(((ay + y) * image.width + ax) * 4, ((ay + y) * image.width + ax + tw) * 4), y * tw * 4);
    const result = (await model(new RawImage(tile, tw, th, 4))) as unknown as RawImage;
    const rgb = result.channels === 4 ? result : result.rgba();
    const rw = rgb.width;
    for (let y = (y0 - ay) * 2; y < Math.min(rgb.height, (y0 - ay + TILE) * 2); y++) {
      const oy = ay * 2 + y;
      if (oy >= height) break;
      for (let x = (x0 - ax) * 2; x < Math.min(rw, (x0 - ax + TILE) * 2); x++) {
        const ox = ax * 2 + x;
        if (ox >= width) break;
        const si = (y * rw + x) * 4;
        const oi = (oy * width + ox) * 4;
        out[oi] = rgb.data[si];
        out[oi + 1] = rgb.data[si + 1];
        out[oi + 2] = rgb.data[si + 2];
        out[oi + 3] = 255;
      }
    }
  }
  return { data: out, width, height };
}

// ---------------------------------------------------------------- Separar voz e música (Open-Unmix)

const N_FFT = 4096;
const HOP = 1024;
const BINS = N_FFT / 2 + 1;
const UMX_URL = 'https://huggingface.co/nsosu/demucs-onnx/resolve/main/umxl_vocals.onnx';

const umx = () =>
  once('umx', async () => {
    // Guardado no cache do navegador depois da primeira vez.
    const store = await caches.open('lumiar-modelos');
    let response = await store.match(UMX_URL);
    if (!response) {
      const remote = await fetch(UMX_URL);
      if (!remote.ok || !remote.body) throw new AiError('Não foi possível baixar o separador ({status}).', { status: remote.status });
      const total = Number(remote.headers.get('content-length')) || 113e6;
      const reader = remote.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        progress('Baixando o separador de voz (só na primeira vez)', got / total);
      }
      const blob = new Blob(chunks as BlobPart[]);
      await store.put(UMX_URL, new Response(blob));
      response = new Response(blob);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
  });

function fftInPlace(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** STFT (janela de Hann): partes real e imaginária, [quadro][bin]. */
function stft(x: Float32Array, frames: number) {
  const win = Float64Array.from({ length: N_FFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT));
  const re = new Float32Array(frames * BINS);
  const im = new Float32Array(frames * BINS);
  const r = new Float64Array(N_FFT);
  const m = new Float64Array(N_FFT);
  for (let f = 0; f < frames; f++) {
    const start = f * HOP - N_FFT / 2;
    for (let i = 0; i < N_FFT; i++) {
      const k = start + i;
      r[i] = (k >= 0 && k < x.length ? x[k] : 0) * win[i];
      m[i] = 0;
    }
    fftInPlace(r, m, false);
    for (let b = 0; b < BINS; b++) {
      re[f * BINS + b] = r[b];
      im[f * BINS + b] = m[b];
    }
  }
  return { re, im };
}

/** ISTFT com sobreposição e soma (mesma janela), de volta para o som. */
function istft(re: Float32Array, im: Float32Array, frames: number, length: number): Float32Array {
  const win = Float64Array.from({ length: N_FFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT));
  const out = new Float64Array(length + N_FFT);
  const norm = new Float64Array(length + N_FFT);
  const r = new Float64Array(N_FFT);
  const m = new Float64Array(N_FFT);
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < BINS; b++) {
      r[b] = re[f * BINS + b];
      m[b] = im[f * BINS + b];
    }
    for (let b = BINS; b < N_FFT; b++) {
      r[b] = r[N_FFT - b];
      m[b] = -m[N_FFT - b];
    }
    fftInPlace(r, m, true);
    const start = f * HOP - N_FFT / 2;
    for (let i = 0; i < N_FFT; i++) {
      const k = start + i + N_FFT / 2;
      if (k < 0 || k >= out.length) continue;
      out[k] += (r[i] / N_FFT) * win[i];
      norm[k] += win[i] * win[i];
    }
  }
  const y = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const k = i + N_FFT / 2;
    y[i] = norm[k] > 1e-8 ? out[k] / norm[k] : 0;
  }
  return y;
}

/**
 * Voz e o resto (música, ruído), a 44,1 kHz estéreo. O modelo estima o espectro da voz; a máscara
 * (voz ÷ mistura) aplicada ao som original separa as duas partes sem perder a fase.
 */
async function separate(left: Float32Array, right: Float32Array): Promise<{ voice: Float32Array[]; rest: Float32Array[] }> {
  const session = await umx();
  const length = left.length;
  const frames = Math.ceil(length / HOP) + 1;
  progress('Analisando o som', 0);
  const L = stft(left, frames);
  const R = stft(right, frames);
  const mask = new Float32Array(frames * BINS * 2);
  // O modelo trabalha com janelas fixas de 100 quadros (~2,3 s). Cada janela leva 10 quadros de
  // contexto de cada lado (a rede tem memória) e só o miolo de 80 é usado.
  const WIN = 100;
  const PAD = 10;
  const KEEP = WIN - PAD * 2;
  const n = WIN;
  const mag = (s: { re: Float32Array; im: Float32Array }, f: number, k: number) => (f < 0 || f >= frames ? 0 : Math.hypot(s.re[f * BINS + k], s.im[f * BINS + k]));
  for (let start = 0; start < frames; start += KEEP) {
    const a = start - PAD;
    const input = new Float32Array(2 * BINS * n);
    for (let k = 0; k < BINS; k++) {
      for (let f = 0; f < n; f++) {
        input[k * n + f] = mag(L, a + f, k);
        input[BINS * n + k * n + f] = mag(R, a + f, k);
      }
    }
    const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 2, BINS, n]) };
    const output = (await session.run(feeds))[session.outputNames[0]].data as Float32Array;
    for (let f = start; f < Math.min(start + KEEP, frames); f++) {
      const lf = f - a;
      for (let k = 0; k < BINS; k++) {
        for (let c = 0; c < 2; c++) {
          const mix = input[c * BINS * n + k * n + lf];
          const voice = output[c * BINS * n + k * n + lf];
          mask[(f * BINS + k) * 2 + c] = mix > 1e-8 ? Math.min(1, voice / mix) : 0;
        }
      }
    }
    progress('Separando a voz', Math.min(1, (start + KEEP) / frames));
  }
  const apply = (s: { re: Float32Array; im: Float32Array }, c: number, voice: boolean) => {
    const re = new Float32Array(s.re.length);
    const im = new Float32Array(s.im.length);
    for (let i = 0; i < re.length; i++) {
      const g = voice ? mask[i * 2 + c] : 1 - mask[i * 2 + c];
      re[i] = s.re[i] * g;
      im[i] = s.im[i] * g;
    }
    return istft(re, im, frames, length);
  };
  progress('Montando as duas partes', null);
  return { voice: [apply(L, 0, true), apply(R, 1, true)], rest: [apply(L, 0, false), apply(R, 1, false)] };
}

// ---------------------------------------------------------------- Selecionar objeto (SlimSAM, em objectSam.ts)

const samModel = (device: SamDevice) => once(`sam-${device}`, () => loadSam(device, downloadProgress('o modelo de seleção de objetos')));

scope.onmessage = async (event: MessageEvent<AiRequest>) => {
  const req = event.data;
  current = req.id;
  try {
    setup(req.baseUrl);
    if (req.task === 'sam') {
      const result = await segmentWithSam(samModel, req, () => progress('Analisando o quadro', null));
      post({ id: req.id, type: 'done', result }, [result.masks.buffer]);
    } else if (req.task === 'translate') post({ id: req.id, type: 'done', result: await translate(req.texts, req.from, req.to) });
    else if (req.task === 'clip-image') post({ id: req.id, type: 'done', result: await clipImages(req.images) });
    else if (req.task === 'clip-text') post({ id: req.id, type: 'done', result: await clipTexts(req.texts) });
    else if (req.task === 'depth') {
      const result = await depth(req.image);
      post({ id: req.id, type: 'done', result }, [result.data.buffer]);
    } else if (req.task === 'upscale') {
      const result = await upscale(req.image);
      post({ id: req.id, type: 'done', result }, [result.data.buffer]);
    } else {
      const result = await separate(req.left, req.right);
      post({ id: req.id, type: 'done', result }, [...result.voice, ...result.rest].map((a) => a.buffer));
    }
  } catch (error) {
    const vars = error instanceof AiError ? error.vars : undefined;
    post({ id: req.id, type: 'error', message: error instanceof Error ? error.message : String(error), vars });
  }
};
