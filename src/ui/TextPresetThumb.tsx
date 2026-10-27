import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { loadFonts } from '../media/fonts';
import { drawTextClip } from '../media/textRender';
import { createTextClip, type TextPreset } from '../project/text';
import { cx } from './kit';
import { previewStore, sceneCanvas } from './previews';

const W = 256;
const H = 144;

/** Miniatura de um estilo de texto. Com `live`, toca a animação de entrada e saída em loop. */
export function TextPresetThumb({ preset, live, className }: { preset: TextPreset; live: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const clip = useMemo(() => createTextClip(preset, 0, 3), [preset]);
  // Redesenha quando a foto real de fundo terminar de carregar.
  const version = useSyncExternalStore(previewStore.subscribe, previewStore.getVersion);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const draw = (local: number) => {
      ctx.drawImage(sceneCanvas(1), 0, 0, W, H);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, W, H);
      drawTextClip(ctx, clip, local, W, H);
    };
    let frame = 0;
    let cancelled = false;
    void loadFonts().then(() => {
      if (cancelled) return;
      if (!live) {
        draw(clip.duration / 2);
        return;
      }
      const start = performance.now();
      const loop = (now: number) => {
        // Uma pausa curta entre as repetições.
        draw((((now - start) / 1000) % (clip.duration + 0.6)) - 0.3);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [clip, live, version]);

  return <canvas ref={ref} width={W} height={H} className={cx('size-full', className)} />;
}
