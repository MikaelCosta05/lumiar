import { useRef, useState } from 'react';
import { Spline } from 'lucide-react';
import { Button } from './kit';
import { locale, t } from '../i18n';

/** Curva de velocidade: pontos [posição no clipe 0 a 1, velocidade]. */
type Curve = [number, number][];

const PRESETS: { label: string; curve: Curve }[] = [
  { label: t('Montanha (lento no meio)'), curve: [[0, 1], [0.35, 0.3], [0.65, 0.3], [1, 1]] },
  { label: t('Freia até parar'), curve: [[0, 1.5], [1, 0.2]] },
  { label: t('Acelera aos poucos'), curve: [[0, 0.3], [1, 3]] },
  { label: t('Bullet time'), curve: [[0, 2], [0.3, 0.15], [0.7, 0.15], [1, 2]] },
  { label: t('Pulo (rápido, lento, rápido)'), curve: [[0, 3], [0.45, 0.25], [0.55, 0.25], [1, 3]] },
];

const MIN = 0.1;
const MAX = 4;
const toY = (speed: number) => Math.log(speed / MIN) / Math.log(MAX / MIN);
const fromY = (y: number) => MIN * Math.pow(MAX / MIN, Math.min(1, Math.max(0, y)));

/** Velocidade na posição p (linear entre os pontos, em escala logarítmica). */
function sample(curve: Curve, p: number): number {
  if (p <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (p <= curve[i][0]) {
      const [x0, s0] = curve[i - 1];
      const [x1, s1] = curve[i];
      const k = (p - x0) / Math.max(1e-6, x1 - x0);
      return fromY(toY(s0) + (toY(s1) - toY(s0)) * k);
    }
  }
  return curve[curve.length - 1][1];
}

/**
 * Rampa de velocidade desenhada numa curva: ao aplicar, o clipe vira 16 pedacinhos, cada um com a velocidade
 * da curva naquele ponto (a aceleração e a freada ficam suaves).
 */
export function SpeedCurve({ onApply }: { onApply: (speeds: number[]) => void }) {
  const [curve, setCurve] = useState<Curve>(PRESETS[0].curve);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 240;
  const H = 110;
  const at = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), fromY(1 - (e.clientY - r.top) / r.height)];
  };
  const path = Array.from({ length: 61 }, (_, i) => `${i ? 'L' : 'M'}${(i / 60) * W},${(1 - toY(sample(curve, i / 60))) * H}`).join('');
  const oneX = (1 - toY(1)) * H;
  return (
    <div className="mt-4">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-dim">
        <Spline size={13} className="text-accent" /> {t('Curva de velocidade (rampa)')}
      </p>
      <div className="mb-1.5 flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => setCurve(p.curve)}
            className="rounded-full border border-line px-2 py-0.5 text-[11px] text-dim transition-colors hover:border-line-strong hover:text-fg"
          >
            {p.label}
          </button>
        ))}
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair touch-none rounded-lg bg-panel-3 ring-1 ring-line"
        onPointerDown={(e) => {
          const [x, s] = at(e);
          const near = curve.findIndex(([px, ps]) => Math.hypot((px - x) * W, (toY(ps) - toY(s)) * H) < 10);
          e.currentTarget.setPointerCapture(e.pointerId);
          if (near >= 0) setDrag(near);
          else {
            const next = [...curve, [x, s] as [number, number]].sort((a, b) => a[0] - b[0]);
            setCurve(next);
            setDrag(next.findIndex((p) => p[0] === x));
          }
        }}
        onPointerMove={(e) => {
          if (drag === null) return;
          const [x, s] = at(e);
          setCurve((c) =>
            c.map((p, i): [number, number] => {
              if (i !== drag) return p;
              if (i === 0) return [0, s];
              if (i === c.length - 1) return [1, s];
              return [Math.min(c[i + 1][0] - 0.02, Math.max(c[i - 1][0] + 0.02, x)), s];
            }),
          );
        }}
        onPointerUp={() => setDrag(null)}
        onDoubleClick={(e) => {
          const [x, s] = at(e);
          const near = curve.findIndex(([px, ps], i) => i > 0 && i < curve.length - 1 && Math.hypot((px - x) * W, (toY(ps) - toY(s)) * H) < 10);
          if (near >= 0) setCurve((c) => c.filter((_, i) => i !== near));
        }}
      >
        <line x1={0} y1={oneX} x2={W} y2={oneX} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
        <text x={4} y={oneX - 3} fontSize={8} fill="rgba(255,255,255,0.35)">1×</text>
        <text x={4} y={9} fontSize={8} fill="rgba(255,255,255,0.35)">4×</text>
        <text x={4} y={H - 3} fontSize={8} fill="rgba(255,255,255,0.35)">{(0.1).toLocaleString(locale())}×</text>
        <path d={path} fill="none" stroke="#a5b4fc" strokeWidth={2} />
        {curve.map(([x, s], i) => (
          <circle key={i} cx={x * W} cy={(1 - toY(s)) * H} r={4.5} fill="#a5b4fc" stroke="#000" />
        ))}
      </svg>
      <p className="mt-1 text-[11px] leading-snug text-faint">
        {t('Para cima = mais rápido. Clique para criar pontos, arraste, e duplo clique apaga. Ao aplicar, o clipe é dividido em pedacinhos com a velocidade de cada ponto da curva.')}
      </p>
      <Button
        variant="secondary"
        className="mt-1.5 h-8 w-full text-xs"
        onClick={() => onApply(Array.from({ length: 16 }, (_, i) => Math.round(sample(curve, (i + 0.5) / 16) * 100) / 100))}
      >
        {t('Aplicar a curva no clipe')}
      </Button>
    </div>
  );
}
