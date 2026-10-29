import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allowedUrl,
  checkIndexUrl,
  DEFAULT_INDEX_URL,
  downloadItem,
  fetchIndex,
  filterItems,
  GalleryError,
  installState,
  parseIndex,
  sha256Hex,
  verifyDownload,
  type GalleryItem,
} from './gallery';

const INDEX = DEFAULT_INDEX_URL;
const encode = (text: string) => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
// SHA-256 de "abc" (vetor de teste do padrão).
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

function entry(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'onda-colorida',
    kind: 'effect',
    name: 'Onda colorida',
    description: 'A imagem ondula.',
    author: 'Fulana',
    tags: ['Cor', 'glitch'],
    language: 'pt',
    file: 'efeitos/onda-colorida/onda-colorida.lumiarfx',
    preview: 'efeitos/onda-colorida/preview.jpg',
    size: 3,
    sha256: ABC,
    version: '1.0.0',
    added: '2026-10-28',
    ...extra,
  };
}

const index = (items: unknown[], extra: Record<string, unknown> = {}) => ({ format: 'lumiar-galeria', version: 1, items, ...extra });

function problem(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof GalleryError ? error.problem : 'outro';
  }
  return undefined;
}

describe('parseIndex', () => {
  it('lê um índice certo e resolve os caminhos relativos ao index.json', () => {
    const { items, skipped } = parseIndex(index([entry()]), INDEX);
    expect(skipped).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0].file).toBe('https://raw.githubusercontent.com/MikaelCosta05/lumiar-galeria/main/efeitos/onda-colorida/onda-colorida.lumiarfx');
    expect(items[0].preview).toBe('https://raw.githubusercontent.com/MikaelCosta05/lumiar-galeria/main/efeitos/onda-colorida/preview.jpg');
    expect(items[0].tags).toEqual(['cor', 'glitch']);
    expect(items[0].contents).toEqual([]);
  });

  it('recusa o índice sem a marca do formato, com a lista errada ou de versão mais nova', () => {
    expect(problem(() => parseIndex({ ...index([entry()]), format: 'outra-coisa' }, INDEX))).toBe('invalid');
    expect(problem(() => parseIndex({ format: 'lumiar-galeria', version: 1, items: {} }, INDEX))).toBe('invalid');
    expect(problem(() => parseIndex({ format: 'lumiar-galeria', version: '1', items: [] }, INDEX))).toBe('invalid');
    expect(problem(() => parseIndex([entry()], INDEX))).toBe('invalid');
    expect(problem(() => parseIndex(null, INDEX))).toBe('invalid');
    expect(problem(() => parseIndex(index([], { version: 2 }), INDEX))).toBe('newer');
  });

  it('deixa de fora só o item com tipos errados', () => {
    const bad = [
      entry({ id: 'a', kind: 'filtro' }),
      entry({ id: 'b', name: 42 }),
      entry({ id: 'c', tags: 'cor' }),
      entry({ id: 'd', size: '3' }),
      entry({ id: 'e', author: undefined }),
      entry({ id: 'Com Espaço' }),
      entry({ id: 'f', contents: [1, 2] }),
    ];
    const { items, skipped } = parseIndex(index([...bad, entry()]), INDEX);
    expect(items.map((i) => i.id)).toEqual(['onda-colorida']);
    expect(skipped).toHaveLength(bad.length);
  });

  it('recusa arquivo e prévia em http', () => {
    const http = 'http://raw.githubusercontent.com/MikaelCosta05/lumiar-galeria/main/efeitos/x.lumiarfx';
    expect(parseIndex(index([entry({ file: http })]), INDEX).items).toEqual([]);
    expect(parseIndex(index([entry({ preview: http.replace('.lumiarfx', '.jpg') })]), INDEX).items).toEqual([]);
  });

  it('recusa arquivo e prévia de outro servidor ou de outro repositório', () => {
    for (const file of [
      'https://exemplo.com/onda.lumiarfx',
      'https://raw.githubusercontent.com/outra-pessoa/outro-repo/main/onda.lumiarfx',
      '../../../outra-pessoa/outro-repo/main/onda.lumiarfx',
      'https://usuario:senha@raw.githubusercontent.com/MikaelCosta05/lumiar-galeria/main/onda.lumiarfx',
    ]) {
      expect(parseIndex(index([entry({ file })]), INDEX).items, file).toEqual([]);
    }
    expect(parseIndex(index([entry({ preview: 'https://rastreador.exemplo/pixel.gif' })]), INDEX).items).toEqual([]);
    // Endereço completo no mesmo repositório vale.
    const full = 'https://raw.githubusercontent.com/MikaelCosta05/lumiar-galeria/main/pacotes/x.lumiarpack';
    expect(parseIndex(index([entry({ kind: 'pack', file: full })]), INDEX).items).toHaveLength(1);
  });

  it('recusa item sem SHA-256 (ou com um que não é SHA-256), sem tamanho ou grande demais', () => {
    expect(parseIndex(index([entry({ sha256: undefined })]), INDEX).items).toEqual([]);
    expect(parseIndex(index([entry({ sha256: 'abc' })]), INDEX).items).toEqual([]);
    expect(parseIndex(index([entry({ size: 0 })]), INDEX).items).toEqual([]);
    expect(parseIndex(index([entry({ size: 50 * 1024 * 1024 })]), INDEX).items).toEqual([]);
  });

  it('confere a extensão do arquivo pelo tipo e pula ids repetidos', () => {
    expect(parseIndex(index([entry({ kind: 'pack' })]), INDEX).items).toEqual([]);
    const { items, skipped } = parseIndex(index([entry(), entry({ name: 'Outra' })]), INDEX);
    expect(items).toHaveLength(1);
    expect(skipped).toHaveLength(1);
  });

  it('o índice também precisa estar em https', () => {
    expect(typeof checkIndexUrl('http://exemplo.com/index.json')).toBe('string');
    expect(typeof checkIndexUrl('não é endereço')).toBe('string');
    expect(checkIndexUrl(' https://exemplo.com/galeria/index.json ')).toBeInstanceOf(URL);
    expect(problem(() => parseIndex(index([]), 'http://exemplo.com/index.json'))).toBe('bad-url');
  });

  it('fora do GitHub, vale qualquer caminho no mesmo servidor', () => {
    const mirror = new URL('https://espelho.exemplo/lumiar/index.json');
    expect(allowedUrl(mirror, new URL('https://espelho.exemplo/arquivos/a.lumiarfx'))).toBe(true);
    expect(allowedUrl(mirror, new URL('https://outro.exemplo/a.lumiarfx'))).toBe(false);
  });
});

