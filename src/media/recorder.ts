import { AudioBufferSource, BufferTarget, Output, WavOutputFormat } from 'mediabunny';

/**
 * Grava a voz pelo microfone (narração/dublagem), com cancelamento de eco e redução de ruído do navegador.
 * open() pede o microfone; begin() começa a gravar (depois da contagem regressiva).
 */
export class VoiceRecorder {
  private readonly chunks: Blob[] = [];
  private readonly meter: AudioContext;
  private readonly analyser: AnalyserNode;
  private readonly samples: Float32Array<ArrayBuffer>;

  private constructor(
    private readonly stream: MediaStream,
    private readonly recorder: MediaRecorder,
  ) {
    recorder.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    });
    // Medidor de nível (só lê o microfone, não toca nada).
    this.meter = new AudioContext();
    this.analyser = this.meter.createAnalyser();
    this.analyser.fftSize = 1024;
    this.samples = new Float32Array(this.analyser.fftSize);
    this.meter.createMediaStreamSource(stream).connect(this.analyser);
    void this.meter.resume().catch(() => {});
  }

  /** Microfones disponíveis (os nomes só aparecem depois da primeira permissão). */
  static async devices(): Promise<MediaDeviceInfo[]> {
    const all = await navigator.mediaDevices?.enumerateDevices().catch(() => []);
    return (all ?? []).filter((d) => d.kind === 'audioinput');
  }

  static async open(deviceId?: string): Promise<VoiceRecorder> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não deixa gravar áudio.');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 160_000 } : undefined);
    return new VoiceRecorder(stream, recorder);
  }

  /** Atalho: abre e já começa a gravar. */
  static async start(deviceId?: string): Promise<VoiceRecorder> {
    const voice = await VoiceRecorder.open(deviceId);
    voice.begin();
    return voice;
  }

  begin(): void {
    if (this.recorder.state === 'inactive') this.recorder.start(250);
  }

  /** Volume do microfone agora (0 a 1). */
  level(): number {
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const v of this.samples) sum += v * v;
    // RMS em escala que "parece" certa para voz.
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 4);
  }

  /** Para a gravação e devolve o arquivo de áudio. */
  stop(name: string): Promise<File> {
    return new Promise((resolve) => {
      this.recorder.addEventListener(
        'stop',
        () => {
          this.release();
          const type = this.recorder.mimeType || 'audio/webm';
          const recorded = new Blob(this.chunks, { type: type.split(';')[0] });
          // O WebM gravado pelo navegador não traz a duração e avança mal: vira WAV.
          void toWav(recorded).then(
            (wav) => resolve(new File([wav], `${name}.wav`, { type: 'audio/wav' })),
            () => resolve(new File([recorded], `${name}.${type.includes('ogg') ? 'ogg' : 'webm'}`, { type: recorded.type })),
          );
        },
        { once: true },
      );
      this.recorder.stop();
    });
  }

  /** Cancela sem gerar arquivo. */
  cancel(): void {
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    this.release();
  }

  private release(): void {
    this.stream.getTracks().forEach((t) => t.stop());
    void this.meter.close().catch(() => {});
  }
}

async function toWav(blob: Blob): Promise<Blob> {
  const context = new OfflineAudioContext(1, 1, 48000);
  const audio = await context.decodeAudioData(await blob.arrayBuffer());
  const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() });
  const source = new AudioBufferSource({ codec: 'pcm-s16', bitrate: 1 });
  output.addAudioTrack(source);
  await output.start();
  await source.add(audio);
  source.close();
  await output.finalize();
  return new Blob([(output.target as BufferTarget).buffer!], { type: 'audio/wav' });
}
