import { describe, expect, it } from 'vitest';
import { crc32, ZipTooLarge, ZipWriter } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);

/** Lê o .zip pelo diretório central, como os descompactadores fazem. */
function readZip(data: Uint8Array): { name: string; content: string; crc: number }[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const end = data.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const files = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const offset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(data.subarray(p + 46, p + 46 + nameLength));
    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    expect(view.getUint16(offset + 8, true)).toBe(0);
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    files.push({ name, crc, content: new TextDecoder().decode(data.subarray(start, start + size)) });
    p += 46 + nameLength;
  }
  return files;
}

describe('crc32', () => {
  it('bate com os valores conhecidos', () => {
    expect(crc32(bytes(''))).toBe(0);
    expect(crc32(bytes('hello'))).toBe(0x3610a686);
    expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });
});

describe('ZipWriter', () => {
  it('monta um .zip que se lê de volta, com nomes acentuados', async () => {
    const zip = new ZipWriter(new Date(2026, 9, 30, 12, 34, 56));
    zip.add('quadro_00001.png', bytes('um'));
    zip.add('Ação_00002.png', bytes('dois'), new Blob([bytes('dois')]));
    const blob = zip.finish();
    expect(blob.type).toBe('application/zip');
    const files = readZip(new Uint8Array(await blob.arrayBuffer()));
    expect(files.map((f) => [f.name, f.content])).toEqual([
      ['quadro_00001.png', 'um'],
      ['Ação_00002.png', 'dois'],
    ]);
    expect(files[1].crc).toBe(crc32(bytes('dois')));
  });

  it('zip vazio ainda é válido', async () => {
    const files = readZip(new Uint8Array(await new ZipWriter().finish().arrayBuffer()));
    expect(files).toEqual([]);
  });

  it('avisa quando passaria do limite do formato', () => {
    const zip = new ZipWriter();
    const big = { length: 0xffffffff } as unknown as Uint8Array;
    expect(() => zip.add('grande.png', big, new Blob())).toThrow(ZipTooLarge);
  });
});
