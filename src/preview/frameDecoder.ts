import { ALL_FORMATS, BlobSource, Input, VideoSampleSink, type VideoSample } from 'mediabunny';

interface Opened {
  input: Input;
  sink: VideoSampleSink;
  /** Alguns arquivos começam um pouco depois de 0 s; antes disso não existe quadro. */
  first: number;
}

/**
 * Lê quadros exatos dos arquivos de vídeo, pelo mesmo caminho da exportação, sem mexer nos <video> do preview
 * (que continuam parados no cursor). Usado para calcular o trecho antes do cursor dos efeitos com memória.
 */
export class FrameDecoder {
  private readonly opened = new Map<string, { file: Blob; ready: Promise<Opened | null> }>();

  private open(id: string, file: Blob): Promise<Opened | null> {
    const found = this.opened.get(id);
    if (found && found.file === file) return found.ready;
    if (found) void found.ready.then((o) => o?.input.dispose());
    const ready = (async () => {
      const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
      const track = await input.getPrimaryVideoTrack();
      if (!track) {
        input.dispose();
        return null;
      }
      return { input, sink: new VideoSampleSink(track), first: await track.getFirstTimestamp() };
    })().catch(() => null);
    this.opened.set(id, { file, ready });
    return ready;
  }

  /** Quadros do arquivo nos instantes pedidos, em ordem (null = não deu para ler). Quem chama fecha cada quadro. */
  async frames(id: string, file: Blob, timestamps: number[]): Promise<AsyncGenerator<VideoSample | null, void, unknown> | null> {
    const opened = await this.open(id, file);
    if (!opened) return null;
    return opened.sink.samplesAtTimestamps(timestamps.map((t) => Math.max(t, opened.first)));
  }

  /** Esquece os arquivos que não estão mais no projeto. */
  keep(ids: Set<string>): void {
    for (const [id, entry] of this.opened) {
      if (ids.has(id)) continue;
      void entry.ready.then((o) => o?.input.dispose());
      this.opened.delete(id);
    }
  }

  dispose(): void {
    this.keep(new Set());
  }
}
