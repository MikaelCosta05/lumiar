import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  canEncodeAudio,
  canEncodeVideo,
  CanvasSource,
  Input,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  QUALITY_VERY_HIGH,
  VideoSampleSink,
  WavOutputFormat,
  WebMOutputFormat,
  type AudioCodec,
  type Quality,
  type VideoCodec,
  type VideoSample,
} from 'mediabunny';
import { Renderer, type LayerInput } from '../engine/renderer';
import {
  clipLength,
  DUCK_RAMP,
  getMedia,
  voiceIntervals,
  type VoiceEffect,
  layoutProject,
  resolveFrame,
  speedOf,
  toFrameInput,
  type FrameState,
  type MediaItem,
  type Project,
  type TimelineLayout,
  type VideoClip,
} from '../project/model';
import { assets } from './assets';
import { loadFonts } from './fonts';
import { GifEncoder } from './gif';
import { buildVoiceChain } from './voiceFx';
import { drawTexts } from './textRender';

export interface ExportProgress {
  stage: string;
  /** 0 → 1 */
  fraction: number;
}

export type ExportFormat = 'mp4' | 'webm' | 'mov' | 'gif' | 'wav' | 'm4a';
export type ExportQuality = 'low' | 'medium' | 'high' | 'very-high';

export interface ExportSettings {
  format: ExportFormat;
  /** Lado menor da saída (o outro segue a proporção do projeto). null = o do projeto. */
  height: number | null;
  /** null = a do projeto */
  fps: number | null;
  quality: ExportQuality;
  /** Trecho da timeline (s). null = tudo. */
  range: { start: number; end: number } | null;
}

export const FORMAT_INFO: Record<ExportFormat, { label: string; extension: string; mime: string; video: boolean; hint: string }> = {
  mp4: { label: 'MP4', extension: 'mp4', mime: 'video/mp4', video: true, hint: 'H.264 · abre em qualquer lugar' },
  webm: { label: 'WebM', extension: 'webm', mime: 'video/webm', video: true, hint: 'VP9 · ótimo para a web' },
  mov: { label: 'MOV', extension: 'mov', mime: 'video/quicktime', video: true, hint: 'H.264 · para editores e Apple' },
  gif: { label: 'GIF', extension: 'gif', mime: 'image/gif', video: true, hint: 'Animação sem som, em loop' },
  wav: { label: 'WAV', extension: 'wav', mime: 'audio/wav', video: false, hint: 'Só o áudio, sem perdas' },
  m4a: { label: 'M4A', extension: 'm4a', mime: 'audio/mp4', video: false, hint: 'Só o áudio, compactado (AAC)' },
};

const QUALITIES: Record<ExportQuality, Quality> = {
  low: QUALITY_LOW,
  medium: QUALITY_MEDIUM,
  high: QUALITY_HIGH,
  'very-high': QUALITY_VERY_HIGH,
};

export interface ExportOptions {
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}

/**
 * Tamanho de saída com a proporção do projeto (sempre par, exigência dos codificadores).
 * "short" é o lado menor: 1080p num projeto vertical vira 1080×1920.
 */
export function outputSize(project: Project, short: number | null): { width: number; height: number } {
  const projectShort = Math.min(project.width, project.height);
  if (!short || short === projectShort) return { width: project.width, height: project.height };
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  const scale = short / projectShort;
  return { width: even(project.width * scale), height: even(project.height * scale) };
}

/**
 * Renderiza a timeline quadro a quadro com o MESMO Renderer do preview
 * (então o resultado é idêntico ao que se vê na tela) e grava no formato escolhido.
 */
