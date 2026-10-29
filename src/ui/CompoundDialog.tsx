import { Boxes, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { extractRange } from '../project/compound';
import { layoutProject, type Project } from '../project/model';
import { t } from '../i18n';
import { formatTime } from './format';
import { Button, IconButton, Slider } from './kit';

/**
 * Escolher o trecho do clipe composto. Entra tudo o que está inteiro dentro do trecho: os clipes da
 * trilha principal (cortados nas pontas) e os textos, sons, camadas e pacotes por cima deles.
 */
export function CompoundDialog({
  project,
  from: initialFrom,
  to: initialTo,
  onCreate,
  onClose,
}: {
  project: Project;
  from: number;
  to: number;
  onCreate: (from: number, to: number) => void;
  onClose: () => void;
}) {
  const end = layoutProject(project).videoDuration;
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(Math.min(end, initialTo));
  const extracted = useMemo(() => extractRange(project, from, to), [project, from, to]);
  const sub = extracted?.sub;
  const count = (n: number, one: string, many: string) => (n ? (n > 1 ? many : one).replace('{n}', String(n)) : null);
  const summary = sub
    ? [
        count(sub.clips.length, t('{n} clipe'), t('{n} clipes')),
        count(sub.textTracks.reduce((n, track) => n + track.clips.length, 0), t('{n} texto'), t('{n} textos')),
        count(sub.audioTracks.reduce((n, track) => n + track.clips.length, 0), t('{n} som'), t('{n} sons')),
        count(sub.videoTracks.reduce((n, track) => n + track.clips.length, 0), t('{n} camada'), t('{n} camadas')),
        count(sub.packTracks.reduce((n, track) => n + track.clips.length, 0), t('{n} pacote'), t('{n} pacotes')),
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[420px] animate-pop-in rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <Boxes size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Clipe composto')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-dim">
          {t(
            'O trecho vira um clipe só na trilha principal: dá para pôr um efeito, um filtro ou uma velocidade em tudo de uma vez. Para mexer por dentro, clique direito nele →',
          )}{' '}
          <b>{t('Abrir o clipe composto')}</b>.
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-dim">
            <span>{t('Começa em')}</span>
            <span className="font-mono">{formatTime(from)}</span>
          </div>
          <Slider label={t('Começo')} value={from} min={0} max={end} step={0.05} onChange={(v) => setFrom(Math.min(v, to - 0.2))} />
          <div className="flex items-center justify-between text-[11px] text-dim">
            <span>{t('Termina em')}</span>
            <span className="font-mono">{formatTime(to)}</span>
          </div>
          <Slider label={t('Fim')} value={to} min={0} max={end} step={0.05} onChange={(v) => setTo(Math.max(v, from + 0.2))} />
          <p className="rounded-lg bg-panel-2 px-3 py-2 text-xs text-dim">
            {sub ? (
              <>
                <b className="text-fg">{(to - from).toFixed(1)}s</b>{' '}
                {t('com {summary}. Itens que atravessam as pontas ficam de fora.', { summary: summary || t('nada') })}
              </>
            ) : (
              t('Escolha um trecho com vídeo na trilha principal.')
            )}
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>{t('Cancelar')}</Button>
          <Button variant="primary" icon={<Boxes size={14} />} disabled={!sub} onClick={() => onCreate(from, to)}>
            {t('Criar clipe composto')}
          </Button>
        </div>
      </div>
    </div>
  );
}
