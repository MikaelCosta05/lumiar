import { describe, expect, it } from 'vitest';
import type { Gray } from './motion';
import { smoothTrack, trackGrayPoints, type TrackFrame } from './pointTrack';

/** Manchas redondas espalhadas (sempre as mesmas): dá para seguir qualquer ponto. */
const BLOBS = (() => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 260 }, () => ({ x: rand() * 260 - 30, y: rand() * 180 - 30, r: 2.5 + rand() * 4, v: rand() * 160 - 80 }));
})();

/** A textura deslocada (dx, dy) px, com fração de pixel. */
function texture(width: number, height: number, dx: number, dy: number): Gray {
  const data = new Float32Array(width * height).fill(120);
  for (const b of BLOBS) {
    const cx = b.x + dx;
    const cy = b.y + dy;
    for (let y = Math.max(0, Math.floor(cy - b.r * 3)); y < Math.min(height, cy + b.r * 3); y++) {
      for (let x = Math.max(0, Math.floor(cx - b.r * 3)); x < Math.min(width, cx + b.r * 3); x++) {
        data[y * width + x] += b.v * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * b.r * b.r));
      }
    }
  }
  return { data, width, height };
}

describe('seguir vários pontos', () => {
  const W = 200;
  const H = 120;
  // A imagem anda 1,7 px para a direita e 0,9 px para baixo por quadro.
  const frames: TrackFrame[] = Array.from({ length: 12 }, (_, i) => ({ t: i / 10, img: texture(W, H, i * 1.7, i * 0.9) }));
  const start = 4;
  const points = [
    { x: 0.3, y: 0.35 },
    { x: 0.7, y: 0.35 },
    { x: 0.7, y: 0.65 },
    { x: 0.3, y: 0.65 },
  ];

  it('acompanha o movimento com fração de pixel, para frente e para trás', () => {
    const track = trackGrayPoints(frames, start, points, { patch: 8, search: 10 });
    expect(track).toHaveLength(frames.length);
    for (let i = 0; i < frames.length; i++) {
      for (let k = 0; k < points.length; k++) {
        const ex = points[k].x * W + (i - start) * 1.7;
        const ey = points[k].y * H + (i - start) * 0.9;
        expect(Math.abs(track[i][k].x * W - ex)).toBeLessThan(0.35);
        expect(Math.abs(track[i][k].y * H - ey)).toBeLessThan(0.35);
        expect(track[i][k].lost).toBe(false);
      }
    }
  });

  it('ponto que não cabe o molde (na borda) anda junto com o grupo', () => {
    const withEdge = [...points, { x: 0.01, y: 0.5 }];
    const track = trackGrayPoints(frames, start, withEdge, { patch: 8, search: 10, group: true });
    const last = track[frames.length - 1][4];
    expect(last.lost).toBe(true);
    expect(last.x * W).toBeCloseTo(0.01 * W + (frames.length - 1 - start) * 1.7, 0);
    // Sem grupo, fica parado.
    const alone = trackGrayPoints(frames, start, withEdge, { patch: 8, search: 10 });
    expect(alone[frames.length - 1][4].x).toBeCloseTo(0.01, 6);
  });

  it('imagem lisa (sem textura) não inventa movimento', () => {
    const flat: TrackFrame[] = Array.from({ length: 3 }, (_, i) => ({ t: i, img: { data: new Float32Array(W * H).fill(90), width: W, height: H } }));
    const track = trackGrayPoints(flat, 0, [{ x: 0.5, y: 0.5 }]);
    expect(track[2][0]).toEqual({ x: 0.5, y: 0.5, lost: true });
  });

  it('suavizar tira o tremido sem mexer nas pontas', () => {
    const jitter = [0, 1, 0, 1, 0].map((v, i) => [{ x: i + v * 0.2, y: 0, lost: false }]);
    const smooth = smoothTrack(jitter);
    expect(smooth[0][0].x).toBe(0);
    expect(smooth[4][0].x).toBe(4);
    expect(smooth[2][0].x).toBeCloseTo(2.1, 6);
  });
});
