/// <reference lib="webworker" />
// Reconhecimento de fala (Whisper) numa thread separada, para a interface não travar.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { transcribeSpeech } from './audioChunks';
import { WHISPER_OPTIONS } from './whisperOptions';

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
  | { type: 'transcribing'; fraction: number }
  | { type: 'done'; words: { text: string; start: number; end: number }[] }
  | { type: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: TranscribeMessage) => scope.postMessage(message);

let loaded: { model: string; asr: Promise<AutomaticSpeechRecognitionPipeline> } | null = null;

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
  // Sempre no processador: com os modelos q8 que vêm no app, a placa de vídeo (WebGPU) ficou de 3 a 6 vezes
  // mais lenta (medido num vídeo de 30 min: 25 s de fala em ~25 s na placa e em ~5 s no processador).
  return (await pipeline('automatic-speech-recognition', model, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback,
  })) as AutomaticSpeechRecognitionPipeline;
}

scope.onmessage = async (event: MessageEvent<TranscribeRequest>) => {
  const { audio, model, language, baseUrl, translate } = event.data;
  try {
    useLocalFiles(baseUrl);
    if (!loaded || loaded.model !== model) loaded = { model, asr: load(model) };
    const asr = await loaded.asr;
    const options = {
      ...WHISPER_OPTIONS,
      ...(translate ? { ...(language ? { language } : {}), task: 'translate' } : language ? { language, task: 'transcribe' } : {}),
    };
    // Um trecho por vez: dá para mostrar o andamento, e o silêncio nem vai para o Whisper.
    const words = await transcribeSpeech(
      audio,
      async (part) => {
        const output = await asr(part, options);
        const result = Array.isArray(output) ? output[0] : output;
        return (result.chunks ?? []) as { text: string; timestamp: [number, number | null] }[];
      },
      (fraction) => post({ type: 'transcribing', fraction }),
    );
    post({ type: 'done', words });
  } catch (error) {
    loaded = null;
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
