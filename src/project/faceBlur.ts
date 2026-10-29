import type { Keyframe } from '../engine/keyframes';
import type { EffectInstance } from '../engine/types';
import type { FaceTrack } from '../media/tracking';
import { createEffect, speedOf } from './model';

const BLUR_ID = 'effects/desfocar-area';

/**
 * Um "Desfocar área" por rosto, com keyframes de posição e tamanho seguindo o rosto. Quando o rosto
 * some por um tempo, a área encolhe até sumir e volta quando ele reaparece.
 */
export function faceBlurEffects(
  tracks: FaceTrack[],
  clip: { trimIn: number; speed?: number },
  options: { pixelate: boolean; strength: number },
): EffectInstance[] {
  const local = (t: number) => Math.max(0, (t - clip.trimIn) / speedOf(clip));
  const effects: EffectInstance[] = [];
  for (const track of tracks) {
    const effect = createEffect(BLUR_ID);
    if (!effect) continue;
    const center: Keyframe[] = [];
    const size: Keyframe[] = [];
    const hidden = [0, 0];
    const push = (time: number, c: number[], s: number[], easing: Keyframe['easing'] = 'linear') => {
      const t = Math.round(time * 1000) / 1000;
      if (size.length && t <= size[size.length - 1].time + 1e-3) return;
      center.push({ time: t, value: c, easing });
      size.push({ time: t, value: s, easing });
    };
    const pts = track.points;
    // Antes de aparecer pela primeira vez, nada.
    if (local(pts[0].t) > 0.15) push(0, [pts[0].x, pts[0].y], hidden, 'hold');
    pts.forEach((p, i) => {
      // Caixa um pouco maior que o rosto (cabelo, queixo) e oval.
      const box = [Math.min(1, p.w * 1.6), Math.min(1, p.h * 1.8)];
      push(local(p.t) - (i === 0 && local(p.t) > 0.15 ? 0.05 : 0), [p.x, p.y], box);
      const next = pts[i + 1];
      if (next && next.t - p.t > 0.6) {
        push(local(p.t) + 0.15, [p.x, p.y], hidden, 'hold');
        push(local(next.t) - 0.08, [next.x, next.y], hidden);
      }
    });
    const last = pts[pts.length - 1];
    push(local(last.t) + 0.2, [last.x, last.y], hidden, 'hold');
    effects.push({
      ...effect,
      params: { ...effect.params, oval: 1, pixelate: options.pixelate ? 1 : 0, strength: options.strength, feather: 0.2 },
      keyframes: { center, size },
    });
  }
  return effects;
}
