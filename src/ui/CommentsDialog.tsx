import { MessageSquarePlus, MessagesSquare, Trash, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { uid, type Project, type TimelineComment } from '../project/model';
import { t } from '../i18n';
import { formatTime } from './format';
import { Button, cx, IconButton, Segmented } from './kit';

/** Comentário novo no instante t (já entra na lista). */
export function addComment(project: Project, time: number, text = ''): { project: Project; id: string } {
  const comment: TimelineComment = { id: uid(), time, text, done: false };
  const comments = [...(project.comments ?? []), comment].sort((a, b) => a.time - b.time);
  return { project: { ...project, comments }, id: comment.id };
}

export function updateComment(project: Project, id: string, patch: Partial<TimelineComment>): Project {
  return { ...project, comments: project.comments?.map((c) => (c.id === id ? { ...c, ...patch } : c)) };
}

export function removeComment(project: Project, id: string): Project {
  return { ...project, comments: project.comments?.filter((c) => c.id !== id) };
}

/**
 * Comentários e tarefas: notas com tempo marcado ("trocar essa música", "cortar aqui"). Aparecem na
 * régua da timeline; marcar como feito deixa o balão verde.
 */
export function CommentsDialog({
  project,
  time,
  focus,
  onChange,
  onSeek,
  onClose,
}: {
  project: Project;
  time: number;
  /** Comentário para destacar e editar ao abrir */
  focus: string | null;
  onChange: (update: (p: Project) => Project) => void;
  onSeek: (time: number) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [editing, setEditing] = useState<string | null>(focus);
  const listRef = useRef<HTMLDivElement>(null);
  const comments = project.comments ?? [];
  const shown = filter === 'open' ? comments.filter((c) => !c.done || c.id === editing) : comments;
  const pending = comments.filter((c) => !c.done).length;

  useEffect(() => {
    if (editing) listRef.current?.querySelector<HTMLTextAreaElement>(`[data-comment="${editing}"] textarea`)?.focus();
  }, [editing]);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[80vh] w-[460px] animate-pop-in flex-col rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <MessagesSquare size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Comentários e tarefas')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-dim">
          {t('Anote o que falta fazer em cada ponto do vídeo. Os balões aparecem na régua da timeline; clique num deles para vir aqui.')}
        </p>
        <div className="mb-2 flex items-center gap-2">
          <Segmented
            options={[
              { value: 'open', label: t('A fazer ({n})', { n: pending }) },
              { value: 'all', label: t('Todos ({n})', { n: comments.length }) },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <span className="flex-1" />
          <Button
            variant="primary"
            className="h-8 text-xs"
            icon={<MessageSquarePlus size={14} />}
            onClick={() => {
              let id = '';
              onChange((p) => {
                const r = addComment(p, time);
                id = r.id;
                return r.project;
              });
              setEditing(id);
            }}
          >
            {t('No cursor ({time})', { time: formatTime(time).replace(/\.\d+$/, '') })}
          </Button>
        </div>
        <div ref={listRef} className="min-h-24 flex-1 space-y-1.5 overflow-y-auto">
          {shown.length === 0 && <p className="p-6 text-center text-xs text-faint">{comments.length ? t('Tudo feito. 🎉') : t('Nenhum comentário ainda.')}</p>}
          {shown.map((c) => (
            <div
              key={c.id}
              data-comment={c.id}
              className={cx('flex items-start gap-2 rounded-lg border p-2', c.id === editing ? 'border-accent bg-accent/5' : 'border-line bg-panel-2')}
            >
              <input
                type="checkbox"
                className="mt-1 accent-[var(--color-success)]"
                checked={c.done}
                title={t('Feito')}
                onChange={(e) => onChange((p) => updateComment(p, c.id, { done: e.target.checked }))}
              />
              <div className="min-w-0 flex-1">
                <button className="font-mono text-[10px] text-faint hover:text-accent" onClick={() => onSeek(c.time)} title={t('Ir para este ponto')}>
                  {formatTime(c.time)}
                </button>
                <textarea
                  rows={Math.min(4, Math.max(1, Math.ceil(c.text.length / 46)))}
                  value={c.text}
                  placeholder={t('O que fazer aqui?')}
                  onFocus={() => setEditing(c.id)}
                  onChange={(e) => {
                    const text = e.target.value;
                    onChange((p) => updateComment(p, c.id, { text }));
                  }}
                  className={cx('w-full resize-none bg-transparent text-xs leading-snug outline-none', c.done && 'text-faint line-through')}
                />
              </div>
              <IconButton label={t('Apagar')} className="size-6 hover:!text-danger" onClick={() => onChange((p) => removeComment(p, c.id))}>
                <Trash size={12} />
              </IconButton>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
