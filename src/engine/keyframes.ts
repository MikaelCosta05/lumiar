import { t, tc } from '../i18n';
import { cubicBezierAt, DEFAULT_BEZIER, normalizeBezier, type CubicBezier } from './cubicBezier';
import type { ParamValue, ParamValues } from './types';

/** Como o valor vai do keyframe até o próximo. */
export type Easing =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'hold'
  | 'smooth'
  | 'back'
  | 'elastic'
  | 'bounce'
  | 'expo-in'
  | 'expo-out'
  | 'expo-in-out'
  /** Curva personalizada: a Bézier do campo `bezier` do keyframe */
  | 'custom';

export interface Keyframe {
  /** Segundos desde o início do clipe (tempo da timeline) */
  time: number;
  value: ParamValue;
  easing: Easing;
  /** Alças da curva personalizada (só com easing 'custom'; sem elas vale o "ease" do CSS) */
  bezier?: CubicBezier;
}

/** Keyframes de cada parâmetro, pelo id do parâmetro. Sempre em ordem de tempo. */
export type KeyframeMap = Record<string, Keyframe[]>;

export const EASINGS: { id: Easing; label: string }[] = [
  { id: 'ease', label: tc('curva', 'Suave') },
  { id: 'linear', label: t('Linear') },
  { id: 'ease-in', label: t('Acelerando') },
  { id: 'ease-out', label: t('Freando') },
  { id: 'smooth', label: t('Bem suave (entra e sai devagar)') },
  // As curvas exponenciais dos motion designers: o zoom de impacto, a rampa de velocidade, o whip pan.
  { id: 'expo-out', label: t('Arranca e freia forte') },
  { id: 'expo-in', label: t('Começa parado e dispara') },
  { id: 'expo-in-out', label: t('Rápido no meio (rampa)') },
  { id: 'back', label: t('Passa do ponto e volta') },
  { id: 'elastic', label: t('Elástico (mola)') },
  { id: 'bounce', label: t('Quica no fim') },
  { id: 'hold', label: t('Salto (sem transição)') },
];

/** Dois keyframes a menos que isso são considerados o mesmo ponto. */
export const KEYFRAME_TOLERANCE = 1 / 60;

/**
 * As curvas prontas como Bézier, para a curva personalizada começar na forma da atual. Exatas no suave,
 * acelerando e freando (são cúbicas); aproximadas nas outras. Elástico, quicar e salto não têm uma Bézier parecida.
 */
export const PRESET_BEZIERS: Partial<Record<Easing, CubicBezier>> = {
  linear: [0, 0, 1, 1],
  ease: [1 / 3, 0, 2 / 3, 1],
  'ease-in': [1 / 3, 0, 2 / 3, 0],
  'ease-out': [1 / 3, 1, 2 / 3, 1],
  smooth: [0.83, 0, 0.17, 1],
  'expo-in': [0.7, 0, 0.84, 0],
  'expo-out': [0.16, 1, 0.3, 1],
  'expo-in-out': [0.87, 0, 0.13, 1],
  back: [0.34, 1.56, 0.64, 1],
};

/** Alças para começar a curva personalizada a partir do keyframe (a própria, a da curva pronta ou o padrão). */
export function bezierFor(keyframe: Pick<Keyframe, 'easing' | 'bezier'>): CubicBezier {
  if (keyframe.easing === 'custom') return normalizeBezier(keyframe.bezier) ?? DEFAULT_BEZIER;
  return PRESET_BEZIERS[keyframe.easing] ?? DEFAULT_BEZIER;
}

/** O keyframe com outra curva. Na personalizada, sem alças novas, elas começam na forma da curva que ele tinha. */
export function withEasing(keyframe: Keyframe, easing: Easing, bezier?: CubicBezier): Keyframe {
  const { bezier: _previous, ...rest } = keyframe;
  if (easing !== 'custom') return { ...rest, easing };
  return { ...rest, easing, bezier: normalizeBezier(bezier) ?? bezierFor(keyframe) };
}

export function applyEasing(easing: Easing, p: number, bezier?: CubicBezier): number {
  switch (easing) {
    case 'custom':
      // Projetos e pacotes vindos de fora podem trazer qualquer coisa: curva inválida vira o "ease" do CSS.
      return cubicBezierAt(normalizeBezier(bezier) ?? DEFAULT_BEZIER, p);
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
    case 'smooth':
      return p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2;
    // Exponenciais normalizadas: começam e terminam exatamente em 0 e 1 (a fórmula pura erra por 2⁻¹⁰).
    case 'expo-in':
      return p <= 0 ? 0 : (Math.pow(2, 10 * p - 10) - 1 / 1024) / (1 - 1 / 1024);
    case 'expo-out':
      return p >= 1 ? 1 : (1 - Math.pow(2, -10 * p)) / (1 - 1 / 1024);
    case 'expo-in-out':
      return p < 0.5 ? applyEasing('expo-in', p * 2) / 2 : 0.5 + applyEasing('expo-out', p * 2 - 1) / 2;
    case 'back': {
      const c = 1.70158;
      return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
    }
    case 'elastic':
      return p === 0 || p === 1 ? p : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    case 'bounce': {
      const n = 7.5625;
      const d = 2.75;
      if (p < 1 / d) return n * p * p;
      if (p < 2 / d) return n * (p - 1.5 / d) * (p - 1.5 / d) + 0.75;
      if (p < 2.5 / d) return n * (p - 2.25 / d) * (p - 2.25 / d) + 0.9375;
      return n * (p - 2.625 / d) * (p - 2.625 / d) + 0.984375;
    }
    default:
      // Curva desconhecida (projeto de uma versão mais nova): anda em linha reta em vez de travar.
      return p;
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
      return lerp(a.value, b.value, applyEasing(a.easing, p, a.bezier));
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
