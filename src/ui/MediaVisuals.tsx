import { useEffect, useRef, useSyncExternalStore } from 'react';
import { assets, PEAKS_PER_SECOND } from '../media/assets';
import type { MediaItem } from '../project/model';

/** Re-renderiza quando chegam miniaturas/formas de onda novas. */
export function useAssets(): number {
  return useSyncExternalStore(assets.subscribe, assets.getVersion);
}

interface WaveformProps {
  mediaId: string;
  trimIn: number;
  trimOut: number;
  width: number;
  height: number;
  color: string;
}

/** Forma de onda do trecho [trimIn, trimOut] desenhada em canvas. */
export function Waveform({ mediaId, trimIn, trimOut, width, height, color }: WaveformProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useAssets();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.min(Math.round(width), 16000));
    canvas.width = w * dpr;
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, height);
    const peaks = assets.peaks.get(mediaId);
    if (!peaks) return;

    const mid = height / 2;
    const perPixel = ((trimOut - trimIn) * PEAKS_PER_SECOND) / w;
    ctx.fillStyle = color;
    for (let x = 0; x < w; x++) {
      const from = Math.floor(trimIn * PEAKS_PER_SECOND + x * perPixel);
      const to = Math.max(from + 1, Math.floor(trimIn * PEAKS_PER_SECOND + (x + 1) * perPixel));
      let peak = 0;
      for (let i = from; i < to && i < peaks.length; i++) peak = Math.max(peak, peaks[i]);
      const h = Math.max(1, Math.min(1, peak * 1.4) * (height - 2));
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
  }, [mediaId, trimIn, trimOut, width, height, color, version]);

  return <canvas ref={ref} style={{ width: Math.min(width, 16000), height }} className="pointer-events-none block" />;
}

interface FilmstripProps {
  media: MediaItem;
  trimIn: number;
  pxPerSecond: number;
  width: number;
  height: number;
}

/** Sequência de miniaturas que acompanha o trecho do clipe na timeline. */
export function Filmstrip({ media, trimIn, pxPerSecond, width, height }: FilmstripProps) {
  useAssets();
  const strip = assets.filmstrips.get(media.id);
  const aspect = media.width && media.height ? media.width / media.height : 16 / 9;
  // Nunca mais de ~300 quadrinhos, mesmo com muito zoom.
  const tileWidth = Math.max(height * aspect, width / 300);
  const count = Math.max(1, Math.ceil(width / tileWidth));

  const urlAt = (time: number): string | null => {
    if (!strip || strip.urls.length === 0) return media.thumbnail;
    let best = 0;
    for (let i = 1; i < strip.times.length; i++) {
      if (Math.abs(strip.times[i] - time) < Math.abs(strip.times[best] - time)) best = i;
    }
    return strip.urls[best];
  };

  return (
    <div className="pointer-events-none flex h-full overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const url = media.kind === 'image' ? media.thumbnail : urlAt(trimIn + (i * tileWidth + tileWidth / 2) / pxPerSecond);
        return (
          <div
            key={i}
            className="h-full shrink-0 border-r border-black/30 bg-cover bg-center"
            style={{ width: tileWidth, backgroundImage: url ? `url(${url})` : undefined }}
          />
        );
      })}
    </div>
  );
}
