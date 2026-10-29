import { Copy, FolderSearch, HardDrive, Replace, Trash, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { duplicateGroups, mediaUsage } from '../project/mediaUsage';
import type { MediaItem, Project } from '../project/model';
import { t } from '../i18n';
import { formatTime } from './format';
import { Button, cx, IconButton, Segmented } from './kit';

const mb = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`);

/**
 * Mídias do projeto: o que está sendo usado, quanto espaço cada uma ocupa no arquivo .lumiar,
 * o que dá para tirar e trocar o arquivo de uma mídia (todos os clipes passam a usar o novo).
 */
export function MediaManagerDialog({
  project,
  onRemove,
  onMerge,
  onReplace,
  onClose,
}: {
  project: Project;
  onRemove: (ids: string[]) => void;
  onMerge: () => void;
  onReplace: (media: MediaItem) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'unused'>('all');
  const usage = useMemo(() => mediaUsage(project), [project]);
  const duplicates = useMemo(() => duplicateGroups(project), [project]);
  const unused = project.media.filter((m) => !usage.get(m.id));
  const total = project.media.reduce((n, m) => n + m.file.size, 0);
  const unusedSize = unused.reduce((n, m) => n + m.file.size, 0);
  const duplicateSize = duplicates.reduce((n, g) => n + g.slice(1).reduce((k, m) => k + m.file.size, 0), 0);
  const list = (filter === 'unused' ? unused : project.media).slice().sort((a, b) => b.file.size - a.file.size);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[86vh] w-[min(680px,calc(100vw-48px))] animate-pop-in flex-col rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <HardDrive size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Mídias do projeto')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-dim">
          {t(
            'O Lumiar guarda uma cópia de cada mídia dentro do projeto, então nada se perde se o arquivo original mudar de pasta. Aqui você vê quanto cada uma ocupa, tira o que não está sendo usado e troca o arquivo de uma mídia por outro.',
          )}
        </p>

        <div className="mb-3 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-panel-2 px-3 py-2">
            <p className="text-[11px] text-faint">{t('No projeto')}</p>
            <p className="text-sm font-semibold">
              {project.media.length} · {mb(total)}
            </p>
          </div>
          <div className="rounded-lg bg-panel-2 px-3 py-2">
            <p className="text-[11px] text-faint">{t('Sem uso')}</p>
            <p className={cx('text-sm font-semibold', unused.length > 0 && 'text-amber')}>
              {unused.length} · {mb(unusedSize)}
            </p>
          </div>
          <div className="rounded-lg bg-panel-2 px-3 py-2">
            <p className="text-[11px] text-faint">{t('Repetidas')}</p>
            <p className={cx('text-sm font-semibold', duplicates.length > 0 && 'text-amber')}>
              {duplicates.reduce((n, g) => n + g.length - 1, 0)} · {mb(duplicateSize)}
            </p>
          </div>
        </div>

        <div className="mb-2 flex items-center gap-2">
          <Segmented
            options={[
              { value: 'all', label: t('Todas') },
              { value: 'unused', label: t('Sem uso ({n})', { n: unused.length }) },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <span className="flex-1" />
          {duplicates.length > 0 && (
            <Button className="h-8 text-xs" icon={<Copy size={13} />} onClick={onMerge} title={t('Os clipes passam a usar uma cópia só de cada mídia repetida')}>
              {t('Juntar as repetidas')}
            </Button>
          )}
          <Button
            variant="danger"
            className="h-8 text-xs"
            icon={<Trash size={13} />}
            disabled={unused.length === 0}
            onClick={() => onRemove(unused.map((m) => m.id))}
          >
            {t('Tirar as sem uso ({size})', { size: mb(unusedSize) })}
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {list.length === 0 && <p className="p-6 text-center text-xs text-faint">{filter === 'unused' ? t('Todas as mídias estão sendo usadas.') : t('Nenhuma mídia.')}</p>}
          {list.map((m) => {
            const uses = usage.get(m.id) ?? 0;
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 px-2.5 py-2">
                <div className="h-9 w-16 shrink-0 overflow-hidden rounded bg-panel-3 bg-cover bg-center" style={{ backgroundImage: m.thumbnail ? `url(${m.thumbnail})` : undefined }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {m.name}
                    {m.compound && <span className="ml-1.5 rounded bg-accent/20 px-1 text-[10px] text-accent">{t('composto')}</span>}
                  </p>
                  <p className="text-[11px] text-faint">
                    {m.kind === 'image' ? t('Imagem') : m.kind === 'audio' ? t('Áudio') : t('Vídeo')}
                    {m.kind !== 'image' && ` · ${formatTime(m.duration).replace(/\.\d+$/, '')}`}
                    {m.width ? ` · ${m.width}×${m.height}` : ''} · {mb(m.file.size)} ·{' '}
                    <span className={uses ? 'text-dim' : 'text-amber'}>{uses ? t('usada {n}×', { n: uses }) : t('sem uso')}</span>
                  </p>
                </div>
                {!m.compound && (
                  <IconButton label={t('Trocar o arquivo (os clipes passam a usar o novo)')} onClick={() => onReplace(m)}>
                    <Replace size={14} />
                  </IconButton>
                )}
                {!uses && (
                  <IconButton label={t('Tirar do projeto')} className="hover:!text-danger" onClick={() => onRemove([m.id])}>
                    <Trash size={14} />
                  </IconButton>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-faint">
          <FolderSearch size={12} /> {t('Gravou de novo, achou uma versão melhor ou mudou o arquivo? Use')} <Replace size={11} className="inline" />{' '}
          {t('para trocar: os cortes e efeitos continuam.')}
        </p>
      </div>
    </div>
  );
}
