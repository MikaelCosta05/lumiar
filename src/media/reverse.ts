import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  canEncodeAudio,
  canEncodeVideo,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
} from 'mediabunny';
import type { MediaItem } from '../project/model';

/** Pedaço lido de cada vez (os quadros dele são gravados de trás para frente). */
const WINDOW = 0.5;
const MAX_SIDE = 1920;

/**
 * Cria um novo arquivo com o trecho [from, to] tocando de trás para frente (imagem e som).
 * O vídeo é lido em pedaços curtos, do fim para o começo, para não precisar de muita memória.
 */
export async function reverseMedia(
  media: MediaItem,
  from: number,
  to: number,
  onProgress?: (fraction: number) => void,
): Promise<File> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media.file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Este arquivo não tem vídeo.');
    const stats = await track.computePacketStats(120).catch(() => null);
    const fps = Math.min(60, Math.max(10, Math.round(stats?.averagePacketRate || 30)));
    const scale = Math.min(1, MAX_SIDE / Math.max(track.displayWidth, track.displayHeight));
    const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
    const width = even(track.displayWidth * scale);
    const height = even(track.displayHeight * scale);

    const avc = await canEncodeVideo('avc', { width, height }).catch(() => false);
    const output = new Output({
      format: avc ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const video = new CanvasSource(canvas, { codec: avc ? 'avc' : 'vp9', bitrate: QUALITY_HIGH });
    output.addVideoTrack(video, { frameRate: fps });

    // Som invertido: decodifica o trecho inteiro e vira as amostras.
    let audio: AudioBuffer | null = null;
    let audioSource: AudioBufferSource | null = null;
    if (media.hasAudio) {
      audio = await reversedAudio(media.file, from, to).catch(() => null);
      if (audio) {
        const codec = avc
          ? (await canEncodeAudio('aac', { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate })) ? 'aac' : 'opus'
          : 'opus';
        audioSource = new AudioBufferSource({ codec, bitrate: QUALITY_HIGH });
        output.addAudioTrack(audioSource);
      }
    }

    await output.start();
    if (audioSource && audio) {
      await audioSource.add(audio);
      audioSource.close();
    }

    const first = await track.getFirstTimestamp();
    const sink = new CanvasSink(track, { width, height, fit: 'fill', poolSize: 0 });
    const step = 1 / fps;
    const total = Math.max(1, (to - from) / step);
    const seen = new Set<number>();
    let written = 0;
    for (let end = to; end > from + 1e-6; end -= WINDOW) {
      const start = Math.max(from, end - WINDOW);
      const frames: { t: number; canvas: HTMLCanvasElement | OffscreenCanvas }[] = [];
      for await (const frame of sink.canvases(first + start, first + end)) {
        const key = Math.round(frame.timestamp * 1000);
        if (seen.has(key)) continue; // o quadro da emenda entre dois pedaços
        seen.add(key);
        frames.push({ t: frame.timestamp, canvas: frame.canvas });
      }
      frames.sort((a, b) => b.t - a.t);
      for (const f of frames) {
        ctx.drawImage(f.canvas, 0, 0, width, height);
        await video.add(written * step, step);
        written++;
      }
      onProgress?.(Math.min(1, written / total));
    }
    video.close();
    await output.finalize();
    const buffer = (output.target as BufferTarget).buffer!;
    const base = media.name.replace(/\.[^.]+$/, '');
    return new File([buffer], `${base} (invertido).${avc ? 'mp4' : 'webm'}`, { type: avc ? 'video/mp4' : 'video/webm' });
  } finally {
    input.dispose();
  }
}

async function reversedAudio(file: File, from: number, to: number): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, 1, 48000);
  const decoded = await context.decodeAudioData(await file.arrayBuffer());
  const start = Math.floor(from * decoded.sampleRate);
  const length = Math.max(1, Math.min(decoded.length - start, Math.ceil((to - from) * decoded.sampleRate)));
  const out = new AudioBuffer({ numberOfChannels: decoded.numberOfChannels, length, sampleRate: decoded.sampleRate });
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const data = decoded.getChannelData(ch).slice(start, start + length);
    data.reverse();
    out.copyToChannel(data, ch);
  }
  return out;
}

/** Uma imagem PNG do quadro do instante `time` (para congelar). */
export async function grabFrame(media: MediaItem, time: number): Promise<File> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media.file) });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Este arquivo não tem vídeo.');
    const first = await track.getFirstTimestamp();
    const sink = new CanvasSink(track, { width: track.displayWidth, height: track.displayHeight, fit: 'fill' });
    const frame = await sink.getCanvas(first + time);
    if (!frame) throw new Error('Não foi possível ler esse quadro.');
    const canvas = frame.canvas;
    const blob =
      canvas instanceof HTMLCanvasElement
        ? await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG'))), 'image/png'))
        : await canvas.convertToBlob({ type: 'image/png' });
    const base = media.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${base} (quadro ${time.toFixed(2)}s).png`, { type: 'image/png' });
  } finally {
    input.dispose();
  }
}