export async function exportProject(project: Project, settings: ExportSettings, options: ExportOptions = {}): Promise<Blob> {
  const { onProgress, signal } = options;
  const timeline = layoutProject(project);
  if (timeline.duration <= 0) throw new Error('A timeline está vazia.');
  const start = Math.max(0, settings.range?.start ?? 0);
  const end = Math.min(timeline.duration, settings.range?.end ?? timeline.duration);
  if (end - start < 0.05) throw new Error('O trecho escolhido é curto demais.');
  const info = FORMAT_INFO[settings.format];

  if (!info.video) return exportAudioOnly(project, timeline, settings, start, end, options);

  const { width, height } = outputSize(project, settings.height);
  const fps = settings.fps ?? project.fps;
  const gif = settings.format === 'gif';
  const quality = QUALITIES[settings.quality];

  let videoCodec: VideoCodec = 'avc';
  if (!gif) {
    const candidates: VideoCodec[] = settings.format === 'webm' ? ['vp9', 'vp8', 'av1'] : ['avc', 'hevc'];
    const found = await firstSupported(candidates, (c) => canEncodeVideo(c, { width, height, bitrate: quality }));
    if (!found) throw new Error(`Este navegador não consegue gerar ${info.label} em ${width}×${height}.`);
    videoCodec = found;
  }

  // 1. Quais instantes de cada vídeo serão necessários, quadro a quadro.
  const frameCount = Math.max(1, Math.round((end - start) * fps));
  const states: FrameState[] = [];
  const timestampsByClip = new Map<string, number[]>();
  const firstTimeByClip = new Map<string, number>();
  for (let k = 0; k < frameCount; k++) {
    const state = resolveFrame(project, timeline, start + k / fps);
    states.push(state);
    for (const active of visibleClips(state)) {
      if (active.layout.media.kind !== 'video') continue;
      const id = active.layout.clip.id;
      if (!timestampsByClip.has(id)) timestampsByClip.set(id, []);
      timestampsByClip.get(id)!.push(active.sourceTime);
      if (!firstTimeByClip.has(id)) firstTimeByClip.set(id, active.sourceTime);
    }
  }

  // 2. Todo o áudio mixado (vídeos + trilhas de áudio), recortado no trecho.
  let audio: AudioBuffer | null = null;
  if (!gif) {
    onProgress?.({ stage: 'Mixando o áudio', fraction: 0 });
    audio = sliceAudio(await mixAudio(project, timeline), start, end);
    throwIfAborted(signal);
  }

  // 3. Saída.
  const scaled = { ...project, width, height };
  const canvas = document.createElement('canvas');
  const renderer = new Renderer(canvas, width, height);
  const textCanvas = document.createElement('canvas');
  await loadFonts();

  let output: Output | null = null;
  let videoSource: CanvasSource | null = null;
  let gifEncoder: GifEncoder | null = null;
  let readback: CanvasRenderingContext2D | null = null;
  if (gif) {
    gifEncoder = new GifEncoder(width, height);
    const copy = document.createElement('canvas');
    copy.width = width;
    copy.height = height;
    readback = copy.getContext('2d', { willReadFrequently: true });
  } else {
    const format =
      settings.format === 'webm'
        ? new WebMOutputFormat()
        : settings.format === 'mov'
          ? new MovOutputFormat({ fastStart: 'in-memory' })
          : new Mp4OutputFormat({ fastStart: 'in-memory' });
    output = new Output({ format, target: new BufferTarget() });
    videoSource = new CanvasSource(canvas, { codec: videoCodec, bitrate: quality });
    output.addVideoTrack(videoSource, { frameRate: fps });
  }

  let audioSource: AudioBufferSource | null = null;
  if (output && audio) {
    const codec = await pickAudioCodec(settings.format, audio.sampleRate);
    audioSource = new AudioBufferSource({ codec, bitrate: quality });
    output.addAudioTrack(audioSource);
  }

  const inputs: Input[] = [];
  const streams = new Map<string, AsyncGenerator<VideoSample | null, void, unknown>>();
  const windows = new Map<string, FrameWindow>();
  const current = new Map<string, VideoSample>();

  try {
    if (output) await output.start();
    if (audioSource && audio) {
      await audioSource.add(audio);
      audioSource.close();
    }

    for (const layout of [...timeline.clips, ...timeline.overlays]) {
      const timestamps = timestampsByClip.get(layout.clip.id);
      if (!timestamps) continue;
      const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(layout.media.file) });
      inputs.push(input);
      const track = await input.getPrimaryVideoTrack();
      if (!track) continue;
      // Alguns arquivos começam um pouco depois de 0s; antes disso não existe quadro.
      const first = await track.getFirstTimestamp();
      const sink = new VideoSampleSink(track);
      if (isSmoothSlowMotion(layout.clip)) {
        windows.set(layout.clip.id, new FrameWindow(sink, Math.max(first, firstTimeByClip.get(layout.clip.id)! - 0.1)));
      } else {
        streams.set(layout.clip.id, sink.samplesAtTimestamps(timestamps.map((t) => Math.max(t, first))));
      }
    }

    for (let k = 0; k < frameCount; k++) {
      throwIfAborted(signal);
      const state = states[k];

      // Puxa o quadro de cada vídeo visível (e o seguinte, na câmera lenta suave) e envia para a GPU.
      const frames = new Map<string, VideoFrame>();
      const layerSources = new Map<string, Pick<LayerInput, 'source' | 'interpolation'>>();
      for (const active of visibleClips(state)) {
        if (active.layout.media.kind !== 'video') continue;
        const { clip } = active.layout;
        const window = windows.get(clip.id);
        if (window) {
          const { a, b } = await window.at(active.sourceTime);
          if (!a) continue;
          const prev = a.toVideoFrame();
          frames.set(`${clip.id}:a`, prev);
          if (!b) {
            layerSources.set(clip.id, { source: prev });
            continue;
          }
          const next = b.toVideoFrame();
          frames.set(`${clip.id}:b`, next);
          const alpha = Math.min(1, Math.max(0, (active.sourceTime - a.timestamp) / Math.max(1e-6, b.timestamp - a.timestamp)));
          layerSources.set(clip.id, {
            source: next,
            interpolation: { mode: clip.interpolation === 'blend' ? 'blend' : 'flow', alpha, previous: prev },
          });
          continue;
        }
        const result = await streams.get(clip.id)?.next();
        const sample = result && !result.done ? result.value : null;
        // O mesmo quadro pode vir repetido (vídeo com fps menor que o do projeto).
        if (!sample || sample === current.get(clip.id)) continue;
        current.get(clip.id)?.close();
        current.set(clip.id, sample);
        const videoFrame = sample.toVideoFrame();
        frames.set(clip.id, videoFrame);
        layerSources.set(clip.id, { source: videoFrame });
      }

      const frame = toFrameInput(state, (active) =>
        active.layout.media.kind === 'image'
          ? { source: assets.bitmaps.get(active.layout.media.id) ?? null }
          : (layerSources.get(active.layout.clip.id) ?? { source: null }),
        project.background,
      );
      if (drawTexts(textCanvas, scaled, start + k / fps)) frame.overlay = textCanvas;
      renderer.render(frame);
      frames.forEach((f) => f.close());

      if (gifEncoder && readback) {
        readback.drawImage(canvas, 0, 0);
        gifEncoder.addFrame(readback.getImageData(0, 0, width, height).data, 100 / fps);
        // Deixa a interface respirar: o GIF é codificado aqui mesmo.
        if (k % 4 === 3) await new Promise((r) => setTimeout(r, 0));
      } else if (videoSource) {
        await videoSource.add(k / fps, 1 / fps);
      }
      onProgress?.({ stage: gif ? 'Criando o GIF' : 'Renderizando o vídeo', fraction: (k + 1) / frameCount });
    }

    onProgress?.({ stage: 'Finalizando o arquivo', fraction: 1 });
    if (gifEncoder) return gifEncoder.finish();
    videoSource!.close();
    await output!.finalize();
    return new Blob([(output!.target as BufferTarget).buffer!], { type: info.mime });
  } catch (error) {
    await output?.cancel().catch(() => {});
    throw error;
  } finally {
    current.forEach((s) => s.close());
    for (const stream of streams.values()) await stream.return?.().catch(() => {});
    for (const window of windows.values()) await window.close().catch(() => {});
    inputs.forEach((i) => i.dispose());
    renderer.dispose();
  }
}

