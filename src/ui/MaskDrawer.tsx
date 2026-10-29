import { Check, Diamond, Eraser } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { LayerMask } from '../engine/renderer';
import { maskAt, type MediaItem, type OverlayClip, type Project } from '../project/model';
import { Button } from './kit';
import { t } from '../i18n';

/**
 * Desenhar a forma (máscara) de uma camada direto no vídeo: clique para pôr pontos, arraste para
 * mover, botão direito apaga. Com a animação ligada, cada mudança vira um keyframe no instante do
 * cursor e a forma acompanha o movimento entre eles.
 */
export function MaskDrawer({
  project,
  clip,
  media,
  clipTime,
  canvasRef,
  onChange,
  onDone,
}: {
  project: Project;
  clip: OverlayClip;
  media: MediaItem;
  /** Instante do cursor dentro do clipe */
  clipTime: number;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onChange: (mask: LayerMask) => void;
  onDone: () => void;
}) {
  const [box, setBox] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const svg = useRef<SVGSVGElement>(null);
  const mask = clip.transform.mask?.shape === 'path' ? clip.transform.mask : { shape: 'path' as const, x: 0.5, y: 0.5, width: 1, height: 1, feather: 0.05, invert: false, points: [] };
  const shown = maskAt(mask, clipTime)?.points ?? [];
  const animated = !!mask.keys?.length;

  // O SVG fica exatamente em cima do canvas (que muda de tamanho com a janela).
  useEffect(() => {
    const update = () => {
      const c = canvasRef.current;
      if (c) setBox({ left: c.offsetLeft, top: c.offsetTop, width: c.offsetWidth, height: c.offsetHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [canvasRef]);

  // Mesma conta do renderizador: onde a camada está na tela.
  const ratio = project.width / project.height;
  const sideways = clip.turn === 90 || clip.turn === 270;
  const mw = sideways ? media.height : media.width;
  const mh = sideways ? media.width : media.height;
  const mediaRatio = mw / mh || ratio;
  const fit = mediaRatio > ratio ? [1, ratio / mediaRatio] : [mediaRatio / ratio, 1];
  const tf = clip.transform;
  const half = [0.5 * fit[0] * tf.scale * ratio, 0.5 * fit[1] * tf.scale];
  const angle = (tf.rotation * Math.PI) / 180;
  const toScreen = (lx: number, ly: number): [number, number] => {
    const dx = (lx - 0.5) * 2 * half[0];
    const dy = (ly - 0.5) * 2 * half[1];
    const x = Math.cos(angle) * dx - Math.sin(angle) * dy;
    const y = Math.sin(angle) * dx + Math.cos(angle) * dy;
    return [(tf.x + x / ratio) * box.width, (tf.y + y) * box.height];
  };
  const toLocal = (sx: number, sy: number): [number, number] => {
    const x = (sx / box.width - tf.x) * ratio;
    const y = sy / box.height - tf.y;
    const dx = Math.cos(-angle) * x - Math.sin(-angle) * y;
    const dy = Math.sin(-angle) * x + Math.cos(-angle) * y;
    return [dx / (2 * half[0]) + 0.5, dy / (2 * half[1]) + 0.5];
  };

  /** Grava os pontos: na forma fixa ou, com animação, num keyframe no instante do cursor. */
  const write = (points: number[]) => {
    if (!animated) return onChange({ ...mask, points });
    const time = Math.round(clipTime * 1000) / 1000;
    const keys = [...(mask.keys ?? []).filter((k) => Math.abs(k.time - time) > 1 / 60), { time, points }].sort((a, b) => a.time - b.time);
    onChange({ ...mask, points, keys });
  };

  const pointer = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return toLocal(e.clientX - r.left, e.clientY - r.top);
  };

  const startDrag = (index: number, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const [x, y] = pointer(ev);
      const next = [...shown];
      next[index * 2] = x;
      next[index * 2 + 1] = y;
      write(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const pts = Array.from({ length: shown.length / 2 }, (_, i) => toScreen(shown[i * 2], shown[i * 2 + 1]));

  return (
    <>
      <svg
        ref={svg}
        className="absolute z-20 cursor-crosshair"
        style={box}
        onPointerDown={(e) => {
          if (e.button !== 0 || shown.length >= 64) return;
          const [x, y] = pointer(e);
          write([...shown, x, y]);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {pts.length >= 2 && (
          <polygon
            points={pts.map((p) => p.join(',')).join(' ')}
            fill="rgba(111,125,255,0.18)"
            stroke="#8b96ff"
            strokeWidth={2}
            strokeDasharray={pts.length < 3 ? '4 4' : undefined}
          />
        )}
        {pts.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={6}
            fill={i === 0 ? '#ffd23f' : '#ffffff'}
            stroke="#111"
            strokeWidth={1.5}
            className="cursor-move"
            onPointerDown={(e) => startDrag(i, e)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              write(shown.filter((_, k) => k !== i * 2 && k !== i * 2 + 1));
            }}
          />
        ))}
      </svg>
      <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-accent/50 bg-panel-2/95 py-1 pl-4 pr-1 text-xs shadow-2xl backdrop-blur">
        <span className="text-dim">
          {t('{n} pontos · clique põe, arraste move, botão direito apaga', { n: shown.length / 2 })}
          {animated ? ` · ${t('{n} keyframe(s)', { n: mask.keys!.length })}` : ''}
        </span>
        <Button
          className="h-7 text-xs"
          icon={<Diamond size={12} />}
          title={t('A forma passa a acompanhar o movimento: mude o cursor de lugar e ajuste os pontos (cada ajuste vira um keyframe)')}
          onClick={() => {
            if (animated) onChange({ ...mask, points: shown, keys: undefined });
            else onChange({ ...mask, points: shown, keys: [{ time: Math.round(clipTime * 1000) / 1000, points: shown }] });
          }}
        >
          {animated ? t('Parar de animar') : t('Animar a forma')}
        </Button>
        <Button className="h-7 text-xs" icon={<Eraser size={12} />} onClick={() => onChange({ ...mask, points: [], keys: undefined })}>
          {t('Limpar')}
        </Button>
        <Button variant="primary" className="h-7 text-xs" icon={<Check size={12} />} onClick={onDone}>
          {t('Concluir')}
        </Button>
      </div>
    </>
  );
}