describe('conferência do download', () => {
  const item = { name: 'Onda', size: 3, sha256: ABC };

  it('calcula o SHA-256', async () => {
    expect(await sha256Hex(encode('abc'))).toBe(ABC);
  });

  it('aceita o arquivo igual ao publicado e recusa o diferente', async () => {
    await expect(verifyDownload(encode('abc'), item)).resolves.toBeUndefined();
    await expect(verifyDownload(encode('abd'), item)).rejects.toMatchObject({ problem: 'hash' });
    await expect(verifyDownload(encode('abcd'), item)).rejects.toMatchObject({ problem: 'size' });
    await expect(verifyDownload(encode('abc'), { ...item, sha256: ABC.toUpperCase() })).resolves.toBeUndefined();
  });

  it('baixa e confere; para no limite e recusa redirecionamento para fora', async () => {
    const [parsed] = parseIndex(index([entry()]), INDEX).items;
    const ok = async () => new Response('abc');
    await expect(downloadItem(parsed, INDEX, ok)).resolves.toEqual(encode('abc'));
    await expect(downloadItem(parsed, INDEX, async () => new Response('abcdefgh'))).rejects.toMatchObject({ problem: 'size' });
    await expect(downloadItem(parsed, INDEX, async () => new Response('xyz'))).rejects.toMatchObject({ problem: 'hash' });
    const redirected = async () => {
      const response = new Response('abc');
      Object.defineProperty(response, 'url', { value: 'https://exemplo.com/a.lumiarfx' });
      return response;
    };
    await expect(downloadItem(parsed, INDEX, redirected)).rejects.toMatchObject({ problem: 'bad-url' });
  });
});

