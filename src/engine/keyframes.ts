import type { ParamValue, ParamValues } from './types';

/** Como o valor vai do keyframe até o próximo. */
export type Easing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'hold';

export interface Keyframe {
  /** Segundos desde o início do clipe (tempo da timeline) */
  time: number;
  value: ParamValue;
  easing: Easing;
}

/** Keyframes de cada parâmetro, pelo id do parâmetro. Sempre em ordem de tempo. */
export type KeyframeMap = Record<string, Keyframe[]>;

export const EASINGS: { id: Easing; label: string }[] = [
  { id: 'ease', label: 'Suave' },
  { id: 'linear', label: 'Linear' },
  { id: 'ease-in', label: 'Acelerando' },
  { id: 'ease-out', label: 'Freando' },
  { id: 'hold', label: 'Salto (sem transição)' },
];

/** Dois keyframes a menos que isso são considerados o mesmo ponto. */
export const KEYFRAME_TOLERANCE = 1 / 60;

export function applyEasing(easing: Easing, p: number): number {
  switch (easing) {
    case 'linear':
      return p;
    case 'ease':
      return p * p * (3 - 2 * p);
    case 'ease-in':
      return p * p * p;
    case 'ease-out':
      return 1 - Math.pow(1 - p, 3);
    case 'hold':
      return 0;
  }
}

function lerp(a: ParamValue, b: ParamValue, p: number): ParamValue {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * p;
  const va = typeof a === 'number' ? [a] : a;
  const vb = typeof b === 'number' ? [b] : b;
  return va.map((x, i) => x + ((vb[i] ?? x) - x) * p);
}

/** Valor no instante t. Sem keyframes, devolve o valor fixo. */
export function evaluate(keyframes: Keyframe[] | undefined, t: number, fallback: ParamValue): ParamValue {
  if (!keyframes || keyframes.length === 0) return fallback;
  if (t <= keyframes[0].time) return keyframes[0].value;
  const last = keyframes[keyframes.length - 1];
  if (t >= last.time) return last.value;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t >= a.time && t < b.time) {
      const p = (t - a.time) / Math.max(1e-6, b.time - a.time);
      return lerp(a.value, b.value, applyEasing(a.easing, p));
    }
  }
  return last.value;
}

export function evaluateNumber(keyframes: Keyframe[] | undefined, t: number, fallback: number): number {
  const v = evaluate(keyframes, t, fallback);
  return typeof v === 'number' ? v : (v[0] ?? fallback);
}

/** Parâmetros com os keyframes já aplicados no instante t. */
export function resolveParams(values: ParamValues, keyframes: KeyframeMap | undefined, t: number): ParamValues {
  if (!keyframes) return values;
  const out: ParamValues = { ...values };
  for (const [id, kfs] of Object.entries(keyframes)) {
    if (kfs.length) out[id] = evaluate(kfs, t, values[id] ?? 0);
  }
  return out;
}

export function keyframeAt(keyframes: Keyframe[] | undefined, t: number): Keyframe | undefined {
  return keyframes?.find((k) => Math.abs(k.time - t) <= KEYFRAME_TOLERANCE);
}

/** Cria ou atualiza o keyframe no instante t. */
export function setKeyframe(keyframes: Keyframe[] | undefined, t: number, value: ParamValue, easing?: Easing): Keyframe[] {
  const list = keyframes ?? [];
  const existing = keyframeAt(list, t);
  if (existing) {
    return list.map((k) => (k === existing ? { ...k, value, easing: easing ?? k.easing } : k));
  }
  return [...list, { time: Math.max(0, t), value, easing: easing ?? 'ease' }].sort((a, b) => a.time - b.time);
}

export function removeKeyframe(keyframes: Keyframe[] | undefined, t: number): Keyframe[] {
  return (keyframes ?? []).filter((k) => Math.abs(k.time - t) > KEYFRAME_TOLERANCE);
}

/** Todos os instantes com keyframe (para desenhar os losangos na timeline). */
export function keyframeTimes(...maps: (KeyframeMap | undefined)[]): number[] {
  const times = new Set<number>();
  for (const map of maps) {
    if (!map) continue;
    for (const kfs of Object.values(map)) for (const k of kfs) times.add(Math.round(k.time * 1000) / 1000);
  }
  return [...times].sort((a, b) => a - b);
}

/** Desloca todos os keyframes (ao dividir um clipe, a segunda parte começa do zero). */
export function shiftKeyframes(map: KeyframeMap | undefined, offset: number): KeyframeMap | undefined {
  if (!map) return map;
  return Object.fromEntries(
    Object.entries(map).map(([id, kfs]) => [id, kfs.map((k) => ({ ...k, time: k.time + offset })).filter((k) => k.time >= -1e-6)]),
  );
}
