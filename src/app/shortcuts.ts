import { useEffect, useRef, useSyncExternalStore } from 'react';
import { t } from '../i18n';
import { isMac, keys } from '../i18n/keys';

/**
 * Atalhos do teclado: cada ação tem um id, um nome, o grupo e os atalhos padrão. A pessoa pode trocar
 * qualquer um (janela "Atalhos do teclado"); o que mudou fica guardado neste computador.
 *
 * Os atalhos são escritos como "Mod+Shift+Z": Mod é o Ctrl (ou o Cmd no Mac), sempre na ordem
 * Mod, Alt, Shift e a tecla. Letras em maiúscula, e as teclas com nome como o navegador chama
 * (ArrowLeft, Delete, Home…), com Space para a barra de espaço.
 *
 * Para uma ferramenta nova ter atalho (e aparecer na janela), basta registrar (no topo do módulo, com o
 * nome já traduzido) e tratar dentro do componente:
 *
 *   registerShortcut({ id: 'timeline.slip', label: <nome traduzido>, group: SHORTCUT_GROUPS.timeline, defaults: ['Y'] });
 *   useShortcut('timeline.slip', () => setTool('slip'));
 */

export interface ShortcutAction {
  id: string;
  /** Nome que aparece na janela de atalhos (já traduzido) */
  label: string;
  /** Grupo na janela (já traduzido; use SHORTCUT_GROUPS) */
  group: string;
  /** Atalhos padrão, no formato normalizado ("Mod+S") */
  defaults: string[];
  /** Vale também com o foco num campo de texto e com a exportação aberta (salvar, abrir) */
  always?: boolean;
  /** Impede o que o navegador faria com a tecla (rolar a página, clicar no botão em foco…) */
  preventDefault?: boolean;
}

/**
 * Quem trata o atalho. Devolver `false` = não deu para fazer aqui (a tecla segue o caminho normal,
 * como os números da multicâmera quando não há aquela câmera).
 */
export type ShortcutHandler = (e: KeyboardEvent) => boolean | void;

export const SHORTCUT_GROUPS = {
  playback: t('Tocar e navegar'),
  timeline: t('Linha do tempo'),
  edit: t('Editar'),
  project: t('Projeto'),
  multicam: t('Multicâmera'),
};

const G = SHORTCUT_GROUPS;

