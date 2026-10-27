import type { ReactNode } from 'react';
import { hexToRgb, rgbToHex } from '../engine/color';
import type { ParamDef, ParamValue } from '../engine/types';
import { Slider } from './kit';

interface Props {
  def: ParamDef;
  value: ParamValue;
  onChange: (value: ParamValue) => void;
  /** Botões de keyframe, ao lado do nome. */
  keyframes?: ReactNode;
}

function Label({ text, keyframes }: { text: string; keyframes?: ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-xs text-dim">
      {text}
      {keyframes}
    </span>
  );
}

export function ParamControl({ def, value, onChange, keyframes }: Props) {
  if (def.type === 'color') {
    const rgb = Array.isArray(value) ? value : [0, 0, 0];
    const hex = rgbToHex(rgb);
    return (
      <div className="flex items-center justify-between py-1.5">
        <Label text={def.label} keyframes={keyframes} />
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-panel px-1.5 py-1 hover:border-line-strong">
          <span className="size-4 rounded-sm ring-1 ring-white/20" style={{ background: hex }} />
          <span className="font-mono text-[11px] uppercase text-dim">{hex}</span>
          <input type="color" className="sr-only" value={hex} onChange={(e) => onChange(hexToRgb(e.target.value))} />
        </label>
      </div>
    );
  }

  if (def.type === 'vec2') {
    const v = Array.isArray(value) ? value : [0, 0];
    return (
      <div className="py-1.5">
        <Label text={def.label} keyframes={keyframes} />
        <ValueSlider def={def} value={v[0]} prefix="X" onChange={(x) => onChange([x, v[1]])} />
        <ValueSlider def={def} value={v[1]} prefix="Y" onChange={(y) => onChange([v[0], y])} />
      </div>
    );
  }

  const n = typeof value === 'number' ? value : 0;
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <Label text={def.label} keyframes={keyframes} />
        <span className="font-mono text-[11px] text-fg">{format(def, n)}</span>
      </div>
      <Slider label={def.label} value={n} min={def.min ?? 0} max={def.max ?? 1} step={def.step} onChange={onChange} />
    </div>
  );
}

function ValueSlider({
  def,
  value,
  prefix,
  onChange,
}: {
  def: ParamDef;
  value: number;
  prefix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-3 text-[10px] font-semibold text-faint">{prefix}</span>
      <Slider
        label={`${def.label} ${prefix}`}
        value={value}
        min={def.min ?? 0}
        max={def.max ?? 1}
        step={def.step}
        onChange={onChange}
      />
      <span className="w-10 text-right font-mono text-[11px]">{format(def, value)}</span>
    </div>
  );
}

function format(def: ParamDef, value: number): string {
  const step = def.step ?? ((def.max ?? 1) - (def.min ?? 0)) / 100;
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
  return value.toFixed(decimals);
}
