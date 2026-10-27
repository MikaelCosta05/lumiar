import { Check, Search, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import type { PluginKind, ShaderPlugin } from '../engine/types';
import { cx, Pill } from './kit';
import { LivePreview } from './LivePreview';
import { usePluginPreviews } from './previews';

/** Ordem das categorias; as que não estão aqui vêm depois, em ordem alfabética. */
const CATEGORY_ORDER: Record<PluginKind, string[]> = {
  filter: ['Retrato', 'Mono', 'Filmes', 'Retrô', 'Ferramentas', 'Cinema', 'Atmosfera', 'Criativos', 'Básicos', 'Temperatura'],
  transition: ['Impacto', 'Câmera', 'Suaves', 'Criativas', 'Movimento', 'Formas', '3D', 'Estilizar', 'Básicas'],
  effect: [],
};

export function sortCategories(kind: PluginKind, categories: string[]): string[] {
  const order = CATEGORY_ORDER[kind];
  const rank = (c: string) => (order.includes(c) ? order.indexOf(c) : order.length);
  return categories.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'pt-BR'));
}

const RING: Record<PluginKind, string> = {
  filter: 'ring-pink',
  effect: 'ring-accent-2',
  transition: 'ring-amber',
};

interface Props {
  plugins: ShaderPlugin[];
  kind: PluginKind;
  /** Plugin marcado como escolhido */
  selected?: string | null;
  onPick: (plugin: ShaderPlugin) => void;
  /** Primeira opção "nenhum" (sem filtro, corte seco…) */
  none?: { label: string; onPick: () => void };
}

/** Grade de miniaturas com busca e categorias, para escolher filtro, efeito ou transição no painel. */
export function PluginPicker({ plugins, kind, selected, onPick, none }: Props) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const previews = usePluginPreviews();
  const categories = useMemo(() => sortCategories(kind, [...new Set(plugins.map((p) => p.category))]), [kind, plugins]);
  const query = search.trim().toLowerCase();
  const list = plugins.filter(
    (p) => (!category || p.category === category) && `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(query),
  );

  return (
    <div className="space-y-2.5">
      <label className="relative block">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
        <input className="field h-7 w-full pl-8 text-xs" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        <Pill active={!category} onClick={() => setCategory(null)}>
          Todos
        </Pill>
        {categories.map((c) => (
          <Pill key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </Pill>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-2.5">
        {none && !query && !category && (
          <Option label={none.label} active={!selected} ring={RING[kind]} onClick={none.onPick}>
            <span className="flex size-full items-center justify-center text-faint">
              <X size={16} />
            </span>
          </Option>
        )}
        {list.map((p) => (
          <Option
            key={p.id}
            label={p.name}
            title={p.description}
            active={selected === p.id}
            ring={RING[kind]}
            onClick={() => onPick(p)}
            onHover={(on) => setHovered((h) => (on ? p.id : h === p.id ? null : h))}
          >
            {previews.get(p.id) && <img src={previews.get(p.id)} alt="" draggable={false} className="size-full object-cover" />}
            {hovered === p.id && <LivePreview plugin={p} className="absolute inset-0" />}
          </Option>
        ))}
      </div>
      {list.length === 0 && <p className="py-4 text-center text-xs text-faint">Nada encontrado.</p>}
    </div>
  );
}

function Option({
  label,
  title,
  active,
  ring,
  onClick,
  onHover,
  children,
}: {
  label: string;
  title?: string;
  active: boolean;
  ring: string;
  onClick: () => void;
  onHover?: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className="group min-w-0 text-left"
    >
      <div
        className={cx(
          'relative aspect-video overflow-hidden rounded-md bg-panel-3 ring-2 transition-all',
          active ? ring : 'ring-transparent group-hover:ring-line-strong',
        )}
      >
        {children}
        {active && (
          <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-white text-black shadow">
            <Check size={10} strokeWidth={3} />
          </span>
        )}
      </div>
      <p className={cx('mt-1 truncate text-[10px]', active ? 'font-medium text-fg' : 'text-faint group-hover:text-dim')}>{label}</p>
    </button>
  );
}