/** Todos os atalhos que o editor já traz (os da tabela do README). */
export const DEFAULT_SHORTCUTS: ShortcutAction[] = [
  { id: 'playPause', label: t('Tocar / pausar'), group: G.playback, defaults: ['Space'], preventDefault: true },
  { id: 'shuttleBack', label: t('Tocar para trás (de novo: 2× e 4×)'), group: G.playback, defaults: ['J'] },
  { id: 'shuttlePause', label: t('Pausar'), group: G.playback, defaults: ['K'] },
  { id: 'shuttleForward', label: t('Tocar para frente (de novo: 2× e 4×)'), group: G.playback, defaults: ['L'] },
  { id: 'frameBack', label: t('Um quadro para trás'), group: G.playback, defaults: ['ArrowLeft'] },
  { id: 'frameForward', label: t('Um quadro para frente'), group: G.playback, defaults: ['ArrowRight'] },
  { id: 'secondBack', label: t('Um segundo para trás'), group: G.playback, defaults: ['Shift+ArrowLeft'] },
  { id: 'secondForward', label: t('Um segundo para frente'), group: G.playback, defaults: ['Shift+ArrowRight'] },
  { id: 'prevEdit', label: t('Pular para o corte ou marcador anterior'), group: G.playback, defaults: ['Mod+ArrowLeft'], preventDefault: true },
  { id: 'nextEdit', label: t('Pular para o corte ou marcador seguinte'), group: G.playback, defaults: ['Mod+ArrowRight'], preventDefault: true },
  { id: 'goStart', label: t('Ir para o início'), group: G.playback, defaults: ['Home'] },
  { id: 'goEnd', label: t('Ir para o fim'), group: G.playback, defaults: ['End'] },

  { id: 'split', label: t('Dividir o clipe no cursor'), group: G.timeline, defaults: ['S'] },
  { id: 'trimStart', label: t('Cortar do começo do clipe até o cursor'), group: G.timeline, defaults: ['Q'] },
  { id: 'trimEnd', label: t('Cortar do cursor até o fim do clipe'), group: G.timeline, defaults: ['W'] },
  { id: 'marker', label: t('Marcador no cursor'), group: G.timeline, defaults: ['M'] },
  { id: 'voice', label: t('Gravar / parar a narração'), group: G.timeline, defaults: ['R'] },

  { id: 'undo', label: t('Desfazer'), group: G.edit, defaults: ['Mod+Z'], preventDefault: true },
  { id: 'redo', label: t('Refazer'), group: G.edit, defaults: ['Mod+Shift+Z', 'Mod+Y'], preventDefault: true },
  { id: 'copy', label: t('Copiar'), group: G.edit, defaults: ['Mod+C'] },
  { id: 'cut', label: t('Recortar'), group: G.edit, defaults: ['Mod+X'] },
  { id: 'paste', label: t('Colar no cursor'), group: G.edit, defaults: ['Mod+V'], preventDefault: true },
  { id: 'duplicate', label: t('Duplicar'), group: G.edit, defaults: ['Mod+D'], preventDefault: true },
  { id: 'delete', label: t('Excluir o que está selecionado'), group: G.edit, defaults: ['Delete', 'Backspace'] },

  { id: 'save', label: t('Salvar projeto'), group: G.project, defaults: ['Mod+S'], always: true, preventDefault: true },
  { id: 'saveAs', label: t('Salvar como…'), group: G.project, defaults: ['Mod+Shift+S'], always: true, preventDefault: true },
  { id: 'open', label: t('Abrir projeto'), group: G.project, defaults: ['Mod+O'], always: true, preventDefault: true },
  { id: 'shortcuts', label: t('Atalhos do teclado'), group: G.project, defaults: ['?'], preventDefault: true },
  // Vale também com o foco num campo de texto (abre e fecha a paleta de qualquer lugar).
  { id: 'commandPalette', label: t('Buscar filtro, efeito, pacote ou ação'), group: G.project, defaults: ['Mod+K'], always: true, preventDefault: true },

  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(
    (n): ShortcutAction => ({ id: `camera${n}`, label: t('Cortar para a câmera {n}', { n }), group: G.multicam, defaults: [String(n)], preventDefault: true }),
  ),
];

// ---------------------------------------------------------------- Formato dos atalhos

const MODIFIER_ALIASES: Record<string, 'Mod' | 'Alt' | 'Shift'> = {
  mod: 'Mod',
  ctrl: 'Mod',
  control: 'Mod',
  cmd: 'Mod',
  command: 'Mod',
  meta: 'Mod',
  '⌘': 'Mod',
  alt: 'Alt',
  option: 'Alt',
  opt: 'Alt',
  '⌥': 'Alt',
  shift: 'Shift',
  '⇧': 'Shift',
};

/** Teclas com nome, como o navegador chama (e alguns apelidos). */
const NAMED_KEYS = [
  'Space',
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
];
const KEY_ALIASES: Record<string, string> = {
  ...Object.fromEntries(NAMED_KEYS.map((k) => [k.toLowerCase(), k])),
  ' ': 'Space',
  spacebar: 'Space',
  'espaço': 'Space',
  esc: 'Escape',
  del: 'Delete',
  supr: 'Delete',
  return: 'Enter',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  pgup: 'PageUp',
  pgdn: 'PageDown',
};

/** As teclas que só mudam o que as outras fazem (sozinhas não viram atalho). */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'OS', 'Fn', 'Hyper', 'Super', 'Dead', 'Unidentified', 'Process']);

function normalizeKey(raw: string): string | null {
  if (!raw) return null;
  const alias = KEY_ALIASES[raw.toLowerCase()] ?? KEY_ALIASES[raw];
  if (alias) return alias;
  if ([...raw].length === 1) return raw.toUpperCase();
  return null;
}

/** Monta o atalho na ordem certa. Num sinal (?, !, /…) o Shift já faz parte do caractere e sai. */
function buildCombo(mod: boolean, alt: boolean, shift: boolean, key: string): string {
  const symbol = [...key].length === 1 && !/^[A-Z0-9]$/.test(key);
  return [mod && 'Mod', alt && 'Alt', shift && !symbol && 'Shift', key].filter(Boolean).join('+');
}

