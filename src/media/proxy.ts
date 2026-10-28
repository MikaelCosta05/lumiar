import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  canEncodeVideo,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
  WebMOutputFormat,
} from 'mediabunny';
import type { MediaItem } from '../project/model';

/**
 * Prévia leve (proxy): uma cópia do vídeo em 540p, com quadros-chave a cada 0,5 s,
 * só para tocar e buscar rápido enquanto se edita. A exportação sempre usa o arquivo original.
 */
export const PROXY_SIDE = 540;

/** Vale a pena fazer a cópia? (vídeos pequenos já são leves) */
export function needsProxy(media: MediaItem): boolean {
  return media.kind === 'video' && Math.min(media.width, media.height) > PROXY_SIDE * 1.2;
}

export async function makeProxy(media: MediaItem, onProgress?: (fraction: number) => void): Promise<string> {
  // Nunca aumenta: vídeos que já são pequenos só ganham os quadros-chave frequentes.
  const side = Math.min(PROXY_SIDE, Math.min(media.width, media.height));
  const landscape = media.width >= media.height;
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);
  const size = landscape ? { height: even(side) } : { width: even(side) };
  const probe = landscape
    ? { width: even((media.width / media.height) * side), height: even(side) }
    : { width: even(side), height: even((media.height / media.width) * side) };
  const avc = await canEncodeVideo('avc', probe).catch(() => false);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media.file) });
  try {
    const output = new Output({
      format: avc ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target: new BufferTarget(),
    });
    const conversion = await Conversion.init({
      input,
      output,
      video: { ...size, codec: avc ? 'avc' : 'vp9', quality: QUALITY_MEDIUM, keyFrameInterval: 0.5, forceTranscode: true },
      showWarnings: false,
    });
    if (!conversion.isValid) throw new Error('não foi possível converter este vídeo');
    conversion.onProgress = (progress) => onProgress?.(progress);
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('a cópia saiu vazia');
    return URL.createObjectURL(new Blob([buffer], { type: avc ? 'video/mp4' : 'video/webm' }));
  } finally {
    input.dispose();
  }
}
