import { ChevronLeft, ChevronRight, Diamond } from 'lucide-react';
import {
  evaluate,
  keyframeAt,
  KEYFRAME_TOLERANCE,
  removeKeyframe,
  setKeyframe,
  type Keyframe,
} from '../engine/keyframes';
import type { ParamValue } from '../engine/types';
import { cx } from './kit';

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
}: {
  animated: boolean;
  at: boolean;
  onToggle: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  return (
    <span className="flex items-center">
      {animated && (
        <button
          title="Keyframe anterior"
          disabled={!onPrev}
          onClick={onPrev}
          className="text-faint transition-colors hover:text-fg disabled:opacity-25"
        >
          <ChevronLeft size={12} />
        </button>
      )}
      <button
        title={at ? 'Remover keyframe neste ponto' : 'Adicionar keyframe neste ponto'}
        onClick={onToggle}
        className={cx('flex size-5 items-center justify-center rounded transition-colors hover:bg-panel-3', animated ? 'text-amber' : 'text-faint hover:text-dim')}
      >
        <Diamond size={11} fill={at ? 'currentColor' : 'none'} strokeWidth={2.5} />
      </button>
      {animated && (
        <button
          title="Próximo keyframe"
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