/**
 * Deixa o atalho no formato normalizado: "ctrl+shift+z" → "Mod+Shift+Z", "cmd+o" → "Mod+O", "shift+?" → "?".
 * null se não for um atalho (vazio, só modificadores ou tecla desconhecida).
 */
export function normalizeCombo(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  // "Mod++" = Mod e a tecla +; "+" sozinho = a tecla +.
  const parts = text === '+' ? ['+'] : text.endsWith('++') ? [...text.slice(0, -2).split('+'), '+'] : text.split('+');
  let mod = false;
  let alt = false;
  let shift = false;
  let key: string | null = null;
  for (const part of parts) {
    const p = part.trim() || (part === ' ' ? ' ' : '');
    if (!p) return null;
    const modifier = MODIFIER_ALIASES[p.toLowerCase()];
    if (modifier) {
      if (modifier === 'Mod') mod = true;
      else if (modifier === 'Alt') alt = true;
      else shift = true;
      continue;
    }
    if (key) return null;
    key = normalizeKey(p);
    if (!key) return null;
  }
  return key ? buildCombo(mod, alt, shift, key) : null;
}

/** A tecla apertada, no formato normalizado. Ctrl e Cmd valem o mesmo (Mod). null = só um modificador. */
export function comboFromEvent(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'> & { getModifierState?: (key: string) => boolean }): string | null {
  if (!e.key || MODIFIER_KEYS.has(e.key)) return null;
  // AltGr (Ctrl+Alt no Windows) só serve para digitar o caractere: não conta como modificador.
  const altGraph = e.getModifierState?.('AltGraph') ?? false;
  const mod = (e.ctrlKey || e.metaKey) && !altGraph;
  const alt = e.altKey && !altGraph;
  let key: string | null;
  const letter = /^Key([A-Z])$/.exec(e.code ?? '');
  // No teclado numérico, só com o Num Lock ligado (desligado, o 1 é o End).
  const digit = /^Digit(\d)$/.exec(e.code ?? '') ?? (/^\d$/.test(e.key) ? /^Numpad(\d)$/.exec(e.code ?? '') : null);
  if (e.code === 'Space' || e.key === ' ') key = 'Space';
  else if (letter) {
    // Letras pelo caractere (respeita o layout do teclado). Uma letra de outro alfabeto (teclado russo) ou o que o
    // Alt do Mac escreve (Alt+S = ß) vale pela posição; um sinal nessa tecla (a vírgula do teclado francês) vale o sinal.
    const char = [...e.key].length === 1 ? e.key : '';
    key = /^[a-z]$/i.test(char) ? char.toUpperCase() : char && !mod && !alt && !/\p{L}/u.test(char) ? char : letter[1];
  }
  // Números pela posição: Shift+1 continua sendo 1 (e no teclado francês não precisa do Shift).
  else if (digit) key = digit[1];
  else key = normalizeKey(e.key);
  if (!key) return null;
  return buildCombo(mod, alt, e.shiftKey, key);
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

/** Como o atalho aparece na tela: "Mod+Shift+Z" → "Ctrl+Shift+Z" (ou "⌘⇧Z" no Mac). */
export function comboLabel(combo: string): string {
  const parts = combo === '+' ? ['+'] : combo.endsWith('++') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+');
  const key = parts.pop()!;
  const name = key === 'Space' ? t('Espaço') : key === 'Backspace' && isMac ? '⌫' : (KEY_LABELS[key] ?? key);
  return keys([...parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)), name].join('+'));
}

// ---------------------------------------------------------------- Registro e preferências

type Bindings = Record<string, string[]>;

/** Onde a preferência fica (null = sem armazenamento: vale só até fechar). */
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const SHORTCUTS_STORAGE_KEY = 'lumiar:atalhos';

/** Atalho já usado por outra ação. */
export interface ShortcutConflict {
  combo: string;
  action: ShortcutAction;
}

/**
 * O registro: as ações, os atalhos de cada uma (o padrão ou o que a pessoa escolheu) e quem trata
 * cada ação agora. Separado numa fábrica para os testes terem um registro limpo (e um armazenamento falso).
 */
