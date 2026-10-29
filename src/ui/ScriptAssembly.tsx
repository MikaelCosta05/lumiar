import { ChevronLeft, ChevronRight, ListOrdered, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getCaptions } from '../project/captions';
import type { Project } from '../project/model';
import { keptRanges, planFromScript, type SentencePlan } from '../project/scriptAlign';
import { formatTime } from './format';
import { Button, cx, IconButton } from './kit';
import { t } from '../i18n';

/**
 * Montar pelo roteiro: cada frase do roteiro com as tentativas encontradas na gravação. O Lumiar
 * escolhe uma (dá para trocar pelas setas) e, ao aplicar, tudo fora das escolhidas sai do vídeo.
 */
export function ScriptAssemblyDialog({
  project,
  onSeek,
  onApply,
  onClose,
}: {
  project: Project;
  onSeek: (t: number) => void;
  onApply: (kept: [number, number][]) => void;
  onClose: () => void;
}) {
  const words = useMemo(() => getCaptions(project).captions.flatMap((c) => c.words ?? []).sort((a, b) => a.start - b.start), [project]);
  const [plans, setPlans] = useState<SentencePlan[]>(() => planFromScript(project.script, words));
  const found = plans.filter((p) => p.chosen >= 0).length;
  const kept = keptRanges(plans, words);
  const keptTime = kept.reduce((s, [a, b]) => s + b - a, 0);
  const setChosen = (i: number, chosen: number) => setPlans((all) => all.map((p, k) => (k === i ? { ...p, chosen } : p)));

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[86vh] w-[min(640px,calc(100vw-48px))] animate-pop-in flex-col rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <ListOrdered size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Montar pelo roteiro')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-dim">
          {t(
            'Para cada frase do roteiro, o Lumiar achou as vezes em que você a disse e escolheu a melhor (normalmente a última que saiu completa). Clique no tempo para ouvir e use as setas para trocar de tentativa. Ao montar, só as escolhidas ficam.',
          )}
        </p>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {plans.map((p, i) => {
            const take = p.chosen >= 0 ? p.takes[p.chosen] : null;
            return (
              <div key={i} className={cx('rounded-lg border px-3 py-2', take ? 'border-line bg-panel-2' : 'border-danger/40 bg-danger/5')}>
                <p className="text-xs leading-snug">{p.sentence}</p>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
                  {take ? (
                    <>
                      <IconButton label={t('Tentativa anterior')} className="size-5" disabled={p.chosen <= 0} onClick={() => setChosen(i, p.chosen - 1)}>
                        <ChevronLeft size={12} />
                      </IconButton>
                      <button className="font-mono text-dim hover:text-accent" onClick={() => onSeek(take.start)} title={t('Ouvir esta tentativa')}>
                        {formatTime(take.start)} → {formatTime(take.end)}
                      </button>
                      <IconButton label={t('Próxima tentativa')} className="size-5" disabled={p.chosen >= p.takes.length - 1} onClick={() => setChosen(i, p.chosen + 1)}>
                        <ChevronRight size={12} />
                      </IconButton>
                      <span>
                        {t('tentativa {n} de {total} · {score}% igual ao roteiro', {
                          n: p.chosen + 1,
                          total: p.takes.length,
                          score: Math.round(take.score * 100),
                        })}
                      </span>
                      <span className="flex-1" />
                      <button className="hover:text-danger" onClick={() => setChosen(i, -1)} title={t('Tirar esta frase do vídeo')}>
                        {t('tirar')}
                      </button>
                    </>
                  ) : p.takes.length ? (
                    <button className="hover:text-accent" onClick={() => setChosen(i, p.takes.length - 1)}>
                      {t('Fora do vídeo · usar a última tentativa')}
                    </button>
                  ) : (
                    <span className="text-danger">{t('Não encontrei esta frase na gravação.')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <p className="flex-1 text-xs text-dim">
            {t('{found} de {total} frases · o vídeo fica com {time}', {
              found,
              total: plans.length,
              time: formatTime(keptTime).replace(/\.\d+$/, ''),
            })}
          </p>
          <Button onClick={onClose}>{t('Cancelar')}</Button>
          <Button variant="primary" icon={<ListOrdered size={14} />} disabled={!found} onClick={() => onApply(kept)}>
            {t('Montar')}
          </Button>
        </div>
      </div>
    </div>
  );
}
