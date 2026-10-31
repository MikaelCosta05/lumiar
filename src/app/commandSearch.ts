/**
 * Busca da paleta de comandos (Ctrl+K): acha filtros, efeitos, pacotes, sons e ações pelo nome, sem ligar para
 * acento nem maiúscula e aceitando um erro pequeno de digitação ("glicth" acha "Glitch").
 */

export type CommandKind = 'filter' | 'effect' | 'transition' | 'pack' | 'sticker' | 'text' | 'sound' | 'action';

export interface Searchable {
  /** Único e estável (é o que fica guardado nos usados recentemente) */
  id: string;
  kind: CommandKind;
  /** Nome no idioma da interface */
  label: string;
  /** Outros nomes que também valem por inteiro (o nome em português) */
  aliases?: string[];
  /** Palavras que ajudam, mas valem menos (categoria, tipo, descrição curta) */
  keywords?: string[];
}

/** Sem acento, em minúsculas, só letras e números separados por um espaço. */
export function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Distância de edição com troca de duas letras vizinhas valendo um erro só (Damerau, versão "OSA"). */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      row.push(v);
      best = Math.min(best, v);
    }
    // A linha toda já passou do limite: não adianta continuar.
    if (best > max) return max + 1;
    rows.push(row);
  }
  return rows[a.length][b.length];
}

/** Quantos erros a palavra digitada aceita: nenhum nas curtas, um até 5 letras, dois nas maiores. */
function allowed(length: number): number {
  return length <= 3 ? 0 : length <= 5 ? 1 : 2;
}

/** Quanto uma palavra digitada combina com as palavras de um nome (0 = não combina). */
function wordScore(token: string, words: string[]): number {
  let best = 0;
  const max = allowed(token.length);
  for (const word of words) {
    if (word === token) return 100;
    if (word.startsWith(token)) best = Math.max(best, 90 - Math.min(10, word.length - token.length));
    else if (token.length >= 3 && word.includes(token)) best = Math.max(best, 65);
    else if (max > 0) {
      const d = editDistance(token, word, max);
      if (d <= max) best = Math.max(best, 60 - 15 * d);
      // Erro de digitação no meio da palavra ainda sendo escrita: "glic" → "glitch".
      else if (token.length >= 4 && word.length > token.length) {
        const p = editDistance(token, word.slice(0, token.length), max);
        if (p <= max) best = Math.max(best, 50 - 15 * p);
      }
    }
  }
  return best;
}

/** Quanto a busca combina com um texto (0 = não combina). `query` e `text` já passados por plain(). */
export function matchScore(query: string, text: string): number {
  if (!query || !text) return 0;
  if (text === query) return 1000;
  if (text.startsWith(query)) return 900 - Math.min(50, text.length - query.length);
  const words = text.split(' ');
  if (words.some((w) => w.startsWith(query))) return 800 - Math.min(50, text.length - query.length);
  if (query.length >= 3 && text.includes(query)) return 700;
  // Várias palavras: todas precisam aparecer (em qualquer ordem, com algum erro).
  const tokens = query.split(' ');
  let total = 0;
  for (const token of tokens) {
    const s = wordScore(token, words);
    if (s === 0) return 0;
    total += s;
  }
  return 300 + (total / tokens.length) * 3;
}

interface Prepared {
  label: string;
  aliases: string[];
  keywords: string[];
}

const cache = new WeakMap<Searchable, Prepared>();
function prepared(item: Searchable): Prepared {
  let p = cache.get(item);
  if (!p) {
    p = { label: plain(item.label), aliases: (item.aliases ?? []).map(plain), keywords: (item.keywords ?? []).map(plain) };
    cache.set(item, p);
  }
  return p;
}

/** Nota do item para a busca (0 = fora). O nome vale mais; outros nomes quase igual; categoria e tipo, menos. */
export function scoreCommand(item: Searchable, query: string): number {
  const q = plain(query);
  if (!q) return 0;
  const p = prepared(item);
  let best = matchScore(q, p.label);
  for (const alias of p.aliases) best = Math.max(best, matchScore(q, alias) * 0.95);
  if (best >= 700) return best;
  // Categoria e tipo juntos com o nome: "transicao dissolver", "efeito glitch".
  const all = [p.label, ...p.aliases, ...p.keywords].join(' ');
  return Math.max(best, matchScore(q, all) * 0.6);
}

/**
 * Resultados em ordem. Sem busca: os usados recentemente primeiro, depois o resto na ordem dada.
 * Com busca: pela nota; os recentes ganham um empurrão (desempate entre parecidos), depois o nome mais curto.
 */
export function searchCommands<T extends Searchable>(items: T[], query: string, recent: string[] = [], limit = 60): T[] {
  const rank = new Map(recent.map((id, i) => [id, i]));
  if (!plain(query)) {
    const byId = new Map(items.map((item) => [item.id, item]));
    const first = recent.flatMap((id) => byId.get(id) ?? []);
    const seen = new Set(first.map((item) => item.id));
    return [...first, ...items.filter((item) => !seen.has(item.id))].slice(0, limit);
  }
  return items
    .map((item, index) => {
      const score = scoreCommand(item, query);
      const r = rank.get(item.id);
      return { item, index, score: score > 0 && r !== undefined ? score + 40 - r * 3 : score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.item.label.length - b.item.label.length || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.item);
}

// ---------------------------------------------------------------- Usados recentemente

export const RECENT_STORAGE_KEY = 'lumiar:paleta-recentes';
const RECENT_LIMIT = 8;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** O localStorage, ou null quando o navegador bloqueia (só de olhar ele já pode dar erro). */
function local(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readRecent(storage: StorageLike | null | undefined = local()): string[] {
  try {
    const list: unknown = JSON.parse(storage?.getItem(RECENT_STORAGE_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string').slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Põe o comando no topo dos recentes (e guarda neste computador). */
export function pushRecent(id: string, storage: StorageLike | null | undefined = local()): string[] {
  const list = [id, ...readRecent(storage).filter((x) => x !== id)].slice(0, RECENT_LIMIT);
  try {
    storage?.setItem(RECENT_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Sem armazenamento: os recentes valem só até fechar.
  }
  return list;
}
