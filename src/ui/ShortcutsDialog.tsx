import { Keyboard, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { comboFromEvent, comboLabel, shortcuts, useShortcutsVersion, type ShortcutAction, type ShortcutConflict } from '../app/shortcuts';
import { t } from '../i18n';
import { keys } from '../i18n/keys';
import { Button, cx, IconButton, Kbd } from './kit';

/** Esperando a pessoa apertar o atalho novo (ou decidindo o que fazer com um atalho já usado). */
interface Capture {
  id: string;
  mode: 'replace' | 'add';
  combo?: string;
  conflicts?: ShortcutConflict[];
}

/** Sem acento e em minúsculas, para a busca achar "camera" em "Câmera". */
const plain = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Atalhos do teclado: a lista de tudo o que tem atalho, por grupo. "Mudar" espera a nova combinação
 * (Esc cancela); se ela já for de outra ação, dá para trocar as duas ou tirar de lá.
 */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useShortcutsVersion();
  const [query, setQuery] = useState('');
  const [capture, setCapture] = useState<Capture | null>(null);
  const waiting = !!capture && !capture.combo;

  // Esperando o atalho: a tecla é lida antes de qualquer outro atalho do editor (e não faz mais nada).
  useEffect(() => {
    if (!waiting) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setCapture(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo || !capture) return;
      const conflicts = shortcuts.conflicts(combo, capture.id);
      if (conflicts.length) {
        setCapture({ ...capture, combo, conflicts });
        return;
      }
      shortcuts.assign(capture.id, combo, capture.mode);
      setCapture(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [waiting, capture]);

  // Esc desiste do atalho já usado ou fecha a janela (esperando a tecla, quem trata é o de cima).
  useEffect(() => {
    if (waiting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (capture) setCapture(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [waiting, capture, onClose]);

  const q = plain(query.trim());
  const matches = (a: ShortcutAction) =>
    !q || plain(a.label).includes(q) || plain(a.group).includes(q) || shortcuts.bindings(a.id).some((c) => plain(comboLabel(c)).includes(q) || plain(c).includes(q));
  const all = shortcuts.actions();
  const groups = [...new Set(all.map((a) => a.group))].map((group) => ({ group, actions: all.filter((a) => a.group === group && matches(a)) })).filter((g) => g.actions.length);
  const clashes = shortcuts.clashes();
  const anyCustom = all.some((a) => shortcuts.isCustom(a.id));

  const resolve = (how: 'swap' | 'steal' | 'keep') => {
    if (!capture?.combo) return;
    shortcuts.assign(capture.id, capture.combo, capture.mode, how);
    setCapture(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[85vh] w-[600px] max-w-[calc(100vw-32px)] animate-pop-in flex-col rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <Keyboard size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Atalhos do teclado')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-dim">
          {t('Clique em Mudar e aperte a nova combinação (Esc cancela). Fica guardado neste computador.')}{' '}
          {t('{ctrl} e {cmd} valem o mesmo.', { ctrl: 'Ctrl', cmd: 'Cmd' })}
        </p>
        <label className="relative mb-3 block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="field w-full pl-8" placeholder={t('Buscar pela ação ou pela tecla…')} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </label>

        <div className="min-h-24 flex-1 overflow-y-auto pr-1">
          {groups.length === 0 && <p className="p-6 text-center text-xs text-faint">{t('Nenhum atalho encontrado.')}</p>}
          {groups.map(({ group, actions }) => (
            <section key={group} className="mb-4 last:mb-0">
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{group}</h4>
              <ul className="space-y-1">
                {actions.map((action) => {
                  const bindings = shortcuts.bindings(action.id);
                  const active = capture?.id === action.id;
                  const shared = clashes.filter((c) => c.ids.includes(action.id)).flatMap((c) => c.ids.filter((id) => id !== action.id));
                  return (
                    <li key={action.id} className={cx('rounded-lg border px-2.5 py-1.5', active ? 'border-accent bg-accent/5' : 'border-transparent hover:bg-panel-2')}>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 text-xs">
                          {action.label}
                          {shortcuts.isCustom(action.id) && <span className="ml-1.5 text-[10px] text-accent">{t('mudado')}</span>}
                        </span>
                        {active && !capture.combo ? (
                          <span className="animate-pulse text-[11px] text-accent">{t('Aperte a combinação… (Esc cancela)')}</span>
                        ) : (
                          <span className="flex flex-wrap items-center justify-end gap-1">
                            {bindings.length === 0 && <span className="text-[11px] text-faint">{t('sem atalho')}</span>}
                            {bindings.map((combo) => (
                              <span key={combo} className="group/kbd relative">
                                <Kbd>{comboLabel(combo)}</Kbd>
                                <button
                                  title={t('Tirar este atalho')}
                                  aria-label={t('Tirar este atalho')}
                                  onClick={() => shortcuts.setBindings(action.id, bindings.filter((b) => b !== combo))}
                                  className="absolute -right-1.5 -top-1.5 hidden size-3.5 items-center justify-center rounded-full bg-panel-3 text-faint ring-1 ring-line-strong hover:text-danger group-hover/kbd:flex"
                                >
                                  <X size={9} />
                                </button>
                              </span>
                            ))}
                          </span>
                        )}
                        <Button className="h-6 px-2 text-[11px]" onClick={() => setCapture({ id: action.id, mode: 'replace' })}>
                          {t('Mudar')}
                        </Button>
                        <IconButton label={t('Adicionar outro atalho')} className="size-6" onClick={() => setCapture({ id: action.id, mode: 'add' })}>
                          <Plus size={13} />
                        </IconButton>
                        <IconButton
                          label={t('Restaurar padrão')}
                          className={cx('size-6', !shortcuts.isCustom(action.id) && 'invisible')}
                          onClick={() => shortcuts.reset(action.id)}
                        >
                          <RotateCcw size={12} />
                        </IconButton>
                      </div>
                      {shared.length > 0 && !active && (
                        <p className="mt-1 text-[11px] text-amber">
                          {t('O mesmo atalho também está em “{name}”: só um deles vai funcionar.', { name: shortcuts.action(shared[0])?.label ?? shared[0] })}
                        </p>
                      )}
                      {active && capture.combo && capture.conflicts && (
                        <ConflictChoice
                          combo={capture.combo}
                          conflicts={capture.conflicts}
                          canSwap={capture.mode === 'replace' && bindings.some((b) => b !== capture.combo)}
                          onResolve={resolve}
                          onCancel={() => setCapture(null)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="mt-2 text-[11px] text-faint">
            {t('Também: {alt} + arrastar duplica o item arrastado, e o botão direito abre o menu de qualquer coisa.', { alt: keys('Alt') })}
          </p>
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
          <span className="flex-1 text-[11px] text-faint">{t('{n} ações com atalho', { n: all.length })}</span>
          <Button
            variant="ghost"
            className="h-8 text-xs"
            icon={<RotateCcw size={13} />}
            disabled={!anyCustom}
            onClick={() => {
              if (confirm(t('Voltar todos os atalhos ao padrão?'))) shortcuts.resetAll();
            }}
          >
            {t('Restaurar todos os padrões')}
          </Button>
          <Button variant="primary" className="h-8 text-xs" onClick={onClose}>
            {t('Pronto')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** O atalho escolhido já é de outra ação: trocar, tirar de lá ou deixar os dois. */
function ConflictChoice({
  combo,
  conflicts,
  canSwap,
  onResolve,
  onCancel,
}: {
  combo: string;
  conflicts: ShortcutConflict[];
  canSwap: boolean;
  onResolve: (how: 'swap' | 'steal' | 'keep') => void;
  onCancel: () => void;
}) {
  const names = conflicts.map((c) => `“${c.action.label}”`).join(', ');
  return (
    <div className="mt-1.5 rounded-md bg-amber/10 p-2 text-[11px] text-amber">
      <p className="mb-1.5">{t('{keys} já é usado em {names}.', { keys: comboLabel(combo), names })}</p>
      <div className="flex flex-wrap gap-1.5">
        {canSwap && (
          <Button className="h-6 px-2 text-[11px]" onClick={() => onResolve('swap')} title={t('A outra ação fica com o atalho que esta tinha')}>
            {t('Trocar entre as duas')}
          </Button>
        )}
        <Button className="h-6 px-2 text-[11px]" onClick={() => onResolve('steal')} title={t('A outra ação fica sem esse atalho')}>
          {t('Usar aqui e tirar de lá')}
        </Button>
        <Button variant="ghost" className="h-6 px-2 text-[11px]" onClick={onCancel}>
          {t('Cancelar')}
        </Button>
      </div>
    </div>
  );
}