/** Exporta só o som do trecho (WAV sem perdas ou M4A compactado). */
async function exportAudioOnly(
  project: Project,
  timeline: TimelineLayout,
  settings: ExportSettings,
  start: number,
  end: number,
  { onProgress, signal }: ExportOptions,
): Promise<Blob> {
  onProgress?.({ stage: 'Mixando o áudio', fraction: 0.2 });
  const audio = sliceAudio(await mixAudio(project, timeline), start, end);
  throwIfAborted(signal);
  if (!audio) throw new Error('O projeto não tem nenhum som para exportar.');
  const wav = settings.format === 'wav';
  const output = new Output({
    format: wav ? new WavOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const codec: AudioCodec = wav ? 'pcm-s16' : await pickAudioCodec('m4a', audio.sampleRate);
  const source = new AudioBufferSource({ codec, bitrate: QUALITIES[settings.quality] });
  output.addAudioTrack(source);
  onProgress?.({ stage: 'Gravando o áudio', fraction: 0.6 });
  await output.start();
  await source.add(audio);
  source.close();
  await output.finalize();
  onProgress?.({ stage: 'Finalizando o arquivo', fraction: 1 });
  return new Blob([(output.target as BufferTarget).buffer!], { type: FORMAT_INFO[settings.format].mime });
}

async function pickAudioCodec(format: ExportFormat, sampleRate: number): Promise<AudioCodec> {
  const candidates: AudioCodec[] = format === 'webm' ? ['opus', 'vorbis'] : ['aac', 'opus'];
  const found = await firstSupported(candidates, (c) => canEncodeAudio(c, { numberOfChannels: 2, sampleRate }));
  if (!found) throw new Error('Este navegador não consegue codificar o áudio neste formato.');
  return found;
}

async function firstSupported<T>(candidates: T[], test: (c: T) => Promise<boolean>): Promise<T | null> {
  for (const c of candidates) if (await test(c).catch(() => false)) return c;
  return null;
}

/** Tudo o que aparece no quadro (trilha principal e camadas sobrepostas). */
function visibleClips(state: FrameState) {
  return [state.a, state.b, ...state.overlays.map((o) => o.active)].filter((a): a is NonNullable<typeof a> => !!a);
}

/** Recorta o áudio mixado no trecho exportado. */
function sliceAudio(buffer: AudioBuffer | null, start: number, end: number): AudioBuffer | null {
  if (!buffer) return null;
  if (start <= 0 && end * buffer.sampleRate >= buffer.length - 1) return buffer;
  const from = Math.floor(start * buffer.sampleRate);
  const length = Math.max(1, Math.min(buffer.length - from, Math.ceil((end - start) * buffer.sampleRate)));
  const sliced = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length, sampleRate: buffer.sampleRate });
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    sliced.copyToChannel(buffer.getChannelData(ch).subarray(from, from + length), ch);
  }
  return sliced;
}

