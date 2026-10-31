/**
 * Arquivo .zip sem compressão (as imagens PNG já vêm compactadas), montado aos poucos: cada arquivo entra como um
 * Blob, que o navegador pode guardar em disco, então uma sequência longa de quadros não precisa caber na memória.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** O .zip comum guarda tamanhos e posições em 32 bits e no máximo 65 535 arquivos. */
export class ZipTooLarge extends Error {}

const MAX_SIZE = 0xffffffff;
const MAX_ENTRIES = 0xffff;

export class ZipWriter {
  private readonly parts: BlobPart[] = [];
  private readonly central: Uint8Array<ArrayBuffer>[] = [];
  private offset = 0;
  private readonly time: number;
  private readonly date: number;

  constructor(now = new Date()) {
    // Data e hora no formato do DOS (resolução de 2 s), como todo .zip.
    this.time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    this.date = (Math.max(0, now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  }

  get count(): number {
    return this.central.length;
  }

  /** `stored` é o que vai para o arquivo (o Blob de onde os bytes vieram, para não guardar duas cópias). */
  add(name: string, bytes: Uint8Array, stored: BlobPart = bytes as Uint8Array<ArrayBuffer>): void {
    const encodedName = new TextEncoder().encode(name);
    const size = bytes.length;
    if (this.count + 1 > MAX_ENTRIES || this.offset + 30 + encodedName.length + size > MAX_SIZE) throw new ZipTooLarge();
    const crc = crc32(bytes);

    const local = new Uint8Array(30 + encodedName.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    // Bit 11: nomes em UTF-8 (acentos no nome do projeto).
    l.setUint16(6, 0x0800, true);
    l.setUint16(8, 0, true);
    l.setUint16(10, this.time, true);
    l.setUint16(12, this.date, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, size, true);
    l.setUint32(22, size, true);
    l.setUint16(26, encodedName.length, true);
    l.setUint16(28, 0, true);
    local.set(encodedName, 30);

    const entry = new Uint8Array(46 + encodedName.length);
    const c = new DataView(entry.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, this.time, true);
    c.setUint16(14, this.date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, size, true);
    c.setUint32(24, size, true);
    c.setUint16(28, encodedName.length, true);
    // Extra, comentário, disco, atributos: zero.
    c.setUint32(42, this.offset, true);
    entry.set(encodedName, 46);

    this.parts.push(local, stored);
    this.central.push(entry);
    this.offset += local.length + size;
  }

  /** Junta tudo num Blob (o diretório central vai no fim). */
  finish(): Blob {
    const centralSize = this.central.reduce((sum, e) => sum + e.length, 0);
    if (this.offset + centralSize + 22 > MAX_SIZE) throw new ZipTooLarge();
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, this.count, true);
    e.setUint16(10, this.count, true);
    e.setUint32(12, centralSize, true);
    e.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...this.central, end], { type: 'application/zip' });
  }
}
