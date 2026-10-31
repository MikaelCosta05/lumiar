import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleResource, releaseIdleNow } from './idleRelease';

/** Um "worker" de mentira que registra quando foi criado e liberado. */
function fake(idleMs = 60_000) {
  const log: string[] = [];
  let n = 0;
  const resource = new IdleResource({
    create: () => {
      n++;
      log.push(`cria ${n}`);
      return { id: n };
    },
    release: (v) => log.push(`libera ${v.id}`),
    idleMs,
  });
  return { resource, log };
}

/** Uma promessa que a gente resolve quando quiser (um uso que demora). */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)));
  return { promise, resolve, reject };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('IdleResource', () => {
  it('cria só quando é usado e libera depois do tempo parado', async () => {
    const { resource, log } = fake();
    expect(resource.loaded).toBe(false);
    expect(await resource.use((v) => v.id)).toBe(1);
    expect(resource.loaded).toBe(true);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(log).toEqual(['cria 1']);
    await vi.advanceTimersByTimeAsync(1);
    expect(log).toEqual(['cria 1', 'libera 1']);
    expect(resource.loaded).toBe(false);
  });

  it('volta a carregar sozinho na próxima vez', async () => {
    const { resource, log } = fake();
    await resource.use(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await resource.use((v) => v.id)).toBe(2);
    expect(log).toEqual(['cria 1', 'libera 1', 'cria 2']);
  });

  it('usar de novo antes do prazo aproveita o que está carregado e recomeça o relógio', async () => {
    const { resource, log } = fake();
    await resource.use(() => {});
    await vi.advanceTimersByTimeAsync(50_000);
    await resource.use(() => {});
    await vi.advanceTimersByTimeAsync(50_000);
    expect(log).toEqual(['cria 1']);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(log).toEqual(['cria 1', 'libera 1']);
  });

  it('nunca libera no meio de um uso, por mais longo que seja', async () => {
    const { resource, log } = fake();
    const job = deferred<number>();
    const result = resource.use(() => job.promise);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(log).toEqual(['cria 1']);
    releaseIdleNow();
    expect(resource.releaseIfIdle()).toBe(false);
    expect(log).toEqual(['cria 1']);
    job.resolve(7);
    expect(await result).toBe(7);
    // O relógio começa quando o uso termina.
    await vi.advanceTimersByTimeAsync(59_000);
    expect(log).toEqual(['cria 1']);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(log).toEqual(['cria 1', 'libera 1']);
  });

  it('com vários usos ao mesmo tempo, espera o último terminar', async () => {
    const { resource, log } = fake();
    const a = deferred();
    const b = deferred();
    const first = resource.use(() => a.promise);
    const second = resource.use(() => b.promise);
    expect(resource.busy).toBe(2);
    a.resolve();
    await first;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(log).toEqual(['cria 1']);
    b.resolve();
    await second;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(log).toEqual(['cria 1', 'libera 1']);
  });

  it('um uso que falha também conta como terminado', async () => {
    const { resource, log } = fake();
    await expect(resource.use(() => Promise.reject(new Error('falhou')))).rejects.toThrow('falhou');
    expect(resource.busy).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(log).toEqual(['cria 1', 'libera 1']);
  });

  it('vale o prazo mais longe pedido pelos usos (o modelo do preview fica mais tempo)', async () => {
    const { resource, log } = fake(60_000);
    await resource.use(() => {}, 300_000);
    await vi.advanceTimersByTimeAsync(10_000);
    // Um uso rápido depois não encurta o prazo do anterior.
    await resource.use(() => {});
    await vi.advanceTimersByTimeAsync(200_000);
    expect(log).toEqual(['cria 1']);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(log).toEqual(['cria 1', 'libera 1']);
  });

  it('o prazo longo não passa para a próxima vez que carregar', async () => {
    const { resource, log } = fake(60_000);
    await resource.use(() => {}, 300_000);
    await vi.advanceTimersByTimeAsync(300_000);
    await resource.use(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    expect(log).toEqual(['cria 1', 'libera 1', 'cria 2', 'libera 2']);
  });

  it('drop libera já (worker que caiu) e os usos antigos não bagunçam a contagem', async () => {
    const { resource, log } = fake();
    const old = deferred();
    const broken = resource.use(() => old.promise);
    resource.drop();
    expect(log).toEqual(['cria 1', 'libera 1']);
    // Um uso novo começa enquanto o antigo ainda não terminou de falhar.
    const fresh = deferred();
    const current = resource.use(() => fresh.promise);
    old.reject(new Error('caiu'));
    await expect(broken).rejects.toThrow('caiu');
    expect(resource.busy).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(log).toEqual(['cria 1', 'libera 1', 'cria 2']);
    fresh.resolve();
    await current;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(log).toEqual(['cria 1', 'libera 1', 'cria 2', 'libera 2']);
  });

  it('releaseIdleNow libera os parados e deixa os em uso', async () => {
    const parado = fake();
    const ocupado = fake();
    await parado.resource.use(() => {});
    const job = deferred();
    const running = ocupado.resource.use(() => job.promise);
    expect(releaseIdleNow()).toBeGreaterThanOrEqual(1);
    expect(parado.log).toEqual(['cria 1', 'libera 1']);
    expect(ocupado.log).toEqual(['cria 1']);
    job.resolve();
    await running;
  });

  it('erro ao criar não deixa um uso pendurado', async () => {
    let fail = true;
    const resource = new IdleResource({
      create: () => {
        if (fail) throw new Error('sem modelo');
        return 1;
      },
      release: () => {},
      idleMs: 1000,
    });
    await expect(resource.use(() => {})).rejects.toThrow('sem modelo');
    expect(resource.busy).toBe(0);
    fail = false;
    expect(await resource.use((v) => v + 1)).toBe(2);
  });
});
