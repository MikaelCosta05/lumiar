import { describe, expect, it } from 'vitest';
import { createCamera, evaluateCamera, IDENTITY, sourceToScreen } from './camera';
import {
  accumulatePath,
  applyStabilization,
  buildStabilization,
  chooseZoom,
  corrections,
  fitCorrection,
  frameZoom,
  gaussianSmooth,
  MAX_STABILIZE_ZOOM,
  orientCorrection,
  sampleStabilization,
  smoothPath,
  type FrameMotion,
  type Stabilization,
} from './stabilize';

const W = 320;
const H = 180;
const FPS = 30;

/** Passos de quadro a quadro a partir das posições (deslocamento e giro) de cada quadro. */
function motionsFrom(poses: { x: number; y: number; angle: number }[]): FrameMotion[] {
  return poses.map((p, i) => {
    if (i === 0) return { t: 0, dx: 0, dy: 0, angle: 0 };
    const prev = poses[i - 1];
    const angle = p.angle - prev.angle;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { t: i / FPS, dx: p.x - (c * prev.x - s * prev.y), dy: p.y - (s * prev.x + c * prev.y), angle };
  });
}

const std = (values: number[]) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
};

describe('caminho da câmera', () => {
  it('soma os deslocamentos e compõe os giros', () => {
    const path = accumulatePath([
      { t: 0, dx: 99, dy: 99, angle: 1 }, // o primeiro quadro é a referência: não conta
      { t: 1, dx: 2, dy: 0, angle: 0 },
      { t: 2, dx: 0, dy: 0, angle: Math.PI / 2 },
    ]);
    expect(path[0]).toEqual({ x: 0, y: 0, angle: 0 });
    expect(path[1]).toEqual({ x: 2, y: 0, angle: 0 });
    // Girar 90° leva o deslocamento (2, 0) para (0, 2).
    expect(path[2].x).toBeCloseTo(0, 9);
    expect(path[2].y).toBeCloseTo(2, 9);
    expect(path[2].angle).toBeCloseTo(Math.PI / 2, 9);
  });

  it('volta às posições usadas para gerar os passos', () => {
    const poses = Array.from({ length: 20 }, (_, i) => ({ x: i * 1.5 + Math.sin(i), y: Math.sin(i * 1.3) * 3, angle: Math.sin(i * 0.7) * 0.02 }));
    accumulatePath(motionsFrom(poses)).forEach((p, i) => {
      expect(p.x).toBeCloseTo(poses[i].x, 9);
      expect(p.y).toBeCloseTo(poses[i].y, 9);
      expect(p.angle).toBeCloseTo(poses[i].angle, 9);
    });
  });
});

describe('suavização', () => {
  it('não mexe em valor constante nem em reta (nem nas pontas)', () => {
    expect(gaussianSmooth(Array(40).fill(3), 6).every((v) => Math.abs(v - 3) < 1e-9)).toBe(true);
    const ramp = Array.from({ length: 40 }, (_, i) => 2 * i - 5);
    gaussianSmooth(ramp, 8).forEach((v, i) => expect(v).toBeCloseTo(ramp[i], 9));
  });

  it('tira o tremido rápido', () => {
    const shaky = Array.from({ length: 120 }, (_, i) => Math.sin(i * 1.7) * 5 + ((i * 7919) % 13) - 6);
    expect(std(gaussianSmooth(shaky, 10))).toBeLessThan(std(shaky) * 0.15);
  });

  it('desvio pequeno demais (ou poucos pontos) deixa como está', () => {
    expect(gaussianSmooth([1, 5, 2], 0.2)).toEqual([1, 5, 2]);
    expect(gaussianSmooth([1, 5], 4)).toEqual([1, 5]);
  });
});

