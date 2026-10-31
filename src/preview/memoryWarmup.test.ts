import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameInput, LayerInput } from '../engine/renderer';
import { MAX_WARMUP_SECONDS, memorySeconds, WARMUP_DELAY, WARMUP_SECONDS, warmupTimes, WarmupScheduler } from './memoryWarmup';

const NONE = { state: false, history: false, motion: false, background: false };
const INPUTS: Record<string, typeof NONE> = {
  'effects/brilho': NONE,
  'effects/rastro': { ...NONE, state: true },
  'effects/eco': { ...NONE, history: true },
  'effects/pessoa-invisivel': { ...NONE, background: true },
  'transitions/dissolver': NONE,
  'transitions/datamosh': { ...NONE, state: true, motion: true },
  // Transições não guardam o passado (getPast): só estado e movimento contam para elas.
  'transitions/eco': { ...NONE, history: true },
};
const inputsOf = (id: string) => INPUTS[id];

function layer(...effects: string[]): LayerInput {
  return {
    key: 'clipe',
    source: null,
    width: 1920,
    height: 1080,
    time: 1,
    duration: 4,
    effects: effects.map((pluginId, i) => ({ uid: String(i), pluginId, enabled: true, params: {} })),
    filter: null,
  };
}

function frame(extra: Partial<FrameInput>): FrameInput {
  return { a: layer(), b: null, transition: null, ...extra };
}

describe('quando o preview pausado precisa calcular o passado', () => {
  it('só com efeito ou transição que lembra dos quadros anteriores', () => {
    expect(memorySeconds(frame({ a: layer('effects/brilho') }), inputsOf)).toBe(0);
    expect(memorySeconds(frame({ a: layer('effects/brilho', 'effects/rastro') }), inputsOf)).toBe(WARMUP_SECONDS);
    expect(memorySeconds(frame({ a: layer('effects/eco') }), inputsOf)).toBe(WARMUP_SECONDS);
    expect(memorySeconds(frame({ a: layer('effects/pessoa-invisivel') }), inputsOf)).toBe(WARMUP_SECONDS);
    expect(memorySeconds(frame({ a: null }), inputsOf)).toBe(0);
  });

  it('efeito desligado ou desconhecido não conta', () => {
    const off = layer('effects/rastro');
    off.effects[0].enabled = false;
    expect(memorySeconds(frame({ a: off }), inputsOf)).toBe(0);
    expect(memorySeconds(frame({ a: layer('effects/sumiu') }), inputsOf)).toBe(0);
  });

  it('vale nas camadas sobrepostas e nos pacotes (que não estão zerados)', () => {
    const placed = { ...layer('effects/eco'), place: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, blend: 'normal' as const, chroma: null, radius: 0 } };
    expect(memorySeconds(frame({ layers: [placed] }), inputsOf)).toBe(WARMUP_SECONDS);
    const pack = { time: 0, duration: 2, effects: layer('effects/rastro').effects, filter: null, camera: null, amount: 1 };
    expect(memorySeconds(frame({ adjust: [pack] }), inputsOf)).toBe(WARMUP_SECONDS);
    expect(memorySeconds(frame({ adjust: [{ ...pack, amount: 0 }] }), inputsOf)).toBe(0);
  });

  it('transição com memória: desde o começo dela (com teto)', () => {
    const datamosh = { pluginId: 'transitions/datamosh', params: {}, progress: 0.5 };
    expect(memorySeconds(frame({ b: layer(), transition: datamosh }), inputsOf, 0.4)).toBeCloseTo(0.4);
    expect(memorySeconds(frame({ b: layer(), transition: datamosh }), inputsOf, 10)).toBe(MAX_WARMUP_SECONDS);
    // Efeito com memória no clipe: pelo menos o passado dele.
    expect(memorySeconds(frame({ a: layer('effects/rastro'), b: layer(), transition: datamosh }), inputsOf, 0.4)).toBe(WARMUP_SECONDS);
    expect(memorySeconds(frame({ b: layer(), transition: { ...datamosh, pluginId: 'transitions/dissolver' } }), inputsOf, 0.4)).toBe(0);
    expect(memorySeconds(frame({ b: layer(), transition: { ...datamosh, pluginId: 'transitions/eco' } }), inputsOf, 0.4)).toBe(0);
  });
});

