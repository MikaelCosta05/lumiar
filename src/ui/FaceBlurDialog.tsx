import { ScanFace, X } from 'lucide-react';
import { useState } from 'react';
import type { FaceTrack } from '../media/tracking';
import { t } from '../i18n';
import { Button, cx, IconButton, Segmented, Slider } from './kit';

export interface FaceBlurChoice {
  tracks: FaceTrack[];
  pixelate: boolean;
  strength: number;
}

/** Os rostos encontrados no clipe: marque os que devem ser escondidos. */
export function FaceBlurDialog({ tracks, onApply, onClose }: { tracks: FaceTrack[]; onApply: (choice: FaceBlurChoice) => void; onClose: () => void }) {
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(tracks.map((_, i) => i)));
  const [pixelate, setPixelate] = useState(false);
  const [strength, setStrength] = useState(0.7);
  const toggle = (i: number) =>
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[480px] animate-pop-in rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <ScanFace size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Desfocar rostos')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-dim">
          {t(
            'Achei {n} rosto(s) no clipe. Os marcados são escondidos e o desfoque acompanha cada um enquanto se mexe. Desmarque quem deve continuar aparecendo (você, por exemplo).',
            { n: tracks.length },
          )}
        </p>
        <div className="mb-4 grid max-h-64 grid-cols-5 gap-2 overflow-y-auto">
          {tracks.map((track, i) => (
            <button
              key={i}
              onClick={() => toggle(i)}
              title={t('{n} aparições · de {from}s a {to}s', {
                n: track.points.length,
                from: track.points[0].t.toFixed(1),
                to: track.points[track.points.length - 1].t.toFixed(1),
              })}
              className={cx('relative overflow-hidden rounded-lg ring-2 transition', chosen.has(i) ? 'ring-accent' : 'opacity-50 ring-line')}
            >
              <img src={track.thumb} alt={t('Rosto {n}', { n: i + 1 })} className="aspect-square w-full object-cover" />
              <span className={cx('absolute right-1 top-1 flex size-4 items-center justify-center rounded text-[10px] font-bold', chosen.has(i) ? 'bg-accent text-white' : 'bg-black/60 text-faint')}>
                {chosen.has(i) ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>
        <div className="space-y-2.5">
          <Segmented
            options={[
              { value: 'blur', label: t('Desfoque') },
              { value: 'pixel', label: t('Pixels') },
            ]}
            value={pixelate ? 'pixel' : 'blur'}
            onChange={(v) => setPixelate(v === 'pixel')}
          />
          <div className="flex items-center justify-between text-[11px] text-dim">
            <span>{t('Força')}</span>
            <span className="font-mono">{Math.round(strength * 100)}%</span>
          </div>
          <Slider label={t('Força')} value={strength} min={0.2} max={1} step={0.05} onChange={setStrength} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>{t('Cancelar')}</Button>
          <Button
            variant="primary"
            icon={<ScanFace size={14} />}
            disabled={chosen.size === 0}
            onClick={() => onApply({ tracks: tracks.filter((_, i) => chosen.has(i)), pixelate, strength })}
          >
            {t('Desfocar {n} rosto(s)', { n: chosen.size })}
          </Button>
        </div>
      </div>
    </div>
  );
}
