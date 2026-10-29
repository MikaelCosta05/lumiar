// Selecionar objeto com cliques (SlimSAM, ~14 MB no processador ou ~40 MB na placa de vídeo, baixado na
// primeira vez). Roda dentro do worker de IA (ai.worker.ts): o quadro vira uma "descrição" (a parte
// pesada, uma vez por quadro) e cada clique só passa pela parte leve, que desenha as máscaras.
import { AutoProcessor, RawImage, SamModel, type PreTrainedModel, type Processor, type Tensor } from '@huggingface/transformers';

export const SAM_MODEL = 'Xenova/slimsam-77-uniform';

export interface SamRequest {
  /** Identifica o quadro: o mesmo quadro aproveita a descrição já calculada */
  key: string;
  /** Quadro com no máximo 1024 px no lado maior (o tamanho com que o modelo trabalha) */
  image: ImageData;
  /** x, y de 0 a 1 */
  points: { x: number; y: number; include: boolean }[];
  /** Tamanho das máscaras devolvidas */
  width: number;
  height: number;
}

export interface SamResult {
  /** As três máscaras candidatas, uma depois da outra (1 = objeto), cada uma width × height */
  masks: Uint8Array;
  /** Nota que a IA dá para cada máscara */
  scores: number[];
}

export type SamDevice = 'webgpu' | 'wasm';

export interface Sam {
  model: PreTrainedModel;
  processor: Processor;
}

/** Na placa de vídeo, a versão completa (a quantizada é lenta lá); no processador, a quantizada. */
export async function loadSam(device: SamDevice, progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => void): Promise<Sam> {
  const model = (await SamModel.from_pretrained(SAM_MODEL, { device, dtype: device === 'webgpu' ? 'fp32' : 'q8', progress_callback })) as PreTrainedModel;
  const processor = (await AutoProcessor.from_pretrained(SAM_MODEL)) as Processor;
  return { model, processor };
}

type Embedded = { sam: Sam; sizes: { original_sizes: number[][]; reshaped_input_sizes: number[][] }; embeddings: Record<string, Tensor> };

/** Descrição do último quadro (cada clique no mesmo quadro só roda a parte leve). */
let last: { key: string; device: SamDevice; promise: Promise<Embedded> } | null = null;
/** A placa de vídeo falhou uma vez: daí em diante, só o processador. */
let gpuFailed = false;

async function hasGpu(): Promise<boolean> {
  if (gpuFailed) return false;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  return !!(gpu && (await gpu.requestAdapter().catch(() => null)));
}

async function embed(sam: Sam, image: ImageData): Promise<Embedded> {
  const raw = new RawImage(image.data, image.width, image.height, 4);
  const inputs = (await sam.processor(raw)) as { pixel_values: Tensor; original_sizes: number[][]; reshaped_input_sizes: number[][] };
  const embeddings = (await (sam.model as unknown as { get_image_embeddings(i: unknown): Promise<Record<string, Tensor>> }).get_image_embeddings(inputs)) as Record<string, Tensor>;
  return { sam, sizes: { original_sizes: inputs.original_sizes, reshaped_input_sizes: inputs.reshaped_input_sizes }, embeddings };
}

async function decode(e: Embedded, req: SamRequest): Promise<SamResult> {
  const size = req.width * req.height;
  if (!req.points.length) return { masks: new Uint8Array(size * 3), scores: [0, 0, 0] };
  const imageProcessor = (e.sam.processor as unknown as { image_processor: { reshape_input_points(...a: unknown[]): Tensor; add_input_labels(...a: unknown[]): Tensor } }).image_processor;
  const points = req.points.map((p) => [p.x * req.image.width, p.y * req.image.height]);
  const labels = req.points.map((p) => (p.include ? 1 : 0));
  const input_points = imageProcessor.reshape_input_points([[points]], e.sizes.original_sizes, e.sizes.reshaped_input_sizes);
  const input_labels = imageProcessor.add_input_labels([[labels]], input_points);
  const out = (await e.sam.model({ ...e.embeddings, input_points, input_labels })) as { pred_masks: Tensor; iou_scores: Tensor };
  const post = (e.sam.processor as unknown as { post_process_masks(...a: unknown[]): Promise<Tensor[]> }).post_process_masks;
  const [masks] = await post.call(e.sam.processor, out.pred_masks, [[req.height, req.width]], e.sizes.reshaped_input_sizes);
  const data = masks.data as Uint8Array;
  const count = Math.min(3, Math.floor(data.length / size));
  const result = new Uint8Array(size * 3);
  result.set(data.subarray(0, size * count));
  const scores = Array.from(out.iou_scores.data as Float32Array).slice(0, 3);
  while (scores.length < 3) scores.push(-1);
  return { masks: result, scores };
}

/**
 * As três máscaras candidatas para os pontos. `getSam` carrega o modelo (uma vez por aparelho);
 * `onEmbed` avisa quando o quadro é novo e a parte pesada vai rodar.
 */
export async function segmentWithSam(getSam: (device: SamDevice) => Promise<Sam>, req: SamRequest, onEmbed: () => void): Promise<SamResult> {
  const attempt = async (device: SamDevice) => {
    if (!last || last.key !== req.key || last.device !== device) {
      onEmbed();
      const promise = getSam(device).then((sam) => embed(sam, req.image));
      last = { key: req.key, device, promise };
      promise.catch(() => last?.promise === promise && (last = null));
    }
    return decode(await last.promise, req);
  };
  const device: SamDevice = (await hasGpu()) ? 'webgpu' : 'wasm';
  if (device === 'wasm') return attempt('wasm');
  try {
    return await attempt('webgpu');
  } catch (error) {
    // Placa de vídeo sem suporte (ou que caiu no meio): continua no processador.
    console.warn('[Lumiar] WebGPU indisponível para selecionar objetos; usando o processador', error);
    gpuFailed = true;
    last = null;
    return attempt('wasm');
  }
}
