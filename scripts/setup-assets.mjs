// Prepara a pasta public/ com tudo o que o Lumiar usa sem internet:
// o runtime do ONNX e do MediaPipe (copiados do node_modules) e os modelos de IA (baixados uma vez).
// Uso: npm run setup        (pula o que já existe)
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');

function copyDir(from, to, filter = () => true) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from).filter(filter)) copyFileSync(join(from, name), join(to, name));
}

// 1. Runtimes que vêm com as dependências.
copyDir(join(root, 'node_modules/onnxruntime-web/dist'), join(pub, 'ort'), (n) => /^ort-wasm-simd-threaded.*\.(mjs|wasm)$/.test(n));
copyDir(join(root, 'node_modules/@mediapipe/tasks-vision/wasm'), join(pub, 'mediapipe'));
console.log('runtime do ONNX e do MediaPipe copiados');

// 2. Modelos.
const HF = 'https://huggingface.co';
const whisperFiles = [
  'added_tokens.json',
  'config.json',
  'generation_config.json',
  'merges.txt',
  'normalizer.json',
  'preprocessor_config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];
const ttsFiles = [
  'added_tokens.json',
  'config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.json',
  'onnx/model_quantized.onnx',
];

const downloads = [
  {
    url: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
    to: 'models/blaze_face_short_range.tflite',
  },
  {
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
    to: 'models/selfie_segmenter.tflite',
  },
  ...['whisper-tiny', 'whisper-base', 'whisper-small'].flatMap((m) =>
    whisperFiles.map((f) => ({ url: `${HF}/Xenova/${m}/resolve/main/${f}`, to: `models/whisper/Xenova/${m}/${f}` })),
  ),
  ...['mms-tts-por', 'mms-tts-eng', 'mms-tts-spa'].flatMap((m) =>
    ttsFiles.map((f) => ({ url: `${HF}/Xenova/${m}/resolve/main/${f}`, to: `models/tts/Xenova/${m}/${f}` })),
  ),
];

let fetched = 0;
for (const { url, to } of downloads) {
  const file = join(pub, to);
  if (existsSync(file) && statSync(file).size > 0) continue;
  mkdirSync(dirname(file), { recursive: true });
  process.stdout.write(`baixando ${to}… `);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`falhou (${response.status}): ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  console.log(`${(statSync(file).size / 1024 / 1024).toFixed(1)} MB`);
  fetched++;
}
console.log(fetched ? `${fetched} arquivo(s) baixado(s).` : 'modelos já estavam todos aqui.');
