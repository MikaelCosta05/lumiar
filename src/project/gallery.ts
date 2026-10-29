import { t } from '../i18n';

/**
 * Galeria da comunidade: efeitos (.lumiarfx) e pacotes (.lumiarpack) que outras pessoas compartilharam.
 *
 * A galeria é um repositório público no GitHub com um index.json (a lista do que existe, com o tamanho e o
 * SHA-256 de cada arquivo). O Lumiar baixa o índice, mostra os itens e, ao instalar, baixa o arquivo, confere
 * o tamanho e o SHA-256 e só então passa pela importação de sempre. O formato está em docs/GALERIA.md.
 *
 * Aqui fica só a parte sem tela (conferência do índice, downloads, o que já está instalado), para os testes.
 */

export const DEFAULT_INDEX_URL = 'https://raw.githubusercontent.com/MikaelCosta05/lumiar-galeria/main/index.json';
export const GALLERY_DOCS_URL = 'https://github.com/MikaelCosta05/lumiar/blob/main/docs/GALERIA.md';

export const INDEX_FORMAT = 'lumiar-galeria';
export const INDEX_VERSION = 1;

// Limites para não travar o Lumiar com um índice ou arquivo estranho.
export const MAX_INDEX_BYTES = 2 * 1024 * 1024;
/** O mesmo limite do arquivo .lumiarfx na importação. */
export const MAX_ITEM_BYTES = 4 * 1024 * 1024;
const MAX_ITEMS = 5000;
const MAX_TAGS = 12;
const MAX_CONTENTS = 200;

export type GalleryKind = 'effect' | 'pack';

const EXTENSION: Record<GalleryKind, string> = { effect: '.lumiarfx', pack: '.lumiarpack' };

export interface GalleryItem {
  id: string;
  kind: GalleryKind;
  name: string;
  description: string;
  author: string;
  tags: string[];
  /** Idioma dos nomes e textos do item ("pt", "en", "es"…); vazio quando não importa. */
  language: string;
  /** Endereço completo do arquivo (já conferido). */
  file: string;
  /** Imagem de prévia (já conferida), ou null. */
  preview: string | null;
  size: number;
  sha256: string;
  version: string;
  /** Data em que entrou na galeria (AAAA-MM-DD). */
  added: string;
  /** Ids dos efeitos ou pacotes que o arquivo traz (para saber se já estão aqui). */
  contents: string[];
}

export interface GalleryIndex {
  name: string;
  updated: string;
  items: GalleryItem[];
  /** Itens do índice que ficaram de fora, com o motivo. */
  skipped: string[];
}

export type GalleryProblem = 'bad-url' | 'offline' | 'not-found' | 'http' | 'invalid' | 'newer' | 'too-big' | 'size' | 'hash';

export class GalleryError extends Error {
  constructor(
    readonly problem: GalleryProblem,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GalleryError';
  }
}

// ---------------------------------------------------------------- Endereços

/** Confere o endereço do índice: só https (o conteúdo vira código na placa de vídeo, não pode vir adulterado no caminho). */
export function checkIndexUrl(raw: string): URL | string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return t('Endereço inválido.');
  }
  if (url.protocol !== 'https:') return t('O endereço precisa começar com https://');
  if (url.username || url.password) return t('O endereço não pode ter usuário e senha.');
  return url;
}

/**
 * Os arquivos e as prévias só podem vir do mesmo servidor do índice e, no raw.githubusercontent.com, do mesmo
 * repositório. Assim o que aparece na galeria é o que passou pela revisão do repositório, e abrir a galeria não
 * faz o Lumiar buscar imagens em servidores de terceiros (que saberiam quem abriu e quando).
 */
export function allowedUrl(index: URL, target: URL): boolean {
  if (target.protocol !== 'https:' || target.username || target.password) return false;
  if (target.host !== index.host) return false;
  if (index.hostname === 'raw.githubusercontent.com') {
    const repo = (u: URL) => u.pathname.split('/').slice(1, 3).join('/').toLowerCase();
    return repo(target) === repo(index);
  }
  return true;
}

