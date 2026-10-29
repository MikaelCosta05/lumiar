import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_CATEGORIES, PACKS } from './packLibrary';

/**
 * Confere os pacotes prontos: cada filtro e efeito aponta para uma pasta de plugin que existe
 * e só mexe em parâmetros que o plugin tem (um nome errado não dá erro: o pacote só não faria nada).
 */

const PLUGINS = join(__dirname, '..', '..', 'plugins');

function paramsOf(pluginId: string): Set<string> | null {
  const folder = join(PLUGINS, ...pluginId.split('/'));
  if (!existsSync(join(folder, 'plugin.json')) || !existsSync(join(folder, 'shader.glsl'))) return null;
  const manifest = JSON.parse(readFileSync(join(folder, 'plugin.json'), 'utf8')) as { params?: { id: string }[] };
  return new Set((manifest.params ?? []).map((p) => p.id));
}

describe('pacotes prontos', () => {
  it('ids únicos', () => {
    const ids = PACKS.map((p) => p.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('todo pacote está numa categoria da biblioteca', () => {
    expect(PACKS.filter((p) => !PACK_CATEGORIES.includes(p.category)).map((p) => p.id)).toEqual([]);
  });

  it('cada filtro e efeito existe em plugins/', () => {
    const missing = PACKS.flatMap((p) =>
      [...p.effects.map((e) => e.pluginId), ...(p.filter ? [p.filter.pluginId] : [])]
        .filter((id) => paramsOf(id) === null)
        .map((id) => `${p.id} → ${id}`),
    );
    expect(missing).toEqual([]);
  });

  it('os parâmetros (fixos, animados e nas batidas) existem no plugin', () => {
    const wrong: string[] = [];
    for (const p of PACKS) {
      const check = (pluginId: string, keys: string[], extra: string[] = []) => {
        const known = paramsOf(pluginId);
        if (!known) return;
        for (const k of keys) if (!known.has(k) && !extra.includes(k)) wrong.push(`${p.id} → ${pluginId}.${k}`);
      };
      p.effects.forEach((e) => check(e.pluginId, [...Object.keys(e.params ?? {}), ...Object.keys(e.keyframes ?? {})]));
      if (p.filter) check(p.filter.pluginId, [...Object.keys(p.filter.params ?? {}), ...Object.keys(p.filter.keyframes ?? {})], ['intensity']);
      for (const key of Object.keys(p.beat?.pulses ?? {})) {
        const [kind, a, b] = key.split('.');
        if (kind === 'effects') {
          const effect = p.effects[Number(a)];
          if (!effect) wrong.push(`${p.id} → batida em efeito que não existe: ${key}`);
          else check(effect.pluginId, [b]);
        } else if (kind === 'filter') {
          if (!p.filter) wrong.push(`${p.id} → batida no filtro sem filtro: ${key}`);
          else check(p.filter.pluginId, [a], ['intensity']);
        } else if (kind !== 'camera') wrong.push(`${p.id} → batida desconhecida: ${key}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('os keyframes de cada pacote ficam dentro da duração e em ordem', () => {
    // Antigos com o zoom terminando depois do fim do bloco (só não chegam ao valor final).
    const known = ['packs/momento-epico', 'packs/coracao-partido'];
    const wrong: string[] = [];
    for (const p of PACKS.filter((p) => !known.includes(p.id))) {
      const maps = [...p.effects.map((e) => e.keyframes), p.filter?.keyframes, p.camera?.keyframes];
      for (const map of maps) {
        for (const [id, kfs] of Object.entries(map ?? {})) {
          if (kfs.some((k, i) => k.time < 0 || k.time > p.duration + 1e-6 || (i > 0 && k.time < kfs[i - 1].time))) wrong.push(`${p.id} → ${id}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
