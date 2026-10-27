import { useEffect, useRef } from 'react';
import type { ShaderPlugin } from '../engine/types';
import { cx } from './kit';
import { drawLivePreview } from './previews';

/** Miniatura animada de um efeito, transição ou filtro, rodando no motor de verdade. */
export function LivePreview({ plugin, className }: { plugin: ShaderPlugin; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const start = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      drawLivePreview(plugin, (now - start) / 1000, ctx);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [plugin]);

  return <canvas ref={ref} width={256} height={144} className={cx('pointer-events-none size-full', className)} />;
}
