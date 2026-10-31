import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cubicBezierAt, normalizeBezier, type CubicBezier } from '../engine/cubicBezier';
import { EASINGS, PRESET_BEZIERS } from '../engine/keyframes';
import { t } from '../i18n';

const W = 236;
const H = 168;
const PAD = 14;
/** Valores que aparecem no gráfico: um pouco abaixo de 0 e acima de 1 para dar para "passar do ponto". */
const Y_MIN = -0.75;
const Y_MAX = 1.75;
/** Uma ida da bolinha (s) e a pausa no fim antes de recomeçar. */
const RUN = 1.2;
const REST = 0.5;

const sx = (x: number) => PAD + x * (W - PAD * 2);
const sy = (y: number) => PAD + ((Y_MAX - y) / (Y_MAX - Y_MIN)) * (H - PAD * 2);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fmt = (v: number) => String(Math.round(v * 100) / 100);

/**
 * Curva personalizada: arraste as duas alças (como no cubic-bezier do CSS). O tempo vai da esquerda para a
 * direita e o valor de baixo para cima; acima da linha de cima a animação passa do ponto. A bolinha mostra o
 * movimento de verdade, repetindo.
 */
export function BezierEditor({ value, onChange }: { value: CubicBezier; onChange: (curve: CubicBezier) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<0 | 1 | null>(null);
  const [text, setText] = useState<string | null>(null);
  const progress = useBallProgress();
  const [x1, y1, x2, y2] = value;

  const pointAt = (e: ReactPointerEvent) => {
    const rect = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    return { x: clamp((px - PAD) / (W - PAD * 2), 0, 1), y: clamp(Y_MAX - ((py - PAD) / (H - PAD * 2)) * (Y_MAX - Y_MIN), Y_MIN, Y_MAX) };
  };
  const move = (handle: 0 | 1, p: { x: number; y: number }) => {
    const r = (v: number) => Math.round(v * 1000) / 1000;
    onChange(handle === 0 ? [r(p.x), r(p.y), x2, y2] : [x1, y1, r(p.x), r(p.y)]);
  };
  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    const p = pointAt(e);
    // Clicar em qualquer lugar do gráfico pega a alça mais perto.
    const d = (hx: number, hy: number) => Math.hypot(sx(hx) - sx(p.x), sy(hy) - sy(p.y));
    const handle = d(x1, y1) <= d(x2, y2) ? 0 : 1;
    svg.current?.setPointerCapture(e.pointerId);
    setDragging(handle);
    move(handle, p);
  };

  const commitText = () => {
    if (text === null) return;
    const numbers = (text.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const curve = normalizeBezier(numbers);
    if (curve) onChange(curve);
    setText(null);
  };

  const p = progress;
  const v = cubicBezierAt(value, p);
  const curve = `M${sx(0)},${sy(0)} C${sx(x1)},${sy(y1)} ${sx(x2)},${sy(y2)} ${sx(1)},${sy(1)}`;
  // Alça fora do gráfico (valor digitado além do limite) fica desenhada na borda.
  const hy = (y: number) => sy(clamp(y, Y_MIN, Y_MAX));
  // Trilho da bolinha: 0 e 1 marcados, com folga dos lados para quando passa do ponto.
  const track = (u: number) => 34 + clamp(u, -0.4, 1.4) * (W - 68);

  return (
    <div className="mt-1.5 space-y-1.5 rounded-lg bg-panel-3 p-1.5">
      <p className="text-[10px] leading-snug text-faint">{t('Arraste as duas alças. Acima da linha de cima, a animação passa do ponto e volta.')}</p>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none rounded bg-panel-2"
        style={{ cursor: dragging === null ? 'crosshair' : 'grabbing' }}
        onPointerDown={onDown}
        onPointerMove={(e) => dragging !== null && move(dragging, pointAt(e))}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {/* Área do começo ao fim (0 a 1) */}
        <rect x={sx(0)} y={sy(1)} width={sx(1) - sx(0)} height={sy(0) - sy(1)} className="fill-panel-3" />
        <line x1={sx(0)} y1={sy(1)} x2={sx(1)} y2={sy(1)} className="stroke-line-strong" strokeDasharray="3 3" />
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(0)} className="stroke-line-strong" strokeDasharray="3 3" />
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} className="stroke-line" />
        <line x1={sx(p)} y1={sy(Y_MIN)} x2={sx(p)} y2={sy(Y_MAX)} className="stroke-line" />
        <path d={curve} fill="none" stroke="currentColor" strokeWidth={2} className="text-accent" />
        {/* Hastes e alças */}
        <line x1={sx(0)} y1={sy(0)} x2={sx(x1)} y2={hy(y1)} className="stroke-dim" strokeWidth={1.2} />
        <line x1={sx(1)} y1={sy(1)} x2={sx(x2)} y2={hy(y2)} className="stroke-dim" strokeWidth={1.2} />
        {([[x1, y1], [x2, y2]] as const).map(([hx, hyv], i) => (
          <circle
            key={i}
            cx={sx(hx)}
            cy={hy(hyv)}
            r={dragging === i ? 7 : 6}
            className={i === 0 ? 'fill-amber stroke-panel' : 'fill-accent-2 stroke-panel'}
            strokeWidth={2}
            style={{ cursor: 'grab' }}
          />
        ))}
        <circle cx={sx(p)} cy={sy(clamp(v, Y_MIN, Y_MAX))} r={3.5} className="fill-fg" />
      </svg>
      {/* A bolinha andando com a curva: o que a animação faz de verdade */}
      <svg viewBox={`0 0 ${W} 22`} className="w-full" aria-hidden>
        <line x1={track(0)} y1={11} x2={track(1)} y2={11} className="stroke-line-strong" strokeWidth={2} strokeLinecap="round" />
        <line x1={track(0)} y1={5} x2={track(0)} y2={17} className="stroke-line-strong" />
        <line x1={track(1)} y1={5} x2={track(1)} y2={17} className="stroke-line-strong" />
        <circle cx={track(v)} cy={11} r={6} className="fill-accent" />
      </svg>
      <div className="flex items-center gap-1">
        <select
          className="field h-7 min-w-0 flex-1 px-1 text-[11px]"
          value=""
          title={t('Começar de uma curva pronta')}
          onChange={(e) => {
            const preset = PRESET_BEZIERS[e.target.value as keyof typeof PRESET_BEZIERS];
            if (preset) onChange(preset);
          }}
        >
          <option value="">{t('Começar de…')}</option>
          {EASINGS.filter((e) => PRESET_BEZIERS[e.id]).map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
        <input
          className="field h-7 w-[108px] px-1 font-mono text-[10px]"
          title={t('Valores da curva, como no cubic-bezier do CSS (x1, y1, x2, y2)')}
          value={text ?? `${fmt(x1)}, ${fmt(y1)}, ${fmt(x2)}, ${fmt(y2)}`}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText();
            if (e.key === 'Escape') setText(null);
          }}
        />
      </div>
    </div>
  );
}

/** 0 a 1, repetindo: a ida da bolinha e uma pausa no fim. */
function useBallProgress(): number {
  const [p, setP] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const s = ((now - start) / 1000) % (RUN + REST);
      setP(Math.min(1, s / RUN));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return p;
}
