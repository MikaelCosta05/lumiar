import { describe as group, expect, it } from 'vitest';
import { compareShot, describe, diffPixels, failed, isChanged, LIMITS, reportHtml, shotFile, summarize, type Bitmap, type ShotResult } from './visualDiff';

/** Imagem w×h de uma cor só; `paint` muda pixels (índice → [r, g, b]). */
function image(w: number, h: number, rgb: [number, number, number], paint: Record<number, [number, number, number]> = {}): Bitmap {
  const data = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) data.set([...(paint[p] ?? rgb), 255], p * 4);
  return { data, width: w, height: h };
}

const shot = (id: string, label: string, status: ShotResult['status'], changed = 0, mean = 0, max = 0): ShotResult => ({
  id,
  label,
  status,
  diff: status === 'novo' || status === 'faltou' ? null : { changed, mean, max },
});

group('diferença por pixel', () => {
  it('imagens iguais dão zero', () => {
    const a = image(4, 4, [10, 20, 30]);
    expect(diffPixels(a.data, a.data, 8)).toEqual({ changed: 0, mean: 0, max: 0 });
  });

  it('conta como mudado só o pixel acima da tolerância, pelo canal que mais mudou', () => {
    const a = image(10, 10, [100, 100, 100]);
    const b = image(10, 10, [100, 100, 100], { 0: [100, 100, 109], 1: [104, 100, 100] });
    const d = diffPixels(a.data, b.data, 8);
    expect(d.changed).toBeCloseTo(1 / 100);
    expect(d.max).toBe(9);
    expect(d.mean).toBeCloseTo(13 / 300);
  });

  it('ignora o alfa', () => {
    const a = image(2, 2, [50, 50, 50]);
    const b = image(2, 2, [50, 50, 50]);
    b.data[3] = 0;
    expect(diffPixels(a.data, b.data, 0).max).toBe(0);
  });

  it('o mapa marca em magenta o que mudou e escurece o resto', () => {
    const a = image(2, 1, [200, 200, 200]);
    const b = image(2, 1, [200, 200, 200], { 1: [0, 200, 200] });
    const map = new Uint8Array(a.data.length);
    diffPixels(a.data, b.data, 8, map);
    expect([...map.slice(0, 4)]).toEqual([60, 60, 60, 255]);
    expect(map[4]).toBe(255);
    expect(map[6]).toBe(255);
    expect(map[5]).toBe(30);
  });

  it('recusa tamanhos diferentes', () => {
    expect(() => diffPixels(new Uint8Array(4), new Uint8Array(8), 8)).toThrow();
  });
});

group('quadro mudou ou não', () => {
  it('ruído de 1 ou 2 níveis (dither, arredondamento da placa) não acusa', () => {
    const a = image(48, 27, [120, 80, 40]);
    const paint: Record<number, [number, number, number]> = {};
    for (let p = 0; p < 48 * 27; p += 3) paint[p] = [121, 79, 41];
    expect(compareShot(a, image(48, 27, [120, 80, 40], paint)).status).toBe('igual');
  });

  it('uma mudança pequena na imagem toda (abaixo da tolerância por pixel) acusa pela média', () => {
    const a = image(48, 27, [120, 120, 120]);
    const b = image(48, 27, [124, 124, 124]);
    const d = diffPixels(a.data, b.data, LIMITS.pixel);
    expect(d.changed).toBe(0);
    expect(isChanged(d)).toBe(true);
    expect(compareShot(a, b).status).toBe('mudou');
  });

  it('uma área pequena que mudou muito acusa pela fração de pixels', () => {
    const paint: Record<number, [number, number, number]> = {};
    for (let p = 0; p < 20; p++) paint[p] = [255, 255, 255];
    const d = compareShot(image(100, 100, [0, 0, 0]), image(100, 100, [0, 0, 0], paint));
    expect(d.status).toBe('mudou');
    expect(d.diff!.changed).toBeCloseTo(0.002);
  });

  it('sem referência é novo, sem a atual faltou, tamanho diferente mudou tudo', () => {
    const a = image(4, 4, [0, 0, 0]);
    expect(compareShot(null, a).status).toBe('novo');
    expect(compareShot(a, null).status).toBe('faltou');
    expect(compareShot(a, image(4, 2, [0, 0, 0]))).toEqual({ status: 'mudou', diff: { changed: 1, mean: 255, max: 255 } });
  });
});

group('resumo por plugin', () => {
  it('ordena do mais diferente para o menos: erro, sumiu, mudou (fração, depois média), novo, igual', () => {
    const results = summarize(
      [
        shot('effects/a', 't=0.5', 'igual', 0, 0.1, 2),
        shot('effects/b', 't=0.5', 'mudou', 0.01, 1, 40),
        shot('effects/b', 't=1.5', 'mudou', 0.3, 5, 200),
        shot('effects/c', 't=0.5', 'mudou', 0.3, 9, 90),
        shot('effects/d', 't=0.5', 'novo'),
        shot('effects/e', 't=0.5', 'igual'),
      ],
      [{ id: 'effects/e', message: 'não compilou' }],
      ['packs/x'],
    );
    expect(results.map((r) => [r.id, r.status])).toEqual([
      ['effects/e', 'erro'],
      ['packs/x', 'sumiu'],
      ['effects/c', 'mudou'],
      ['effects/b', 'mudou'],
      ['effects/d', 'novo'],
      ['effects/a', 'igual'],
    ]);
    expect(results.find((r) => r.id === 'effects/b')!.worst).toEqual({ changed: 0.3, mean: 5, max: 200 });
    expect(failed(results)).toBe(true);
  });

  it('um quadro que faltou conta como mudança total', () => {
    const [r] = summarize([shot('filters/x', 't=0.5', 'igual'), shot('filters/x', 't=1.5', 'faltou')]);
    expect(r.status).toBe('mudou');
    expect(r.worst!.changed).toBe(1);
  });

  it('só iguais e novos não falham', () => {
    expect(failed(summarize([shot('effects/a', 't=0.5', 'igual'), shot('effects/d', 't=0.5', 'novo')]))).toBe(false);
  });

  it('a linha do terminal mostra a fração, a média e os quadros que mudaram', () => {
    const [r] = summarize([shot('effects/b', 't=0.5', 'igual'), shot('effects/b', 't=1.5', 'mudou', 0.1234, 3.456, 180)]);
    expect(describe(r)).toBe('MUDOU   12.34% dos pixels  média   3.46  máx 180  effects/b  (t=1.5)');
  });
});

group('arquivos e relatório', () => {
  it('nome do arquivo do quadro', () => {
    expect(shotFile('t=0.5')).toBe('t=0.5.png');
    expect(shotFile('p 0,25')).toBe('p_0_25.png');
  });

  it('o relatório mostra referência, atual e diferença só do que mudou', () => {
    const results = summarize([shot('effects/b', 't=1.5', 'mudou', 0.5, 10, 255), shot('effects/a', 't=0.5', 'igual'), shot('effects/<x>', 't=0.5', 'novo')]);
    const html = reportHtml(results, { reference: 'ontem', now: 'hoje', size: '480x270', limits: LIMITS });
    expect(html).toContain('src="referencia/effects/b/t=1.5.png"');
    expect(html).toContain('src="atual/effects/b/t=1.5.png"');
    expect(html).toContain('src="diferenca/effects/b/t=1.5.png"');
    expect(html).not.toContain('referencia/effects/a/');
    expect(html).toContain('effects/&lt;x&gt;');
    expect(html).toContain('Iguais (1)');
  });
});