export function createShortcutRegistry(initial: ShortcutAction[], storage: () => StorageLike | null | undefined = () => globalThis.localStorage) {
  const actions = new Map<string, ShortcutAction>();
  const handlers = new Map<string, ShortcutHandler[]>();
  const listeners = new Set<() => void>();
  let version = 0;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const read = (): Bindings => {
    try {
      const raw = storage()?.getItem(SHORTCUTS_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const out: Bindings = {};
      for (const [id, list] of Object.entries(parsed as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue;
        out[id] = [...new Set(list.flatMap((c) => (typeof c === 'string' ? (normalizeCombo(c) ?? []) : [])))];
      }
      return out;
    } catch {
      // Sem armazenamento (modo privado, bloqueado) ou guardado com defeito: valem os padrões.
      return {};
    }
  };
  /** Só o que a pessoa mudou (o resto segue o padrão, mesmo se o padrão mudar numa versão nova). */
  let overrides = read();

  const changed = () => {
    version++;
    listeners.forEach((l) => l());
  };
  const persist = () => {
    try {
      const s = storage();
      if (!s) return;
      if (Object.keys(overrides).length) s.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(overrides));
      else s.removeItem(SHORTCUTS_STORAGE_KEY);
    } catch {
      // Sem armazenamento: a mudança vale só até fechar.
    }
  };

  const same = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => c === b[i]);

  const registry = {
    /** Acrescenta (ou troca, se o id já existir) uma ação. Os atalhos padrão são normalizados. */
    register(action: ShortcutAction): void {
      const defaults = [...new Set(action.defaults.flatMap((c) => normalizeCombo(c) ?? []))];
      actions.set(action.id, { ...action, defaults });
      changed();
    },
    actions(): ShortcutAction[] {
      return [...actions.values()];
    },
    action(id: string): ShortcutAction | undefined {
      return actions.get(id);
    },
    /** Atalhos que valem agora para a ação. */
    bindings(id: string): string[] {
      return overrides[id] ?? actions.get(id)?.defaults ?? [];
    },
    isCustom(id: string): boolean {
      return id in overrides;
    },
    /** Troca os atalhos de uma ação (iguais ao padrão = volta a seguir o padrão). */
    setBindings(id: string, combos: string[]): void {
      const list = [...new Set(combos.flatMap((c) => normalizeCombo(c) ?? []))];
      const defaults = actions.get(id)?.defaults ?? [];
      if (same(list, defaults)) delete overrides[id];
      else overrides = { ...overrides, [id]: list };
      persist();
      changed();
    },
    reset(id: string): void {
      registry.setBindings(id, actions.get(id)?.defaults ?? []);
    },
    resetAll(): void {
      overrides = {};
      persist();
      changed();
    },
    /** Ações (fora `exceptId`) que já usam o atalho. */
    conflicts(combo: string, exceptId?: string): ShortcutConflict[] {
      const c = normalizeCombo(combo);
      if (!c) return [];
      return registry.actions().filter((a) => a.id !== exceptId && registry.bindings(a.id).includes(c)).map((action) => ({ combo: c, action }));
    },
    /** Pares de ações que hoje usam o mesmo atalho (para avisar na janela). */
    clashes(): { combo: string; ids: string[] }[] {
      const byCombo = new Map<string, string[]>();
      for (const a of registry.actions()) for (const c of registry.bindings(a.id)) byCombo.set(c, [...(byCombo.get(c) ?? []), a.id]);
      return [...byCombo].filter(([, ids]) => ids.length > 1).map(([combo, ids]) => ({ combo, ids }));
    },
    /**
     * Dá o atalho para a ação.
     * - mode 'replace': o atalho novo fica no lugar dos que a ação tinha; 'add': entra junto com eles.
     * - Se outra ação usava o atalho: 'steal' tira dela; 'swap' dá para ela o atalho que esta ação tinha
     *   (no 'replace'; sem um atalho antigo, vira 'steal'); 'keep' deixa os dois com o mesmo atalho.
     */
    assign(id: string, combo: string, mode: 'replace' | 'add' = 'replace', onConflict: 'steal' | 'swap' | 'keep' = 'steal'): void {
      const c = normalizeCombo(combo);
      if (!c || !actions.has(id)) return;
      const previous = registry.bindings(id);
      const old = previous.find((p) => p !== c);
      for (const { action } of registry.conflicts(c, id)) {
        if (onConflict === 'keep') continue;
        const theirs = registry.bindings(action.id);
        const give = onConflict === 'swap' && mode === 'replace' && old && !theirs.includes(old) ? [old] : [];
        registry.setBindings(
          action.id,
          theirs.flatMap((x) => (x === c ? give : [x])),
        );
      }
      registry.setBindings(id, mode === 'add' ? [...previous.filter((p) => p !== c), c] : [c]);
    },
    // ------------------------------------------------ Quem trata cada ação
    /** Liga quem trata a ação (o último ligado tenta primeiro). Devolve a função que desliga. */
    on(id: string, handler: ShortcutHandler): () => void {
      handlers.set(id, [handler, ...(handlers.get(id) ?? [])]);
      return () => {
        handlers.set(id, (handlers.get(id) ?? []).filter((h) => h !== handler));
      };
    },
    /** Faz a ação como se o atalho tivesse sido apertado (paleta de comandos). true se alguém tratou. */
    run(id: string): boolean {
      const e = (typeof KeyboardEvent === 'function' ? new KeyboardEvent('keydown') : {}) as KeyboardEvent;
      for (const handler of handlers.get(id) ?? []) if (handler(e) !== false) return true;
      return false;
    },
    /** Ações ligadas a este atalho, na ordem do registro. */
    actionsFor(combo: string): ShortcutAction[] {
      return registry.actions().filter((a) => registry.bindings(a.id).includes(combo));
    },
    /**
     * Procura e faz a ação da tecla apertada. `typing` = foco num campo de texto; `blocked` = janela que
     * só deixa passar salvar e abrir (exportação). Devolve true se alguma ação tratou a tecla.
     */
    dispatch(e: KeyboardEvent, context: { typing: boolean; blocked: boolean }): boolean {
      const combo = comboFromEvent(e);
      if (!combo) return false;
      const tryCombo = (c: string) => {
        for (const action of registry.actionsFor(c)) {
          if (!action.always && (context.typing || context.blocked)) continue;
          for (const handler of handlers.get(action.id) ?? []) {
            if (handler(e) === false) continue;
            if (action.preventDefault) e.preventDefault();
            return true;
          }
        }
        return false;
      };
      if (tryCombo(combo)) return true;
      // Shift a mais não atrapalha: Shift+S também divide (se Shift+S não for de outra ação), como sempre foi.
      return e.shiftKey && combo.includes('Shift+') ? tryCombo(combo.replace('Shift+', '')) : false;
    },
    // ------------------------------------------------ Para a interface acompanhar as mudanças
    subscribe,
    version: () => version,
  };
  initial.forEach((a) => registry.register(a));
  return registry;
}