/** Caminho relativo ao índice ("efeitos/onda/onda.lumiarfx") ou endereço completo; null se não for permitido. */
export function resolveUrl(raw: string, index: URL): URL | null {
  try {
    const url = new URL(raw, index);
    return allowedUrl(index, url) ? url : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Índice

const isText = (v: unknown): v is string => typeof v === 'string';
const clean = (v: string, max: number) => v.trim().slice(0, max);

/** Confere um item do índice e devolve só os campos que o Lumiar usa (ou o motivo de ficar de fora). */
function readItem(raw: unknown, index: URL): GalleryItem | string {
  const e = raw as Record<string, unknown> | null;
  if (!e || typeof e !== 'object' || Array.isArray(e)) return t('item inválido.');
  if (!isText(e.id) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(e.id)) return t('item sem id (letras minúsculas, números e -).');
  const fail = (why: string) => `"${e.id as string}": ${why}`;
  if (e.kind !== 'effect' && e.kind !== 'pack') return fail(t('o tipo precisa ser "effect" ou "pack".'));
  if (!isText(e.name) || !e.name.trim()) return fail(t('falta o nome.'));
  if (!isText(e.author) || !e.author.trim()) return fail(t('falta o autor.'));
  if (e.description !== undefined && !isText(e.description)) return fail(t('a descrição não é um texto.'));
  if (e.language !== undefined && !isText(e.language)) return fail(t('o idioma não é um texto.'));
  if (e.added !== undefined && !isText(e.added)) return fail(t('a data não é um texto.'));
  if (e.tags !== undefined && !(Array.isArray(e.tags) && e.tags.every(isText))) return fail(t('as etiquetas precisam ser uma lista de textos.'));
  if (e.contents !== undefined && !(Array.isArray(e.contents) && e.contents.every(isText))) return fail(t('"contents" precisa ser uma lista de ids.'));
  if (e.version !== undefined && !isText(e.version) && !(typeof e.version === 'number' && Number.isFinite(e.version))) return fail(t('a versão não é um texto.'));
  if (!isText(e.sha256) || !/^[0-9a-f]{64}$/i.test(e.sha256)) return fail(t('falta o SHA-256 do arquivo.'));
  if (typeof e.size !== 'number' || !Number.isInteger(e.size) || e.size <= 0) return fail(t('falta o tamanho do arquivo.'));
  if (e.size > MAX_ITEM_BYTES) return fail(t('o arquivo é grande demais.'));
  if (!isText(e.file)) return fail(t('falta o arquivo.'));
  const file = resolveUrl(e.file, index);
  if (!file) return fail(t('o arquivo precisa estar no mesmo repositório do índice (e em https).'));
  if (!file.pathname.toLowerCase().endsWith(EXTENSION[e.kind])) return fail(t('o arquivo precisa terminar em {ext}.', { ext: EXTENSION[e.kind] }));
  let preview: URL | null = null;
  if (e.preview !== undefined && e.preview !== null && e.preview !== '') {
    if (!isText(e.preview)) return fail(t('a prévia não é um endereço.'));
    preview = resolveUrl(e.preview, index);
    if (!preview) return fail(t('a prévia precisa estar no mesmo repositório do índice (e em https).'));
  }
  const tags = [...new Set(((e.tags as string[] | undefined) ?? []).map((tag) => clean(tag, 30).toLowerCase()).filter(Boolean))].slice(0, MAX_TAGS);
  return {
    id: e.id,
    kind: e.kind,
    name: clean(e.name, 80),
    description: clean((e.description as string | undefined) ?? '', 500),
    author: clean(e.author, 60),
    tags,
    language: clean((e.language as string | undefined) ?? '', 10).toLowerCase(),
    file: file.href,
    preview: preview?.href ?? null,
    size: e.size,
    sha256: e.sha256.toLowerCase(),
    version: clean(String(e.version ?? '1'), 20),
    added: clean((e.added as string | undefined) ?? '', 10),
    contents: ((e.contents as string[] | undefined) ?? []).slice(0, MAX_CONTENTS),
  };
}

/** Confere o index.json inteiro. Um item errado fica de fora sozinho; o índice errado não abre. */
export function parseIndex(data: unknown, indexUrl: string): GalleryIndex {
  const invalid = new GalleryError('invalid', t('O índice da galeria não está no formato do Lumiar.'));
  const index = checkIndexUrl(indexUrl);
  if (typeof index === 'string') throw new GalleryError('bad-url', index);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid;
  const { format, version, items, name, updated } = data as Record<string, unknown>;
  if (format !== INDEX_FORMAT || !Array.isArray(items)) throw invalid;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw invalid;
  if (version > INDEX_VERSION) throw new GalleryError('newer', t('A galeria usa um formato mais novo que esta versão do Lumiar. Atualize para ver os itens.'));
  if (items.length > MAX_ITEMS) throw invalid;
  const result: GalleryIndex = { name: isText(name) ? clean(name, 80) : '', updated: isText(updated) ? clean(updated, 25) : '', items: [], skipped: [] };
  const ids = new Set<string>();
  for (const raw of items) {
    const item = readItem(raw, index);
    if (typeof item === 'string') result.skipped.push(item);
    else if (ids.has(item.id)) result.skipped.push(`"${item.id}": ${t('id repetido.')}`);
    else {
      ids.add(item.id);
      result.items.push(item);
    }
  }
  return result;
}

// ---------------------------------------------------------------- Downloads

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: Fetcher = (url, init) => fetch(url, init);
// Sem cookies e sem dizer de onde veio: a galeria só precisa entregar arquivos públicos.
const REQUEST: RequestInit = { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache' };

/** Lê a resposta inteira, parando assim que passa do limite. */
async function readLimited(response: Response, max: number, tooBig: () => GalleryError): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > max) throw tooBig();
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > max) throw tooBig();
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      void reader.cancel();
      throw tooBig();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

async function request(url: string, fetcher: Fetcher): Promise<Response> {
  try {
    return await fetcher(url, REQUEST);
  } catch {
    // fetch só falha assim sem rede (ou com o servidor fora do ar).
    throw new GalleryError('offline', t('Sem conexão com a galeria. Confira a internet e tente de novo.'));
  }
}

/** Baixa e confere o índice. O 404 é o caso de hoje: o repositório da galeria ainda não existe. */
export async function fetchIndex(indexUrl: string, fetcher: Fetcher = defaultFetch): Promise<GalleryIndex> {
  const url = checkIndexUrl(indexUrl);
  if (typeof url === 'string') throw new GalleryError('bad-url', url);
  const response = await request(url.href, fetcher);
  if (response.status === 404) throw new GalleryError('not-found', t('A galeria ainda não está no ar.'), 404);
  if (!response.ok) throw new GalleryError('http', t('A galeria respondeu com erro ({status}). Tente mais tarde.', { status: response.status }), response.status);
  const bytes = await readLimited(response, MAX_INDEX_BYTES, () => new GalleryError('too-big', t('O índice da galeria é grande demais.')));
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new GalleryError('invalid', t('O índice da galeria não está no formato do Lumiar.'));
  }
  return parseIndex(data, url.href);
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Confere se o arquivo baixado é exatamente o do índice (tamanho e SHA-256). */
export async function verifyDownload(bytes: Uint8Array<ArrayBuffer>, item: Pick<GalleryItem, 'name' | 'size' | 'sha256'>): Promise<void> {
  if (bytes.byteLength !== item.size) throw new GalleryError('size', t('"{name}" veio com um tamanho diferente do publicado. Tente de novo.', { name: item.name }));
  if ((await sha256Hex(bytes)) !== item.sha256.toLowerCase()) {
    throw new GalleryError('hash', t('"{name}" não confere com o publicado na galeria (SHA-256 diferente). Nada foi instalado.', { name: item.name }));
  }
}

/** Baixa o arquivo de um item (já conferido) e devolve os bytes. */
export async function downloadItem(item: GalleryItem, indexUrl: string, fetcher: Fetcher = defaultFetch): Promise<Uint8Array<ArrayBuffer>> {
  const index = checkIndexUrl(indexUrl);
  const target = new URL(item.file);
  if (typeof index === 'string' || !allowedUrl(index, target)) throw new GalleryError('bad-url', t('O arquivo de "{name}" está fora da galeria.', { name: item.name }));
  const response = await request(target.href, fetcher);
  // Um redirecionamento para fora da galeria também não vale.
  if (response.url && !allowedUrl(index, new URL(response.url))) throw new GalleryError('bad-url', t('O arquivo de "{name}" está fora da galeria.', { name: item.name }));
  if (response.status === 404) throw new GalleryError('not-found', t('"{name}" não está mais na galeria.', { name: item.name }), 404);
  if (!response.ok) throw new GalleryError('http', t('A galeria respondeu com erro ({status}). Tente mais tarde.', { status: response.status }), response.status);
  const limit = Math.min(item.size, MAX_ITEM_BYTES);
  const bytes = await readLimited(response, limit, () => new GalleryError('size', t('"{name}" veio com um tamanho diferente do publicado. Tente de novo.', { name: item.name })));
  await verifyDownload(bytes, item);
  return bytes;
}

/** Nome do arquivo baixado (o último pedaço do endereço), usado nas mensagens da importação. */
export function itemFileName(item: GalleryItem): string {
  const last = new URL(item.file).pathname.split('/').pop() ?? '';
  try {
    return decodeURIComponent(last) || `${item.id}${EXTENSION[item.kind]}`;
  } catch {
    return `${item.id}${EXTENSION[item.kind]}`;
  }
}

// ---------------------------------------------------------------- O que já está instalado

/** O que o Lumiar guarda de cada item instalado pela galeria. */
export interface InstalledRecord {
  sha256: string;
  version: string;
  /** Ids que os efeitos ou pacotes ganharam aqui (podem mudar na importação, se colidirem). */
  local: string[];
}

export type InstallState = 'none' | 'installed' | 'update';

/**
 * Instalado: pela galeria (e algum dos efeitos ou pacotes ainda está aqui), ou porque todos os ids que o arquivo
 * traz já existem. Instalado com outro SHA-256: há uma versão nova.
 */
export function installState(item: Pick<GalleryItem, 'sha256' | 'contents'>, record: InstalledRecord | undefined, local: ReadonlySet<string>): InstallState {
  if (record && (record.local.length === 0 || record.local.some((id) => local.has(id)))) {
    return record.sha256 === item.sha256 ? 'installed' : 'update';
  }
  if (item.contents.length > 0 && item.contents.every((id) => local.has(id))) return 'installed';
  return 'none';
}

const INSTALLED_KEY = 'lumiar:galeria:instalados';
const URL_KEY = 'lumiar:galeria:indice';

/** Chave do item no registro de instalados (o mesmo id pode existir como efeito e como pacote). */
export const installedKey = (item: Pick<GalleryItem, 'kind' | 'id'>) => `${item.kind}:${item.id}`;

export function readInstalled(): Record<string, InstalledRecord> {
  try {
    const data = JSON.parse(localStorage.getItem(INSTALLED_KEY) ?? '{}') as Record<string, InstalledRecord>;
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function rememberInstalled(item: GalleryItem, local: string[]): void {
  try {
    const all = readInstalled();
    all[installedKey(item)] = { sha256: item.sha256, version: item.version, local };
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(all));
  } catch {
    // Sem armazenamento: o "Instalado" vale só pelos ids.
  }
}

/** Endereço do índice escolhido nas configurações da galeria (para testar ou usar um espelho). */
export function getIndexUrl(): string {
  try {
    const saved = localStorage.getItem(URL_KEY);
    if (saved && typeof checkIndexUrl(saved) !== 'string') return saved;
  } catch {
    // Sem armazenamento: vale o padrão.
  }
  return DEFAULT_INDEX_URL;
}

export function setIndexUrl(url: string | null): void {
  try {
    if (!url || url === DEFAULT_INDEX_URL) localStorage.removeItem(URL_KEY);
    else localStorage.setItem(URL_KEY, url);
  } catch {
    // Sem armazenamento: vale só até fechar.
  }
}

// ---------------------------------------------------------------- Busca

/** Etiquetas da galeria, das mais usadas para as menos. */
export function galleryTags(items: GalleryItem[]): string[] {
  const count = new Map<string, number>();
  for (const item of items) for (const tag of item.tags) count.set(tag, (count.get(tag) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag);
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function filterItems(items: GalleryItem[], query: string, kind: GalleryKind | null, tag: string | null): GalleryItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (kind && item.kind !== kind) return false;
    if (tag && !item.tags.includes(tag)) return false;
    const text = fold(`${item.name} ${item.description} ${item.author} ${item.tags.join(' ')}`);
    return words.every((w) => text.includes(w));
  });
}
