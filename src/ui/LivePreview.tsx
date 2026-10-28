import { useEffect, useRef } from 'react';
import type { ShaderPlugin } from '../engine/types';
import type { PackTemplate } from '../project/packs';
import { cx } from './kit';
import { drawLivePreview, drawPackLive } from './previews';

/** Miniatura animada de um efeito, transição, filtro ou pacote, rodando no motor de verdade. */
export function LivePreview({ plugin, pack, className }: { plugin?: ShaderPlugin; pack?: PackTemplate; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const start = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      const seconds = (now - start) / 1000;
      if (pack) drawPackLive(pack, seconds, ctx);
      else if (plugin) drawLivePreview(plugin, seconds, ctx);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [plugin, pack]);

  return <canvas ref={ref} width={256} height={144} className={cx('pointer-events-none size-full', className)} />;
}