describe('quais quadros calcular', () => {
  it('um por quadro do projeto, em ordem, terminando um quadro antes do instante', () => {
    const times = warmupTimes(5, 30, 1);
    expect(times).toHaveLength(30);
    expect(times[0]).toBeCloseTo(4);
    expect(times[29]).toBeCloseTo(5 - 1 / 30);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeCloseTo(1 / 30);
  });

  it('não passa do começo da timeline nem do teto', () => {
    expect(warmupTimes(0, 30, 1)).toEqual([]);
    const start = warmupTimes(0.2, 30, 1);
    expect(start).toHaveLength(6);
    expect(start[0]).toBeGreaterThanOrEqual(0);
    expect(warmupTimes(20, 60, 99)).toHaveLength(MAX_WARMUP_SECONDS * 60);
    expect(warmupTimes(3, 30, 0)).toEqual([]);
  });

  it('fps inválido usa 30', () => {
    expect(warmupTimes(2, 0, 1)).toHaveLength(30);
  });
});

describe('agenda do cálculo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Cálculo de mentira: cada um fica rodando até `finish()`. */
  function setup() {
    const jobs: { key: { time: number; v?: number }; signal: AbortSignal; finish: () => void }[] = [];
    const scheduler = new WarmupScheduler<{ time: number; v?: number }>(
      (key, signal) =>
        new Promise<void>((resolve) => {
          jobs.push({ key, signal, finish: resolve });
        }),
    );
    return { jobs, scheduler };
  }

  it('espera o cursor parar (arrastando, nada roda)', () => {
    const { jobs, scheduler } = setup();
    for (let i = 0; i < 10; i++) {
      scheduler.request({ time: i * 0.1 });
      vi.advanceTimersByTime(WARMUP_DELAY / 2);
    }
    expect(jobs).toHaveLength(0);
    expect(scheduler.busy).toBe(true);
    vi.advanceTimersByTime(WARMUP_DELAY);
    expect(jobs.map((j) => j.key.time)).toEqual([0.9]);
    expect(scheduler.running?.time).toBe(0.9);
  });

  it('mexer de novo (outro instante) cancela o que está rodando', async () => {
    const { jobs, scheduler } = setup();
    scheduler.request({ time: 1 });
    vi.advanceTimersByTime(WARMUP_DELAY);
    expect(jobs).toHaveLength(1);
    scheduler.request({ time: 2 });
    expect(jobs[0].signal.aborted).toBe(true);
    expect(scheduler.running).toBeNull();
    vi.advanceTimersByTime(WARMUP_DELAY);
    expect(jobs.map((j) => j.key.time)).toEqual([1, 2]);
    // O cancelado terminando depois não atrapalha o novo.
    jobs[0].finish();
    await vi.runAllTimersAsync();
    expect(scheduler.running?.time).toBe(2);
  });

  it('pedido do mesmo instante durante o cálculo: termina e roda de novo com o mais novo', async () => {
    const { jobs, scheduler } = setup();
    scheduler.request({ time: 1, v: 1 });
    vi.advanceTimersByTime(WARMUP_DELAY);
    scheduler.request({ time: 1, v: 2 });
    scheduler.request({ time: 1, v: 3 });
    expect(jobs[0].signal.aborted).toBe(false);
    jobs[0].finish();
    await vi.advanceTimersByTimeAsync(WARMUP_DELAY);
    expect(jobs.map((j) => j.key.v)).toEqual([1, 3]);
    jobs[1].finish();
    await vi.runAllTimersAsync();
    expect(scheduler.busy).toBe(false);
  });

  it('cancel (tocou) para tudo, inclusive o que estava esperando', async () => {
    const { jobs, scheduler } = setup();
    scheduler.request({ time: 1 });
    vi.advanceTimersByTime(WARMUP_DELAY);
    scheduler.request({ time: 1, v: 2 });
    scheduler.cancel();
    expect(jobs[0].signal.aborted).toBe(true);
    jobs[0].finish();
    await vi.runAllTimersAsync();
    expect(jobs).toHaveLength(1);
    expect(scheduler.busy).toBe(false);
    scheduler.request({ time: 3 });
    scheduler.cancel();
    vi.advanceTimersByTime(WARMUP_DELAY * 2);
    expect(jobs).toHaveLength(1);
  });

  it('erro no cálculo não trava a agenda', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    const scheduler = new WarmupScheduler<{ time: number }>(async () => {
      calls++;
      throw new Error('placa');
    });
    scheduler.request({ time: 1 });
    await vi.advanceTimersByTimeAsync(WARMUP_DELAY);
    expect(scheduler.busy).toBe(false);
    scheduler.request({ time: 2 });
    await vi.advanceTimersByTimeAsync(WARMUP_DELAY);
    expect(calls).toBe(2);
    warn.mockRestore();
  });
});
