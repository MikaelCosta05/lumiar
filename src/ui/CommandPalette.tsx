import { Blend, Command as CommandIcon, Music2, Package, Palette, Search, Smile, Sparkles, SquareDashed, Type } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { plain, pushRecent, readRecent, searchCommands, type CommandKind, type Searchable } from '../app/commandSearch';
import { shortcutLabel, shortcuts } from '../app/shortcuts';
import { effectPlugins, filterPlugins, transitionPlugins } from '../engine/registry';
import type { ShaderPlugin } from '../engine/types';
import { sourceText, t } from '../i18n';
import type { SoundEffect } from '../media/sfx';
import { SOUNDS } from '../media/sfx';
import { ADJUSTMENT_TEMPLATE } from '../project/adjustmentBlock';
import { PACKS } from '../project/packLibrary';
import type { PackTemplate } from '../project/packs';
import { STICKERS, TEXT_PRESETS, type TextPreset } from '../project/text';
import type { MenuEntry } from './ContextMenu';
import { cx, Kbd } from './kit';

/** Um resultado da paleta: o que aparece e o que acontece no Enter. */
export interface PaletteCommand extends Searchable {
  /** Categoria, grupo ou de onde vem a ação */
  detail?: string;
  /** Atalho, só para mostrar */
  shortcut?: string;
  /** Emoji do sticker */
  glyph?: string;
  /** false = não deu para fazer agora */
  run: () => boolean | void;
}

const KIND_LABEL: Record<CommandKind, string> = {
  filter: t('Filtro'),
  effect: t('Efeito'),
  transition: t('Transição'),
  pack: t('Pacote'),
  sticker: t('Sticker'),
  text: t('Texto'),
  sound: t('Efeito sonoro'),
  action: t('Ação'),
};

const KIND_ICON: Record<CommandKind, ReactNode> = {
  filter: <Palette size={14} />,
  effect: <Sparkles size={14} />,
  transition: <Blend size={14} />,
  pack: <Package size={14} />,
  sticker: <Smile size={14} />,
  text: <Type size={14} />,
  sound: <Music2 size={14} />,
  action: <CommandIcon size={14} />,
};

/** O tipo como palavra de busca, no idioma da interface e em português ("efeito brilho", "effect brilho"). */
function kindWords(kind: CommandKind): string[] {
  const original = sourceText(KIND_LABEL[kind]);
  return original ? [KIND_LABEL[kind], original] : [KIND_LABEL[kind]];
}

/** Em outro idioma, o nome em português também vale na busca. */
function names(label: string): { aliases?: string[] } {
  const original = sourceText(label);
  return original ? { aliases: [original] } : {};
}

export interface CommandSources {
  /** O mesmo que clicar na biblioteca (avisa se precisa de um clipe ou de uma transição selecionada) */
  applyPlugin: (plugin: ShaderPlugin) => void;
  addPack: (pack: PackTemplate) => void;
  addText: (preset: TextPreset) => void;
  addSound: (sound: SoundEffect) => void;
  userPacks: PackTemplate[];
  /** Menus de agora (o do item selecionado, o da timeline no cursor, o de Ferramentas) e de onde vêm */
  menus: { where: string; entries: MenuEntry[] }[];
}