export type ShortcutRegistry = ReturnType<typeof createShortcutRegistry>;

/** O registro do editor. */
export const shortcuts = createShortcutRegistry(DEFAULT_SHORTCUTS);

/** Acrescenta uma ação com atalho (ferramentas novas: chame no topo do módulo). */
export function registerShortcut(action: ShortcutAction): void {
  shortcuts.register(action);
}

/** Atalho atual da ação, como aparece no teclado da pessoa ("" se ela tirou o atalho). */
export function shortcutLabel(id: string): string {
  const first = shortcuts.bindings(id)[0];
  return first ? comboLabel(first) : '';
}

/** "Salvar projeto (Ctrl+S)": o texto com o atalho atual entre parênteses (sem atalho, só o texto). */
export function withShortcut(text: string, id: string): string {
  const label = shortcutLabel(id);
  return label ? `${text} (${label})` : text;
}

/** Faz o componente redesenhar quando algum atalho muda (para as dicas mostrarem o atalho novo). */
export function useShortcutsVersion(): number {
  return useSyncExternalStore(shortcuts.subscribe, shortcuts.version);
}

/** Trata uma ação enquanto o componente está na tela (a versão mais recente da função é a que vale). */
export function useShortcut(id: string, handler: ShortcutHandler, enabled = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => (enabled ? shortcuts.on(id, (e) => ref.current(e)) : undefined), [id, enabled]);
}

// ---------------------------------------------------------------- Abrir a janela de atalhos de qualquer lugar

const openers = new Set<() => void>();

/** Pede para abrir a janela "Atalhos do teclado" (quem mostra é o App). */
export function requestShortcutsDialog(): void {
  openers.forEach((open) => open());
}

export function onShortcutsDialogRequest(open: () => void): () => void {
  openers.add(open);
  return () => {
    openers.delete(open);
  };
}