describe('fetchIndex', () => {
  it('separa "ainda não está no ar" (404), sem internet e índice errado', async () => {
    await expect(fetchIndex(INDEX, async () => new Response('404: Not Found', { status: 404 }))).rejects.toMatchObject({ problem: 'not-found' });
    await expect(
      fetchIndex(INDEX, async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).rejects.toMatchObject({ problem: 'offline' });
    await expect(fetchIndex(INDEX, async () => new Response('<html>'))).rejects.toMatchObject({ problem: 'invalid' });
    await expect(fetchIndex(INDEX, async () => new Response('', { status: 500 }))).rejects.toMatchObject({ problem: 'http', status: 500 });
    await expect(fetchIndex('http://exemplo.com/index.json', async () => new Response('{}'))).rejects.toMatchObject({ problem: 'bad-url' });
    const { items } = await fetchIndex(INDEX, async () => new Response(JSON.stringify(index([entry()]))));
    expect(items).toHaveLength(1);
  });
});

describe('installState', () => {
  const item = { sha256: ABC, contents: ['user/onda-1a2b3c'] };

  it('instalado pela galeria enquanto algum dos efeitos ainda está aqui', () => {
    const record = { sha256: ABC, version: '1', local: ['user/onda-9z9z9z'] };
    expect(installState(item, record, new Set(['user/onda-9z9z9z']))).toBe('installed');
    // Apagou o efeito: dá para instalar de novo.
    expect(installState(item, record, new Set())).toBe('none');
    // Tudo já estava aqui igualzinho (nenhum id novo): continua instalado.
    expect(installState(item, { ...record, local: [] }, new Set())).toBe('installed');
  });

  it('com outro SHA-256 há uma versão nova', () => {
    expect(installState(item, { sha256: 'f'.repeat(64), version: '1', local: ['user/onda-1a2b3c'] }, new Set(['user/onda-1a2b3c']))).toBe('update');
  });

  it('sem registro, vale ter todos os ids do arquivo', () => {
    expect(installState(item, undefined, new Set(['user/onda-1a2b3c', 'outro']))).toBe('installed');
    expect(installState({ ...item, contents: ['user/onda-1a2b3c', 'user/falta'] }, undefined, new Set(['user/onda-1a2b3c']))).toBe('none');
    expect(installState({ ...item, contents: [] }, undefined, new Set(['user/onda-1a2b3c']))).toBe('none');
  });
});

describe('scripts/galeria-index.mjs', () => {
  it('gera um índice que o Lumiar aceita, com o tamanho e o SHA-256 certos', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lumiar-galeria-'));
    try {
      const folder = join(root, 'efeitos', 'onda-colorida');
      mkdirSync(folder, { recursive: true });
      const fx = JSON.stringify({ format: 'lumiar-efeitos', version: 1, effects: [{ id: 'user/onda-1a2b3c', name: 'Onda', params: [], glsl: 'vec4 effect(vec2 uv) { return getColor(uv); }' }] });
      writeFileSync(join(folder, 'onda-colorida.lumiarfx'), fx);
      writeFileSync(join(folder, 'item.json'), JSON.stringify({ name: 'Onda colorida', author: 'Fulana', tags: ['cor'], language: 'pt' }));
      writeFileSync(join(folder, 'preview.jpg'), 'jpg');
      execFileSync(process.execPath, [join(__dirname, '..', '..', 'scripts', 'galeria-index.mjs'), root], { stdio: 'pipe' });
      const { items, skipped } = parseIndex(JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')), INDEX);
      expect(skipped).toEqual([]);
      expect(items[0]).toMatchObject({ id: 'onda-colorida', kind: 'effect', size: fx.length, contents: ['user/onda-1a2b3c'] });
      expect(items[0].preview).toMatch(/\/efeitos\/onda-colorida\/preview\.jpg$/);
      await expect(verifyDownload(encode(fx), items[0])).resolves.toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('filterItems', () => {
  const items = parseIndex(
    index([entry(), entry({ id: 'trailer', kind: 'pack', name: 'Trailer épico', author: 'Beltrano', tags: ['cinema'], file: 'pacotes/trailer.lumiarpack' })]),
    INDEX,
  ).items as GalleryItem[];

  it('busca sem acento, por tipo e por etiqueta', () => {
    expect(filterItems(items, 'epico', null, null).map((i) => i.id)).toEqual(['trailer']);
    expect(filterItems(items, 'beltrano', null, null).map((i) => i.id)).toEqual(['trailer']);
    expect(filterItems(items, '', 'effect', null).map((i) => i.id)).toEqual(['onda-colorida']);
    expect(filterItems(items, '', null, 'cinema').map((i) => i.id)).toEqual(['trailer']);
    expect(filterItems(items, '', 'effect', 'cinema')).toEqual([]);
  });
});
