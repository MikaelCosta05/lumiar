import { Columns2, X } from 'lucide-react';
import { useState, type DragEvent } from 'react';
import type { MediaItem, Project } from '../project/model';
import { defaultSplitDuration, SPLIT_LAYOUTS, type SplitLayout } from '../project/splitScreen';
import { t } from '../i18n';
import { formatTime } from './format';
import { Button, cx, IconButton, Slider } from './kit';
import { MEDIA_MIME } from './selection';

export interface SplitChoice {
  layout: SplitLayout;
  media: (MediaItem | null)[];
  gap: number;
  color: string;
  duration: number;
}

/**
 * Tela dividida pronta: escolha a divisão e o que vai em cada quadro (da lista, ou arrastando um
 * arquivo do computador para dentro do quadro). Cada quadro vira uma camada recortada.
 */
export function SplitScreenDialog({
  project,
  time,
  onImport,
  onApply,
  onClose,
}: {
  project: Project;
  time: number;
  onImport: (file: File) => Promise<MediaItem | null>;
  onApply: (choice: SplitChoice) => void;
  onClose: () => void;
}) {
  const visual = project.media.filter((m) => m.kind !== 'audio');
  const [layout, setLayout] = useState(SPLIT_LAYOUTS[0]);
  const [chosen, setChosen] = useState<(string | null)[]>(() => visual.slice(0, 4).map((m) => m.id));
  const [extra, setExtra] = useState<MediaItem[]>([]);
  const [gap, setGap] = useState(0.02);
  const [color, setColor] = useState('#000000');
  const all = [...visual, ...extra];
  const media = layout.cells.map((_, i) => all.find((m) => m.id === chosen[i]) ?? null);
  const [duration, setDuration] = useState<number | null>(null);
  const length = duration ?? defaultSplitDuration(media);
  const ratio = project.width / project.height;

  const setCell = (i: number, id: string | null) =>
    setChosen((c) => {
      const next = [...c];
      while (next.length <= i) next.push(null);
      next[i] = id;
      return next;
    });

  const drop = async (i: number, e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(MEDIA_MIME);
    if (id) return setCell(i, id);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const item = await onImport(file);
    if (!item) return;
    setExtra((x) => [...x, item]);
    setCell(i, item.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[min(760px,calc(100vw-48px))] animate-pop-in rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <Columns2 size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Tela dividida')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-dim">
          {t(
            'Escolha a divisão e o que entra em cada quadro (pela lista ou arrastando um arquivo do computador para dentro dele). Começa no cursor ({time}); cada quadro vira uma camada que você pode ajustar depois.',
            { time: formatTime(time) },
          )}
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {SPLIT_LAYOUTS.map((l) => (
            <button
              key={l.id}
              title={l.name}
              onClick={() => setLayout(l)}
              className={cx('rounded-lg border p-1.5 transition-colors', layout.id === l.id ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}
            >
              <div className="relative h-10" style={{ aspectRatio: ratio }}>
                {l.cells.map((c, i) => (
                  <div
                    key={i}
                    className="absolute rounded-[2px] bg-dim/60"
                    style={{ left: `${c.x * 100 + 2}%`, top: `${c.y * 100 + 3}%`, width: `${c.w * 100 - 4}%`, height: `${c.h * 100 - 6}%` }}
                  />
                ))}
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-4">
          {/* Prévia: cada quadro mostra a miniatura do que vai nele */}
          <div className="relative w-full overflow-hidden rounded-lg ring-1 ring-line" style={{ aspectRatio: ratio, background: color }}>
            {layout.cells.map((c, i) => {
              const m = media[i];
              const g = (gap / 2) * 100;
              return (
                <div
                  key={i}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => void drop(i, e)}
                  className="absolute flex items-center justify-center overflow-hidden bg-panel-3 bg-cover bg-center text-xs text-faint"
                  style={{
                    left: `calc(${c.x * 100}% + ${g * Math.min(1, 1 / ratio)}%)`,
                    top: `calc(${c.y * 100}% + ${g * Math.min(1, ratio)}%)`,
                    width: `calc(${c.w * 100}% - ${2 * g * Math.min(1, 1 / ratio)}%)`,
                    height: `calc(${c.h * 100}% - ${2 * g * Math.min(1, ratio)}%)`,
                    backgroundImage: m?.thumbnail ? `url(${m.thumbnail})` : undefined,
                  }}
                >
                  <span className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">{m ? `${i + 1}` : `${i + 1} · ${t('arraste aqui')}`}</span>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            {layout.cells.map((_, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-4 text-center font-mono text-[11px] text-faint">{i + 1}</span>
                <select className="field h-8 min-w-0 flex-1 text-xs" value={chosen[i] ?? ''} onChange={(e) => setCell(i, e.target.value || null)}>
                  <option value="">{t('(vazio)')}</option>
                  {all.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 text-[11px] text-dim">
              <span>{t('Espaço entre os quadros')}</span>
              <label className="relative size-5 cursor-pointer rounded ring-1 ring-white/20" style={{ background: color }} title={t('Cor do fundo entre os quadros')}>
                <input type="color" className="sr-only" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
            </div>
            <Slider label={t('Espaço entre os quadros')} value={gap} min={0} max={0.06} step={0.005} onChange={setGap} />
            <div className="flex items-center justify-between text-[11px] text-dim">
              <span>{t('Duração')}</span>
              <span className="font-mono">{length.toFixed(1)}s</span>
            </div>
            <Slider label={t('Duração')} value={length} min={1} max={Math.max(60, length)} step={0.5} onChange={setDuration} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>{t('Cancelar')}</Button>
          <Button
            variant="primary"
            icon={<Columns2 size={14} />}
            disabled={media.every((m) => !m)}
            onClick={() => onApply({ layout, media, gap, color, duration: length })}
          >
            {t('Montar a tela dividida')}
          </Button>
        </div>
      </div>
    </div>
  );
}
