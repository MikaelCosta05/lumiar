/// <reference lib="webworker" />
// Voz sintética (texto → fala) numa thread separada, com os modelos guardados no próprio app.
import { env, pipeline, type TextToAudioPipeline } from '@huggingface/transformers';

export interface SpeakRequest {
  text: string;
  model: string;
  /** Endereço da pasta public/ do app */
  baseUrl: string;
}

export type SpeakMessage =
  | { type: 'loading'; fraction: number }
  | { type: 'done'; audio: Float32Array; sampleRate: number }
  | { type: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (message: SpeakMessage, transfer: Transferable[] = []) => scope.postMessage(message, transfer);

let loaded: { model: string; tts: Promise<TextToAudioPipeline> } | null = null;

function useLocalFiles(baseUrl: string) {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  // Só o caminho, sem "http://…" (com endereço completo o transformers.js não acha o tokenizer).
  env.localModelPath = new URL('models/tts/', baseUrl).pathname;
  env.useBrowserCache = false;
  const wasm = env.backends.onnx.wasm;
  if (wasm) wasm.wasmPaths = new URL('ort/', baseUrl).href;
}

scope.onmessage = async (event: MessageEvent<SpeakRequest>) => {
  const { text, model, baseUrl } = event.data;
  try {
    useLocalFiles(baseUrl);
    if (!loaded || loaded.model !== model) {
      const files = new Map<string, { loaded: number; total: number }>();
      loaded = {
        model,
        tts: pipeline('text-to-speech', model, {
          device: 'wasm',
          dtype: 'q8',
          progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
            if (p.status !== 'progress' || !p.file || !p.total) return;
            files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
            let done = 0;
            let total = 0;
            files.forEach((f) => ((done += f.loaded), (total += f.total)));
            post({ type: 'loading', fraction: total ? done / total : 0 });
          },
        }) as Promise<TextToAudioPipeline>,
      };
    }
    const tts = await loaded.tts;
    const output = await tts(text);
    const audio = output.audio as Float32Array;
    post({ type: 'done', audio, sampleRate: output.sampling_rate }, [audio.buffer]);
  } catch (error) {
    loaded = null;
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
