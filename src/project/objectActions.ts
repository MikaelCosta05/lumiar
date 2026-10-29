import { hexToRgb } from '../engine/color';
import type { EffectInstance } from '../engine/types';
import { createEffect } from './model';

/**
 * O que fazer com o objeto depois de selecionado (no próprio Selecionar objeto): só deixar a seleção
 * para os efeitos de pessoa, ou já pôr no clipe o efeito que usa o objeto.
 */
export type ObjectAction = 'person' | 'color' | 'blur' | 'erase';

export const OBJECT_ACTION_EFFECTS: Record<Exclude<ObjectAction, 'person'>, string> = {
  color: 'effects/trocar-cor-objeto',
  blur: 'effects/desfocar-objeto',
  erase: 'effects/apagar-o-objeto',
};

/** O efeito que entra no clipe (null: só a seleção). `color` = cor nova em "#rrggbb", para trocar a cor. */
export function objectActionEffect(action: ObjectAction, color = '#d8342c'): EffectInstance | null {
  if (action === 'person') return null;
  const effect = createEffect(OBJECT_ACTION_EFFECTS[action]);
  if (!effect) return null;
  return action === 'color' ? { ...effect, params: { ...effect.params, cor: hexToRgb(color) } } : effect;
}
