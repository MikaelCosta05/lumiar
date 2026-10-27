import type { ReactNode } from 'react';

/**
 * Estrutura comum dos painéis: cabeçalho, abas fixas no topo ao rolar e o conteúdo.
 */
export function InspectorPanel({ header, tabs, children }: { header: ReactNode; tabs?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full animate-fade-in flex-col">
      <div className="px-4 pb-3 pt-4">{header}</div>
      {tabs && <div className="sticky top-0 z-10 border-b border-line bg-panel/95 px-3 pb-3 backdrop-blur">{tabs}</div>}
      <div className="flex-1 px-4 pb-6 pt-4">{children}</div>
    </div>
  );
}

/** Miniatura + tipo + nome + detalhes, no topo de cada painel. */
export function InspectorHeader({
  thumb,
  kicker,
  title,
  chips,
  actions,
}: {
  thumb: ReactNode;
  kicker: ReactNode;
  title: string;
  chips?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex aspect-video w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-panel-3 ring-1 ring-line">
        {thumb}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-faint">{kicker}</p>
        <h3 className="truncate text-sm font-semibold" title={title}>
          {title}
        </h3>
        {chips && <div className="mt-1 flex flex-wrap gap-1">{chips}</div>}
      </div>
      {actions && <div className="-mr-1.5 grid shrink-0 grid-cols-2 gap-0.5 self-start [&>:only-child]:col-start-2">{actions}</div>}
    </div>
  );
}