/** Envelope de volume de um clipe com fades: pontos [tempo, ganho]. */
function fadeEnvelope(start: number, length: number, volume: number, fadeIn: number, fadeOut: number): [number, number][] {
  const end = start + length;
  return [
    [start, fadeIn > 0 ? 0 : volume],
    [start + Math.min(fadeIn, length), volume],
    [end - Math.min(fadeOut, length), volume],
    [end, fadeOut > 0 ? 0 : volume],
  ];
}


export async function mixAudio(project: Project, timeline: TimelineLayout): Promise<AudioBuffer | null> {
  const sampleRate = 48000;
  const context = new OfflineAudioContext(2, Math.ceil(timeline.duration * sampleRate), sampleRate);
  const decoded = new Map<string, Promise<AudioBuffer | null>>();
  const decode = (media: MediaItem) => {
    if (!decoded.has(media.id)) {
      decoded.set(
        media.id,
        media.file
          .arrayBuffer()
          .then((data) => context.decodeAudioData(data))
          .catch(() => {
            console.warn(`[Lumiar] não foi possível ler o áudio de "${media.name}"`);
            return null;
          }),
      );
    }
    return decoded.get(media.id)!;
  };

  /** Agenda um trecho de áudio com envelope de volume (pontos [tempo, ganho]). */
  const schedule = async (
    media: MediaItem,
    start: number,
    offset: number,
    length: number,
    speed: number,
    envelope: [number, number][],
    voice?: VoiceEffect,
    target: AudioNode = context.destination,
  ) => {
    const buffer = await decode(media);
    if (!buffer || length <= 0) return false;
    const source = context.createBufferSource();
    source.buffer = buffer;
    // Velocidade muda também o tom, igual ao preview.
    source.playbackRate.value = speed;
    const gain = context.createGain();
    const chain = buildVoiceChain(context, voice);
    if (chain) {
      source.connect(chain.input);
      chain.output.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(target);
    gain.gain.setValueAtTime(envelope[0][1], start);
    for (const [time, value] of envelope.slice(1)) gain.gain.linearRampToValueAtTime(value, time);
    // A duração aqui é medida no arquivo, não na timeline.
    source.start(start, offset, length * speed);
    return true;
  };

  let added = 0;
  for (const layout of timeline.clips) {
    const { clip, media } = layout;
    if (!media.hasAudio || clip.audioDetached || clip.volume <= 0) continue;
    const start = layout.start;
    const end = start + layout.length;
    const v = clip.volume;
    const envelope: [number, number][] = [
      [start, layout.transitionIn > 0 ? 0 : v],
      [start + layout.transitionIn, v],
      [end - layout.transitionOut, v],
      [end, layout.transitionOut > 0 ? 0 : v],
    ];
    if (await schedule(media, start, clip.trimIn, layout.length, speedOf(clip), envelope)) added++;
  }

  // Som dos vídeos das trilhas extras.
  for (const layout of timeline.overlays) {
    const { clip, media } = layout;
    if (!media.hasAudio || clip.audioDetached || clip.volume <= 0 || project.videoTracks[layout.track]?.muted) continue;
    const envelope = fadeEnvelope(layout.start, layout.length, clip.volume, clip.fadeIn, clip.fadeOut);
    if (await schedule(media, layout.start, clip.trimIn, layout.length, speedOf(clip), envelope)) added++;
  }

  // Trilhas de música abaixam sozinhas enquanto há voz.
  const voices = voiceIntervals(project);
  const level = project.duckLevel ?? 0.3;
  for (const track of project.audioTracks) {
    if (track.muted) continue;
    let target: AudioNode = context.destination;
    if (track.kind === 'music' && voices.length) {
      const duck = context.createGain();
      duck.gain.setValueAtTime(1, 0);
      for (const [a, b] of voices) {
        duck.gain.setValueAtTime(1, Math.max(0, a - DUCK_RAMP));
        duck.gain.linearRampToValueAtTime(level, Math.max(0.001, a));
        duck.gain.setValueAtTime(level, b);
        duck.gain.linearRampToValueAtTime(1, b + DUCK_RAMP);
      }
      duck.connect(context.destination);
      target = duck;
    }
    for (const clip of track.clips) {
      const media = getMedia(project, clip.mediaId);
      if (!media || clip.volume <= 0) continue;
      const length = clipLength(clip);
      const envelope = fadeEnvelope(clip.start, length, clip.volume, clip.fadeIn, clip.fadeOut);
      if (await schedule(media, clip.start, clip.trimIn, length, speedOf(clip), envelope, clip.voice, target)) added++;
    }
  }
  return added > 0 ? context.startRendering() : null;
}

function isSmoothSlowMotion(clip: VideoClip): boolean {
  return speedOf(clip) < 1 && (clip.interpolation ?? 'flow') !== 'none';
}

/**
 * Lê o vídeo em sequência e mantém sempre o par de quadros em volta do instante pedido
 * (o anterior "a" e o seguinte "b"), para criar o quadro intermediário da câmera lenta.
 */
class FrameWindow {
  private readonly iterator: AsyncGenerator<VideoSample, void, unknown>;
  private a: VideoSample | null = null;
  private b: VideoSample | null = null;
  private started = false;
  private finished = false;

  constructor(sink: VideoSampleSink, start: number) {
    this.iterator = sink.samples(start);
  }

  async at(t: number): Promise<{ a: VideoSample | null; b: VideoSample | null }> {
    if (!this.started) {
      this.started = true;
      this.a = await this.next();
      this.b = await this.next();
    }
    while (this.b && this.b.timestamp <= t) {
      this.a?.close();
      this.a = this.b;
      this.b = await this.next();
    }
    return { a: this.a, b: this.b };
  }

  async close(): Promise<void> {
    this.a?.close();
    this.b?.close();
    await this.iterator.return?.();
  }

  private async next(): Promise<VideoSample | null> {
    if (this.finished) return null;
    const result = await this.iterator.next();
    if (result.done) {
      this.finished = true;
      return null;
    }
    return result.value;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Exportação cancelada.', 'AbortError');
}
