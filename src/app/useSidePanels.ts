import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';

export type Side = 'library' | 'inspector';

const KEY = 'lumiar:paineis';
/** O vídeo no meio nunca fica mais estreito que isso (px). */
const MIN_CENTER = 480;

const defaults = (): Record<Side, number> => {
  const wide = window.innerWidth >= 1500;
  return { library: wide ? 320 : 272, inspector: wide ? 340 : 304 };
};

function clamp(side: Side, width: number, other: number): number {
  const [min, max] = side === 'library' ? [240, 560] : [280, 480];
  // 72 da barra de ícones, 30 dos espaços entre os painéis e da margem da janela.
  const room = window.innerWidth - 72 - 30 - other - MIN_CENTER;
  return Math.round(Math.max(min, Math.min(width, max, room)));
}

/**
 * Largura da biblioteca (esquerda) e do painel de ajustes (direita): arrastar a borda muda, dois cliques voltam ao
 * padrão, e fica lembrada entre as sessões.
 */
export function useSidePanels() {
  const [widths, setWidths] = useState<Record<Side, number>>(() => {
    const base = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<Side, number>>;
      for (const side of ['library', 'inspector'] as const) if (Number(saved[side]) > 0) base[side] = Number(saved[side]);
    } catch {
      // Sem acesso ao armazenamento: usa o padrão.
    }
    return { library: clamp('library', base.library, base.inspector), inspector: clamp('inspector', base.inspector, base.library) };
  });

  const save = (next: Record<Side, number>) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Sem acesso ao armazenamento: só não lembra na próxima vez.
    }
  };

  useEffect(() => {
    const onResize = () =>
      setWidths((w) => ({ library: clamp('library', w.library, w.inspector), inspector: clamp('inspector', w.inspector, w.library) }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startResize = (side: Side, e: ReactPointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const start = widths;
    let last = start;
    const move = (ev: PointerEvent) => {
      // A biblioteca cresce para a direita; o painel de ajustes, para a esquerda.
      const dx = side === 'library' ? ev.clientX - x0 : x0 - ev.clientX;
      const other = side === 'library' ? start.inspector : start.library;
      last = { ...start, [side]: clamp(side, start[side] + dx, other) };
      setWidths(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      save(last);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const reset = (side: Side) =>
    setWidths((w) => {
      const next = { ...w, [side]: clamp(side, defaults()[side], side === 'library' ? w.inspector : w.library) };
      save(next);
      return next;
    });

  return { widths, startResize, reset };
}
