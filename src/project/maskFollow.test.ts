import { describe, expect, it } from 'vitest';
import type { LayerMask } from '../engine/renderer';
import { constellation, followMask, followTrack, maskMotion, movePoints, objectPose, type MaskFollow } from './maskFollow';
import type { MediaItem, VideoClip } from './model';

const media = { id: 'm', kind: 'video', width: 1600, height: 900 } as MediaItem;
const clip = { trimIn: 0 } as VideoClip;
const aspect = 1600 / 900;
const path: LayerMask = { shape: 'path', points: [0.4, 0.4, 0.6, 0.4, 0.5, 0.6], x: 0.5, y: 0.5, width: 1, height: 1, feather: 0, invert: false };

const follow: MaskFollow = {
  kind: 'point',
  at: 0,
  scale: true,
  rotate: true,
  track: [
    { t: 0, x: 0.5, y: 0.5, s: 1, a: 0 },
    { t: 1, x: 0.6, y: 0.45, s: 2, a: Math.PI / 2 },
  ],
};

describe('máscara que acompanha', () => {
  it('sem acompanhar, a forma fica como foi desenhada', () => {
    expect(followMask(path, null, clip, media, 1)).toBe(path);
    expect(followMask(path, { ...follow, scale: false, rotate: false }, clip, media, 0)!.points).toEqual(path.points);
  });

  it('só posição: a forma anda junto com o ponto', () => {
    const moved = followMask(path, { ...follow, scale: false, rotate: false }, clip, media, 1)!;
    const expected = [0.5, 0.35, 0.7, 0.35, 0.6, 0.55];
    moved.points!.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
  });

  it('com tamanho e giro: gira em pixels (sem entortar) e dobra de tamanho', () => {
    const moved = followMask(path, follow, clip, media, 1)!;
    // O ponto (0,6; 0,4) estava 0,1 à direita e 0,1 acima do centro: girando 90° (horário) e dobrando,
    // fica 0,2 à direita (em altura de tela) e 0,2·aspect abaixo.
    expect(moved.points![2]).toBeCloseTo(0.6 + 0.2 / aspect, 9);
    expect(moved.points![3]).toBeCloseTo(0.45 + 0.2 * aspect, 9);
  });

  it('desfazer o movimento devolve os pontos desenhados (para editar a forma já andando)', () => {
    const m = maskMotion(follow, clip, media, 0.7)!;
    const there = movePoints(m, path.points!);
    movePoints(m, there, true).forEach((v, i) => expect(v).toBeCloseTo(path.points![i], 9));
  });

  it('forma pronta (círculo) anda e muda de tamanho', () => {
    const ellipse: LayerMask = { ...path, shape: 'ellipse', points: undefined, x: 0.5, y: 0.5, width: 0.3, height: 0.2 };
    const moved = followMask(ellipse, follow, clip, media, 1)!;
    expect(moved.x).toBeCloseTo(0.6, 9);
    expect(moved.y).toBeCloseTo(0.45, 9);
    expect(moved.width).toBeCloseTo(0.6, 9);
  });

  it('espelhado: o ponto andando para a direita no vídeo vai para a esquerda na camada', () => {
    const moved = followMask(path, { ...follow, scale: false, rotate: false }, { ...clip, flipX: true }, media, 1)!;
    expect(moved.points![0]).toBeCloseTo(0.3, 9);
  });

  it('objeto selecionado: segue o centro e o tamanho pela área', () => {
    const frames = [
      { t: 0, area: 0.04, cx: 0.5, cy: 0.5, rle: '' },
      { t: 1, area: 0, cx: 0, cy: 0, rle: '' },
      { t: 2, area: 0.16, cx: 0.7, cy: 0.5, rle: '' },
    ];
    // O quadro em que o objeto sumiu (área 0) não conta.
    expect(objectPose(frames, 1)).toEqual({ x: 0.6, y: 0.5, area: 0.1 });
    const withObject = { ...clip, object: { use: false, at: 0, points: [], width: 8, height: 8, frames } };
    const moved = followMask({ ...path, shape: 'rect', x: 0.5, y: 0.5, width: 0.2, height: 0.2 }, { kind: 'object', at: 0, scale: true, rotate: false }, withObject, media, 2)!;
    expect(moved.x).toBeCloseTo(0.7, 9);
    expect(moved.width).toBeCloseTo(0.4, 9);
  });

  it('rastro: tamanho e giro saem dos pontos de apoio, sem contar os perdidos', () => {
    const p = { x: 0.5, y: 0.5 };
    const ref = constellation(p, aspect).map((q) => ({ ...q, lost: false }));
    // Depois: girou 90° e cresceu 1,5×, em volta do ponto que andou para (0,55; 0,5).
    const now = ref.map((q, k) => {
      const dx = (q.x - p.x) * aspect;
      const dy = q.y - p.y;
      return { x: 0.55 + (-dy * 1.5) / aspect, y: 0.5 + dx * 1.5, lost: k === 3 };
    });
    // Um ponto perdido com posição absurda não atrapalha.
    now[3] = { x: 0.9, y: 0.1, lost: true };
    const track = followTrack([{ t: 0, points: ref }, { t: 1, points: now }], 0, aspect);
    expect(track[0]).toEqual({ t: 0, x: 0.5, y: 0.5, s: 1, a: 0 });
    expect(track[1].x).toBeCloseTo(0.55, 9);
    expect(track[1].s).toBeCloseTo(1.5, 6);
    expect(track[1].a).toBeCloseTo(Math.PI / 2, 6);
  });
});
