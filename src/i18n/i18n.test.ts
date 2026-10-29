import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Confere as traduções: todo t('…') do código precisa existir nos dicionários de inglês e espanhol,
 * e cada tradução precisa ter os mesmos {nomes} do texto original.
 */

type Dict = Record<string, string>;
type Files = Record<string, { default: Dict }>;
const enFiles: Files = import.meta.glob<{ default: Dict }>('./en/*.ts', { eager: true });
const esFiles: Files = import.meta.glob<{ default: Dict }>('./es/*.ts', { eager: true });
const load = (files: Files): Dict => Object.assign({}, ...Object.values(files).map((m) => m.default));
const en = load(enFiles);
const es = load(esFiles);

/** O mesmo texto traduzido de jeitos diferentes em dois arquivos: só um vale (o último), sem aviso. */
function conflicts(files: Files): string[] {
  const seen = new Map<string, { value: string; file: string }>();
  const found: string[] = [];
  for (const [file, { default: dict }] of Object.entries(files)) {
    for (const [key, value] of Object.entries(dict)) {
      const before = seen.get(key);
      if (before && before.value !== value) found.push(`"${key}": ${before.file} → "${before.value}", ${file} → "${value}"`);
      else seen.set(key, { value, file });
    }
  }
  return found;
}

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });
}

const unescape = (s: string) => s.replace(/\\n/g, '\n').replace(/\\(['"`\\])/g, '$1');

/** Textos literais passados para t(): t('…'), t("…") e t(`…`) sem ${}; e tc('contexto', '…') vira "contexto|…". */
export function keysIn(source: string): string[] {
  const keys: string[] = [];
  for (const m of source.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) keys.push(unescape(m[2]));
  for (const m of source.matchAll(/\bt\(\s*`((?:\\.|[^`\\$])*)`/g)) keys.push(unescape(m[1]));
  for (const m of source.matchAll(/\btc\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3/g)) {
    keys.push(`${unescape(m[2])}|${unescape(m[4])}`);
  }
  return keys;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

describe('traduções', () => {
  for (const file of sourceFiles(SRC)) {
    const keys = [...new Set(keysIn(readFileSync(file, 'utf8')))];
    if (!keys.length) continue;
    it(`${relative(SRC, file).replace(/\\/g, '/')} tem tudo em inglês e espanhol`, () => {
      expect({ en: keys.filter((k) => !(k in en)), es: keys.filter((k) => !(k in es)) }).toEqual({ en: [], es: [] });
    });
  }

  it('as mensagens do worker de IA estão nos dicionários', () => {
    // O worker não tem dicionário: manda o texto em português e media/ai.ts traduz.
    const source = readFileSync(join(SRC, 'media', 'ai.worker.ts'), 'utf8');
    const keys = [...source.matchAll(/\b(?:progress|downloadProgress|AiError)\(\s*'((?:\\.|[^'\\])*)'/g)].map((m) => unescape(m[1]));
    expect(keys.length).toBeGreaterThan(10);
    expect({ en: keys.filter((k) => !(k in en)), es: keys.filter((k) => !(k in es)) }).toEqual({ en: [], es: [] });
  });

  it('o mesmo texto tem a mesma tradução em todos os arquivos', () => {
    expect({ en: conflicts(enFiles), es: conflicts(esFiles) }).toEqual({ en: [], es: [] });
  });

  it('as traduções têm os mesmos {nomes} do original', () => {
    const wrong = [en, es].flatMap((dict) => Object.entries(dict).filter(([k, v]) => placeholders(k) !== placeholders(v)).map(([k, v]) => `${k} → ${v}`));
    expect(wrong).toEqual([]);
  });
});
