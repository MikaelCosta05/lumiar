/**
 * Medidores do mixer: pico e RMS de cada canal e a sonoridade de curto prazo (LUFS, janela de 3 s) do Master.
 * As contas ficam separadas do Web Audio para dar para testar.
 */

import { lufsOf } from '../media/loudness';

export interface Level {
  /** Pico de cada lado (0 a 1+, linear) */
  peak: [number, number];
  /** RMS de cada lado (linear) */
  rms: [number, number];
}

export const SILENT: Level = { peak: [0, 0], rms: [0, 0] };

/** Pico e média dos quadrados de um bloco de amostras. */
export function measureBlock(data: Float32Array): { peak: number; meanSquare: number } {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    sum += v * v;
  }
  return { peak, meanSquare: data.length ? sum / data.length : 0 };
}

/** Linear → dBFS (0 vira −∞). */
export function toDbfs(value: number): number {
  return value > 0 ? 20 * Math.log10(value) : -Infinity;
}

/**
 * Queda do ponteiro do medidor: sobe na hora e desce devagar (`fall` dB por segundo), para dar para ler.
 * Valores em dB.
 */
export function meterFall(previous: number, current: number, dt: number, fall = 24): number {
  if (!(current < previous)) return current;
  const dropped = Number.isFinite(previous) ? previous - fall * Math.max(0, dt) : -Infinity;
  return Math.max(current, dropped);
}

/**
 * Sonoridade de curto prazo (BS.1770, janela de 3 s, sem portão): média dos blocos medidos nos últimos
 * 3 segundos. Cada bloco é a soma das médias dos quadrados dos canais, já com o filtro K.
 */
export class ShortTermLoudness {
  private readonly blocks: { time: number; meanSquare: number }[] = [];

  constructor(private readonly window = 3) {}

  push(time: number, meanSquare: number): void {
    this.blocks.push({ time, meanSquare });
    while (this.blocks.length && this.blocks[0].time < time - this.window) this.blocks.shift();
  }

  reset(): void {
    this.blocks.length = 0;
  }

  /** LUFS (−∞ se não há som). */
  value(): number {
    if (!this.blocks.length) return -Infinity;
    return lufsOf(this.blocks.reduce((sum, b) => sum + b.meanSquare, 0) / this.blocks.length);
  }
}

/** Lê pico e RMS de um par de AnalyserNode (esquerda e direita). */
export function readLevel(pair: [AnalyserNode, AnalyserNode], buffer: Float32Array<ArrayBuffer>): Level {
  const sides = pair.map((analyser) => {
    analyser.getFloatTimeDomainData(buffer);
    return measureBlock(buffer);
  });
  return {
    peak: [sides[0].peak, sides[1].peak],
    rms: [Math.sqrt(sides[0].meanSquare), Math.sqrt(sides[1].meanSquare)],
  };
}
