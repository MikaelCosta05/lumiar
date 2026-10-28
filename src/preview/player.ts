import type { Renderer } from '../engine/renderer';
import { assets } from '../media/assets';
import { drawTexts } from '../media/textRender';
import { buildVoiceChain, type VoiceChain } from '../media/voiceFx';
import {
  audioAt,
  layoutProject,
  resolveFrame,
  speedOf,
  toFrameInput,
  type FrameState,
  type Project,
  type TimelineLayout,
  type VoiceEffect,
} from '../project/model';

/** Diferença máxima (s) entre a mídia e o relógio do player antes de corrigir. */
const MAX_DRIFT = 0.25;
/** Quanto antes (s) o próximo clipe já é posicionado no ponto certo. */
const PREROLL = 1;

/**
 * Toca a timeline em tempo real. Cada clipe de vídeo/áudio tem um elemento
 * <video>/<audio> escondido que só decodifica; a imagem é sempre desenhada
 * pelo Renderer e o som passa por um ganho do Web Audio (volume, fades e crossfade).
 */
export class Player {
  private project!: Project;
  private timeline!: TimelineLayout;
  private readonly videos = new Map<string, HTMLVideoElement>();
  private readonly audios = new Map<string, HTMLAudioElement>();
  private readonly gains = new Map<HTMLMediaElement, GainNode>();
  private readonly frameInfo = new Map<HTMLVideoElement, { time: number; previous: number; fresh: boolean }>();
  private readonly audioContext = new AudioContext();
  /** Volume geral (silencia o projeto enquanto grava a narração). */
  private readonly master = this.audioContext.createGain();
  private readonly elementSources = new Map<HTMLMediaElement, MediaElementAudioSourceNode>();
  private readonly voices = new Map<HTMLMediaElement, { effect: VoiceEffect; chain: VoiceChain | null }>();
  private readonly container: HTMLDivElement;
  private readonly textCanvas = document.createElement('canvas');
  private time = 0;
  private playing = false;
  private clockStart = 0;
  private timeAtStart = 0;
  private frameRequest = 0;
  private renderQueued = false;
  /** Tocar as cópias leves (proxies) em vez dos arquivos originais */
  private proxies = false;

  onTime?: (time: number) => void;
  onPlayingChange?: (playing: boolean) => void;

  constructor(private readonly renderer: Renderer) {
    this.container = document.createElement('div');
    this.container.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
    document.body.appendChild(this.container);
    this.master.connect(this.audioContext.destination);
  }

  /** Prévia leve: troca os vídeos pelas cópias em 540p (as que já existem). */
  setProxies(enabled: boolean): void {
    if (this.proxies === enabled) return;
    this.proxies = enabled;
    this.refreshSources();
  }

  /** Recarrega os vídeos (uma cópia leve acabou de ficar pronta). */
  refreshSources(): void {
    if (this.project) this.setProject(this.project);
  }

