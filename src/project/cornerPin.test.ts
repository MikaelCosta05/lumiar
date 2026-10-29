import { describe, expect, it } from 'vitest';
import { cornersAt, correctCorners, defaultCorners, pinOverlays, screenCorners, type CornerPin } from './cornerPin';
import { createCamera } from './camera';
import type { ActiveClip, ActiveOverlay, ClipLayout, MediaItem, OverlayClip } from './model';

const media = { id: 'm', kind: 'video', width: 1280, height: 720 } as MediaItem;
const square = [0.2, 0.2, 0.6, 0.2, 0.6, 0.6, 0.2, 0.6];

function active(clipId: string, sourceTime: number, camera?: OverlayClip['camera']): ActiveClip {
  const layout = { clip: { id: clipId, trimIn: 0, camera }, media, start: 0, length: 10 } as unknown as ClipLayout;
  return { layout, sourceTime, clipTime: sourceTime };
}

describe('trocar a tela', () => {
  const pin: CornerPin = {
    clipId: 'base',
    corners: square,
    at: 1,
    track: [
      { t: 1, c: square },
      { t: 2, c: square.map((v, i) => (i % 2 === 0 ? v + 0.1 : v)) },
    ],
  };

  it('os cantos andam em linha reta entre as amostras do rastro e param nas pontas', () => {
    expect(cornersAt(pin, 1.5)[0]).toBeCloseTo(0.25, 9);
    expect(cornersAt(pin, 1.5)[1]).toBeCloseTo(0.2, 9);
    expect(cornersAt(pin, 0)).toEqual(square);
    expect(cornersAt(pin, 9)[0]).toBeCloseTo(0.3, 9);
    expect(cornersAt({ ...pin, track: undefined }, 5)).toEqual(square);
  });

  it('corrigir à mão vale inteiro no instante e some aos poucos', () => {
    const fixed = correctCorners(pin, 1.5, cornersAt(pin, 1.5).map((v, i) => (i === 0 ? v + 0.05 : v)), 1);
    expect(cornersAt(fixed, 1.5)[0]).toBeCloseTo(0.3, 9);
    // A 0,5 s de distância, metade da correção.
    expect(cornersAt(fixed, 1)[0]).toBeCloseTo(0.2 + 0.025, 9);
    expect(cornersAt(fixed, 2)[0]).toBeCloseTo(0.3 + 0.025, 9);
    // Os outros cantos não mudam.
    expect(cornersAt(fixed, 1.5)[2]).toBeCloseTo(cornersAt(pin, 1.5)[2], 9);
    // Sem rastro: os cantos passam a ser os novos.
    expect(correctCorners({ ...pin, track: undefined }, 3, square.map((v) => v + 0.01)).corners[0]).toBeCloseTo(0.21, 9);
  });

  it('cantos iniciais têm a proporção da sobreposição', () => {
    const c = defaultCorners({ width: 1920, height: 1080 }, { width: 1000, height: 1000 });
    const w = (c[2] - c[0]) * 1920;
    const h = (c[5] - c[1]) * 1080;
    expect(w / h).toBeCloseTo(1, 6);
  });

  it('sem câmera, os cantos na tela são os da imagem (mesma proporção)', () => {
    const screen = screenCorners(pin, active('base', 1), { width: 1280, height: 720 })!;
    screen.forEach((v, i) => expect(v).toBeCloseTo(square[i], 9));
  });

  it('com zoom no clipe de baixo, os cantos se afastam do centro junto com a imagem', () => {
    const camera = { ...createCamera(), base: { zoom: 2, x: 0.5, y: 0.5, rotation: 0 } };
    const screen = screenCorners({ ...pin, track: undefined }, active('base', 1, camera), { width: 1280, height: 720 })!;
    expect(screen[0]).toBeCloseTo(0.5 + (0.2 - 0.5) * 2, 6);
    expect(screen[1]).toBeCloseTo(0.5 + (0.2 - 0.5) * 2, 6);
  });

  it('a camada só ganha os cantos quando o clipe de baixo aparece no quadro', () => {
    const overlay = { active: { ...active('cima', 0), layout: { ...active('cima', 0).layout, clip: { id: 'cima', cornerPin: pin } } }, opacity: 1 } as unknown as ActiveOverlay;
    const [withBase] = pinOverlays([overlay], { a: active('base', 1.5), b: null }, { width: 1280, height: 720 });
    expect(withBase.corners).toHaveLength(8);
    const [without] = pinOverlays([overlay], { a: active('outro', 1.5), b: null }, { width: 1280, height: 720 });
    expect(without.corners).toBeUndefined();
  });

  it('cantos que se cruzam não são usados', () => {
    const crossed = { ...pin, track: undefined, corners: [0.2, 0.2, 0.6, 0.6, 0.6, 0.2, 0.2, 0.6] };
    expect(screenCorners(crossed, active('base', 1), { width: 1280, height: 720 })).toBeNull();
  });
});
