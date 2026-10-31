import { Clapperboard, LoaderCircle, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { indexVisual, isIndexed, matchFrames } from '../media/mediaIndex';
import { getCaptions } from '../project/captions';
import { layoutProject, type MediaItem, type Project } from '../project/model';
import { t } from '../i18n';
import { formatTime } from './format';
import { Button, cx, IconButton, Slider } from './kit';

export interface BrollPick {
  /** Onde entra na timeline */
  start: number;
  length: number;
  media: MediaItem;
  /** Instante do arquivo que combina com a fala */
  time: number;
}

interface Suggestion extends BrollPick {
  text: string;
  score: number;
}

/**
 * Imagens de apoio automáticas: para cada frase falada, o Lumiar procura nas suas mídias um trecho que
 * mostre aquilo (pela IA que compara imagem e texto) e põe por cima, por alguns segundos.
 */
export function BrollDialog({ project, onApply, onClose }: { project: Project; onApply: (picks: BrollPick[]) => void; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(t('Preparando…'));
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<{ text: string; start: number; end: number; best: { media: MediaItem; time: number; score: number } | null }[]>([]);
  const [threshold, setThreshold] = useState(0.23);
  const [off, setOff] = useState<Set<number>>(new Set());

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const tl = layoutProject(project);
        const captions = getCaptions(project).captions;
        if (!captions.length) throw new Error(t('Transcreva o vídeo primeiro (aba Transcrição ou Legendas).'));
        // Frases de 3 a 8 s (juntando legendas vizinhas), para cada imagem de apoio ter tempo de aparecer.
        const phrases: { text: string; start: number; end: number }[] = [];
        for (const c of captions) {
          const last = phrases[phrases.length - 1];
          if (last && c.start - last.end < 0.6 && c.end - last.start < 8 && last.end - last.start < 3) {
            last.text += ` ${c.text}`;
            last.end = c.end;
          } else phrases.push({ text: c.text, start: c.start, end: c.end });
        }
        const media = project.media.filter((m) => m.kind !== 'audio' && !m.sfx && !m.compound);
        for (const [i, m] of media.entries()) {
          if (isIndexed(m, 'visual')) continue;
          await indexVisual(m, (stage, f) => alive && setBusy(`${t('Olhando {i}/{n}', { i: i + 1, n: media.length })} · ${stage}${f === null ? '' : ` ${Math.round(f * 100)}%`}`));
        }
        const matches = await matchFrames(
          phrases.map((p) => p.text),
          media,
          'pt',
          (stage, f) => alive && setBusy(`${stage}${f === null ? '' : ` ${Math.round(f * 100)}%`}`),
        );
        // Não vale mostrar o próprio vídeo que já está na tela naquele momento.
        const onScreen = (at: number) => tl.clips.find((l) => at >= l.start && at < l.start + l.length)?.media.id;
        if (!alive) return;
        setRaw(phrases.map((p, i) => ({ ...p, best: matches[i].find((m) => m.media.id !== onScreen(p.start)) ?? null })));
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setBusy(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [project]);

  // Só as que passam do limite, com pelo menos 6 s entre uma e outra.
  const suggestions = useMemo(() => {
    const out: Suggestion[] = [];
    for (const r of raw) {
      if (!r.best || r.best.score < threshold) continue;
      const last = out[out.length - 1];
      if (last && r.start - (last.start + last.length) < 6) continue;
      const length = Math.min(4, Math.max(2, r.end - r.start), r.best.media.kind === 'image' ? 4 : r.best.media.duration);
      out.push({ text: r.text, start: r.start, length, media: r.best.media, time: Math.max(0, r.best.time - 0.5), score: r.best.score });
    }
    return out;
  }, [raw, threshold]);
  const chosen = suggestions.filter((_, i) => !off.has(i));

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[86vh] w-[min(640px,calc(100vw-48px))] animate-pop-in flex-col rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <Clapperboard size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Imagens de apoio automáticas')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-dim">
          {t('Enquanto você fala "a praia estava linda", entra um trecho das suas mídias com praia. Desmarque o que não combinar.')}
        </p>
        {error ? (
          <p className="text-xs text-danger">{error}</p>
        ) : busy ? (
          <p className="flex items-center gap-2 text-xs text-dim">
            <LoaderCircle size={14} className="animate-spin text-accent" /> {busy}
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-3 text-[11px] text-dim">
              <span className="shrink-0">{t('Exigência')}</span>
              <Slider label={t('Exigência')} value={threshold} min={0.2} max={0.34} step={0.005} onChange={setThreshold} />
              <span className="w-28 shrink-0 text-right">{t('{n} sugestões', { n: suggestions.length })}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {suggestions.length === 0 && <p className="p-6 text-center text-xs text-faint">{t('Nenhuma imagem combina o suficiente. Diminua a exigência.')}</p>}
              {suggestions.map((s, i) => (
                <label key={i} className={cx('flex cursor-pointer items-center gap-3 rounded-lg border px-2.5 py-2', off.has(i) ? 'border-line opacity-50' : 'border-line bg-panel-2')}>
                  <input
                    type="checkbox"
                    checked={!off.has(i)}
                    onChange={() =>
                      setOff((o) => {
                        const next = new Set(o);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                  <div className="h-9 w-14 shrink-0 rounded bg-panel-3 bg-cover bg-center" style={{ backgroundImage: s.media.thumbnail ? `url(${s.media.thumbnail})` : undefined }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">"{s.text}"</p>
                    <p className="truncate text-[11px] text-faint">
                      {formatTime(s.start)} · {t('{name} em {time}', { name: s.media.name, time: formatTime(s.time) })}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={onClose}>{t('Cancelar')}</Button>
          <Button variant="primary" icon={<Clapperboard size={14} />} disabled={!chosen.length} onClick={() => onApply(chosen)}>
            {t('Pôr {n} imagem(ns)', { n: chosen.length })}
          </Button>
        </div>
      </div>
    </div>
  );
}
