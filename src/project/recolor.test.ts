import { describe, expect, it } from 'vitest';
import { chromaHue, oklabToRgb, recolorPixel, rgbToOklab, skinLikeness, type Rgb } from './recolor';

const RED: Rgb = [0.85, 0.2, 0.17];
const BLUE_SHIRT: Rgb = [0.12, 0.2, 0.55];
const angle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('trocar a cor: conversão OKLab', () => {
  it('ida e volta devolve a mesma cor', () => {
    for (const c of [[0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5], RED, BLUE_SHIRT, [0.2, 0.8, 0.3], [1, 0.9, 0]] as Rgb[]) {
      const back = oklabToRgb(rgbToOklab(c));
      back.forEach((v, i) => expect(v).toBeCloseTo(c[i], 4));
    }
  });

  it('valores de referência do OKLab', () => {
    // Branco: L = 1, sem cor. Vermelho puro: L ≈ 0,628, a ≈ 0,225, b ≈ 0,126 (tabela do OKLab).
    const white = rgbToOklab([1, 1, 1]);
    expect(white[0]).toBeCloseTo(1, 3);
    expect(Math.hypot(white[1], white[2])).toBeLessThan(1e-3);
    const red = rgbToOklab([1, 0, 0]);
    expect(red[0]).toBeCloseTo(0.628, 2);
    expect(red[1]).toBeCloseTo(0.225, 2);
    expect(red[2]).toBeCloseTo(0.126, 2);
  });
});

describe('trocar a cor de um pixel', () => {
  it('mantém a luz de cada pixel (sombra continua sombra, brilho continua brilho)', () => {
    for (const pixel of [BLUE_SHIRT, [0.05, 0.08, 0.2], [0.4, 0.5, 0.9], [0.3, 0.3, 0.3]] as Rgb[]) {
      const out = recolorPixel(pixel, RED, { saturation: 1, brightness: 0 });
      expect(rgbToOklab(out)[0]).toBeCloseTo(rgbToOklab(pixel)[0], 2);
    }
  });

  it('o matiz vira o da cor escolhida', () => {
    const out = recolorPixel(BLUE_SHIRT, RED, { saturation: 1, brightness: 0 });
    expect(angle(chromaHue(rgbToOklab(out)).hue, chromaHue(rgbToOklab(RED)).hue)).toBeLessThan(0.02);
    // E fica avermelhado mesmo: vermelho maior que o azul.
    expect(out[0]).toBeGreaterThan(out[2]);
  });

  it('pinta também o que era cinza ou branco (a saturação vem da cor escolhida)', () => {
    const out = recolorPixel([0.6, 0.6, 0.6], RED, { saturation: 1, brightness: 0 });
    expect(chromaHue(rgbToOklab(out)).chroma).toBeGreaterThan(0.08);
  });

  it('saturação 0 deixa cinza com a mesma luz; 2 satura mais (até o limite da tela)', () => {
    const gray = recolorPixel(BLUE_SHIRT, RED, { saturation: 0, brightness: 0 });
    expect(Math.max(...gray) - Math.min(...gray)).toBeLessThan(1e-3);
    const c1 = chromaHue(rgbToOklab(recolorPixel([0.5, 0.5, 0.5], [0.6, 0.45, 0.4], { saturation: 1, brightness: 0 }))).chroma;
    const c2 = chromaHue(rgbToOklab(recolorPixel([0.5, 0.5, 0.5], [0.6, 0.45, 0.4], { saturation: 2, brightness: 0 }))).chroma;
    expect(c2).toBeGreaterThan(c1 * 1.5);
  });

  it('nunca sai da tela: cores impossíveis perdem saturação em vez de estourar', () => {
    // Azul saturado num pixel quase branco (não existe): fica um azul bem claro, ainda com o matiz.
    const out = recolorPixel([0.97, 0.97, 0.97], [0, 0, 1], { saturation: 2, brightness: 0 });
    out.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
    expect(rgbToOklab(out)[0]).toBeCloseTo(rgbToOklab([0.97, 0.97, 0.97])[0], 2);
    expect(out[2]).toBeGreaterThan(out[0]);
  });

  it('clarear e escurecer mudam só a luz', () => {
    const base = rgbToOklab(recolorPixel(BLUE_SHIRT, RED, { saturation: 1, brightness: 0 }))[0];
    expect(rgbToOklab(recolorPixel(BLUE_SHIRT, RED, { saturation: 1, brightness: 0.2 }))[0]).toBeCloseTo(base + 0.2, 2);
    expect(rgbToOklab(recolorPixel(BLUE_SHIRT, RED, { saturation: 1, brightness: -0.1 }))[0]).toBeCloseTo(base - 0.1, 2);
  });
});

describe('proteger a pele', () => {
  it('reconhece tons de pele e não reconhece roupas coloridas nem cinza', () => {
    for (const s of [[0.87, 0.67, 0.55], [0.55, 0.37, 0.27], [0.95, 0.8, 0.7]] as Rgb[]) expect(skinLikeness(s)).toBeGreaterThan(0.5);
    for (const c of [BLUE_SHIRT, [0.2, 0.6, 0.25], [0.5, 0.5, 0.5], [0.05, 0.05, 0.05]] as Rgb[]) expect(skinLikeness(c)).toBeLessThan(0.1);
  });
});
