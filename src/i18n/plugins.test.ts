import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NAME_KEYS } from '../engine/registry';

/**
 * Confere as traduções dos plugins: o nome, a descrição e os controles de cada plugin.json, e cada categoria,
 * precisam existir nos dicionários de inglês e espanhol (com os mesmos {nomes} do original).
 */

type Dict = Record<string, string>;
const load = (files: Record<string, { default: Dict }>): Dict => Object.assign({}, ...Object.values(files).map((m) => m.default));
const en = load(import.meta.glob<{ default: Dict }>('./en/*.ts', { eager: true }));
const es = load(import.meta.glob<{ default: Dict }>('./es/*.ts', { eager: true }));

interface Manifest {
  name?: string;
  description?: string;
  category?: string;
  params?: { label?: string }[];
}

const PLUGINS = join(__dirname, '..', '..', 'plugins');

const manifests = ['filters', 'effects', 'transitions'].flatMap((folder) =>
  readdirSync(join(PLUGINS, folder))
    .filter((name) => existsSync(join(PLUGINS, folder, name, 'plugin.json')))
    .map((name) => ({
      id: `${folder}/${name}`,
      manifest: JSON.parse(readFileSync(join(PLUGINS, folder, name, 'plugin.json'), 'utf8')) as Manifest,
    })),
);

/** Textos que a pessoa lê: nome (ou a chave com contexto), descrição e o nome de cada controle. */
function texts(id: string, m: Manifest): string[] {
  const list = [m.name && (NAME_KEYS[id] ?? m.name), m.description, ...(m.params ?? []).map((p) => p.label)];
  return list.filter((s): s is string => !!s);
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const missing = (keys: string[]) => ({ en: keys.filter((k) => !(k in en)), es: keys.filter((k) => !(k in es)) });

describe('traduções dos plugins', () => {
  it('encontra os plugins', () => {
    expect(manifests.length).toBeGreaterThan(200);
  });

  for (const folder of ['filters', 'effects', 'transitions']) {
    it(`${folder}: nome, descrição e controles em inglês e espanhol`, () => {
      const keys = manifests.filter((p) => p.id.startsWith(`${folder}/`)).flatMap((p) => texts(p.id, p.manifest));
      expect(missing([...new Set(keys)])).toEqual({ en: [], es: [] });
    });
  }

  it('todas as categorias em inglês e espanhol', () => {
    const categories = new Set(['Geral', 'Meus efeitos', ...manifests.map((p) => p.manifest.category ?? 'Geral')]);
    expect(missing([...categories])).toEqual({ en: [], es: [] });
  });

  it('as traduções dos plugins têm os mesmos {nomes} do original', () => {
    const keys = new Set(manifests.flatMap((p) => texts(p.id, p.manifest)));
    const wrong = [en, es].flatMap((dict) =>
      [...keys].filter((k) => k in dict && placeholders(k) !== placeholders(dict[k])).map((k) => `${k} → ${dict[k]}`),
    );
    expect(wrong).toEqual([]);
  });

  it('as chaves com contexto apontam para plugins que existem', () => {
    const ids = new Set(manifests.map((p) => p.id));
    expect(Object.keys(NAME_KEYS).filter((id) => !ids.has(id))).toEqual([]);
  });
});
