// Gera electron/icon.png (512×512): o círculo em degradê do logo com um "play", sobre fundo escuro arredondado.
// Uso: node electron/make-icon.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 512;
const SS = 4; // amostras por eixo (bordas suaves)
const stops = [
  [0, [111, 125, 255]],
  [0.35, [179, 107, 255]],
  [0.7, [255, 107, 181]],
  [1, [111, 125, 255]],
];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function conic(angle) {
  const t = (((angle / (2 * Math.PI)) % 1) + 1) % 1;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  }
  return stops[0][1];
}

/** Cor (rgba 0-255) de um ponto, de -1 a 1. */
function sample(x, y) {
  // Fundo: quadrado arredondado.
  const r = 0.44;
  const qx = Math.max(Math.abs(x) - (1 - r), 0);
  const qy = Math.max(Math.abs(y) - (1 - r), 0);
  if (Math.hypot(qx, qy) > r) return [0, 0, 0, 0];
  let color = mix([22, 24, 33], [12, 13, 17], (y + 1) / 2);
  const d = Math.hypot(x, y);
  // Brilho em volta do círculo.
  const glow = Math.max(0, 1 - Math.abs(d - 0.6) / 0.35);
  color = mix(color, [111, 125, 255], glow * glow * 0.25);
  if (d < 0.6) {
    color = conic(Math.atan2(y, x) + 3.5);
    // Leve sombra por dentro para dar volume.
    color = mix(color, [255, 255, 255], Math.max(0, -y) * 0.18);
    // Triângulo de "play" branco, um pouco à direita do centro (equilíbrio visual).
    const px = x - 0.06;
    const inside = px > -0.2 && Math.abs(y) < (0.34 - (px + 0.2)) * 0.62 && px < 0.34;
    if (inside) color = [255, 255, 255];
  }
  return [...color, 255];
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let py = 0; py < SIZE; py++) {
  raw[py * (SIZE * 4 + 1)] = 0;
  for (let px = 0; px < SIZE; px++) {
    const acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = ((px + (sx + 0.5) / SS) / SIZE) * 2 - 1;
        const y = ((py + (sy + 0.5) / SS) / SIZE) * 2 - 1;
        const c = sample(x, y);
        // Soma com alfa pré-multiplicado.
        acc[0] += c[0] * c[3];
        acc[1] += c[1] * c[3];
        acc[2] += c[2] * c[3];
        acc[3] += c[3];
      }
    }
    const o = py * (SIZE * 4 + 1) + 1 + px * 4;
    const a = acc[3] / (SS * SS);
    raw[o] = acc[3] ? Math.round(acc[0] / acc[3]) : 0;
    raw[o + 1] = acc[3] ? Math.round(acc[1] / acc[3]) : 0;
    raw[o + 2] = acc[3] ? Math.round(acc[2] / acc[3]) : 0;
    raw[o + 3] = Math.round(a);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bits
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(new URL('./icon.png', import.meta.url), png);
console.log('electron/icon.png gerado');
