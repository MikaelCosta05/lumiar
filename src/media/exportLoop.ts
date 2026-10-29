/**
 * Exportar em loop (para GIF e Reels, que repetem sozinhos):
 * - seamless (loop perfeito): os últimos quadros dissolvem nos primeiros; o arquivo começa um pouco depois
 *   do começo do trecho, então do último quadro para o primeiro não há pulo;
 * - boomerang: o trecho toca para frente e depois de trás para frente.
 * Os quadros são renderizados em ordem, uma vez só; o que precisa voltar fica guardado.
 */

export type ExportLoop = 'none' | 'seamless' | 'boomerang';

/** Duração do dissolve do loop perfeito (s). */
export const LOOP_SECONDS = 0.5;

/** Quantos quadros dissolvem: meio segundo, sem passar de um terço do trecho. */
export function crossfadeFrames(frames: number, fps: number): number {
  return Math.max(0, Math.min(Math.round(LOOP_SECONDS * fps), Math.floor(frames / 3)));
}

export interface LoopFrame {
  /** Quadro renderizado (0 = primeiro do trecho) */
  main: number;
  /** Quadro misturado por cima, com a opacidade `alpha` */
  over: number | null;
  alpha: number;
}

/** O quadro de saída j, a partir dos n quadros renderizados. */
export function loopFrames(mode: ExportLoop, n: number, fps: number): LoopFrame[] {
  if (mode === 'boomerang' && n > 2) {
    // Ida 0…n-1 e volta n-2…1 (as pontas não repetem: no loop, n-1 e 0 apareceriam duas vezes seguidas).
    const back = Array.from({ length: n - 2 }, (_, i) => n - 2 - i);
    return [...Array.from({ length: n }, (_, i) => i), ...back].map((main) => ({ main, over: null, alpha: 0 }));
  }
  const d = mode === 'seamless' ? crossfadeFrames(n, fps) : 0;
  return Array.from({ length: n - d }, (_, j) => {
    const main = j + d;
    const into = main - (n - d);
    // Opacidade crescendo até "quase 1" no último quadro; o quadro seguinte (o primeiro do arquivo) é o d.
    return into >= 0 ? { main, over: into, alpha: (into + 1) / (d + 1) } : { main, over: null, alpha: 0 };
  });
}

/** O som com o mesmo loop (mesma emenda ou indo e voltando), canal por canal. */
export function loopSamples(mode: ExportLoop, data: Float32Array, rate: number, n: number, fps: number): Float32Array {
  const frame = rate / fps;
  if (mode === 'boomerang' && n > 2) {
    const forward = data.subarray(0, Math.min(data.length, Math.round(n * frame)));
    const back = data.slice(Math.round(frame), Math.min(data.length, Math.round((n - 1) * frame))).reverse();
    const out = new Float32Array(forward.length + back.length);
    out.set(forward);
    out.set(back, forward.length);
    return out;
  }
  const d = mode === 'seamless' ? crossfadeFrames(n, fps) : 0;
  if (!d) return data;
  const skip = Math.round(d * frame);
  const length = Math.max(0, Math.min(data.length, Math.round(n * frame)) - skip);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const s = i + skip;
    const into = s - length;
    // Nos últimos `skip` instantes, o começo entra aos poucos (mesma curva da imagem).
    out[i] = into >= 0 ? data[s] * (1 - (into + 1) / (skip + 1)) + data[into] * ((into + 1) / (skip + 1)) : data[s];
  }
  return out;
}

type Emit = (source: HTMLCanvasElement, index: number) => Promise<void>;

/** Recebe os quadros renderizados em ordem e manda para o arquivo os quadros do loop. */
export class ExportLooper {
  /** Onde o quadro final é montado (o arquivo de vídeo lê daqui) */
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly plan: LoopFrame[];
  /** Quadros guardados para usar de novo (o começo, no loop perfeito; todos, no boomerang) */
  private readonly kept = new Map<number, Blob | ImageBitmap>();
  private readonly keep: Set<number>;
  private received = 0;
  private written = 0;

  constructor(
    private readonly mode: ExportLoop,
    private readonly frames: number,
    private readonly fps: number,
    width: number,
    height: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.plan = loopFrames(mode, frames, fps);
    this.keep = new Set(this.plan.flatMap((f, j) => [...(f.over !== null ? [f.over] : []), ...(j > 0 && f.main < this.plan[j - 1].main ? [f.main] : [])]));
  }

  /** Muitos quadros guardados (boomerang de vídeo grande): em JPEG de alta qualidade ocupam bem menos memória. */
  private get heavy(): boolean {
    return this.keep.size * this.canvas.width * this.canvas.height * 4 > 512e6;
  }

  /** Quantos quadros o arquivo terá */
  get length(): number {
    return this.plan.length;
  }

  /** Som do trecho com o mesmo loop. */
  audio(buffer: AudioBuffer): AudioBuffer {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) => loopSamples(this.mode, buffer.getChannelData(ch), buffer.sampleRate, this.frames, this.fps));
    const out = new AudioBuffer({ numberOfChannels: buffer.numberOfChannels, length: Math.max(1, channels[0]?.length ?? 1), sampleRate: buffer.sampleRate });
    channels.forEach((data, ch) => out.copyToChannel(data as Float32Array<ArrayBuffer>, ch));
    return out;
  }

  /** Mais um quadro renderizado (na ordem). */
  async push(rendered: HTMLCanvasElement, emit: Emit): Promise<void> {
    const index = this.received++;
    if (this.keep.has(index)) this.kept.set(index, this.heavy ? await jpeg(rendered) : await createImageBitmap(rendered));
    await this.flush(rendered, index, emit);
  }

  /** Manda o que ainda falta (a volta do boomerang) e libera a memória. */
  async finish(emit: Emit): Promise<void> {
    await this.flush(null, -1, emit);
    for (const v of this.kept.values()) if (v instanceof ImageBitmap) v.close();
    this.kept.clear();
  }

  private async flush(rendered: HTMLCanvasElement | null, index: number, emit: Emit): Promise<void> {
    while (this.written < this.plan.length) {
      const f = this.plan[this.written];
      const main = f.main === index && rendered ? rendered : this.kept.get(f.main);
      if (!main) return;
      const over = f.over === null ? null : this.kept.get(f.over);
      if (f.over !== null && !over) return;
      this.ctx.globalAlpha = 1;
      await this.draw(main);
      if (over) {
        this.ctx.globalAlpha = f.alpha;
        await this.draw(over);
        this.ctx.globalAlpha = 1;
      }
      await emit(this.canvas, this.written++);
      // Quadro guardado que não aparece mais: sai da memória.
      if (f.over !== null) this.release(f.over);
    }
  }

  private release(index: number): void {
    if (this.plan.slice(this.written).some((f) => f.main === index || f.over === index)) return;
    const v = this.kept.get(index);
    if (v instanceof ImageBitmap) v.close();
    this.kept.delete(index);
  }

  private async draw(source: HTMLCanvasElement | Blob | ImageBitmap): Promise<void> {
    if (source instanceof Blob) {
      const bitmap = await createImageBitmap(source);
      this.ctx.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
      bitmap.close();
    } else {
      this.ctx.drawImage(source, 0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

function jpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg'))), 'image/jpeg', 0.95));
}
