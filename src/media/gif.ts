/**
 * Gerador de GIF animado. Cada quadro ganha a própria paleta de 256 cores
 * (corte pela mediana) e um pontilhado leve para os degradês não ficarem em faixas.
 */
export class GifEncoder {
  private readonly bytes: number[] = [];

  constructor(
    private readonly width: number,
    private readonly height: number,
    /** 0 = repete para sempre */
    loop = 0,
  ) {
    this.writeString('GIF89a');
    this.writeShort(width);
    this.writeShort(height);
    this.bytes.push(0x00, 0x00, 0x00); // sem paleta global
    // Extensão NETSCAPE: repetição
    this.bytes.push(0x21, 0xff, 0x0b);
    this.writeString('NETSCAPE2.0');
    this.bytes.push(0x03, 0x01);
    this.writeShort(loop);
    this.bytes.push(0x00);
  }

  /** rgba: pixels do quadro; delay em centésimos de segundo. */
  addFrame(rgba: Uint8ClampedArray, delay: number): void {
    const palette = buildPalette(rgba);
    const indices = mapPixels(rgba, this.width, this.height, palette);

    // Controle do quadro: tempo de exibição.
    this.bytes.push(0x21, 0xf9, 0x04, 0x04);
    this.writeShort(Math.max(2, Math.round(delay)));
    this.bytes.push(0x00, 0x00);
    // Descritor da imagem com paleta local de 256 cores.
    this.bytes.push(0x2c);
    this.writeShort(0);
    this.writeShort(0);
    this.writeShort(this.width);
    this.writeShort(this.height);
    this.bytes.push(0x80 | 0x07);
    for (let i = 0; i < 256 * 3; i++) this.bytes.push(palette[i] ?? 0);
    this.bytes.push(8);
    const data = lzw(indices, 8);
    for (let i = 0; i < data.length; i += 255) {
      const block = data.subarray(i, i + 255);
      this.bytes.push(block.length);
      for (let k = 0; k < block.length; k++) this.bytes.push(block[k]);
    }
    this.bytes.push(0x00);
  }

  finish(): Blob {
    this.bytes.push(0x3b);
    return new Blob([new Uint8Array(this.bytes)], { type: 'image/gif' });
  }

  private writeShort(v: number): void {
    this.bytes.push(v & 0xff, (v >> 8) & 0xff);
  }

  private writeString(text: string): void {
    for (let i = 0; i < text.length; i++) this.bytes.push(text.charCodeAt(i));
  }
}

/** Paleta de até 256 cores pelo corte na mediana, sobre uma amostra dos pixels. */
function buildPalette(rgba: Uint8ClampedArray): Uint8Array {
  const total = rgba.length / 4;
  const step = Math.max(1, Math.floor(total / 30000));
  const count = Math.floor(total / step);
  const samples = new Uint8Array(count * 3);
  for (let i = 0, j = 0; i < count; i++, j += step * 4) {
    samples[i * 3] = rgba[j];
    samples[i * 3 + 1] = rgba[j + 1];
    samples[i * 3 + 2] = rgba[j + 2];
  }
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;

  interface Box {
    start: number;
    end: number;
    channel: number;
    range: number;
  }
  const measure = (start: number, end: number): Box => {
    const min = [255, 255, 255];
    const max = [0, 0, 0];
    for (let i = start; i < end; i++) {
      const o = order[i] * 3;
      for (let c = 0; c < 3; c++) {
        const v = samples[o + c];
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
    const ranges = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const channel = ranges.indexOf(Math.max(...ranges));
    return { start, end, channel, range: ranges[channel] };
  };

  const boxes: Box[] = [measure(0, count)];
  while (boxes.length < 256) {
    // Divide a caixa com mais variação (pesada pela quantidade de pixels).
    let best = -1;
    let score = 0;
    boxes.forEach((b, i) => {
      const value = b.range * Math.sqrt(b.end - b.start);
      if (b.end - b.start > 1 && b.range > 0 && value > score) {
        score = value;
        best = i;
      }
    });
    if (best < 0) break;
    const box = boxes[best];
    const sub = order.subarray(box.start, box.end);
    sub.sort((a, b) => samples[a * 3 + box.channel] - samples[b * 3 + box.channel]);
    const mid = box.start + ((box.end - box.start) >> 1);
    boxes.splice(best, 1, measure(box.start, mid), measure(mid, box.end));
  }

  const palette = new Uint8Array(256 * 3);
  boxes.forEach((b, i) => {
    const sum = [0, 0, 0];
    for (let k = b.start; k < b.end; k++) for (let c = 0; c < 3; c++) sum[c] += samples[order[k] * 3 + c];
    const n = Math.max(1, b.end - b.start);
    for (let c = 0; c < 3; c++) palette[i * 3 + c] = Math.round(sum[c] / n);
  });
  return palette;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.5) * 10);

/** Troca cada pixel pela cor mais próxima da paleta (com cache por cor). */
function mapPixels(rgba: Uint8ClampedArray, width: number, height: number, palette: Uint8Array): Uint8Array {
  const out = new Uint8Array(width * height);
  const cache = new Int16Array(32768).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const d = BAYER[(y & 3) * 4 + (x & 3)];
      const r = clampByte(rgba[i * 4] + d);
      const g = clampByte(rgba[i * 4 + 1] + d);
      const b = clampByte(rgba[i * 4 + 2] + d);
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let index = cache[key];
      if (index < 0) {
        let best = Infinity;
        index = 0;
        for (let p = 0; p < 256; p++) {
          const dr = palette[p * 3] - r;
          const dg = palette[p * 3 + 1] - g;
          const db = palette[p * 3 + 2] - b;
          const dist = dr * dr * 2 + dg * dg * 4 + db * db * 3;
          if (dist < best) {
            best = dist;
            index = p;
          }
        }
        cache[key] = index;
      }
      out[i] = index;
    }
  }
  return out;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Compressão LZW do GIF (códigos de tamanho variável, até 12 bits). */
function lzw(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = minCodeSize + 1;
  let next = end + 1;
  let dict = new Map<number, number>();

  const write = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  write(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    write(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      // Dicionário cheio: recomeça.
      write(clear);
      dict = new Map();
      codeSize = minCodeSize + 1;
      next = end + 1;
    }
    prefix = k;
  }
  write(prefix);
  write(end);
  if (bitCount > 0) out.push(bitBuffer & 0xff);
  return new Uint8Array(out);
}
