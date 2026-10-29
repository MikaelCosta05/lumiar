/// <reference lib="webworker" />
// Reconhecimento de fala (Whisper) numa thread separada, para a interface não travar.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

export interface TranscribeRequest {
  audio: Float32Array;
  model: string;
  language: string | null;
  /** Traduz a fala para o inglês (o Whisper só traduz para o inglês) */
  translate?: boolean;
  /** Endereço da pasta public/ do app (modelos e motor ficam lá: funciona sem internet). */
  baseUrl: string;
}

/** Tudo vem dos arquivos do próprio app: nada é baixado da internet. */
function useLocalFiles(baseUrl: string) {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  // Só o caminho, sem "http://…": com endereço completo o transformers.js não acha o tokenizer
  // nem o preprocessor_config.json e a transcrição falha ("feature_extractor" nulo).
  env.localModelPath = new URL('models/whisper/', baseUrl).pathname;
  env.useBrowserCache = false;
  const wasm = env.backends.onnx.wasm;
  if (wasm) wasm.wasmPaths = new URL('ort/', baseUrl).href;
}

export type TranscribeMessage =
  | { type: 'download'; fraction: number }
  | { type: 'transcribing'; device: string }
  | { type: 'done'; chunks: { text: string; timestamp: [number, number | null] }[] }
  | { type: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: TranscribeMessage) => scope.postMessage(message);

let loaded: { model: string; asr: Promise<{ asr: AutomaticSpeechRecognitionPipeline; device: string }> } | null = null;

async function load(model: string) {
  // Progresso somando todos os arquivos do modelo.
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file || !p.total) return;
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
    let loadedBytes = 0;
    let total = 0;
    files.forEach((f) => ((loadedBytes += f.loaded), (total += f.total)));
    post({ type: 'download', fraction: total ? loadedBytes / total : 0 });
  };
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  const adapter = gpu ? await gpu.requestAdapter().catch(() => null) : null;
  // Os modelos guardados no app são a versão quantizada (q8), usada na placa de vídeo e no processador.
  if (adapter) {
    try {
      const asr = (await pipeline('automatic-speech-recognition', model, {
        device: 'webgpu',
        dtype: 'q8',
        progress_callback,
      })) as AutomaticSpeechRecognitionPipeline;
      return { asr, device: 'webgpu' };
    } catch (error) {
      console.warn('[Lumiar] WebGPU indisponível para a transcrição; usando o processador', error);
    }
  }
  const asr = (await pipeline('automatic-speech-recognition', model, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback,
  })) as AutomaticSpeechRecognitionPipeline;
  return { asr, device: 'wasm' };
}

scope.onmessage = async (event: MessageEvent<TranscribeRequest>) => {
  const { audio, model, language, baseUrl, translate } = event.data;
  try {
    useLocalFiles(baseUrl);
    if (!loaded || loaded.model !== model) loaded = { model, asr: load(model) };
    const { asr, device } = await loaded.asr;
    post({ type: 'transcribing', device });
    const output = await asr(audio, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      ...(translate ? { ...(language ? { language } : {}), task: 'translate' } : language ? { language, task: 'transcribe' } : {}),
    });
    const result = Array.isArray(output) ? output[0] : output;
    post({ type: 'done', chunks: (result.chunks ?? []) as { text: string; timestamp: [number, number | null] }[] });
  } catch (error) {
    loaded = null;
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
