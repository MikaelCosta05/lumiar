/**
 * Libera da memória um recurso pesado (worker de IA, modelo do MediaPipe) depois de um tempo parado; na próxima
 * vez que for usado, ele é criado de novo sozinho (só demora o tempo de carregar o modelo, que já está no disco).
 *
 * Nunca libera no meio de um uso: cada uso conta (use) e o relógio só corre quando ninguém está usando.
 * Cada uso pode pedir para ficar mais tempo carregado depois dele (ex.: a profundidade, que o preview pede a
 * cada quadro, fica mais que a voz sintética, usada de vez em quando): vale o prazo mais longe.
 */

export interface IdleOptions<T> {
  /** Cria o recurso (ex.: new Worker). */
  create: () => T;
  /** Libera de verdade (terminate, close…). */
  release: (value: T) => void;
  /** Tempo parado até liberar (ms), quando o uso não pede outro. */
  idleMs: number;
}

/** Todos os recursos que se liberam sozinhos (para liberar tudo o que está parado de uma vez). */
const registry = new Set<IdleResource<unknown>>();

export class IdleResource<T> {
  private value: T | null = null;
  private users = 0;
  /** Muda quando o recurso é descartado à força: os usos antigos não mexem mais na contagem. */
  private generation = 0;
  /** Instante (Date.now) a partir do qual pode liberar. */
  private deadline = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: IdleOptions<T>) {
    registry.add(this as IdleResource<unknown>);
  }

  /** Está carregado agora? */
  get loaded(): boolean {
    return this.value !== null;
  }

  /** Quantos usos estão em andamento. */
  get busy(): number {
    return this.users;
  }

  /** O recurso, sem contar como uso (ex.: para ligar ouvintes); null se não está carregado. */
  peek(): T | null {
    return this.value;
  }

  /**
   * Usa o recurso: ele não é liberado enquanto `work` não terminar. Depois, fica carregado por `keepMs`
   * (ou o padrão) sem uso antes de ser liberado.
   */
  async use<R>(work: (value: T) => R | Promise<R>, keepMs = this.options.idleMs): Promise<R> {
    const value = this.acquire();
    const generation = this.generation;
    try {
      return await work(value);
    } finally {
      if (generation === this.generation) this.finish(keepMs);
    }
  }

  /** Libera agora mesmo se ninguém estiver usando. Devolve se liberou. */
  releaseIfIdle(): boolean {
    if (this.users > 0 || this.value === null) return false;
    this.free();
    return true;
  }

  /** O recurso quebrou (ex.: o worker caiu): libera já, mesmo em uso; o próximo uso cria outro. */
  drop(): void {
    this.generation++;
    this.users = 0;
    if (this.value !== null) this.free();
  }

  private acquire(): T {
    this.clearTimer();
    this.users++;
    if (this.value === null) {
      this.deadline = 0;
      try {
        this.value = this.options.create();
      } catch (error) {
        this.users--;
        throw error;
      }
    }
    return this.value;
  }

  private finish(keepMs: number): void {
    this.users = Math.max(0, this.users - 1);
    this.deadline = Math.max(this.deadline, Date.now() + keepMs);
    if (this.users === 0) this.schedule();
  }

  private schedule(): void {
    this.clearTimer();
    if (this.value === null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.users > 0 || this.value === null) return;
      // O relógio pode adiantar (timers atrasam com a aba em segundo plano): confere o prazo de novo.
      if (Date.now() < this.deadline) this.schedule();
      else this.free();
    }, Math.max(0, this.deadline - Date.now()));
  }

  private free(): void {
    this.clearTimer();
    const value = this.value!;
    this.value = null;
    this.deadline = 0;
    try {
      this.options.release(value);
    } catch (error) {
      console.warn('[Lumiar] erro ao liberar um modelo da memória', error);
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

/** Libera já todos os modelos que não estão em uso (ex.: pouca memória). Devolve quantos liberou. */
export function releaseIdleNow(): number {
  let count = 0;
  for (const resource of registry) if (resource.releaseIfIdle()) count++;
  return count;
}

/** Um minuto e meio: o suficiente para usar de novo em seguida sem esperar carregar. */
export const IDLE_DEFAULT = 90_000;
