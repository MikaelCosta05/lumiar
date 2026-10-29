import { createProject, createVideoClip, createAudioClip, insertVideoClips, addMedia, placeAudioClip, type MediaItem } from '../project/model';
import type { CaptionWord } from '../project/captions';
import { t } from '../i18n';
import { cosine, embedImages, embedTexts, translateTexts, type AiProgress } from './ai';
import { transcribeProject } from './captioning';
import { videoFrames } from './tracking';

/**
 * Índice das mídias para a busca:
 * - pelo que aparece: um quadro a cada 2 s vira um vetor (CLIP); a busca compara com o texto;
 * - pelo que é falado: a fala de cada mídia, palavra por palavra (Whisper).
 * Guardado na memória enquanto o Lumiar está aberto (cada mídia é analisada uma vez).
 */
interface VisualEntry {
  t: number;
  vec: Float32Array;
}

const visual = new Map<string, VisualEntry[]>();
const speech = new Map<string, CaptionWord[]>();

export function isIndexed(media: MediaItem, kind: 'visual' | 'speech'): boolean {
  return (kind === 'visual' ? visual : speech).has(media.id);
}

/** Quadro do vídeo em 224×224 (recorte do meio), o tamanho que o CLIP enxerga. */
function square(canvas: HTMLCanvasElement | OffscreenCanvas): ImageData {
  const c = document.createElement('canvas');
  c.width = 224;
  c.height = 224;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const side = Math.min(canvas.width, canvas.height);
  ctx.drawImage(canvas as CanvasImageSource, (canvas.width - side) / 2, (canvas.height - side) / 2, side, side, 0, 0, 224, 224);
  return ctx.getImageData(0, 0, 224, 224);
}

export async function indexVisual(media: MediaItem, onProgress?: AiProgress): Promise<void> {
  if (visual.has(media.id) || media.kind === 'audio') return;
  const step = Math.max(2, media.duration / 300);
  const times: number[] = [];
  const images: ImageData[] = [];
  const stage = t('Lendo os quadros');
  for await (const { t, canvas } of videoFrames(media, 0, media.kind === 'image' ? 0 : media.duration, 1 / step, 320)) {
    times.push(t);
    images.push(square(canvas));
    onProgress?.(stage, media.duration ? t / media.duration : null);
  }
  const vecs = await embedImages(images, onProgress);
  visual.set(
    media.id,
    vecs.map((vec, i) => ({ t: times[i], vec })),
  );
}

export async function indexSpeech(media: MediaItem, language: string | null, onProgress?: AiProgress): Promise<void> {
  if (speech.has(media.id) || !(media.hasAudio || media.kind === 'audio')) return;
  // Um projeto só com esta mídia: o Whisper ouve o arquivo inteiro.
  let p = addMedia(createProject(), [media]);
  p = media.kind === 'audio' ? placeAudioClip(p, createAudioClip(media, 0)) : insertVideoClips(p, [createVideoClip(media)]);
  const captions = await transcribeProject(p, { model: 'Xenova/whisper-base', language, maxWords: 12 }, (stage, f) => onProgress?.(stage, f));
  speech.set(
    media.id,
    captions.flatMap((c) => c.words ?? []),
  );
}

export interface SearchHit {
  media: MediaItem;
  /** Instante dentro do arquivo */
  time: number;
  score: number;
  /** Trecho da fala (busca pela fala) */
  context?: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Busca pelo que aparece: o texto (em português) é traduzido para o inglês e comparado com os quadros. */
export async function searchVisual(query: string, media: MediaItem[], language = 'pt', onProgress?: AiProgress): Promise<SearchHit[]> {
  const [english] = await translateTexts([query], language, 'en', onProgress);
  const [q] = await embedTexts([`a photo of ${english}`], onProgress);
  const hits: SearchHit[] = [];
  for (const m of media) {
    const entries = visual.get(m.id);
    if (!entries) continue;
    // Melhor momento de cada trecho (sem repetir quadros vizinhos da mesma cena).
    const scored = entries.map((e) => ({ t: e.t, score: cosine(q, e.vec) })).sort((a, b) => b.score - a.score);
    const kept: { t: number; score: number }[] = [];
    for (const s of scored) {
      if (kept.length >= 4) break;
      if (kept.some((k) => Math.abs(k.t - s.t) < 6)) continue;
      kept.push(s);
    }
    hits.push(...kept.map((k) => ({ media: m, time: k.t, score: k.score })));
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 24);
}

/** Busca pelo que é falado: todas as vezes em que a frase (ou as palavras dela) aparece. */
export function searchSpeech(query: string, media: MediaItem[]): SearchHit[] {
  const target = norm(query).split(' ').filter(Boolean);
  if (!target.length) return [];
  const hits: SearchHit[] = [];
  for (const m of media) {
    const words = speech.get(m.id);
    if (!words) continue;
    const plain = words.map((w) => norm(w.text));
    for (let i = 0; i < plain.length; i++) {
      let matched = 0;
      for (let k = 0; k < target.length && i + k < plain.length; k++) if (plain[i + k] === target[k] || (k === target.length - 1 && plain[i + k].startsWith(target[k]))) matched++;
      if (matched < target.length) continue;
      const context = words
        .slice(Math.max(0, i - 6), i + target.length + 6)
        .map((w) => w.text)
        .join(' ');
      hits.push({ media: m, time: words[i].start, score: 1, context });
    }
  }
  return hits;
}

/** Os melhores momentos visuais para cada frase (imagens de apoio automáticas). */
export async function matchFrames(sentences: string[], media: MediaItem[], language: string, onProgress?: AiProgress): Promise<{ media: MediaItem; time: number; score: number }[][]> {
  const english = await translateTexts(sentences, language, 'en', onProgress);
  const vecs = await embedTexts(english.map((s) => `a photo of ${s}`), onProgress);
  return vecs.map((q) => {
    const all: { media: MediaItem; time: number; score: number }[] = [];
    for (const m of media) for (const e of visual.get(m.id) ?? []) all.push({ media: m, time: e.t, score: cosine(q, e.vec) });
    return all.sort((a, b) => b.score - a.score).slice(0, 3);
  });
}