/** Todas as ações de um menu, com os submenus como "Velocidade › 2×". As desligadas ficam de fora. */
function menuCommands(entries: MenuEntry[], where: string, path: string[] = [], out: PaletteCommand[] = [], seen = new Set<string>()): PaletteCommand[] {
  let section = where;
  for (const entry of entries) {
    if (!entry || entry === 'separator') continue;
    if ('header' in entry) {
      section = path.length ? section : entry.header;
      continue;
    }
    if (entry.disabled) continue;
    if (entry.items) {
      menuCommands(entry.items, section, [...path, entry.label], out, seen);
      continue;
    }
    if (!entry.onClick) continue;
    const label = [...path, entry.label].join(' › ');
    const id = `menu:${plain(label)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const original = [...path, entry.label].map((part) => sourceText(part) ?? part).join(' › ');
    out.push({
      id,
      kind: 'action',
      label,
      ...(original !== label ? { aliases: [original] } : {}),
      keywords: [...kindWords('action'), section],
      detail: section,
      shortcut: entry.shortcut,
      run: entry.onClick,
    });
  }
  return out;
}

/** Tudo o que a paleta acha: ações (dos menus e dos atalhos), filtros, efeitos, transições, pacotes, stickers e sons. */
export function buildCommands(sources: CommandSources): PaletteCommand[] {
  const list: PaletteCommand[] = [];
  const seen = new Set<string>();
  for (const { where, entries } of sources.menus) list.push(...menuCommands(entries, where, [], [], seen));
  for (const action of shortcuts.actions()) {
    if (action.id === 'commandPalette') continue;
    list.push({
      id: `atalho:${action.id}`,
      kind: 'action',
      label: action.label,
      ...names(action.label),
      keywords: [...kindWords('action'), action.group],
      detail: action.group,
      shortcut: shortcutLabel(action.id),
      run: () => shortcuts.run(action.id),
    });
  }
  for (const plugin of [...filterPlugins, ...effectPlugins, ...transitionPlugins]) {
    list.push({
      id: plugin.id,
      kind: plugin.kind,
      label: plugin.name,
      ...names(plugin.name),
      keywords: [...kindWords(plugin.kind), t(plugin.category), plugin.category],
      detail: t(plugin.category),
      run: () => sources.applyPlugin(plugin),
    });
  }
  for (const pack of [ADJUSTMENT_TEMPLATE, ...sources.userPacks, ...PACKS]) {
    list.push({
      id: `pacote:${pack.id}`,
      kind: 'pack',
      label: pack.name,
      ...names(pack.name),
      keywords: [...kindWords('pack'), t(pack.category), pack.category],
      detail: t(pack.category),
      run: () => sources.addPack(pack),
    });
  }
  for (const sticker of STICKERS) {
    list.push({
      id: `sticker:${sticker.id}`,
      kind: 'sticker',
      label: sticker.name,
      ...names(sticker.name),
      keywords: [...kindWords('sticker'), t(sticker.category), sticker.category],
      detail: t(sticker.category),
      glyph: sticker.icon ?? sticker.sample,
      run: () => sources.addText(sticker),
    });
  }
  for (const preset of TEXT_PRESETS) {
    list.push({ id: `texto:${preset.id}`, kind: 'text', label: preset.name, ...names(preset.name), keywords: [...kindWords('text')], run: () => sources.addText(preset) });
  }
  for (const sound of SOUNDS) {
    list.push({
      id: `som:${sound.id}`,
      kind: 'sound',
      label: sound.name,
      ...names(sound.name),
      keywords: [...kindWords('sound'), t(sound.category), sound.category],
      detail: t(sound.category),
      run: () => sources.addSound(sound),
    });
  }
  return list;
}

/**
 * Paleta de comandos (Ctrl+K): um campo por cima de tudo. Digite o nome (sem acento, com erro pequeno), escolha com
 * as setas e aperte Enter: aplica como se tivesse clicado na biblioteca ou no menu. Esc fecha.
 */
export function CommandPalette({ commands, onClose, notify }: { commands: PaletteCommand[]; onClose: () => void; notify: (text: string, error?: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(() => readRecent());
  const listRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchCommands(commands, query, recent), [commands, query, recent]);
  const recentCount = query.trim() ? 0 : results.filter((c) => recent.includes(c.id)).length;
  const current = Math.min(active, results.length - 1);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const run = (command: PaletteCommand | undefined) => {
    if (!command) return;
    setRecent(pushRecent(command.id));
    onClose();
    if (command.run() === false) notify(t('"{name}" não dá para fazer agora.', { name: command.label }), true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-[2px]" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-label={t('Buscar filtro, efeito, pacote ou ação')}
        className="flex h-fit max-h-[70vh] w-full max-w-[580px] animate-pop-in flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <label className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="shrink-0 text-faint" />
          <input
            autoFocus
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-faint"
            placeholder={t('Buscar filtro, efeito, transição, pacote, sticker, som ou ação…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (results.length) setActive((current + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(results[current]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }
            }}
          />
          <Kbd>Esc</Kbd>
        </label>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.length === 0 && <p className="py-8 text-center text-xs text-faint">{t('Nada encontrado.')}</p>}
          {results.map((command, i) => (
            <div key={command.id}>
              {i === 0 && recentCount > 0 && <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint">{t('Usados recentemente')}</p>}
              {i === recentCount && recentCount > 0 && <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-faint">{t('Tudo')}</p>}
              <button
                data-index={i}
                onMouseMove={() => i !== current && setActive(i)}
                onClick={() => run(command)}
                className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left', i === current ? 'bg-panel-3 text-fg' : 'text-dim')}
              >
                <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-md bg-panel-2', i === current ? 'text-accent' : 'text-faint')}>
                  {command.glyph ? <span className="text-sm leading-none">{command.glyph}</span> : command.id === `pacote:${ADJUSTMENT_TEMPLATE.id}` ? <SquareDashed size={14} /> : KIND_ICON[command.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{command.label}</span>
                  {command.detail && <span className="block truncate text-[11px] text-faint">{command.detail}</span>}
                </span>
                {command.shortcut && <Kbd>{command.shortcut}</Kbd>}
                <span className="shrink-0 rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-faint">{KIND_LABEL[command.kind]}</span>
              </button>
            </div>
          ))}
        </div>
        <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
          {t('↑ ↓ escolhe · Enter aplica no clipe selecionado ou no cursor · Esc fecha')}
        </p>
      </div>
    </div>
  );
}
