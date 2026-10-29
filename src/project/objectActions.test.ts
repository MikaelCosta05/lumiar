import { describe, expect, it } from 'vitest';
import { getPlugin } from '../engine/registry';
import { OBJECT_ACTION_EFFECTS, objectActionEffect } from './objectActions';

describe('o que fazer com o objeto selecionado', () => {
  it('cada escolha aponta para um efeito que existe', () => {
    for (const id of Object.values(OBJECT_ACTION_EFFECTS)) expect(getPlugin(id), id).toBeDefined();
  });

  it('trocar a cor já vem com a cor escolhida; só selecionar não põe efeito', () => {
    const effect = objectActionEffect('color', '#ff0000')!;
    expect(effect.pluginId).toBe('effects/trocar-cor-objeto');
    expect(effect.params.cor).toEqual([1, 0, 0]);
    expect(effect.params.intensidade).toBe(1);
    expect(objectActionEffect('blur')?.pluginId).toBe('effects/desfocar-objeto');
    expect(objectActionEffect('person')).toBeNull();
  });

  it('o efeito usa a máscara do objeto (getPerson)', () => {
    expect(getPlugin('effects/trocar-cor-objeto')!.glsl).toContain('getPerson(');
  });
});
