import {
  ALL_FORMATS,
  AudioBufferSink,
  BlobSource,
  BufferTarget,
  canEncodeVideo,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny';
import { IMAGE_MAX_DURATION, uid, type MediaItem, type MediaKind } from '../project/model';
import { assets, PEAKS_PER_SECOND } from './assets';

const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
/** Fotos maiores que isso são reduzidas (o projeto vai no máximo até 1920px). */
const MAX_IMAGE_SIDE = 3840;

export function mediaKindOf(file: File): MediaKind | null {
  if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  if (file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)) return 'audio';
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) return 'video';
  return null;
}

/** Lê as informações básicas do arquivo. Miniaturas e forma de onda vêm depois, em analyzeMedia. */
export async function importMedia(file: File): Promise<MediaItem> {
  const kind = mediaKindOf(file);
  if (kind === 'image' && isGif(file)) {
    // GIF animado vira um vídeo (dá para cortar, acelerar e aplicar efeitos como qualquer clipe).
    const video = await gifToVideo(file);
    if (video) return { ...(await importMedia(video)), name: file.name };
  }
  if (kind === 'image') return importImage(file);
  if (!kind) throw new Error(`"${file.name}" não é um vídeo, áudio ou imagem suportado.`);

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video && !audio) throw new Error(`"${file.name}" não tem vídeo nem áudio.`);
    const track = video ?? audio!;
    if (!(await track.canDecode())) {
      throw new Error(`O navegador não consegue ler "${file.name}" (codec: ${track.codec ?? 'desconhecido'}).`);
    }
    const base = {
      id: uid(),
      name: file.name,
      file,
      url: URL.createObjectURL(file),
      duration: await input.computeDuration(),
      hasAudio: audio !== null && (await audio.canDecode()),
    };
    if (!video) return { ...base, kind: 'audio', thumbnail: null, width: 0, height: 0 };
    return {
      ...base,
      kind: 'video',
      thumbnail: await videoThumbnail(video, base.duration).catch(() => null),
      width: video.displayWidth,
      height: video.displayHeight,
    };
  } finally {
    input.dispose();
  }
}

function isGif(file: File): boolean {
  return file.type === 'image/gif' || /\.gif$/i.test(file.name);
}

/**
 * Converte um GIF animado em vídeo, quadro a quadro, respeitando o tempo de cada quadro.
 * Devolve null se o GIF tiver um quadro só (aí ele entra como imagem).
 */
async function gifToVideo(file: File): Promise<File | null> {
  if (typeof ImageDecoder === 'undefined') return null;
  const decoder = new ImageDecoder({ data: file.stream(), type: 'image/gif' });
  try {
    await decoder.tracks.ready;
    await decoder.completed;
    const track = decoder.tracks.selectedTrack;
    if (!track || track.frameCount < 2) return null;

    const first = await decoder.decode({ frameIndex: 0 });
    const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
    const width = even(first.image.displayWidth);
    const height = even(first.image.displayHeight);
    first.image.close();

    const avc = await canEncodeVideo('avc', { width, height }).catch(() => false);
    const output = new Output({
      format: avc ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const source = new CanvasSource(canvas, { codec: avc ? 'avc' : 'vp9', bitrate: QUALITY_HIGH });
    output.addVideoTrack(source);
    await output.start();

    let t = 0;
    for (let i = 0; i < track.frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      // Navegadores tratam atrasos muito curtos como 0,1 s; aqui é igual.
      const seconds = (image.duration ?? 0) / 1e6;
      const duration = seconds > 0.011 ? seconds : 0.1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      image.close();
      await source.add(t, duration);
      t += duration;
    }
    source.close();
    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer!;
    const base = file.name.replace(/\.gif$/i, '');
    return new File([buffer], `${base}.${avc ? 'mp4' : 'webm'}`, { type: avc ? 'video/mp4' : 'video/webm' });
  } catch (error) {
    console.warn(`[Lumiar] não foi possível converter o GIF "${file.name}"`, error);
    return null;
  } finally {
    decoder.close();
  }
}

async function importImage(file: File): Promise<MediaItem> {
  let bitmap = await createImageBitmap(file);
  const scale = MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height);
  if (scale < 1) {
    const original = bitmap;
    bitmap = await createImageBitmap(original, {
      resizeWidth: Math.round(original.width * scale),
      resizeHeight: Math.round(original.height * scale),
      resizeQuality: 'high',
    });
    original.close();
  }
  const id = uid();
  assets.bitmaps.set(id, bitmap);
  return {
    id,
    kind: 'image',
    name: file.name,
    file,
    url: URL.createObjectURL(file),
    thumbnail: drawThumbnail(bitmap, bitmap.width, bitmap.height),
    duration: IMAGE_MAX_DURATION,
    width: bitmap.width,
    height: bitmap.height,
    hasAudio: false,
  };
}

/**
 * Recria o que não fica salvo no projeto (imagem decodificada, miniatura,
 * filmstrip e forma de onda) para uma mídia que veio de um arquivo .lumiar.
 */
export async function restoreMediaAssets(media: MediaItem): Promise<MediaItem> {
  let restored = media;
  try {
    if (media.kind === 'image') {
      const bitmap = await createImageBitmap(media.file, {
        resizeWidth: media.width,
        resizeHeight: media.height,
        resizeQuality: 'high',
      });
      assets.bitmaps.set(media.id, bitmap);
      if (!media.thumbnail) restored = { ...media, thumbnail: drawThumbnail(bitmap, bitmap.width, bitmap.height) };
    } else if (media.kind === 'video' && !media.thumbnail) {
      const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media.file) });
      try {
        const track = await input.getPrimaryVideoTrack();
        if (track) restored = { ...media, thumbnail: await videoThumbnail(track, media.duration) };
      } finally {
        input.dispose();
      }
    }
  } catch (error) {
    console.warn(`[Lumiar] não foi possível restaurar "${media.name}"`, error);
  }
  void analyzeMedia(restored);
  return restored;
}

