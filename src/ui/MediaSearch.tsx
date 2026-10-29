import { Eye, LoaderCircle, MessageSquareText, Plus, Search, X } from 'lucide-react';
import { useState } from 'react';
import { CAPTION_LANGUAGES } from '../media/captioning';
import { indexSpeech, indexVisual, isIndexed, searchSpeech, searchVisual, type SearchHit } from '../media/mediaIndex';
import type { MediaItem, Project } from '../project/model';
import { t } from '../i18n';
import { formatTime } from './format';
import { Button, cx, IconButton, Segmented } from './kit';

type Mode = 'visual' | 'speech';

/**
 * Buscar nas mídias do projeto (inclusive as que ainda não estão na timeline):
 * pelo que aparece ("cachorro", "pôr do sol") ou pelo que é falado ("a gente chegou").
 */
export function MediaSearchDialog({
  project,
  onInsert,
  onClose,
  notify,
}: {
  project: Project;
  onInsert: (media: MediaItem, time: number, where: 'cursor' | 'end') => void;
  onClose: () => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>('visual');
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState<string | null>('portuguese');
  const [busy, setBusy] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const candidates = project.media.filter((m) => (mode === 'visual' ? m.kind !== 'audio' && !m.sfx : m.hasAudio || m.kind === 'audio'));
  const missing = candidates.filter((m) => !isIndexed(m, mode));
  const langCode = (language ?? 'portuguese').slice(0, 2) === 'po' ? 'pt' : (language ?? 'pt').slice(0, 2);

  const prepare = async () => {
    try {
      for (const [i, m] of missing.entries()) {
        const label = `${i + 1}/${missing.length} · ${m.name}`;
        if (mode === 'visual') await indexVisual(m, (stage, f) => setBusy(`${label} · ${stage}${f === null ? '' : ` ${Math.round(f * 100)}%`}`));
        else await indexSpeech(m, language, (stage, f) => setBusy(`${label} · ${stage}${f === null ? '' : ` ${Math.round(f * 100)}%`}`));
      }
    } catch (error) {
      notify(t('Não foi possível analisar as mídias: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    if (missing.length) await prepare();
    try {
      setBusy(t('Procurando…'));
      setHits(mode === 'visual' ? await searchVisual(query, candidates, langCode, (stage, f) => setBusy(`${stage}${f === null ? '' : ` ${Math.round(f * 100)}%`}`)) : searchSpeech(query, candidates));
    } catch (error) {
      notify(t('Não foi possível buscar: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[86vh] w-[min(640px,calc(100vw-48px))] animate-pop-in flex-col rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <Search size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Buscar nas mídias')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-dim">
          {t(
            'Acha o momento exato nos seus vídeos, mesmo os que ainda não estão na timeline. Cada mídia é analisada uma vez (os modelos de IA são baixados na primeira busca).',
          )}
        </p>
        <div className="mb-2 flex items-center gap-2">
          <Segmented
            options={[
              { value: 'visual', label: t('O que aparece') },
              { value: 'speech', label: t('O que é falado') },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setHits(null);
            }}
          />
          <select className="field h-8 text-xs" value={language ?? ''} onChange={(e) => setLanguage(e.target.value || null)} title={t('Idioma (das buscas e da fala)')}>
            {CAPTION_LANGUAGES.filter((l) => l.id).map((l) => (
              <option key={l.label} value={l.id ?? ''}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input
            autoFocus
            className="field h-9 flex-1 text-sm"
            placeholder={mode === 'visual' ? t('cachorro, praia, pôr do sol, carro vermelho…') : t('uma frase que alguém disse')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button variant="primary" icon={busy ? <LoaderCircle size={14} className="animate-spin" /> : <Search size={14} />} disabled={!!busy || !query.trim() || !candidates.length}>
            {t('Buscar')}
          </Button>
        </form>
        {busy && <p className="mb-2 truncate text-[11px] text-dim">{busy}</p>}
        {!busy && missing.length > 0 && (
          <p className="mb-2 text-[11px] text-faint">
            {t('{n} mídia(s) ainda não analisada(s): a primeira busca demora um pouco mais.', { n: missing.length })}
          </p>
        )}
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {hits?.length === 0 && <p className="p-6 text-center text-xs text-faint">{t('Nada encontrado.')}</p>}
          {hits?.map((h, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 px-2.5 py-2">
              <div className="h-10 w-16 shrink-0 rounded bg-panel-3 bg-cover bg-center" style={{ backgroundImage: h.media.thumbnail ? `url(${h.media.thumbnail})` : undefined }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  {h.media.name} <span className="font-mono text-faint">· {formatTime(h.time)}</span>
                </p>
                <p className={cx('truncate text-[11px]', h.context ? 'text-dim' : 'text-faint')}>
                  {h.context ? (
                    <>
                      <MessageSquareText size={10} className="mr-1 inline" />…{h.context}…
                    </>
                  ) : (
                    <>
                      <Eye size={10} className="mr-1 inline" />
                      {t('{percent}% parecido', { percent: Math.round(Math.min(1, Math.max(0, (h.score - 0.15) / 0.2)) * 100) })}
                    </>
                  )}
                </p>
              </div>
              <Button className="h-7 text-[11px]" icon={<Plus size={12} />} onClick={() => onInsert(h.media, h.time, 'cursor')} title={t('Por cima do vídeo, no cursor (4 s)')}>
                {t('No cursor')}
              </Button>
              <Button className="h-7 text-[11px]" onClick={() => onInsert(h.media, h.time, 'end')} title={t('No fim da trilha principal (4 s)')}>
                {t('No fim')}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
