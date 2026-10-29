import { describe, expect, it } from 'vitest';
import { kWeightStages, lufsOf } from '../media/loudness';
import { measureBlock, meterFall, ShortTermLoudness, toDbfs } from './meters';

describe('filtro K', () => {
  it('tem os coeficientes da norma BS.1770 em 48 kHz', () => {
    const [shelf, highpass] = kWeightStages(48000);
    [1.53512485958697, -2.69169618940638, 1.19839281085285].forEach((v, i) => expect(shelf.b[i]).toBeCloseTo(v, 6));
    [-1.69065929318241, 0.73248077421585].forEach((v, i) => expect(shelf.a[i]).toBeCloseTo(v, 6));
    expect(highpass.b).toEqual([1, -2, 1]);
    [-1.99004745483398, 0.99007225036621].forEach((v, i) => expect(highpass.a[i]).toBeCloseTo(v, 6));
    expect(lufsOf(1)).toBeCloseTo(-0.691, 6);
    expect(lufsOf(0)).toBe(-Infinity);
  });
});

describe('medidores', () => {
  it('pico e RMS de um seno', () => {
    const data = new Float32Array(4800);
    for (let i = 0; i < data.length; i++) data[i] = 0.5 * Math.sin((2 * Math.PI * 100 * i) / 48000);
    const { peak, meanSquare } = measureBlock(data);
    expect(peak).toBeCloseTo(0.5, 3);
    expect(Math.sqrt(meanSquare)).toBeCloseTo(0.5 / Math.SQRT2, 3);
    expect(measureBlock(new Float32Array(0))).toEqual({ peak: 0, meanSquare: 0 });
  });

  it('dBFS', () => {
    expect(toDbfs(1)).toBe(0);
    expect(toDbfs(0.5)).toBeCloseTo(-6.02, 2);
    expect(toDbfs(0)).toBe(-Infinity);
  });

  it('o ponteiro sobe na hora e desce devagar', () => {
    expect(meterFall(-20, -6, 0.016)).toBe(-6);
    expect(meterFall(-6, -40, 0.5)).toBe(-18);
    expect(meterFall(-6, -10, 1)).toBe(-10);
    expect(meterFall(-Infinity, -Infinity, 0.1)).toBe(-Infinity);
  });

  it('sonoridade de curto prazo: média dos últimos 3 s', () => {
    const meter = new ShortTermLoudness();
    expect(meter.value()).toBe(-Infinity);
    // Blocos iguais: a sonoridade é a do próprio bloco.
    for (let k = 0; k < 30; k++) meter.push(k * 0.1, 0.1);
    expect(meter.value()).toBeCloseTo(-0.691 + 10 * Math.log10(0.1), 6);
    // Depois de 3 s de silêncio, os blocos antigos saem da janela.
    for (let k = 30; k < 70; k++) meter.push(k * 0.1, 0);
    expect(meter.value()).toBe(-Infinity);
    meter.reset();
    expect(meter.value()).toBe(-Infinity);
  });
});
