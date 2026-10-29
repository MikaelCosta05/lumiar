import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-accent to-accent-2 text-white font-semibold shadow-lg shadow-accent/20 hover:brightness-110',
  secondary: 'bg-panel-2 border border-line text-fg hover:border-line-strong hover:bg-panel-3',
  ghost: 'text-dim hover:text-fg hover:bg-panel-3',
  danger: 'text-danger hover:bg-danger/10',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] transition-all',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

export function IconButton({ label, active, className, children, ...rest }: IconButtonProps) {
  return (
    <button
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex size-7 items-center justify-center rounded-md transition-colors',
        'disabled:pointer-events-none disabled:opacity-30',
        active ? 'bg-accent/15 text-accent' : 'text-dim hover:bg-panel-3 hover:text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  label?: string;
}

export function Slider({ value, min, max, step, onChange, className, label }: SliderProps) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      aria-label={label}
      className={cx('range', className)}
      style={{ '--fill': `${fill}%` } as CSSProperties}
      min={min}
      max={max}
      step={step ?? (max - min) / 100}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      title={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-4 w-7 shrink-0 rounded-full transition-colors',
        checked ? 'bg-accent' : 'bg-panel-3',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 size-3 rounded-full bg-white shadow transition-all',
          checked ? 'left-3.5' : 'left-0.5',
        )}
      />
    </button>
  );
}

export function SectionTitle({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center gap-2 first:mt-0">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{children}</h4>
      <div className="h-px flex-1 bg-line" />
      {extra}
    </div>
  );
}

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  /** Número ou marca pequena ao lado do nome (ex.: quantos efeitos). */
  badge?: ReactNode;
}

/** Abas em "pílula", usadas para dividir painéis longos. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabItem<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="flex gap-0.5 rounded-lg bg-panel-2 p-0.5 ring-1 ring-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          title={t.label}
          onClick={() => onChange(t.id)}
          className={cx(
            'relative flex min-w-0 flex-auto flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-1.5 text-[10px] font-medium tracking-tight transition-colors',
            value === t.id ? 'bg-panel-3 text-fg shadow-sm' : 'text-faint hover:text-dim',
          )}
        >
          {t.icon && <span className={cx('shrink-0', value === t.id && 'text-accent')}>{t.icon}</span>}
          <span className="max-w-full truncate">{t.label}</span>
          {t.badge && <span className="absolute right-1 top-1 flex">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Botões lado a lado onde só um fica marcado (velocidades, modos…). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  mono,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T | null;
  onChange: (value: T) => void;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-panel-2 p-0.5 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={String(o.value)}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-6 min-w-0 flex-1 rounded-md px-1 text-[11px] transition-colors',
            mono && 'font-mono',
            value === o.value ? 'bg-accent text-white shadow-sm' : 'text-dim hover:bg-panel-3 hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pílula que liga/desliga (filtros de categoria, modos). */
export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
        active ? 'border-accent bg-accent/15 text-fg' : 'border-line text-dim hover:border-line-strong hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-panel-2 px-1.5 font-mono text-[10px] text-dim">
      {children}
    </kbd>
  );
}

/** Interruptor com o texto ao lado (o rótulo aparece, não só no título). */
export function SwitchRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-dim">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
