import type { LayerColor } from '../engine/renderer';
import { t } from '../i18n';

/** LUT 3D importada de um arquivo .cube, guardada no projeto. */
export interface SavedLut {
  id: string;
  name: string;
  size: number;
  /** RGB em bytes (vermelho varia primeiro), em base64 */
  data: string;
}

/** Lê um arquivo .cube (o formato usado por Premiere, DaVinci, Final Cut…). */
export function parseCube(text: string, name: string): SavedLut {
  let size = 0;
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const key = parts[0].toUpperCase();
    if (key === 'LUT_3D_SIZE') size = Number(parts[1]);
    else if (key === 'LUT_1D_SIZE') throw new Error(t('Esta é uma LUT 1D; o Lumiar usa LUTs 3D (.cube com LUT_3D_SIZE).'));
    else if (key === 'DOMAIN_MIN') min = parts.slice(1, 4).map(Number);
    else if (key === 'DOMAIN_MAX') max = parts.slice(1, 4).map(Number);
    else if (/^[-+.\d]/.test(parts[0]) && parts.length >= 3) values.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
  }
  if (!size || size < 2 || size > 128) throw new Error(t('"{name}" não parece uma LUT .cube válida.', { name }));
  if (values.length < size * size * size * 3) throw new Error(t('"{name}" está incompleto: faltam valores da LUT.', { name }));
  const bytes = new Uint8Array(size * size * size * 3);
  for (let i = 0; i < bytes.length; i++) {
    const c = i % 3;
    bytes[i] = Math.round(Math.min(1, Math.max(0, (values[i] - min[c]) / (max[c] - min[c] || 1))) * 255);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { id: crypto.randomUUID(), name: name.replace(/\.cube$/i, ''), size, data: btoa(binary) };
}

const decoded = new Map<string, Uint8Array>();

/** A LUT pronta para o renderizador (decodificada uma vez só). */
export function lutInput(luts: SavedLut[] | undefined, ref: { id: string; amount: number } | undefined): LayerColor['lut'] {
  if (!ref || ref.amount <= 0.001) return null;
  const lut = luts?.find((l) => l.id === ref.id);
  if (!lut) return null;
  let data = decoded.get(lut.id);
  if (!data) {
    const binary = atob(lut.data);
    data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
    decoded.set(lut.id, data);
  }
  return { key: lut.id, size: lut.size, data, amount: ref.amount };
}