describe('correção', () => {
  it('panorâmica reta não é corrigida; o tremido em cima dela é', () => {
    const jitter = (i: number) => Math.sin(i * 2.1) * 4;
    const poses = Array.from({ length: 150 }, (_, i) => ({ x: i * 2 + jitter(i), y: 0, angle: 0 }));
    const path = accumulatePath(motionsFrom(poses));
    const list = corrections(path, smoothPath(path, 15), W, H);
    list.slice(20, -20).forEach((c, i) => expect(c.x * W).toBeCloseTo(jitter(i + 20), 0));
    const pan = accumulatePath(motionsFrom(poses.map((p, i) => ({ ...p, x: i * 2 }))));
    expect(corrections(pan, smoothPath(pan, 15), W, H).every((c) => Math.abs(c.x) < 1e-9)).toBe(true);
  });

  it('com a câmera virtual, um ponto da cena fica parado na tela (deslocamento e giro)', () => {
    const n = 90;
    const shake = (i: number) => ({ x: Math.sin(i * 1.9) * 5, y: Math.cos(i * 2.3) * 4, angle: Math.sin(i * 1.3) * 0.012 });
    const { stabilization } = buildStabilization(motionsFrom(Array.from({ length: n }, (_, i) => shake(i))), { strength: 'forte', width: W, height: H });
    const world = { x: 0.7, y: 0.3 };
    const raw: number[] = [];
    const fixed: number[] = [];
    for (let i = 10; i < n - 10; i++) {
      // Onde o ponto aparece no quadro i: a imagem girou e andou com o tremido.
      const p = shake(i);
      const qx = (world.x - 0.5) * W;
      const qy = (world.y - 0.5) * H;
      const c = Math.cos(p.angle);
      const s = Math.sin(p.angle);
      const source = { x: (c * qx - s * qy + p.x) / W + 0.5, y: (s * qx + c * qy + p.y) / H + 0.5 };
      const view = { ...applyStabilization(IDENTITY, stabilization, i / FPS), fill: false };
      const screen = sourceToScreen(source, view, { width: W, height: H }, { width: W, height: H });
      raw.push(source.x * W, source.y * H);
      fixed.push((screen.x - 0.5) / stabilization.zoom + 0.5, (screen.y - 0.5) / stabilization.zoom + 0.5);
    }
    const spread = (list: number[], axis: number, scale: number) => std(list.filter((_, k) => k % 2 === axis).map((v) => v * scale));
    expect(spread(fixed, 0, W)).toBeLessThan(spread(raw, 0, 1) * 0.15);
    expect(spread(fixed, 1, H)).toBeLessThan(spread(raw, 1, 1) * 0.15);
  });

  it('clipe girado ou espelhado: a correção segue o jeito que a imagem aparece', () => {
    // Igual ao shader: na tela d → no arquivo (d.y, 1 − d.x) com giro de 90°.
    const toFile = (d: { x: number; y: number }) => ({ x: d.y, y: 1 - d.x });
    const fromFile = (f: { x: number; y: number }) => ({ x: 1 - f.y, y: f.x });
    const point = { x: 0.3, y: 0.6 };
    const moved = fromFile({ x: toFile(point).x + 0.02, y: toFile(point).y - 0.01 });
    const turned = orientCorrection({ x: 0.02, y: -0.01, rotation: 1 }, 90, false, false);
    expect(turned.x).toBeCloseTo(moved.x - point.x, 9);
    expect(turned.y).toBeCloseTo(moved.y - point.y, 9);
    expect(turned.rotation).toBe(1);
    expect(orientCorrection({ x: 0.02, y: -0.01, rotation: 1 }, 180, false, false)).toEqual({ x: -0.02, y: 0.01, rotation: 1 });
    expect(orientCorrection({ x: 0.02, y: -0.01, rotation: 1 }, 0, true, false)).toEqual({ x: -0.02, y: -0.01, rotation: -1 });
    expect(orientCorrection({ x: 0.02, y: -0.01, rotation: 1 }, 0, true, true)).toEqual({ x: -0.02, y: 0.01, rotation: 1 });
  });
});

