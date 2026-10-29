import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Output, WebMOutputFormat } from 'mediabunny';
import { locale, t } from '../i18n';
import type { CursorTrack } from '../project/cursorFx';

export interface ScreenRecordOptions {
  webcam: boolean;
  microphone: boolean;
  /** Som do computador (no Windows; no Linux o sistema não entrega esse som) */
  systemAudio: boolean;
  /** Programa instalado: câmera que se aproxima de onde se clica */
  cursorZoom: boolean;
  /** Programa instalado: círculo em volta do cursor e onda nos cliques */
  cursorHighlight: boolean;
  /** Abrir o roteiro (teleprompter) numa janelinha por cima */
  prompter: boolean;
}

/** Versão nova do Lumiar publicada no GitHub. */
export interface UpdateInfo {
  version: string;
  notes: string;
  page: string;
  /** O programa sabe se instalar sozinho (Windows e AppImage); senão abre a página */
  automatic: boolean;
}

/** Ponte com o programa instalado (só existe no Electron). */
interface DesktopBridge {
  startCursor(): Promise<boolean>;
  stopCursor(): Promise<CursorTrack | null>;
  onUpdate(listener: (info: UpdateInfo) => void): void;
  onUpdateProgress(listener: (fraction: number) => void): void;
  checkUpdate(): Promise<UpdateInfo | null>;
  installUpdate(): Promise<boolean>;
  /** Caminho do arquivo no disco ('' quando ele só existe na memória). */
  pathForFile?(file: File): string;
  rememberFiles?(paths: string[]): Promise<void>;
  /** Avisa o programa do idioma da interface (diálogos e menus nativos). */
  setLanguage?(lang: string): void;
}

export function desktop(): DesktopBridge | null {
  return (window as unknown as { lumiarDesktop?: DesktopBridge }).lumiarDesktop ?? null;
}

/**
 * Grava a tela (e, junto, a webcam num arquivo separado) para tutoriais e gameplay.
 * O som (microfone + computador) vai junto com a gravação da tela.
 */
export class ScreenRecorder {
  private readonly chunks: Blob[] = [];
  private readonly cameraChunks: Blob[] = [];
  private readonly stopped: Promise<void>;
  readonly startedAt = performance.now();
  /** O que foi pedido mas não deu para usar (ex.: "a webcam") */
  missing: string[] = [];
  /** Medidor do microfone (para o teleprompter acompanhar a voz) */
  private analyser: AnalyserNode | null = null;
  private readonly samples = new Float32Array(1024);
  /** O programa está anotando o mouse */
  private tracking = false;

  private constructor(
    private readonly streams: MediaStream[],
    private readonly recorder: MediaRecorder,
    private readonly camera: MediaRecorder | null,
    private readonly mixer: AudioContext | null,
  ) {
    recorder.addEventListener('dataavailable', (e) => e.data.size && this.chunks.push(e.data));
    camera?.addEventListener('dataavailable', (e) => e.data.size && this.cameraChunks.push(e.data));
    const done = (r: MediaRecorder) => new Promise<void>((resolve) => r.addEventListener('stop', () => resolve(), { once: true }));
    this.stopped = Promise.all([done(recorder), camera ? done(camera) : Promise.resolve()]).then(() => {});
    // Se a pessoa parar o compartilhamento pela barra do sistema, a gravação termina também.
    streams[0].getVideoTracks()[0]?.addEventListener('ended', () => this.finish());
    recorder.start(1000);
    camera?.start(1000);
  }

  static async start(options: ScreenRecordOptions): Promise<ScreenRecorder> {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error(t('Este navegador não deixa gravar a tela.'));
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: options.systemAudio });
    const streams = [screen];
    try {
      // Sem microfone ou webcam a gravação continua só com a tela (e avisa o que faltou).
      const missing: string[] = [];
      const optional = async (wanted: boolean, label: string, constraints: MediaStreamConstraints) => {
        if (!wanted) return null;
        try {
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          missing.push(label);
          return null;
        }
      };
      const mic = await optional(options.microphone, t('o microfone'), { audio: { echoCancellation: true, noiseSuppression: true } });
      if (mic) streams.push(mic);
      const cam = await optional(options.webcam, t('a webcam'), { video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (cam) streams.push(cam);

      // Som: microfone e computador misturados numa trilha só.
      const audioSources = [screen, mic].filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0);
      let mixer: AudioContext | null = null;
      let analyser: AnalyserNode | null = null;
      const tracks: MediaStreamTrack[] = [...screen.getVideoTracks()];
      if (audioSources.length) {
        mixer = new AudioContext();
        const destination = mixer.createMediaStreamDestination();
        for (const s of audioSources) mixer.createMediaStreamSource(s).connect(destination);
        tracks.push(...destination.stream.getAudioTracks());
        if (mic) {
          analyser = mixer.createAnalyser();
          analyser.fftSize = 1024;
          mixer.createMediaStreamSource(mic).connect(analyser);
        }
      }
      const type = (video: boolean) =>
        (video
          ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
          : ['video/webm;codecs=vp9', 'video/webm']
        ).find((t) => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';
      const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: type(true), videoBitsPerSecond: 8_000_000 });
      const camera = cam ? new MediaRecorder(cam, { mimeType: type(false), videoBitsPerSecond: 3_000_000 }) : null;
      const recording = new ScreenRecorder(streams, recorder, camera, mixer);
      recording.missing = missing;
      recording.analyser = analyser;
      if ((options.cursorZoom || options.cursorHighlight) && desktop()) recording.tracking = await desktop()!.startCursor().catch(() => false);
      return recording;
    } catch (error) {
      streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      throw error;
    }
  }

  get elapsed(): number {
    return (performance.now() - this.startedAt) / 1000;
  }

  /** Volume do microfone agora (0 a 1); 0 sem microfone. */
  level(): number {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const v of this.samples) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 4);
  }

  get hasMicrophone(): boolean {
    return !!this.analyser;
  }

  private finish(): void {
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    if (this.camera && this.camera.state !== 'inactive') this.camera.stop();
  }

  /** Para tudo e devolve os arquivos (tela com som, e a webcam se houver). */
  async stop(): Promise<{ screen: File; webcam: File | null; cursor: CursorTrack | null }> {
    const cursor = this.tracking ? await desktop()!.stopCursor().catch(() => null) : null;
    this.finish();
    await this.stopped;
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    void this.mixer?.close();
    const stamp = new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', hour12: false }).replace(/:/g, 'h').slice(0, 5);
    const screen = await remux(new Blob(this.chunks, { type: 'video/webm' }), t('Gravação da tela {time}.webm', { time: stamp }));
    const webcam = this.cameraChunks.length ? await remux(new Blob(this.cameraChunks, { type: 'video/webm' }), t('Webcam {time}.webm', { time: stamp })) : null;
    return { screen, webcam, cursor: cursor && cursor.points.length > 3 ? cursor : null };
  }
}

/**
 * O gravador do navegador não escreve a duração nem o índice do arquivo (pular no vídeo fica lento).
 * Uma cópia sem recodificar resolve.
 */
async function remux(blob: Blob, name: string): Promise<File> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  try {
    const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output, showWarnings: false });
    if (!conversion.isValid) return new File([blob], name, { type: 'video/webm' });
    await conversion.execute();
    return new File([output.target.buffer!], name, { type: 'video/webm' });
  } catch {
    return new File([blob], name, { type: 'video/webm' });
  } finally {
    input.dispose();
  }
}