/**
 * Gera em segundo plano o filmstrip (várias miniaturas ao longo do vídeo)
 * e a forma de onda do áudio. Avisa a interface pelo `assets`.
 */
export async function analyzeMedia(media: MediaItem): Promise<void> {
  if (media.kind === 'image') return;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media.file) });
  try {
    const video = media.kind === 'video' ? await input.getPrimaryVideoTrack() : null;
    const audio = media.hasAudio ? await input.getPrimaryAudioTrack() : null;
    if (video) {
      assets.filmstrips.set(media.id, await buildFilmstrip(video, media.duration));
      assets.changed();
    }
    if (audio) {
      assets.peaks.set(media.id, await buildPeaks(audio, media.duration));
      assets.changed();
    }
  } catch (error) {
    console.warn(`[Lumiar] não foi possível analisar "${media.name}"`, error);
  } finally {
    input.dispose();
  }
}

async function buildFilmstrip(track: InputVideoTrack, duration: number) {
  const count = Math.min(60, Math.max(1, Math.ceil(duration / 2)));
  const first = await track.getFirstTimestamp();
  const times = Array.from({ length: count }, (_, i) => first + ((i + 0.5) * duration) / count);
  const sink = new CanvasSink(track, { width: 128, height: 72, fit: 'cover' });
  const urls: string[] = [];
  for await (const frame of sink.canvasesAtTimestamps(times)) {
    urls.push(frame ? await canvasToUrl(frame.canvas) : (urls[urls.length - 1] ?? ''));
  }
  return { times: times.map((t) => t - first), urls };
}

async function buildPeaks(track: InputAudioTrack, duration: number): Promise<Float32Array> {
  const peaks = new Float32Array(Math.ceil(duration * PEAKS_PER_SECOND) + 1);
  const sink = new AudioBufferSink(track);
  for await (const { buffer, timestamp } of sink.buffers()) {
    const step = buffer.sampleRate / PEAKS_PER_SECOND;
    const offset = timestamp * PEAKS_PER_SECOND;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const index = Math.floor(offset + i / step);
        const v = Math.abs(data[i]);
        if (index >= 0 && index < peaks.length && v > peaks[index]) peaks[index] = v;
      }
    }
  }
  return peaks;
}

async function videoThumbnail(track: InputVideoTrack, duration: number): Promise<string | null> {
  const sink = new CanvasSink(track, { width: 320, height: 180, fit: 'cover' });
  const first = await track.getFirstTimestamp();
  const frame = await sink.getCanvas(first + Math.min(1, duration / 2));
  return frame ? canvasToUrl(frame.canvas) : null;
}

function drawThumbnail(source: CanvasImageSource, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.max(320 / width, 180 / height);
  ctx.drawImage(source, (320 - width * scale) / 2, (180 - height * scale) / 2, width * scale, height * scale);
  return canvas.toDataURL('image/jpeg', 0.8);
}

async function canvasToUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if (canvas instanceof HTMLCanvasElement) return canvas.toDataURL('image/jpeg', 0.75);
  return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 }));
}
