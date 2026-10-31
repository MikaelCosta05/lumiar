import { describe, expect, it } from 'vitest';
import { editDistance, matchScore, plain, pushRecent, readRecent, RECENT_STORAGE_KEY, scoreCommand, searchCommands, type Searchable } from './commandSearch';
import { createShortcutRegistry, DEFAULT_SHORTCUTS, normalizeCombo } from './shortcuts';

const item = (id: string, kind: Searchable['kind'], label: string, extra: Partial<Searchable> = {}): Searchable => ({ id, kind, label, ...extra });

const ITEMS: Searchable[] = [
  item('effects/glitch', 'effect', 'Glitch', { keywords: ['Efeito', 'Digital'] }),
  item('effects/glitch-digital', 'effect', 'Glitch digital', { keywords: ['Efeito', 'Digital'] }),
  item('effects/brilho', 'effect', 'Brilho', { keywords: ['Efeito', 'Luz'] }),
  item('filters/cinema', 'filter', 'Cinema', { keywords: ['Filtro', 'Filmes'] }),
  item('transitions/dissolver', 'transition', 'Dissolver', { keywords: ['Transição', 'Clássicas'] }),
  item('transitions/camera-de-video', 'transition', 'Câmera de vídeo', { keywords: ['Transição'] }),
  item('packs/trailer-epico', 'pack', 'Trailer épico', { keywords: ['Pacote', 'Cinematográfico'] }),
  item('sticker/caveira', 'sticker', 'Caveira (morri)', { keywords: ['Sticker'] }),
  item('sound/vine-boom', 'sound', 'Vine boom', { keywords: ['Efeito sonoro'] }),
  item('action:undo', 'action', 'Desfazer', { keywords: ['Ação', 'Editar'] }),
  item('action:split', 'action', 'Dividir o clipe no cursor', { keywords: ['Ação'] }),
  // Interface em inglês: o nome traduzido e o português como outro nome.
  item('effects/chuva', 'effect', 'Rain', { aliases: ['Chuva'], keywords: ['Effect'] }),
];
const ids = (query: string, recent: string[] = []) => searchCommands(ITEMS, query, recent).map((i) => i.id);

