import { ArrowLeftRight, Link, Unlink, X } from 'lucide-react';
import { useState } from 'react';
import { aspectLabel, FORMAT_GROUPS, FPS_CHOICES, normalizeSize } from '../project/formats';
import type { Background, Project } from '../project/model';
import { Button, cx, IconButton, Segmented } from './kit';

interface Props {
  project: Project;
  onApply: (patch: Pick<Project, 'width' | 'height' | 'fps' | 'background'>) => void;
  onClose: () => void;
}

/** Tamanho, quadros por segundo e fundo do projeto. */
export function ProjectDialog({ project, onApply, onClose }: Props) {
  const [width, setWidth] = useState(project.width);
  const [height, setHeight] = useState(project.height);
  const [fps, setFps] = useState(project.fps);
  const [background, setBackground] = useState<Background>(project.background ?? { kind: 'black', color: '#000000' });
  const [locked, setLocked] = useState(false);
  const visual = project.media.filter((m) => m.kind !== 'audio');

  const setSize = (w: number, h: number) => {
    setWidth(w);
    setHeight(h);
  };
  const changeWidth = (v: number) => {
    if (locked) setHeight(Math.round((v * height) / width));
    setWidth(v);
  };
  const changeHeight = (v: number) => {
    if (locked) setWidth(Math.round((v * width) / height));
    setHeight(v);
  };

  const apply = () => {
    onApply({ width: normalizeSize(width), height: normalizeSize(height), fps, background });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-3xl animate-pop-in flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-start gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold">Formato do projeto</h3>
            <p className="text-xs text-dim">Tamanho do vídeo, quadros por segundo e o que aparece nas bordas.</p>
          </div>
          <IconButton label="Fechar" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {FORMAT_GROUPS.map((group) => (
            <section key={group.title} className="mb-4">
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">{group.title}</h4>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {group.presets.map((p) => {
                  const active = p.width === width && p.height === height;
                  return (
                    <button
                      key={`${p.width}x${p.height}`}
                      onClick={() => setSize(p.width, p.height)}
                      title={`${p.width}×${p.height}`}
                      className={cx(
                        'flex flex-col items-center gap-1.5 rounded-xl border px-1.5 pb-2 pt-3 text-center transition-colors',
                        active ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong hover:bg-panel-2',
                      )}
                    >
                      <AspectBox width={p.width} height={p.height} active={active} />
                      <span className="w-full truncate text-xs font-medium">{p.name}</span>
                      <span className="-mt-1 w-full truncate text-[10px] text-faint">{p.hint}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="mb-4">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Personalizado</h4>
            <div className="flex flex-wrap items-center gap-2">
              <NumberField label="Largura" value={width} onChange={changeWidth} />
              <IconButton label="Inverter (deitado ↔ em pé)" onClick={() => setSize(height, width)}>
                <ArrowLeftRight size={15} />
              </IconButton>
              <NumberField label="Altura" value={height} onChange={changeHeight} />
              <IconButton label={locked ? 'Proporção travada' : 'Travar proporção'} active={locked} onClick={() => setLocked(!locked)}>
                {locked ? <Link size={14} /> : <Unlink size={14} />}
              </IconButton>
              <span className="ml-1 rounded bg-panel-3 px-2 py-1 font-mono text-[11px] text-dim">{aspectLabel(normalizeSize(width), normalizeSize(height))}</span>
              {visual.length > 0 && (
                <select
                  className="field ml-auto h-8 max-w-56 text-xs"
                  value=""
                  onChange={(e) => {
                    const media = visual.find((m) => m.id === e.target.value);
                    if (media) setSize(media.width, media.height);
                  }}
                >
                  <option value="">Usar o tamanho de uma mídia…</option>
                  {visual.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.width}×{m.height})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-faint">De 64 a 7680 pixels; o Lumiar arredonda para número par (exigência dos codificadores de vídeo).</p>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Quadros por segundo</h4>
              <Segmented options={FPS_CHOICES.map((f) => ({ value: f, label: String(f) }))} value={fps} onChange={setFps} mono />
              <p className="mt-1.5 text-[11px] text-faint">24 = cinema · 30 = padrão · 60 = movimento bem fluido</p>
            </section>
            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Fundo das bordas</h4>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Segmented
                    options={[
                      { value: 'black', label: 'Preto' },
                      { value: 'blur', label: 'Desfocado' },
                      { value: 'color', label: 'Cor' },
                    ]}
                    value={background.kind}
                    onChange={(kind) => setBackground((b) => ({ ...b, kind: kind as Background['kind'] }))}
                  />
                </div>
                {background.kind === 'color' && (
                  <label className="relative size-7 cursor-pointer overflow-hidden rounded-md ring-1 ring-white/20" style={{ background: background.color }} title="Escolher a cor">
                    <input
                      type="color"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      value={background.color}
                      onChange={(e) => setBackground((b) => ({ ...b, color: e.target.value }))}
                    />
                  </label>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-faint">Quando a mídia não preenche a tela (ex.: vídeo deitado num projeto vertical).</p>
            </section>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-6 py-3">
          <span className="font-mono text-xs text-dim">
            {normalizeSize(width)}×{normalizeSize(height)} · {aspectLabel(normalizeSize(width), normalizeSize(height))} · {fps} fps
          </span>
          <span className="flex-1" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={apply}>
            Aplicar
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Retângulo com a proporção do formato. */
export function AspectBox({ width, height, active, size = 34 }: { width: number; height: number; active?: boolean; size?: number }) {
  const scale = size / Math.max(width, height);
  return (
    <span className="flex items-center justify-center" style={{ width: size, height: size }}>
      <span
        className={cx('rounded-[3px] border-2', active ? 'border-accent bg-accent/20' : 'border-dim/60')}
        style={{ width: Math.max(8, width * scale), height: Math.max(8, height * scale) }}
      />
    </span>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-dim">
      {label}
      <input
        type="number"
        min={64}
        max={7680}
        step={2}
        className="field h-8 w-24 font-mono text-xs"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        onBlur={() => onChange(normalizeSize(value))}
      />
    </label>
  );
}
