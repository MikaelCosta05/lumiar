// Mede quanto cada modelo de IA local ocupa e quanto volta depois de liberado (só para quem desenvolve; quem
// chama é scripts/memoria-ia/run.cjs, que lê a memória do processo da página entre os passos).
// Só modelos que já vêm com o app (voz sintética, MediaPipe) e a música: nada é baixado da internet.
import { assetUrl } from '../../src/assetUrl';
import { assets } from '../../src/media/assets';
import { analyzeGaze } from '../../src/media/gaze';
import { generateMusic } from '../../src/media/generatedMusic';
import { releaseIdleNow } from '../../src/media/idleRelease';
import { loadSegmenter, segmentFrame } from '../../src/media/segment';
import { speak } from '../../src/media/speech';
import { trackFace } from '../../src/media/tracking';
import type { MediaItem } from '../../src/project/model';

let photo: MediaItem | null = null;

async function portrait(): Promise<MediaItem> {
  if (photo) return photo;
  const blob = await (await fetch(assetUrl('previews/retrato.jpg'))).blob();
  const bitmap = await createImageBitmap(blob);
  photo = {
    id: 'retrato',
    kind: 'image',
    name: 'retrato.jpg',
    file: new File([blob], 'retrato.jpg', { type: 'image/jpeg' }),
    url: '',
    thumbnail: null,
    duration: 5,
    width: bitmap.width,
    height: bitmap.height,
    hasAudio: false,
  };
  assets.bitmaps.set(photo.id, bitmap);
  return photo;
}

/** Cada passo devolve um resumo do que fez (a memória é medida por fora, depois). */
export async function step(name: string): Promise<string> {
  const started = performance.now();
  const took = () => `${Math.round(performance.now() - started)} ms`;
  if (name === 'voz') {
    const file = await speak('Olá! Este é um teste de memória da voz sintética do Lumiar.', 'Xenova/mms-tts-por');
    return `voz: ${(file.size / 1024).toFixed(0)} KB de WAV em ${took()}`;
  }
  if (name === 'olhar') {
    const frames = await analyzeGaze(await portrait(), 0, 0, () => {});
    return `olhar: ${frames.length} quadro(s) com olhos em ${took()}`;
  }
  if (name === 'rostos') {
    const points = await trackFace(await portrait(), 0, 0);
    return `rostos: ${points.length} ponto(s) em ${took()}`;
  }
  if (name === 'musica') {
    const music = await generateMusic({ style: 'lofi', duration: 20, bpm: 80, intensity: 0.5, seed: 1 });
    return `música: ${(music.file.size / 1024 / 1024).toFixed(1)} MB de WAV em ${took()}`;
  }
  if (name === 'recorte') {
    await loadSegmenter();
    const image = assets.bitmaps.get((await portrait()).id)!;
    const mask = segmentFrame(image, image.width, image.height, 'memoria');
    return `recorte: máscara ${mask?.width}×${mask?.height} em ${took()}`;
  }
  if (name === 'liberar') {
    const count = releaseIdleNow();
    // Dá tempo de o worker fechar e o coletor de lixo passar.
    await new Promise((r) => setTimeout(r, 1500));
    (globalThis as { gc?: () => void }).gc?.();
    await new Promise((r) => setTimeout(r, 1500));
    return `liberados: ${count}`;
  }
  if (name === 'parado') {
    (globalThis as { gc?: () => void }).gc?.();
    await new Promise((r) => setTimeout(r, 1500));
    return 'parado';
  }
  throw new Error(`passo desconhecido: ${name}`);
}
