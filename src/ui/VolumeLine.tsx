import { useRef } from 'react';
import type { VolumeKey } from '../project/model';
import { t } from '../i18n';

/**
 * Linha de volume desenhada em cima da forma de onda de um clipe de áudio.
 * Duplo clique no clipe cria um ponto; arraste os pontos; duplo clique num ponto apaga.
 * Altura: embaixo = mudo, meio = 100%, em cima = 200%.
 */
export function VolumeLine({
  keys,
  length,
  width,
  height,
  onChange,
}: {
  keys: VolumeKey[];
  /** Duração do clipe (s) */
  length: number;
  width: number;
  height: number;
  onChange: (keys: VolumeKey[]) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const pad = 4;
  const y = (value: number) => height - pad - (Math.min(2, Math.max(0, value)) / 2) * (height - pad * 2);
  const x = (time: number) => (time / Math.max(1e-6, length)) * width;
  const line = keys.length
    ? [`0,${y(keys[0].value)}`, ...keys.map((k) => `${x(k.time)},${y(k.value)}`), `${width},${y(keys[keys.length - 1].value)}`].join(' ')
    : `0,${y(1)} ${width},${y(1)}`;

  const drag = (index: number, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = ref.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const prev = keys[index - 1]?.time ?? 0;
      const next = keys[index + 1]?.time ?? length;
      const time = Math.min(next - 0.01, Math.max(prev + 0.01, ((ev.clientX - rect.left) / rect.width) * length));
      const value = Math.min(2, Math.max(0, ((height - pad - (ev.clientY - rect.top)) / (height - pad * 2)) * 2));
      onChange(keys.map((k, i) => (i === index ? { time, value: Math.abs(value - 1) < 0.04 ? 1 : value } : k)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <svg ref={ref} className="pointer-events-none absolute inset-0 z-[1]" width={width} height={height}>
      <polyline points={line} fill="none" stroke="#fde68a" strokeWidth={1.5} strokeOpacity={keys.length ? 0.95 : 0.45} />
      {keys.map((k, i) => (
        <g key={i} className="pointer-events-auto cursor-move" onPointerDown={(e) => drag(i, e)} onDoubleClick={(e) => {
          e.stopPropagation();
          onChange(keys.filter((_, j) => j !== i));
        }}>
          <circle cx={x(k.time)} cy={y(k.value)} r={7} fill="transparent" />
          <circle cx={x(k.time)} cy={y(k.value)} r={3.5} fill="#fde68a" stroke="#000" strokeWidth={1}>
            <title>{t('{percent}% · arraste para mudar · duplo clique apaga', { percent: Math.round(k.value * 100) })}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}
