import { FileText, ListChecks, ListOrdered, LoaderCircle, Scissors, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CAPTION_LANGUAGES, CAPTION_MODELS, DEFAULT_CAPTION_MODEL, transcribeProject } from '../media/captioning';
import { getCaptions, updateCaptions } from '../project/captions';
import type { Project } from '../project/model';
import { removeTimeRanges } from '../project/ripple';
import { FILLER_KINDS, findFillers } from '../project/fillers';
import { formatTime } from './format';
import { Button, cx, Segmented } from './kit';
import { t } from '../i18n';
import { keys } from '../i18n/keys';

interface Props {
  project: Project;
  time: number;
  onChange: (update: (project: Project) => Project) => void;
  onSeek: (time: number) => void;
  notify: (text: string, error?: boolean) => void;
  onScriptAssembly: () => void;
}

interface Word {
  text: string;
  start: number;
  end: number;
}

/**
 * Editar pelo texto: a fala do projeto vira um texto; apagar palavras apaga o trecho do vídeo junto
 * (e todo o resto anda para fechar o buraco).
 */
export function TranscriptPanel({ project, time, onChange, onSeek, notify, onScriptAssembly }: Props) {
  const track = getCaptions(project);
  const words = useMemo<Word[]>(
    () => track.captions.flatMap((c) => c.words ?? []).sort((a, b) => a.start - b.start),
    [track.captions],
  );
  const [language, setLanguage] = useState<string | null>('portuguese');
  const [model, setModel] = useState(DEFAULT_CAPTION_MODEL);
  const [progress, setProgress] = useState<string | null>(null);
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const anchor = useRef<number | null>(null);
  const dragging = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const current = words.findIndex((w) => time >= w.start && time < w.end);
  const fillers = useMemo(() => findFillers(words), [words]);
  const fillerWords = useMemo(() => new Set(fillers.flatMap((f) => Array.from({ length: f.to - f.from + 1 }, (_, k) => f.from + k))), [fillers]);
  // Revisar um por um: os desmarcados ficam no vídeo.
  const [reviewing, setReviewing] = useState(false);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  useEffect(() => setKeep(new Set()), [fillers]);

  useEffect(() => {
    if (current < 0) return;
    listRef.current?.querySelector(`[data-word="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const transcribe = async () => {
    try {
      setProgress(t('Preparando o áudio'));
      const captions = await transcribeProject(project, { model, language, maxWords: track.maxWords }, (stage, fraction) =>
        setProgress(fraction === null ? stage : `${stage} · ${Math.round(fraction * 100)}%`),
      );
      // Transcrever aqui não liga as legendas na tela (isso fica na aba Legendas).
      onChange((p) => updateCaptions(p, (t) => ({ ...t, enabled: t.captions.length ? t.enabled : false, captions })));
      notify(
        captions.length ? t('Pronto. Selecione palavras e aperte {keys} para cortar o trecho do vídeo.', { keys: keys('Delete') }) : t('Nenhuma fala reconhecida.'),
        !captions.length,
      );
    } catch (error) {
      notify(t('Não foi possível transcrever: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setProgress(null);
    }
  };

  /** Trecho da timeline de um grupo de palavras, com uma folguinha que não invade as vizinhas. */
  const rangeOf = (from: number, to: number): [number, number] => {
    const prev = words[from - 1];
    const next = words[to + 1];
    const start = Math.max(prev ? prev.end : 0, words[from].start - 0.06);
    const end = Math.min(next ? next.start : Infinity, words[to].end + 0.06);
    return [start, end];
  };

  const cut = (groups: [number, number][], label: string) => {
    if (groups.length === 0) return;
    let removed = 0;
    // Editar pelo texto sempre leva o resto junto: senão as legendas e os sons sairiam de sincronia.
    onChange((p) => {
      const result = removeTimeRanges(p, groups.map(([a, b]) => rangeOf(a, b)), true);
      removed = result.removed;
      return result.project;
    });
    setSelection(null);
    notify(
      removed > 0
        ? t('{label}: o vídeo ficou {seconds}s mais curto.', { label, seconds: removed.toFixed(1) })
        : t('Essas palavras não estão em cima de um clipe da trilha principal.'),
      removed <= 0,
    );
  };

  const cutSelection = () => {
    if (!selection) return;
    const [a, b] = selection;
    cut([[Math.min(a, b), Math.max(a, b)]], t('{n} palavra(s) cortada(s)', { n: Math.abs(b - a) + 1 }));
  };

  const cutFillers = () => {
    const chosen = fillers.filter((f) => !keep.has(f.from));
    // Vícios vizinhos viram um corte só.
    const groups: [number, number][] = [];
    for (const f of chosen) {
      const last = groups[groups.length - 1];
      if (last && last[1] >= f.from - 1) last[1] = Math.max(last[1], f.to);
      else groups.push([f.from, f.to]);
    }
    cut(groups, t('{n} vício(s) de fala removido(s)', { n: chosen.length }));
    setReviewing(false);
  };
  const chosenCount = fillers.filter((f) => !keep.has(f.from)).length;

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
      e.preventDefault();
      e.stopPropagation();
      cutSelection();
    }
  };

  const [lo, hi] = selection ? [Math.min(...selection), Math.max(...selection)] : [-1, -2];

  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <h2 className="text-[15px] font-semibold">{t('Editar pelo texto')}</h2>
        <span className="text-xs text-faint">{t('{n} palavras', { n: words.length })}</span>
      </div>

      {words.length === 0 || progress ? (
        <div className="px-4">
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <FileText size={13} className="text-accent" /> {t('Transcrever o vídeo')}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-faint">
              {t('A fala vira texto, no seu computador. Depois é só apagar palavras para cortar o vídeo, como num editor de texto.')}
            </p>
            <p className="mb-1 mt-3 text-[11px] text-faint">{t('Idioma falado')}</p>
            <select className="field h-8 w-full text-xs" value={language ?? ''} onChange={(e) => setLanguage(e.target.value || null)} disabled={!!progress}>
              {CAPTION_LANGUAGES.map((l) => (
                <option key={l.label} value={l.id ?? ''}>
                  {t(l.label)}
                </option>
              ))}
            </select>
            <p className="mb-1 mt-2.5 text-[11px] text-faint">{t('Qualidade')}</p>
            <Segmented
              options={CAPTION_MODELS.map((m) => ({ value: m.id, label: t(m.label), title: t('{label} · modelo de {size}', { label: t(m.label), size: m.size }) }))}
              value={model}
              onChange={(id) => !progress && setModel(id)}
            />
            {progress ? (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-dim">
                <LoaderCircle size={12} className="animate-spin text-accent" />
                {progress}
              </p>
            ) : (
              <Button variant="primary" icon={<FileText size={14} />} className="mt-2.5 w-full" onClick={() => void transcribe()}>
                {t('Transcrever')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-1.5 px-4 pb-3">
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="secondary" className="h-8 text-xs" icon={<Scissors size={13} />} disabled={!selection} onClick={cutSelection}>
                {t('Cortar seleção')}
              </Button>
              <Button
                variant="secondary"
                className="h-8 text-xs"
                icon={<Sparkles size={13} />}
                disabled={chosenCount === 0}
                onClick={cutFillers}
                title={
                  fillers.length
                    ? t('Tira de uma vez: {list}', { list: [...new Set(fillers.map((f) => f.label.toLowerCase()))].slice(0, 12).join(', ') })
                    : t('Nenhum "é…", "hum", "tipo," ou repetição encontrado')
                }
              >
                {t('Tirar vícios ({n})', { n: chosenCount })}
              </Button>
            </div>
            {project.script.trim() && (
              <Button
                variant="secondary"
                className="h-8 w-full text-xs"
                icon={<ListOrdered size={13} />}
                onClick={onScriptAssembly}
                title={t('Grava cada frase várias vezes? O Lumiar fica com a melhor tentativa de cada frase do roteiro e tira o resto')}
              >
                {t('Montar pelo roteiro (melhores tentativas)')}
              </Button>
            )}
            {fillers.length > 0 && (
              <button
                onClick={() => setReviewing((r) => !r)}
                className={cx('flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] transition-colors', reviewing ? 'bg-amber/15 text-amber' : 'text-dim hover:bg-panel-2 hover:text-fg')}
              >
                <ListChecks size={13} />
                {reviewing ? t('Fechar a revisão') : t('Revisar os {n} vícios um por um', { n: fillers.length })}
              </button>
            )}
            {reviewing && (
              <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-line bg-panel-2 p-1">
                {fillers.map((f) => (
                  <label key={f.from} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-panel-3">
                    <input
                      type="checkbox"
                      className="accent-[var(--color-accent)]"
                      checked={!keep.has(f.from)}
                      onChange={() =>
                        setKeep((k) => {
                          const next = new Set(k);
                          if (next.has(f.from)) next.delete(f.from);
                          else next.add(f.from);
                          return next;
                        })
                      }
                    />
                    <button
                      className="min-w-0 flex-1 truncate text-left"
                      title={t('Ouvir este trecho')}
                      onClick={(e) => {
                        e.preventDefault();
                        onSeek(Math.max(0, words[f.from].start - 1.2));
                      }}
                    >
                      <span className="text-fg">"{f.label}"</span> <span className="text-faint">· {t(FILLER_KINDS[f.kind])}</span>
                    </button>
                    <span className="font-mono text-[10px] text-faint">{formatTime(words[f.from].start)}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[11px] leading-snug text-faint">
              {t(
                'Clique numa palavra para ir até ela. Arraste (ou {shift}+clique) para selecionar e aperte {delete}: o trecho sai do vídeo e o resto anda junto. Os vícios aparecem sublinhados (repetições e frases recomeçadas também).',
                { shift: keys('Shift'), delete: keys('Delete') },
              )}
            </p>
          </div>
          <div
            ref={listRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            className="min-h-0 flex-1 select-none overflow-y-auto px-4 pb-4 text-[13px] leading-7 outline-none"
          >
            {words.map((w, i) => (
              <span key={i}>
                <span
                  data-word={i}
                  onPointerDown={(e) => {
                    dragging.current = true;
                    if (e.shiftKey && anchor.current !== null) setSelection([anchor.current, i]);
                    else {
                      anchor.current = i;
                      setSelection([i, i]);
                      onSeek(w.start);
                    }
                  }}
                  onPointerEnter={() => dragging.current && anchor.current !== null && setSelection([anchor.current, i])}
                  className={cx(
                    'cursor-pointer rounded px-0.5 transition-colors',
                    i >= lo && i <= hi ? 'bg-danger/30 text-fg line-through decoration-danger/70' : i === current ? 'bg-accent/35 text-fg' : 'text-dim hover:bg-panel-3 hover:text-fg',
                    fillerWords.has(i) && 'underline decoration-amber decoration-dotted decoration-2 underline-offset-4',
                  )}
                >
                  {w.text}
                </span>{' '}
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}
