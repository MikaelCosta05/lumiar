/**
 * Dados pesados derivados das mídias (miniaturas, forma de onda, imagens decodificadas).
 * Ficam fora do projeto para não pesar no desfazer/refazer e poderem chegar depois da importação.
 */
export interface Filmstrip {
  /** Instante (s) de cada miniatura dentro do arquivo */
  times: number[];
  urls: string[];
}

/** Resolução da forma de onda: quantos picos por segundo de áudio. */
export const PEAKS_PER_SECOND = 40;

class AssetStore {
  private version = 0;
  private readonly listeners = new Set<() => void>();

  readonly bitmaps = new Map<string, ImageBitmap>();
  readonly filmstrips = new Map<string, Filmstrip>();
  readonly peaks = new Map<string, Float32Array>();
  /** Cópias leves dos vídeos (prévia leve), por id da mídia */
  readonly proxies = new Map<string, string>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  changed(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }
}

export const assets = new AssetStore();
