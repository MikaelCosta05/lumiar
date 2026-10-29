import type { LayerInput, Renderer } from '../engine/renderer';
import { assets } from '../media/assets';
import { drawTexts } from '../media/textRender';
import { onElementData } from '../media/elementData';
import { onSegmenterReady, segmentFrame } from '../media/segment';
import { objectOrPerson } from '../media/objectSelect';
import { depthFrame, onDepthReady } from '../media/depthVideo';
import { hasBehindText } from '../project/text';
import { prerenderCache } from './prerenderCache';
import { PrerenderPlayback } from './prerenderPlayback';
import { buildAudioChain, type VoiceChain } from '../media/voiceFx';
import { MixerBus } from './mixerBus';
import {
  audioAt,
  layoutProject,
  resolveFrame,
  speedOf,
  toFrameInput,
  type ActiveClip,
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
  /** Mixer: canal de cada trilha (volume, solo, pan e medidores) e o Master, antes do volume geral. */
  readonly mixer = new MixerBus(this.audioContext, this.master);
  private readonly elementSources = new Map<HTMLMediaElement, MediaElementAudioSourceNode>();
  private readonly voices = new Map<HTMLMediaElement, { effect: string; chain: VoiceChain | null }>();
  private readonly container: HTMLDivElement;
  private readonly textCanvas = document.createElement('canvas');
  private readonly behindCanvas = document.createElement('canvas');
  private time = 0;
  private playing = false;
  private clockStart = 0;
  private timeAtStart = 0;
  private frameRequest = 0;
  private renderQueued = false;
  /** Tocar as cópias leves (proxies) em vez dos arquivos originais */
  private proxies = false;
  /** Velocidade de reprodução (J/K/L): 1 normal, 2 e 4 rápido, negativo = para trás */
  private rate = 1;
  /** Trechos pré-renderizados: tocam de um vídeo pronto em vez de renderizar ao vivo */
  private readonly prerender: PrerenderPlayback;

  onTime?: (time: number) => void;
  onPlayingChange?: (playing: boolean) => void;

  constructor(private readonly renderer: Renderer) {
    this.container = document.createElement('div');
    this.container.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
    document.body.appendChild(this.container);
    this.master.connect(this.audioContext.destination);
    // O modelo de recorte de fundo terminou de carregar: redesenha com a máscara.
    onSegmenterReady(() => this.requestRender());
    // Profundidade de um quadro ficou pronta (efeitos de céu, foco e neblina).
    onDepthReady(() => this.requestRender());
    // Mapa-múndi ou análise do som chegaram: os elementos animados podem ser desenhados.
    onElementData(() => this.requestRender());
    this.prerender = new PrerenderPlayback(renderer, () => {
      if (this.project) this.requestRender();
    });
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
    // Confere quais trechos pré-renderizados ainda valem com o projeto novo.
    prerenderCache.check(project, this.timeline);
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
      if (el) this.applyVoice(el, clip.voice ?? 'none', clip.eq);
    }

    // Mixer: o som de cada clipe entra no canal da sua trilha.
    const routed: [string, AudioNode][] = [];
    for (const [id, el] of [...this.videos, ...this.audios]) {
      const gain = this.gains.get(el);
      if (gain) routed.push([id, gain]);
    }
    this.mixer.apply(project, routed);

    if (this.playing) {
      if (this.time >= this.duration) this.pause();
    } else {
      this.seek(Math.min(this.time, this.duration));
    }
  }

  /** Toca para frente (rate > 0) ou para trás (rate < 0), como J/K/L nos editores profissionais. */
  shuttle(rate: number): void {
    this.rate = rate;
    if (this.playing) {
      this.timeAtStart = this.time;
      this.clockStart = performance.now();
    } else {
      this.startPlaying();
    }
  }

  get playbackRate(): number {
    return this.playing ? this.rate : 0;
  }

  play(): void {
    this.rate = 1;
    this.startPlaying();
  }

  private startPlaying(): void {
    if (this.playing || this.duration <= 0) return;
    void this.audioContext.resume();
    if (this.rate > 0 && this.time >= this.duration - 0.01) this.time = 0;
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
    this.rate = 1;
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
    this.prerender.dispose();
    this.container.remove();
    void this.audioContext.close();
  }

  private tick = (now: number): void => {
    if (!this.playing) return;
    const t = this.timeAtStart + ((now - this.clockStart) / 1000) * this.rate;
    if (t >= this.duration || t <= 0) {
      this.time = Math.min(this.duration, Math.max(0, t));
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
    const rate = Math.min(16, speed * Math.max(1, this.rate));
    if (el.playbackRate !== rate) {
      el.playbackRate = rate;
      // Igual à exportação: câmera lenta deixa o som mais grave, acelerado mais agudo.
      el.preservesPitch = false;
    }
    // Para trás não dá para tocar a mídia: cada quadro é buscado (sem som).
    if (this.playing && this.rate > 0 && !hold) {
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
    // Trecho pré-renderizado: o quadro vem pronto do vídeo guardado (o som continua pelo sync, igual).
    const ready = this.prerender.frame(this.time, this.playing ? this.rate : 0);
    if (ready) {
      this.renderer.render(ready);
      return;
    }
    const behind = hasBehindText(this.project, this.time);
    const frame = toFrameInput(
      state,
      (active, needs) => {
        const { clip, media } = active.layout;
        const provided = this.provideSource(active);
        if (!needs.person && !needs.depth) return provided;
        // A máscara da pessoa e a profundidade saem do mesmo quadro que está na tela.
        const element = media.kind === 'image' ? assets.bitmaps.get(media.id) : this.videos.get(clip.id);
        const ready = element && (!(element instanceof HTMLVideoElement) || element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
        if (!ready) return provided;
        const time = element instanceof HTMLVideoElement ? element.currentTime : 0;
        const key = `${clip.id}:${media.kind === 'image' ? 'foto' : time.toFixed(3)}`;
        return {
          ...provided,
          // Com "Recorte: objeto selecionado", a máscara do objeto entra no lugar da pessoa.
          mask: needs.person ? objectOrPerson(clip, time, () => segmentFrame(element, media.width, media.height, key)) : null,
          depth: needs.depth ? depthFrame(element, media.width, media.height, clip.id, key) : null,
        };
      },
      this.project.background,
      this.project.luts,
      behind,
    );
    if (behind && drawTexts(this.behindCanvas, this.project, this.time, 'behind')) frame.behind = this.behindCanvas;
    if (drawTexts(this.textCanvas, this.project, this.time)) frame.overlay = this.textCanvas;
    this.renderer.render(frame);
  }

  /** Quadro de cada clipe visível (e, na câmera lenta suave, o anterior). */
  private provideSource(active: ActiveClip): Pick<LayerInput, 'source' | 'interpolation'> {
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
      // A saída do ganho vai para o canal da trilha no mixer (ligada em setProject).
      source.connect(gain);
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
  private applyVoice(el: HTMLMediaElement, voice: VoiceEffect, eq: { low: number; mid: number; high: number } | undefined): void {
    const current = this.voices.get(el);
    const effect = JSON.stringify([voice, eq ?? null]);
    if ((current?.effect ?? JSON.stringify(['none', null])) === effect) return;
    const source = this.elementSources.get(el);
    const gain = this.gains.get(el);
    if (!source || !gain) return;
    source.disconnect();
    current?.chain?.stop();
    current?.chain?.output.disconnect();
    const chain = buildAudioChain(this.audioContext, voice, eq);
    if (chain) {
      source.connect(chain.input);
      chain.output.connect(gain);
    } else {
      source.connect(gain);
    }
    this.voices.set(el, { effect, chain });
  }
}
