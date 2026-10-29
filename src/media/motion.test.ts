import { describe, expect, it } from 'vitest';
import { blockMotion, estimateRigid, pyramid, type BlockMatch, type Gray } from './motion';

const W = 320;
const H = 180;

/** Números "aleatórios" repetíveis. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Textura contínua (ruído interpolado), para gerar quadros deslocados com fração de pixel. */
function texture(seed: number) {
  const rand = random(seed);
  const SIZE = 128;
  const STEP = 5;
  const grid = Float32Array.from({ length: SIZE * SIZE }, () => rand() * 255);
  const at = (i: number, j: number) => grid[(((j % SIZE) + SIZE) % SIZE) * SIZE + (((i % SIZE) + SIZE) % SIZE)];
  const ease = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const gx = x / STEP + 40;
    const gy = y / STEP + 40;
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = ease(gx - i);
    const fy = ease(gy - j);
    const top = at(i, j) * (1 - fx) + at(i + 1, j) * fx;
    const bottom = at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
}

/** Quadro em que a imagem girou `angle` (radianos) em volta do centro e andou (dx, dy). */
function frame(f: (x: number, y: number) => number, dx = 0, dy = 0, angle = 0): Gray {
  const data = new Float32Array(W * H);
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x - W / 2 - dx;
      const py = y - H / 2 - dy;
      data[y * W + x] = f(c * px - s * py + W / 2, s * px + c * py + H / 2);
    }
  }
  return { data, width: W, height: H };
}

describe('movimento entre quadros', () => {
  const f = texture(7);
  const base = pyramid(frame(f));

  it('acha um deslocamento com fração de pixel', () => {
    const motion = estimateRigid(blockMotion(base, pyramid(frame(f, 3.4, -2.6))), W, H);
    expect(motion).not.toBeNull();
    expect(Math.abs(motion!.dx - 3.4)).toBeLessThan(0.25);
    expect(Math.abs(motion!.dy + 2.6)).toBeLessThan(0.25);
    expect(Math.abs(motion!.angle)).toBeLessThan(0.002);
  });

  it('acha movimentos grandes (procura em duas resoluções)', () => {
    const motion = estimateRigid(blockMotion(base, pyramid(frame(f, -14, 11))), W, H);
    expect(Math.abs(motion!.dx + 14)).toBeLessThan(0.3);
    expect(Math.abs(motion!.dy - 11)).toBeLessThan(0.3);
  });

  it('acha o giro junto com o deslocamento', () => {
    const angle = (0.8 * Math.PI) / 180;
    const motion = estimateRigid(blockMotion(base, pyramid(frame(f, -5, 4, angle))), W, H);
    expect(Math.abs(motion!.angle - angle)).toBeLessThan((0.1 * Math.PI) / 180);
    expect(Math.abs(motion!.dx + 5)).toBeLessThan(0.4);
    expect(Math.abs(motion!.dy - 4)).toBeLessThan(0.4);
  });

  it('ignora um objeto que se mexe sozinho', () => {
    const still = frame(f, 2, 1);
    const other = texture(99);
    // Um terço da imagem (à direita) é outro objeto, andando para outro lado.
    const moving = frame(other, -8, 6);
    for (let y = 0; y < H; y++) for (let x = Math.round(W * 0.67); x < W; x++) still.data[y * W + x] = moving.data[y * W + x];
    const before = frame(f);
    const objectBefore = frame(other);
    for (let y = 0; y < H; y++) for (let x = Math.round(W * 0.67); x < W; x++) before.data[y * W + x] = objectBefore.data[y * W + x];
    const motion = estimateRigid(blockMotion(pyramid(before), pyramid(still)), W, H);
    expect(Math.abs(motion!.dx - 2)).toBeLessThan(0.3);
    expect(Math.abs(motion!.dy - 1)).toBeLessThan(0.3);
  });

  it('imagem lisa não tem o que medir', () => {
    const flat: Gray = { data: new Float32Array(W * H).fill(90), width: W, height: H };
    expect(blockMotion(pyramid(flat), pyramid(flat))).toEqual([]);
    expect(estimateRigid([], W, H)).toBeNull();
  });
});

describe('estimar a câmera pelos pares de pontos', () => {
  /** Pares de uma grade movida por giro + deslocamento, com uma parte "mentirosa". */
  function pairs(angle: number, dx: number, dy: number, outliers: number): BlockMatch[] {
    const rand = random(3);
    const list: BlockMatch[] = [];
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let i = 0; i < 60; i++) {
      const x = 20 + (i % 10) * 30;
      const y = 20 + Math.floor(i / 10) * 28;
      const qx = x - W / 2;
      const qy = y - H / 2;
      const nx = c * qx - s * qy + dx + W / 2;
      const ny = s * qx + c * qy + dy + H / 2;
      const wrong = i % 10 < outliers * 10;
      list.push(wrong ? { x, y, dx: 15 * rand() - 7, dy: 15 * rand() + 3 } : { x, y, dx: nx - x, dy: ny - y });
    }
    return list;
  }

  it('recupera o movimento exato sem pontos errados', () => {
    const m = estimateRigid(pairs(0.01, 3, -2, 0), W, H)!;
    expect(m.angle).toBeCloseTo(0.01, 6);
    expect(m.dx).toBeCloseTo(3, 4);
    expect(m.dy).toBeCloseTo(-2, 4);
    expect(m.inliers).toBe(60);
  });

  it('não se deixa levar por 30% de pontos errados', () => {
    const m = estimateRigid(pairs(-0.006, -4.5, 1.25, 0.3), W, H)!;
    expect(m.angle).toBeCloseTo(-0.006, 5);
    expect(m.dx).toBeCloseTo(-4.5, 3);
    expect(m.dy).toBeCloseTo(1.25, 3);
    expect(m.inliers).toBe(42);
  });

  it('desiste quando quase nada concorda', () => {
    const rand = random(11);
    const noise = Array.from({ length: 30 }, (_, i) => ({ x: 20 + i * 9, y: 90, dx: rand() * 40 - 20, dy: rand() * 40 - 20 }));
    expect(estimateRigid(noise, W, H)).toBeNull();
  });
});