describe('zoom para esconder as bordas', () => {
  const aspect = 16 / 9;

  it('sem correção não precisa de zoom; deslocamento e giro pedem mais', () => {
    expect(frameZoom({ x: 0, y: 0, rotation: 0 }, aspect)).toBe(1);
    expect(frameZoom({ x: 0.05, y: 0, rotation: 0 }, aspect)).toBeCloseTo(1 / 0.9, 9);
    const r = (2 * Math.PI) / 180;
    expect(frameZoom({ x: 0, y: 0, rotation: 2 }, aspect)).toBeCloseTo(Math.cos(r) + Math.sin(r) * aspect, 9);
    expect(frameZoom({ x: 0.5, y: 0, rotation: 0 }, aspect)).toBe(Infinity);
  });

  it('um solavanco isolado não amplia o clipe todo; tremido grande para no máximo', () => {
    const calm = Array.from({ length: 100 }, (_, i) => ({ x: i === 50 ? 0.2 : 0.02, y: 0, rotation: 0 }));
    expect(chooseZoom(calm, aspect).zoom).toBeCloseTo(1 / 0.96, 9);
    const wild = Array.from({ length: 100 }, () => ({ x: 0.2, y: 0.1, rotation: 3 }));
    expect(chooseZoom(wild, aspect)).toEqual({ zoom: MAX_STABILIZE_ZOOM, capped: true });
    expect(chooseZoom([], aspect)).toEqual({ zoom: 1, capped: false });
  });

  it('a correção cortada sempre cabe no zoom escolhido', () => {
    for (const c of [{ x: 0.2, y: -0.15, rotation: 6 }, { x: -0.01, y: 0.3, rotation: -1 }, { x: 0.03, y: 0.02, rotation: 0.5 }]) {
      const fitted = fitCorrection(c, 1.12, aspect);
      expect(frameZoom(fitted, aspect)).toBeLessThanOrEqual(1.12 + 1e-9);
      expect(Math.sign(fitted.x) * Math.sign(c.x)).toBeGreaterThanOrEqual(0);
    }
    // O que já cabe fica igual.
    const small = { x: 0.01, y: -0.01, rotation: 0.3 };
    expect(fitCorrection(small, 1.2, aspect)).toEqual({ ...small, rotation: expect.closeTo(0.3, 9) });
  });

  it('monta a estabilização com zoom e marca quando bateu no máximo', () => {
    const gentle = Array.from({ length: 60 }, (_, i) => ({ x: Math.sin(i * 2) * 3, y: Math.cos(i * 2.5) * 2, angle: 0 }));
    const built = buildStabilization(motionsFrom(gentle), { strength: 'media', width: W, height: H });
    expect(built.capped).toBe(false);
    expect(built.stabilization.zoom).toBeGreaterThan(1);
    expect(built.stabilization.zoom).toBeLessThan(1.1);
    expect(built.stabilization.times).toHaveLength(60);
    const violent = Array.from({ length: 60 }, (_, i) => ({ x: (i % 2) * 100, y: 0, angle: 0 }));
    expect(buildStabilization(motionsFrom(violent), { strength: 'forte', width: W, height: H }).capped).toBe(true);
  });
});

describe('no tempo do arquivo', () => {
  const stab: Stabilization = { strength: 'media', zoom: 1.1, times: [1, 1.04, 1.08], x: [0.01, 0.02, 0.03], y: [0, -0.01, 0], rotation: [0, 1, 2] };

  it('vale o quadro que está na tela (o último que já começou), e as pontas fora do trecho', () => {
    expect(sampleStabilization(stab, 1.02).x).toBe(0.01);
    expect(sampleStabilization(stab, 1.0399).x).toBe(0.02); // arredondamento do tempo
    expect(sampleStabilization(stab, 1.06).rotation).toBe(1);
    expect(sampleStabilization(stab, 0.5).x).toBe(0.01);
    expect(sampleStabilization(stab, 9).x).toBe(0.03);
  });

  it('soma com os keyframes da câmera (não apaga o movimento do usuário)', () => {
    const camera = { ...createCamera(), base: { zoom: 1.5, x: 0.4, y: 0.5, rotation: 10 }, stabilize: stab };
    const view = evaluateCamera(camera, 0, 1.05);
    expect(view.zoom).toBeCloseTo(1.65, 9);
    expect(view.x).toBeCloseTo(0.42, 9);
    expect(view.y).toBeCloseTo(0.49, 9);
    expect(view.rotation).toBeCloseTo(11, 9);
    expect(evaluateCamera({ ...camera, stabilize: undefined }, 0, 1.05)).toEqual(camera.base);
  });
});
