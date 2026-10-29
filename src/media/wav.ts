/** Arquivo WAV (16 bits) a partir dos canais de áudio. */
export function encodeWav(channels: Float32Array[], sampleRate: number, name: string): File {
  const n = channels[0]?.length ?? 0;
  const count = channels.length;
  const buffer = new ArrayBuffer(44 + n * count * 2);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + n * count * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, n * count * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < count; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new File([buffer], name, { type: 'audio/wav' });
}
