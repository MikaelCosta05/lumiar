import { ChevronLeft, ChevronRight, Diamond, Spline } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_BEZIER, type CubicBezier } from '../engine/cubicBezier';
import {
  applyEasing,
  EASINGS,
  type Easing,
  evaluate,
  keyframeAt,
  KEYFRAME_TOLERANCE,
  removeKeyframe,
  setKeyframe,
  withEasing,
  type Keyframe,
} from '../engine/keyframes';
import type { ParamValue } from '../engine/types';
import { BezierEditor } from './BezierEditor';
import { cx } from './kit';
import { t } from '../i18n';

export interface KeyframeContext {
  /** Posição do cursor dentro do clipe (s) */
  clipTime: number;
  /** Leva o cursor para um instante do clipe */
  seek: (clipTime: number) => void;
}

/**
 * Liga um parâmetro aos seus keyframes:
 * - sem keyframes, o controle muda o valor fixo;
 * - com keyframes, mexer no controle cria/atualiza o keyframe no cursor (como no After Effects).
 */
export function bindKeyframes<V extends ParamValue>(
  ctx: KeyframeContext,
  keyframes: Keyframe[] | undefined,
  base: V,
  setBase: (value: V) => void,
  setKeyframes: (keyframes: Keyframe[] | undefined) => void,
) {
  const animated = !!keyframes && keyframes.length > 0;
  const value = (animated ? evaluate(keyframes, ctx.clipTime, base) : base) as V;
  const onChange = (v: V) => (animated ? setKeyframes(setKeyframe(keyframes, ctx.clipTime, v)) : setBase(v));
  const at = !!keyframeAt(keyframes, ctx.clipTime);
  const toggle = () => {
    if (at) {
      const rest = removeKeyframe(keyframes, ctx.clipTime);
      setKeyframes(rest.length ? rest : undefined);
    } else {
      setKeyframes(setKeyframe(keyframes, ctx.clipTime, value));
    }
  };
  const current = keyframeAt(keyframes, ctx.clipTime);
  const setEasing = (easing: Easing, bezier?: CubicBezier) =>
    current && setKeyframes(keyframes!.map((k) => (k === current ? withEasing(k, easing, bezier) : k)));
  const prev = keyframes?.filter((k) => k.time < ctx.clipTime - KEYFRAME_TOLERANCE).pop();
  const next = keyframes?.find((k) => k.time > ctx.clipTime + KEYFRAME_TOLERANCE);
  return {
    value,
    onChange,
    control: (
      <KeyframeButtons
        animated={animated}
        at={at}
        onToggle={toggle}
        onPrev={prev ? () => ctx.seek(prev.time) : undefined}
        onNext={next ? () => ctx.seek(next.time) : undefined}
        easing={current && next ? current.easing : undefined}
        bezier={current?.bezier}
        onEasing={setEasing}
      />
    ),
  };
}

function KeyframeButtons({
  animated,
  at,
  onToggle,
  onPrev,
  onNext,
  easing,
  bezier,
  onEasing,
}: {
  animated: boolean;
  at: boolean;
  onToggle: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** Curva do keyframe do cursor até o próximo (só aparece em cima de um keyframe que tem próximo) */
  easing?: Easing;
  /** Alças da curva personalizada */
  bezier?: CubicBezier;
  onEasing: (easing: Easing, bezier?: CubicBezier) => void;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLSpanElement>(null);
  const custom = easing === 'custom';
  // Na curva personalizada a janelinha não fecha ao sair com o mouse (arrastar uma alça passa da borda):
  // fecha clicando fora (o botão da curva também fecha, como antes).
  useEffect(() => {
    if (!open || !custom) return;
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [open, custom]);
  return (
    <span ref={panel} className="relative flex items-center">
      {easing && (
        <button
          title={t('Curva da animação até o próximo keyframe')}
          onClick={() => setOpen((o) => !o)}
          className={cx('mr-0.5 flex size-5 items-center justify-center rounded transition-colors hover:bg-panel-3', open ? 'text-accent' : 'text-faint hover:text-dim')}
        >
          <Spline size={12} />
        </button>
      )}
      {open && easing && (
        <div
          className="absolute right-0 top-6 z-30 w-64 rounded-xl border border-line-strong bg-panel-2 p-1.5 shadow-2xl"
          onMouseLeave={() => !custom && setOpen(false)}
        >
          <div className="grid grid-cols-3 gap-1">
            {EASINGS.map((e) => (
              <button
                key={e.id}
                title={e.label}
                onClick={() => {
                  onEasing(e.id);
                  setOpen(false);
                }}
                className={cx('flex flex-col items-center gap-0.5 rounded-lg p-1 text-[9px] leading-tight transition-colors', easing === e.id ? 'bg-accent/20 text-fg' : 'text-dim hover:bg-panel-3')}
              >
                <EasingCurve easing={e.id} />
                <span className="line-clamp-2 text-center">{e.label}</span>
              </button>
            ))}
            {/* Personalizada: as alças começam na forma da curva escolhida antes (quando dá para aproximar). */}
            <button
              title={t('Desenhe a sua curva arrastando as alças')}
              onClick={() => !custom && onEasing('custom')}
              className={cx('flex flex-col items-center gap-0.5 rounded-lg p-1 text-[9px] leading-tight transition-colors', custom ? 'bg-accent/20 text-fg' : 'text-dim hover:bg-panel-3')}
            >
              <EasingCurve easing="custom" bezier={custom ? bezier : undefined} />
              <span className="line-clamp-2 text-center">{t('Personalizada')}</span>
            </button>
          </div>
          {custom && <BezierEditor value={bezier ?? DEFAULT_BEZIER} onChange={(curve) => onEasing('custom', curve)} />}
        </div>
      )}
      {animated && (
        <button
          title={t('Keyframe anterior')}
          disabled={!onPrev}
          onClick={onPrev}
          className="text-faint transition-colors hover:text-fg disabled:opacity-25"
        >
          <ChevronLeft size={12} />
        </button>
      )}
      <button
        title={at ? t('Remover keyframe neste ponto') : t('Adicionar keyframe neste ponto')}
        onClick={onToggle}
        className={cx('flex size-5 items-center justify-center rounded transition-colors hover:bg-panel-3', animated ? 'text-amber' : 'text-faint hover:text-dim')}
      >
        <Diamond size={11} fill={at ? 'currentColor' : 'none'} strokeWidth={2.5} />
      </button>
      {animated && (
        <button
          title={t('Próximo keyframe')}
          disabled={!onNext}
          onClick={onNext}
          className="text-faint transition-colors hover:text-fg disabled:opacity-25"
        >
          <ChevronRight size={12} />
        </button>
      )}
    </span>
  );
}

/** Desenho da curva (tempo → valor) para escolher a suavidade. */
function EasingCurve({ easing, bezier }: { easing: Easing; bezier?: CubicBezier }) {
  const W = 56;
  const H = 30;
  const pad = 5;
  const points = Array.from({ length: 41 }, (_, i) => {
    const p = i / 40;
    const v = easing === 'hold' ? (p < 1 ? 0 : 1) : applyEasing(easing, p, bezier);
    return `${(pad + p * (W - pad * 2)).toFixed(1)},${(H - pad - v * (H - pad * 2)).toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={W} height={H} className="rounded bg-panel-3">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.6} className="text-accent" />
    </svg>
  );
}