describe('plain e editDistance', () => {
  it('tira acento, maiúscula e pontuação', () => {
    expect(plain('  Câmera de VÍDEO… (2×) ')).toBe('camera de video 2');
    expect(plain('Transição')).toBe('transicao');
  });

  it('troca de duas letras vizinhas conta como um erro só', () => {
    expect(editDistance('glicth', 'glitch')).toBe(1);
    expect(editDistance('brilo', 'brilho')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    // Com limite: para cedo e devolve "passou do limite".
    expect(editDistance('abcdef', 'uvwxyz', 2)).toBe(3);
  });
});

describe('searchCommands', () => {
  it('acha com erro pequeno de digitação ("glicth" acha "Glitch") e põe o mais parecido primeiro', () => {
    expect(ids('glicth').slice(0, 2)).toEqual(['effects/glitch', 'effects/glitch-digital']);
    expect(ids('brilo')[0]).toBe('effects/brilho');
    expect(ids('disolver')[0]).toBe('transitions/dissolver');
  });

  it('ignora acentos e maiúsculas', () => {
    expect(ids('camera de video')[0]).toBe('transitions/camera-de-video');
    expect(ids('TRAILER EPICO')[0]).toBe('packs/trailer-epico');
    expect(ids('épico')[0]).toBe('packs/trailer-epico');
  });

  it('nome exato e começo do nome vêm antes de pedaço no meio', () => {
    expect(ids('glitch')[0]).toBe('effects/glitch');
    expect(ids('dig')[0]).toBe('effects/glitch-digital');
    expect(ids('div')[0]).toBe('action:split');
  });

  it('acha pelo nome em português com a interface em outro idioma', () => {
    expect(ids('chuva')[0]).toBe('effects/chuva');
    expect(ids('rain')[0]).toBe('effects/chuva');
  });

  it('categoria e tipo ajudam: "transicao dissolver", "efeito brilho"', () => {
    expect(ids('transicao dissolver')[0]).toBe('transitions/dissolver');
    expect(ids('efeito brilho')[0]).toBe('effects/brilho');
    expect(ids('sticker')).toContain('sticker/caveira');
  });

  it('palavras curtas não aceitam erro (senão "boo" acharia tudo)', () => {
    expect(ids('xyz')).toEqual([]);
    expect(ids('zzzzzz')).toEqual([]);
  });

  it('sem busca: os usados recentemente primeiro, na ordem em que foram usados', () => {
    const list = ids('', ['sound/vine-boom', 'nao-existe-mais', 'filters/cinema']);
    expect(list.slice(0, 2)).toEqual(['sound/vine-boom', 'filters/cinema']);
    expect(list).toHaveLength(ITEMS.length);
    expect(new Set(list).size).toBe(ITEMS.length);
  });

  it('com busca, o recente desempata entre os parecidos', () => {
    expect(ids('glit', ['effects/glitch-digital'])[0]).toBe('effects/glitch-digital');
    expect(ids('glit')[0]).toBe('effects/glitch');
    // O nome exato continua na frente.
    expect(ids('glitch', ['effects/glitch-digital'])[0]).toBe('effects/glitch');
    // Mas não passa na frente de um que combina e ele não.
    expect(ids('brilho', ['effects/glitch-digital'])).toEqual(['effects/brilho']);
  });

  it('matchScore e scoreCommand devolvem 0 quando não combina', () => {
    expect(matchScore('', 'glitch')).toBe(0);
    expect(matchScore('abc', '')).toBe(0);
    expect(scoreCommand(ITEMS[0], '   ')).toBe(0);
    expect(scoreCommand(ITEMS[0], 'cinema')).toBe(0);
  });

  it('é rápida com o catálogo inteiro (mil itens)', () => {
    const many = Array.from({ length: 1000 }, (_, i) => item(`x${i}`, 'effect', `Efeito número ${i} com nome comprido`, { keywords: ['Efeito', 'Categoria'] }));
    const start = performance.now();
    for (const q of ['e', 'ef', 'efe', 'efei', 'efeit', 'efeito', 'nuemro', 'comprdo']) searchCommands(many, q);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe('usados recentemente', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  };

  it('o último usado vai para o topo, sem repetir, até 8', () => {
    const s = memory();
    for (const id of ['a', 'b', 'c', 'a']) pushRecent(id, s);
    expect(readRecent(s)).toEqual(['a', 'c', 'b']);
    for (let i = 0; i < 10; i++) pushRecent(`n${i}`, s);
    expect(readRecent(s)).toHaveLength(8);
    expect(readRecent(s)[0]).toBe('n9');
  });

  it('guardado com defeito ou sem armazenamento: lista vazia, sem erro', () => {
    const s = memory();
    s.data.set(RECENT_STORAGE_KEY, '{oops');
    expect(readRecent(s)).toEqual([]);
    s.data.set(RECENT_STORAGE_KEY, JSON.stringify(['a', 3, null, 'b']));
    expect(readRecent(s)).toEqual(['a', 'b']);
    expect(readRecent(null)).toEqual([]);
    expect(pushRecent('x', null)).toEqual(['x']);
  });
});

describe('atalho da paleta', () => {
  it('Ctrl+K (Cmd+K no Mac) é da paleta e de nenhuma outra ação', () => {
    const registry = createShortcutRegistry(DEFAULT_SHORTCUTS, () => null);
    expect(registry.bindings('commandPalette')).toEqual(['Mod+K']);
    expect(registry.conflicts('Mod+K', 'commandPalette')).toEqual([]);
    expect(registry.clashes()).toEqual([]);
    expect(normalizeCombo('cmd+k')).toBe('Mod+K');
  });

  it('run faz a ação como se a tecla tivesse sido apertada', () => {
    const registry = createShortcutRegistry(DEFAULT_SHORTCUTS, () => null);
    let undone = 0;
    expect(registry.run('undo')).toBe(false);
    registry.on('undo', () => void undone++);
    expect(registry.run('undo')).toBe(true);
    expect(undone).toBe(1);
    // Quem trata pode dizer que não dá agora (a câmera 5 não existe).
    registry.on('camera5', () => false);
    expect(registry.run('camera5')).toBe(false);
  });
});

describe('o catálogo de verdade na paleta', async () => {
  const { buildCommands } = await import('../ui/CommandPalette');
  const calls: string[] = [];
  const commands = buildCommands({
    applyPlugin: (plugin) => void calls.push(plugin.id),
    addPack: (pack) => void calls.push(pack.id),
    addText: (preset) => void calls.push(preset.id),
    addSound: (sound) => void calls.push(sound.id),
    userPacks: [],
    menus: [
      {
        where: 'Ferramentas',
        entries: [
          { header: 'Clipe' },
          { label: 'Velocidade', items: [{ label: '2×', onClick: () => void calls.push('2x') }, { label: '4×', disabled: true, onClick: () => {} }] },
          'separator',
          null,
          { label: 'Tela dividida…', onClick: () => void calls.push('split') },
        ],
      },
    ],
  });
  const first = (query: string) => searchCommands(commands, query)[0];

  it('acha filtros, efeitos, transições, pacotes, stickers, sons e o bloco de ajuste', () => {
    expect(first('glicth')).toMatchObject({ id: 'effects/glitch', kind: 'effect' });
    expect(first('dissolver')).toMatchObject({ kind: 'transition' });
    expect(first('trailer epico')).toMatchObject({ id: 'pacote:packs/trailer-epico', kind: 'pack' });
    expect(first('bloco de ajuste')).toMatchObject({ id: 'pacote:packs/bloco-de-ajuste', kind: 'pack' });
    // Há um pacote e um som com o mesmo nome: os dois aparecem, e "efeito sonoro" escolhe o som.
    expect(searchCommands(commands, 'vine boom').slice(0, 2).map((c) => c.kind).sort()).toEqual(['pack', 'sound']);
    expect(first('efeito sonoro vine boom')).toMatchObject({ id: 'som:vine-boom', kind: 'sound' });
    expect(first('caveira')).toMatchObject({ kind: 'sticker' });
    expect(new Set(commands.map((c) => c.kind))).toEqual(new Set(['filter', 'effect', 'transition', 'pack', 'sticker', 'text', 'sound', 'action']));
    // Ids únicos: os recentes e as chaves da lista dependem disso.
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
  });

  it('Enter faz o mesmo que o clique na biblioteca', () => {
    calls.length = 0;
    first('glicth').run();
    first('bloco de ajuste').run();
    expect(calls).toEqual(['effects/glitch', 'packs/bloco-de-ajuste']);
  });

  it('as ações dos menus entram com os submenus ("Velocidade › 2×"), sem as desligadas', () => {
    const speed = commands.filter((c) => c.kind === 'action' && c.label.startsWith('Velocidade'));
    expect(speed.map((c) => c.label)).toEqual(['Velocidade › 2×']);
    expect(speed[0].detail).toBe('Clipe');
    expect(first('tela dividida')).toMatchObject({ kind: 'action', label: 'Tela dividida…' });
    // As ações dos atalhos também (menos a própria paleta).
    expect(first('desfazer')).toMatchObject({ id: 'atalho:undo', kind: 'action' });
    expect(commands.some((c) => c.id === 'atalho:commandPalette')).toBe(false);
  });
});