  /** Liga/desliga o som do projeto (o preview continua tocando). */
  setMuted(muted: boolean): void {
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.audioContext.currentTime, 0.02);
  }

  get duration(): number {
    return this.timeline?.duration ?? 0;
  }

  get currentTime(): number {
    return this.time;
  }

  setProject(project: Project): void {
    this.project = project;
    this.timeline = layoutProject(project);
    this.renderer.setSize(project.width, project.height);

    const videoClips = [...this.timeline.clips, ...this.timeline.overlays].filter((l) => l.media.kind === 'video');
    const url = (media: { id: string; url: string }) => (this.proxies && assets.proxies.get(media.id)) || media.url;
    this.syncElements(this.videos, new Map(videoClips.map((l) => [l.clip.id, url(l.media)])), 'video');
    const audioClips = project.audioTracks.flatMap((t) => t.clips);
    const urls = new Map(project.media.map((m) => [m.id, m.url]));
    this.syncElements(
      this.audios,
      new Map(audioClips.filter((c) => urls.has(c.mediaId)).map((c) => [c.id, urls.get(c.mediaId)!])),
      'audio',
    );

    // Efeitos de voz dos clipes de áudio.
    for (const clip of audioClips) {
      const el = this.audios.get(clip.id);
      if (el) this.applyVoice(el, clip.voice ?? 'none');
    }

    if (this.playing) {
      if (this.time >= this.duration) this.pause();
    } else {
      this.seek(Math.min(this.time, this.duration));
    }
  }

  play(): void {
    if (this.playing || this.duration <= 0) return;
    void this.audioContext.resume();
    if (this.time >= this.duration - 0.01) this.time = 0;
    this.playing = true;
    this.timeAtStart = this.time;
    this.clockStart = performance.now();
    this.onPlayingChange?.(true);
    this.frameRequest = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.frameRequest);
    this.videos.forEach((v) => v.pause());
    this.audios.forEach((a) => a.pause());
    this.onPlayingChange?.(false);
    this.seek(this.time);
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(time: number): void {
    this.time = Math.min(Math.max(0, time), this.duration);
    if (this.playing) {
      this.timeAtStart = this.time;
      this.clockStart = performance.now();
    }
    this.sync();
    this.onTime?.(this.time);
    this.requestRender();
  }

  dispose(): void {
    this.playing = false;
    cancelAnimationFrame(this.frameRequest);
    for (const el of [...this.videos.values(), ...this.audios.values()]) this.removeElement(el);
    this.videos.clear();
    this.audios.clear();
    this.container.remove();
    void this.audioContext.close();
  }

  private tick = (now: number): void => {
    if (!this.playing) return;
    const t = this.timeAtStart + (now - this.clockStart) / 1000;
    if (t >= this.duration) {
      this.time = this.duration;
      this.pause();
      return;
    }
    this.time = t;
    this.render(this.sync());
    this.onTime?.(t);
    this.frameRequest = requestAnimationFrame(this.tick);
  };

  /** Deixa cada elemento de mídia no ponto certo (tocando ou pausado) e com o volume certo. */
  private sync(): FrameState {
    const t = this.time;
    const frame = resolveFrame(this.project, this.timeline, t);
    // Depois do fim do vídeo (com áudio ainda tocando) o último quadro fica parado.
    const holding = t >= this.timeline.videoDuration;
    const visible = new Map<string, number>();
    for (const active of [frame.a, frame.b, ...frame.overlays.map((o) => o.active)]) {
      if (active && active.layout.media.kind === 'video') visible.set(active.layout.clip.id, active.sourceTime);
    }
    const sounds = new Map(audioAt(this.project, this.timeline, t).map((s) => [s.clipId, s]));

    for (const layout of this.timeline.clips) {
      const video = this.videos.get(layout.clip.id);
      if (!video) continue;
      this.setGain(video, sounds.get(layout.clip.id)?.gain ?? 0);
      const target = visible.get(layout.clip.id);
      if (target === undefined) this.idle(video, layout.start, layout.clip.trimIn);
      else this.follow(video, target, holding, speedOf(layout.clip));
    }

    for (const layout of this.timeline.overlays) {
      const video = this.videos.get(layout.clip.id);
      if (!video) continue;
      this.setGain(video, sounds.get(layout.clip.id)?.gain ?? 0);
      const target = visible.get(layout.clip.id);
      if (target === undefined) this.idle(video, layout.start, layout.clip.trimIn);
      else this.follow(video, target, false, speedOf(layout.clip));
    }

    for (const track of this.project.audioTracks) {
      for (const clip of track.clips) {
        const audio = this.audios.get(clip.id);
        if (!audio) continue;
        const sound = sounds.get(clip.id);
        this.setGain(audio, sound?.gain ?? 0);
        if (!sound) this.idle(audio, clip.start, clip.trimIn);
        else this.follow(audio, sound.sourceTime, false, sound.speed);
      }
    }
    return frame;
  }

  /** Mídia que precisa estar no instante `target` agora, tocando na velocidade do clipe. */
  private follow(el: HTMLMediaElement, target: number, hold: boolean, speed: number): void {
    if (el.playbackRate !== speed) {
      el.playbackRate = speed;
      // Igual à exportação: câmera lenta deixa o som mais grave, acelerado mais agudo.
      el.preservesPitch = false;
    }
    if (this.playing && !hold) {
      if (el.paused) {
        if (Math.abs(el.currentTime - target) > 0.1) el.currentTime = target;
        el.play().catch(() => {});
      } else if (Math.abs(el.currentTime - target) > MAX_DRIFT * Math.max(1, speed)) {
        el.currentTime = target;
      }
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - target) > 0.001) el.currentTime = target;
    }
  }

  /** Mídia fora de cena: pausa e, se vai entrar logo, já deixa no ponto de início. */
  private idle(el: HTMLMediaElement, start: number, trimIn: number): void {
    if (!el.paused) el.pause();
    const startsSoon = start > this.time && start - this.time < PREROLL;
    if (startsSoon && !el.seeking && Math.abs(el.currentTime - trimIn) > 0.05) el.currentTime = trimIn;
  }

  private setGain(el: HTMLMediaElement, value: number): void {
    const gain = this.gains.get(el);
    if (gain) gain.gain.setTargetAtTime(Math.max(0, value), this.audioContext.currentTime, 0.015);
  }

  private requestRender(): void {
    if (this.renderQueued || this.playing) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render(resolveFrame(this.project, this.timeline, this.time));
    });
  }

  /** Redesenha o quadro atual (ex.: depois que as fontes terminaram de carregar). */
  refresh(): void {
    this.requestRender();
  }

  private render(state: FrameState): void {
    const frame = toFrameInput(state, (active) => {
      const { clip, media } = active.layout;
      if (media.kind === 'image') return { source: assets.bitmaps.get(media.id) ?? null };
      const video = this.videos.get(clip.id);
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return { source: null };

      // Câmera lenta suave: entre dois quadros do vídeo, cria os intermediários.
      const mode = clip.interpolation ?? 'flow';
      const info = this.frameInfo.get(video);
      if (mode === 'none' || speedOf(clip) >= 1 || !this.playing || !info || info.previous < 0) {
        return { source: video };
      }
      const fresh = info.fresh;
      info.fresh = false;
      const span = info.time - info.previous;
      // Mostra com um quadro de atraso, para sempre ter o quadro anterior e o seguinte.
      const alpha = span > 0 ? Math.min(1, Math.max(0, (active.sourceTime - span - info.previous) / span)) : 1;
      return {
        source: fresh ? video : null,
        interpolation: { mode, alpha, previous: fresh ? 'shift' : null },
      };
    }, this.project.background);
    if (drawTexts(this.textCanvas, this.project, this.time)) frame.overlay = this.textCanvas;
    this.renderer.render(frame);
  }

  private syncElements<T extends HTMLMediaElement>(
    elements: Map<string, T>,
    wanted: Map<string, string>,
    tag: 'video' | 'audio',
  ): void {
    for (const [id, el] of elements) {
      if (wanted.get(id) === el.src) continue;
      this.removeElement(el);
      elements.delete(id);
    }
    for (const [id, url] of wanted) {
      if (elements.has(id)) continue;
      const el = document.createElement(tag) as T;
      el.src = url;
      el.preload = 'auto';
      if (el instanceof HTMLVideoElement) {
        el.playsInline = true;
        // Ao terminar de buscar um quadro (pausado), redesenha a tela.
        el.addEventListener('seeked', () => this.requestRender());
        el.addEventListener('loadeddata', () => this.requestRender());
        // Anota o instante de cada quadro novo (usado na câmera lenta suave).
        const info = { time: 0, previous: -1, fresh: false };
        this.frameInfo.set(el, info);
        el.addEventListener('seeking', () => {
          info.previous = -1;
          info.fresh = false;
        });
        const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
          info.previous = info.time;
          info.time = meta.mediaTime;
          info.fresh = true;
          el.requestVideoFrameCallback(onFrame);
        };
        el.requestVideoFrameCallback(onFrame);
      }
      const gain = this.audioContext.createGain();
      gain.gain.value = 0;
      const source = this.audioContext.createMediaElementSource(el);
      source.connect(gain).connect(this.master);
      this.elementSources.set(el, source);
      this.gains.set(el, gain);
      this.container.appendChild(el);
      elements.set(id, el);
    }
  }

  private removeElement(el: HTMLMediaElement): void {
    el.pause();
    el.remove();
    this.gains.get(el)?.disconnect();
    this.gains.delete(el);
    this.voices.get(el)?.chain?.stop();
    this.voices.delete(el);
    this.elementSources.delete(el);
  }

  /** Refaz as ligações elemento → efeito de voz → volume quando o efeito muda. */
  private applyVoice(el: HTMLMediaElement, effect: VoiceEffect): void {
    const current = this.voices.get(el);
    if ((current?.effect ?? 'none') === effect) return;
    const source = this.elementSources.get(el);
    const gain = this.gains.get(el);
    if (!source || !gain) return;
    source.disconnect();
    current?.chain?.stop();
    current?.chain?.output.disconnect();
    const chain = buildVoiceChain(this.audioContext, effect);
    if (chain) {
      source.connect(chain.input);
      chain.output.connect(gain);
    } else {
      source.connect(gain);
    }
    this.voices.set(el, { effect, chain });
  }
}
