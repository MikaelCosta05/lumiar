import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './kit';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  /** Atalho mostrado à direita (só informativo) */
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  /** Submenu */
  items?: MenuEntry[];
}

export type MenuEntry = MenuItem | 'separator' | { header: string } | false | null | undefined;

export interface MenuState {
  x: number;
  y: number;
  entries: MenuEntry[];
}

/** Menu do clique direito, posicionado no mouse e sempre dentro da janela. */
export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('[data-context-menu]')) onClose();
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('wheel', close, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('wheel', close);
    };
  }, [onClose]);

  return <MenuPanel entries={menu.entries} x={menu.x} y={menu.y} onClose={onClose} />;
}

function MenuPanel({ entries, x, y, onClose, alignRight }: { entries: MenuEntry[]; x: number; y: number; onClose: () => void; alignRight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  const [open, setOpen] = useState<number | null>(null);

  // Mede o menu e empurra para dentro da janela.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // offsetWidth/Height ignoram a animação de entrada (que começa com o menu um pouco menor).
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    let left = x;
    if (left + width > window.innerWidth - 8) left = alignRight !== undefined ? alignRight - width : window.innerWidth - width - 8;
    const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));
    setPos({ left: Math.max(8, left), top, ready: true });
  }, [x, y, alignRight]);

  const items = entries.filter((e): e is Exclude<MenuEntry, false | null | undefined> => !!e);

  return (
    <div
      ref={ref}
      data-context-menu
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className={cx(
        'fixed z-[60] min-w-52 animate-pop-in rounded-xl border border-line-strong bg-panel-2/95 p-1 text-[13px] shadow-2xl shadow-black/60 backdrop-blur',
        !pos.ready && 'invisible',
      )}
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((entry, i) => {
        if (entry === 'separator') return <div key={i} className="mx-1 my-1 h-px bg-line" />;
        if ('header' in entry) {
          return (
            <p key={i} className="truncate px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
              {entry.header}
            </p>
          );
        }
        const hasSub = !!entry.items?.length;
        return (
          <div key={i} className="relative" onMouseEnter={() => setOpen(hasSub ? i : null)}>
            <button
              role="menuitem"
              disabled={entry.disabled}
              onClick={() => {
                if (hasSub) {
                  setOpen(i);
                  return;
                }
                onClose();
                entry.onClick?.();
              }}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors disabled:opacity-35',
                entry.danger ? 'text-danger hover:bg-danger/15' : 'hover:bg-accent/20',
                open === i && 'bg-accent/20',
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-dim">
                {entry.checked ? <Check size={14} className="text-accent" /> : entry.icon}
              </span>
              <span className="flex-1 truncate">{entry.label}</span>
              {entry.shortcut && <span className="pl-4 font-mono text-[10px] text-faint">{entry.shortcut}</span>}
              {hasSub && <ChevronRight size={13} className="text-faint" />}
            </button>
            {hasSub && open === i && <SubMenu entries={entry.items!} onClose={onClose} />}
          </div>
        );
      })}
    </div>
  );
}

/** Submenu ao lado do item (vai para a esquerda se não couber). */
function SubMenu({ entries, onClose }: { entries: MenuEntry[]; onClose: () => void }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    setRect(anchor.current?.parentElement?.getBoundingClientRect() ?? null);
  }, []);
  return (
    <>
      <span ref={anchor} className="hidden" />
      {/* No body: o desfoque do menu pai mudaria a referência do position: fixed. */}
      {rect &&
        createPortal(
          <MenuPanel entries={entries} x={rect.right + 2} y={rect.top - 4} alignRight={rect.left - 2} onClose={onClose} />,
          document.body,
        )}
    </>
  );
}
