import { describe, expect, it, vi } from 'vitest';
import { isMac } from '../i18n/keys';
import { comboFromEvent, comboLabel, createShortcutRegistry, DEFAULT_SHORTCUTS, normalizeCombo, SHORTCUTS_STORAGE_KEY, type ShortcutAction } from './shortcuts';

/** Armazenamento de mentira (o localStorage não existe no Node). */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

/** Armazenamento que falha em tudo (modo privado, site bloqueado). */
const brokenStorage = {
  getItem: () => {
    throw new Error('bloqueado');
  },
  setItem: () => {
    throw new Error('bloqueado');
  },
  removeItem: () => {
    throw new Error('bloqueado');
  },
};

type KeyInit = Partial<Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> & { altGraph?: boolean };

function key(init: KeyInit): KeyboardEvent {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
    getModifierState: (m: string) => m === 'AltGraph' && !!init.altGraph,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

const ACTIONS: ShortcutAction[] = [
  { id: 'split', label: 'Dividir', group: 'g', defaults: ['S'] },
  { id: 'marker', label: 'Marcador', group: 'g', defaults: ['M'] },
  { id: 'undo', label: 'Desfazer', group: 'g', defaults: ['ctrl+z'], preventDefault: true },
  { id: 'redo', label: 'Refazer', group: 'g', defaults: ['Ctrl+Shift+Z', 'Ctrl+Y'], preventDefault: true },
  { id: 'save', label: 'Salvar', group: 'g', defaults: ['Mod+S'], always: true, preventDefault: true },
];

const free = { typing: false, blocked: false };

describe('formato dos atalhos', () => {
  it('normaliza modificadores, apelidos e a ordem', () => {
    expect(normalizeCombo('ctrl+shift+z')).toBe('Mod+Shift+Z');
    expect(normalizeCombo('Shift+Ctrl+z')).toBe('Mod+Shift+Z');
    expect(normalizeCombo('Cmd+O')).toBe('Mod+O');
    expect(normalizeCombo('meta+o')).toBe('Mod+O');
    expect(normalizeCombo('alt+⌘+k')).toBe('Mod+Alt+K');
    expect(normalizeCombo('option+shift+arrowleft')).toBe('Alt+Shift+ArrowLeft');
    expect(normalizeCombo('space')).toBe('Space');
    expect(normalizeCombo('esc')).toBe('Escape');
    expect(normalizeCombo('del')).toBe('Delete');
    expect(normalizeCombo('left')).toBe('ArrowLeft');
    expect(normalizeCombo('f5')).toBe('F5');
    expect(normalizeCombo('s')).toBe('S');
  });

  it('num sinal o Shift já faz parte do caractere', () => {
    expect(normalizeCombo('Shift+?')).toBe('?');
    expect(normalizeCombo('?')).toBe('?');
    expect(normalizeCombo('Shift+1')).toBe('Shift+1');
    expect(normalizeCombo('Mod++')).toBe('Mod++');
    expect(normalizeCombo('+')).toBe('+');
  });

  it('recusa o que não é atalho', () => {
    expect(normalizeCombo('')).toBeNull();
    expect(normalizeCombo('Ctrl')).toBeNull();
    expect(normalizeCombo('Ctrl+Shift')).toBeNull();
    expect(normalizeCombo('Ctrl+A+B')).toBeNull();
    expect(normalizeCombo('Ctrl+Tecla')).toBeNull();
  });

  it('lê a tecla apertada, com Ctrl e Cmd valendo o mesmo', () => {
    expect(comboFromEvent(key({ key: 's', code: 'KeyS', ctrlKey: true }))).toBe('Mod+S');
    expect(comboFromEvent(key({ key: 's', code: 'KeyS', metaKey: true }))).toBe('Mod+S');
    expect(comboFromEvent(key({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }))).toBe('Mod+Shift+Z');
    expect(comboFromEvent(key({ key: ' ', code: 'Space' }))).toBe('Space');
    expect(comboFromEvent(key({ key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: true }))).toBe('Shift+ArrowLeft');
    expect(comboFromEvent(key({ key: 'Delete', code: 'Delete' }))).toBe('Delete');
  });

  it('ignora o modificador sozinho', () => {
    expect(comboFromEvent(key({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))).toBeNull();
    expect(comboFromEvent(key({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }))).toBeNull();
    expect(comboFromEvent(key({ key: 'Meta', code: 'MetaLeft', metaKey: true }))).toBeNull();
  });

  it('letras pelo layout; números e letras não latinas pela posição', () => {
    // Teclado francês: a tecla do Q escreve "a".
    expect(comboFromEvent(key({ key: 'a', code: 'KeyQ' }))).toBe('A');
    // ...e a tecla do M escreve a vírgula.
    expect(comboFromEvent(key({ key: ',', code: 'KeyM' }))).toBe(',');
    // Teclado russo e Alt no Mac: pela posição.
    expect(comboFromEvent(key({ key: 'ы', code: 'KeyS' }))).toBe('S');
    expect(comboFromEvent(key({ key: 'ß', code: 'KeyS', altKey: true }))).toBe('Alt+S');
    // Shift+1 escreve "!", mas continua sendo o 1.
    expect(comboFromEvent(key({ key: '!', code: 'Digit1', shiftKey: true }))).toBe('Shift+1');
    expect(comboFromEvent(key({ key: '?', code: 'Slash', shiftKey: true }))).toBe('?');
    // Teclado numérico: com o Num Lock desligado, o 1 é o End.
    expect(comboFromEvent(key({ key: '1', code: 'Numpad1' }))).toBe('1');
    expect(comboFromEvent(key({ key: 'End', code: 'Numpad1' }))).toBe('End');
  });

  it('AltGr (Ctrl+Alt no Windows) só digita o caractere', () => {
    expect(comboFromEvent(key({ key: '/', code: 'KeyQ', ctrlKey: true, altKey: true, altGraph: true }))).toBe('/');
  });

  it('mostra o atalho como no teclado da pessoa', () => {
    expect(comboLabel('Mod+Shift+Z')).toBe(isMac ? '⌘⇧Z' : 'Ctrl+Shift+Z');
    expect(comboLabel('Mod+ArrowLeft')).toBe(isMac ? '⌘←' : 'Ctrl+←');
    expect(comboLabel('Space')).toBe('Espaço');
    expect(comboLabel('S')).toBe('S');
  });
});

describe('registro de atalhos', () => {
  it('os atalhos padrão do editor não se repetem', () => {
    const registry = createShortcutRegistry(DEFAULT_SHORTCUTS, () => memoryStorage());
    expect(registry.clashes()).toEqual([]);
    expect(registry.bindings('redo')).toEqual(['Mod+Shift+Z', 'Mod+Y']);
    expect(registry.bindings('delete')).toEqual(['Delete', 'Backspace']);
  });

  it('normaliza os padrões e guarda só o que mudou', () => {
    const storage = memoryStorage();
    const registry = createShortcutRegistry(ACTIONS, () => storage);
    expect(registry.bindings('undo')).toEqual(['Mod+Z']);
    registry.setBindings('split', ['b']);
    expect(registry.bindings('split')).toEqual(['B']);
    expect(registry.isCustom('split')).toBe(true);
    expect(JSON.parse(storage.data.get(SHORTCUTS_STORAGE_KEY)!)).toEqual({ split: ['B'] });
    // Outra sessão lê a preferência.
    expect(createShortcutRegistry(ACTIONS, () => storage).bindings('split')).toEqual(['B']);
    // Voltar ao padrão apaga a preferência.
    registry.reset('split');
    expect(registry.isCustom('split')).toBe(false);
    expect(storage.data.has(SHORTCUTS_STORAGE_KEY)).toBe(false);
  });

  it('tirar todos os atalhos de uma ação é diferente de seguir o padrão', () => {
    const storage = memoryStorage();
    const registry = createShortcutRegistry(ACTIONS, () => storage);
    registry.setBindings('marker', []);
    expect(registry.bindings('marker')).toEqual([]);
    expect(createShortcutRegistry(ACTIONS, () => storage).bindings('marker')).toEqual([]);
  });

  it('preferência guardada com defeito: valem os padrões (e o que der para aproveitar)', () => {
    expect(createShortcutRegistry(ACTIONS, () => memoryStorage({ [SHORTCUTS_STORAGE_KEY]: '{nada' })).bindings('split')).toEqual(['S']);
    expect(createShortcutRegistry(ACTIONS, () => memoryStorage({ [SHORTCUTS_STORAGE_KEY]: '[1,2]' })).bindings('split')).toEqual(['S']);
    const mixed = createShortcutRegistry(ACTIONS, () => memoryStorage({ [SHORTCUTS_STORAGE_KEY]: JSON.stringify({ split: ['ctrl+k', 3, 'Ctrl'], marker: 'x' }) }));
    expect(mixed.bindings('split')).toEqual(['Mod+K']);
    expect(mixed.bindings('marker')).toEqual(['M']);
  });

  it('sem armazenamento (ou com ele falhando) funciona só na memória', () => {
    for (const storage of [() => brokenStorage, () => null, () => undefined]) {
      const registry = createShortcutRegistry(ACTIONS, storage);
      expect(registry.bindings('split')).toEqual(['S']);
      expect(() => registry.setBindings('split', ['B'])).not.toThrow();
      expect(registry.bindings('split')).toEqual(['B']);
      expect(() => registry.resetAll()).not.toThrow();
      expect(registry.bindings('split')).toEqual(['S']);
    }
  });

  it('acha quem já usa o atalho', () => {
    const registry = createShortcutRegistry(ACTIONS, () => memoryStorage());
    expect(registry.conflicts('m').map((c) => c.action.id)).toEqual(['marker']);
    expect(registry.conflicts('M', 'marker')).toEqual([]);
    expect(registry.conflicts('ctrl+y').map((c) => c.action.id)).toEqual(['redo']);
    expect(registry.conflicts('X')).toEqual([]);
  });

  it('usar um atalho já ocupado: tirar de lá', () => {
    const registry = createShortcutRegistry(ACTIONS, () => memoryStorage());
    registry.assign('split', 'M', 'replace', 'steal');
    expect(registry.bindings('split')).toEqual(['M']);
    expect(registry.bindings('marker')).toEqual([]);
    expect(registry.clashes()).toEqual([]);
  });

  it('usar um atalho já ocupado: trocar entre as duas', () => {
    const registry = createShortcutRegistry(ACTIONS, () => memoryStorage());
    registry.assign('split', 'M', 'replace', 'swap');
    expect(registry.bindings('split')).toEqual(['M']);
    expect(registry.bindings('marker')).toEqual(['S']);
    // Ctrl+Y era um dos dois do refazer: ele fica com o Ctrl+Z do desfazer no lugar.
    registry.assign('undo', 'Ctrl+Y', 'replace', 'swap');
    expect(registry.bindings('undo')).toEqual(['Mod+Y']);
    expect(registry.bindings('redo')).toEqual(['Mod+Shift+Z', 'Mod+Z']);
  });

  it('acrescentar um atalho mantém os outros', () => {
    const registry = createShortcutRegistry(ACTIONS, () => memoryStorage());
    registry.assign('split', 'B', 'add');
    expect(registry.bindings('split')).toEqual(['S', 'B']);
    registry.assign('split', 'S', 'add');
    expect(registry.bindings('split')).toEqual(['B', 'S']);
    registry.resetAll();
    expect(registry.bindings('split')).toEqual(['S']);
  });

  it('avisa quem muda (para as dicas mostrarem o atalho novo)', () => {
    const registry = createShortcutRegistry(ACTIONS, () => memoryStorage());
    const listener = vi.fn();
    const stop = registry.subscribe(listener);
    const before = registry.version();
    registry.setBindings('split', ['B']);
    expect(listener).toHaveBeenCalled();
    expect(registry.version()).toBeGreaterThan(before);
    stop();
    listener.mockClear();
    registry.resetAll();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('fazer a ação da tecla', () => {
  it('chama quem trata a ação e respeita o preventDefault', () => {
    const registry = createShortcutRegistry(ACTIONS, () => memoryStorage());
    const split = vi.fn();
    const undo = vi.fn();
    registry.on('split', split);
    registry.on('undo', undo);
    const s = key({ key: 's', code: 'KeyS' });
    expect(registry.dispatch(s, free)).toBe(true);
    expect(split).toHaveBeenCalledTimes(1);
    expect(s.preventDefault).not.toHaveBeenCalled();
    const z = key({ key: 'z', code: 'KeyZ', metaKey: true });
    expect(registry.dispatch(z, free)).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(z.preventDefault).toHaveBeenCalled();
    expect(registry.dispatch(key({ key: 'x', code: 'KeyX' }), free)).toBe(false);
  });

  it('segue o atalho que a pessoa escolheu', () => {
    const registry = createShortcutRegistry(ACTIONS, () => memoryStorage());
    const split = vi.fn();
    registry.on('split', split);
    registry.setBindings('split', ['Alt+D']);
    expect(registry.dispatch(key({ key: 's', code: 'KeyS' }), free)).toBe(false);
    expect(registry.dispatch(key({ key: 'd', code: 'KeyD', altKey: true }), free)).toBe(true);
    expect(split).toHaveBeenCalledTimes(1);
  });

  it('digitando num campo (ou exportando) só valem os atalhos "always"', () => {
    const registry = createShortcutRegistry(ACTIONS, () => memoryStorage());
    const split = vi.fn();
    const save = vi.fn();
    registry.on('split', split);
    registry.on('save', save);
    expect(registry.dispatch(key({ key: 's', code: 'KeyS' }), { typing: true, blocked: false })).toBe(false);
    expect(registry.dispatch(key({ key: 's', code: 'KeyS' }), { typing: false, blocked: true })).toBe(false);
    expect(registry.dispatch(key({ key: 's', code: 'KeyS', ctrlKey: true }), { typing: true, blocked: true })).toBe(true);
    expect(split).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('quem devolve false deixa a tecla seguir (e o anterior tenta)', () => {
    const registry = createShortcutRegistry(ACTIONS, () => memoryStorage());
    const app = vi.fn();
    registry.on('split', app);
    const stop = registry.on('split', () => false);
    const e = key({ key: 's', code: 'KeyS' });
    expect(registry.dispatch(e, free)).toBe(true);
    expect(app).toHaveBeenCalledTimes(1);
    stop();
    const none = createShortcutRegistry(ACTIONS, () => memoryStorage());
    none.on('undo', () => false);
    const z = key({ key: 'z', code: 'KeyZ', ctrlKey: true });
    expect(none.dispatch(z, free)).toBe(false);
    expect(z.preventDefault).not.toHaveBeenCalled();
  });

  it('Shift a mais não atrapalha, a não ser que o atalho com Shift seja de outra ação', () => {
    const registry = createShortcutRegistry(ACTIONS, () => memoryStorage());
    const split = vi.fn();
    const undo = vi.fn();
    const redo = vi.fn();
    registry.on('split', split);
    registry.on('undo', undo);
    registry.on('redo', redo);
    registry.dispatch(key({ key: 'S', code: 'KeyS', shiftKey: true }), free);
    expect(split).toHaveBeenCalledTimes(1);
    registry.dispatch(key({ key: 'Z', code: 'KeyZ', ctrlKey: true, shiftKey: true }), free);
    expect(redo).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });

  it('uma ferramenta nova registra a própria ação e o atalho', () => {
    const registry = createShortcutRegistry(ACTIONS, () => memoryStorage());
    registry.register({ id: 'timeline.slip', label: 'Deslizar', group: 'Linha do tempo', defaults: ['y'] });
    const slip = vi.fn();
    const stop = registry.on('timeline.slip', slip);
    expect(registry.bindings('timeline.slip')).toEqual(['Y']);
    expect(registry.actions().map((a) => a.id)).toContain('timeline.slip');
    registry.dispatch(key({ key: 'y', code: 'KeyY' }), free);
    expect(slip).toHaveBeenCalledTimes(1);
    stop();
    expect(registry.dispatch(key({ key: 'y', code: 'KeyY' }), free)).toBe(false);
  });
});
