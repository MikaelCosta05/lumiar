// Efeitos com memória no preview pausado: rastro, datamosh, eco temporal… dependem dos quadros anteriores.
// Tocando, o motor recebe os quadros em ordem; pausado (ou depois de pular no tempo), só o instante atual.
// Ao parar num ponto, o player calcula em segundo plano o trecho antes do cursor (como a exportação faz) e mostra
// o quadro que sai dele. Aqui fica a parte sem placa de vídeo: se precisa, quais quadros e quando (com cancelamento).
import type { FrameInput } from '../engine/renderer';
import type { PluginInputs } from '../engine/shaders';

/** Passado (s) que os efeitos usam: o getPast guarda ~1 s; num estado (rastro, datamosh), o que é mais velho já sumiu. */
export const WARMUP_SECONDS = 32 / 30;
/** Teto do trecho: transições com memória andam desde o começo delas, mas não vale calcular mais que isso. */
export const MAX_WARMUP_SECONDS = 3;
/** Espera (ms) depois do último movimento do cursor: arrastando, nada é calculado. */
export const WARMUP_DELAY = 250;

type MemoryInputs = Pick<PluginInputs, 'state' | 'history' | 'motion' | 'background'>;

/**
 * Quantos segundos antes do instante o quadro precisa ver para sair igual à reprodução e à exportação (0 = nenhum:
 * nada no quadro lembra do passado). `transitionElapsed` = quanto da transição já passou (s), se há uma.
 * Mesmas regras do motor (renderer.drawLook e drawTransition): efeitos com state/getPast/getMotion/getBackground;
 * transições só com state/getMotion.
 */
export function memorySeconds(frame: FrameInput, inputsOf: (pluginId: string) => MemoryInputs | null | undefined, transitionElapsed: number | null = null): number {
  const layers = [frame.a, frame.b, ...(frame.layers ?? [])].filter((l) => !!l);
  const effects = [...layers.flatMap((l) => l.effects), ...(frame.adjust ?? []).filter((a) => a.amount > 0.001).flatMap((a) => a.effects)];
  let seconds = 0;
  if (
    effects.some((e) => {
      const i = e.enabled ? inputsOf(e.pluginId) : null;
      return !!i && (i.state || i.history || i.motion || i.background);
    })
  ) {
    seconds = WARMUP_SECONDS;
  }
  const t = frame.transition && frame.b ? inputsOf(frame.transition.pluginId) : null;
  if (t && (t.state || t.motion)) seconds = Math.max(seconds, Math.max(0, transitionElapsed ?? WARMUP_SECONDS));
  return Math.min(MAX_WARMUP_SECONDS, seconds);
}

/**
 * Instantes a calcular antes de `time`, em ordem, um por quadro do projeto, terminando um quadro antes dele (o próprio
 * instante é o último, desenhado na tela). Não passa do começo da timeline.
 */
export function warmupTimes(time: number, fps: number, seconds: number): number[] {
  const rate = fps > 0 ? fps : 30;
  const span = Math.min(seconds, MAX_WARMUP_SECONDS, Math.max(0, time));
  const count = Math.floor(span * rate + 1e-6);
  return Array.from({ length: count }, (_, i) => time - (count - i) / rate);
}

interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

/**
 * Agenda o cálculo do trecho: espera o cursor parar (WARMUP_DELAY), cancela o que está rodando se o pedido mudou de
 * instante e, se o pedido é do mesmo instante (um parâmetro mudou), deixa terminar e roda de novo com o mais novo
 * (assim, mexendo num controle, a imagem continua se atualizando sem recomeçar a cada passo).
 */
export class WarmupScheduler<K extends { time: number }> {
  private timer: unknown = null;
  private waiting: K | null = null;
  private current: { key: K; controller: AbortController } | null = null;
  /** Pedido do mesmo instante que chegou durante o cálculo: roda quando ele terminar. */
  private next: K | null = null;

  constructor(
    private readonly run: (key: K, signal: AbortSignal) => Promise<void>,
    private readonly delay = WARMUP_DELAY,
    private readonly timers: Timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id as number) },
  ) {}

  /** O que está sendo calculado agora (null = nada). */
  get running(): K | null {
    return this.current?.key ?? null;
  }

  /** Há algo esperando ou rodando? */
  get busy(): boolean {
    return this.timer !== null || this.current !== null;
  }

  request(key: K): void {
    if (this.current && this.current.key.time === key.time) {
      this.next = key;
      return;
    }
    this.abortCurrent();
    this.schedule(key);
  }

  cancel(): void {
    this.abortCurrent();
    this.next = null;
    this.clearTimer();
  }

  private schedule(key: K): void {
    this.clearTimer();
    this.waiting = key;
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      const waiting = this.waiting;
      this.waiting = null;
      if (waiting) this.start(waiting);
    }, this.delay);
  }

  private start(key: K): void {
    const controller = new AbortController();
    const job = { key, controller };
    this.current = job;
    const done = () => {
      if (this.current !== job) return;
      this.current = null;
      const next = this.next;
      this.next = null;
      if (next && !controller.signal.aborted) this.schedule(next);
    };
    this.run(key, controller.signal).then(done, (error) => {
      if (!controller.signal.aborted) console.warn('[Lumiar] trecho do preview não calculado:', error);
      done();
    });
  }

  private abortCurrent(): void {
    this.current?.controller.abort();
    this.current = null;
    this.next = null;
  }

  private clearTimer(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
    this.waiting = null;
  }
}
