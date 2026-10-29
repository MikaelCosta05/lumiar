import { IdCard } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { BrandKit } from '../project/brand';
import { getCaptions, updateCaptions, type CaptionTrack } from '../project/captions';
import type { Project } from '../project/model';
import { addSpeakerNames, firstAppearances, type SpeakerLabel } from '../project/speakerNames';
import { loadBrandKit } from '../project/storage';
import { t } from '../i18n';
import { formatTime } from './format';
import { Button, Segmented, SwitchRow } from './kit';

interface Props {
  project: Project;
  track: CaptionTrack;
  onChange: (update: (project: Project) => Project) => void;
  notify: (text: string, error?: boolean) => void;
}

/**
 * "Pôr o nome de cada pessoa na tela": pergunta o nome (e, se quiser, o cargo) de cada voz e cria uma
 * faixa de nome na primeira vez que cada uma fala. Fica na seção "Quem fala" das legendas.
 */
export function SpeakerNames({ project, track, onChange, notify }: Props) {
  const speakers = track.speakers ?? [];
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<SpeakerLabel[]>([]);
  const [duration, setDuration] = useState(4);
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [useBrand, setUseBrand] = useState(true);

  useEffect(() => {
    if (!open) return;
    // "Pessoa 1" é o nome provisório: o campo começa vazio para a pessoa digitar o nome de verdade.
    setLabels(speakers.map((s, i) => ({ name: s.name === t('Pessoa {n}', { n: i + 1 }) ? '' : s.name, role: '' })));
    loadBrandKit()
      .then(setBrand)
      .catch(() => setBrand(null));
  }, [open, speakers.length]);

  if (speakers.length === 0) return null;
  const firsts = firstAppearances(track.captions, duration);
  const ready = labels.some((l) => l.name.trim());

  const create = () => {
    const kit = useBrand ? brand : null;
    const { count } = addSpeakerNames(project, track, labels, duration, kit);
    onChange((p) => {
      const result = addSpeakerNames(p, getCaptions(p), labels, duration, kit).project;
      // Os nomes também passam a valer nas legendas ("Mostrar o nome acima da legenda").
      return updateCaptions(result, (tr) => ({ ...tr, speakers: tr.speakers?.map((s, i) => ({ ...s, name: labels[i]?.name.trim() || s.name })) }));
    });
    notify(t('{n} nome(s) na tela, na primeira fala de cada pessoa. Cada um é um texto comum: clique nele na timeline para mudar.', { n: count }), count === 0);
    if (count) setOpen(false);
  };

  if (!open) {
    return (
      <Button variant="secondary" className="h-8 w-full text-xs" icon={<IdCard size={13} />} onClick={() => setOpen(true)}>
        {t('Pôr o nome de cada pessoa na tela')}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-line bg-panel p-2">
      <p className="text-[11px] leading-snug text-faint">{t('Como se chama cada voz? O nome aparece embaixo, na primeira vez que a pessoa fala.')}</p>
      {speakers.map((sp, i) => {
        const first = firsts.find((f) => f.speaker === i);
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] text-faint">
              <span className="size-2.5 rounded-full" style={{ background: sp.color }} />
              {t('Pessoa {n}', { n: i + 1 })}
              {first && <span className="ml-auto font-mono">{formatTime(first.start)}</span>}
            </div>
            <input
              className="field h-7 w-full text-xs"
              placeholder={t('Nome (vazio = sem nome na tela)')}
              value={labels[i]?.name ?? ''}
              onChange={(e) => setLabels((list) => list.map((l, j) => (j === i ? { ...l, name: e.target.value } : l)))}
            />
            <input
              className="field h-7 w-full text-xs"
              placeholder={t('Cargo ou @perfil (opcional)')}
              value={labels[i]?.role ?? ''}
              onChange={(e) => setLabels((list) => list.map((l, j) => (j === i ? { ...l, role: e.target.value } : l)))}
            />
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2 text-[11px] text-dim">
        <span>{t('Tempo na tela')}</span>
        <Segmented
          mono
          value={duration}
          onChange={setDuration}
          options={[3, 4, 6].map((s) => ({ value: s, label: `${s}s` }))}
        />
      </div>
      {brand && <SwitchRow checked={useBrand} onChange={setUseBrand} label={t('Cores e fonte do Kit da marca')} />}
      <div className="flex gap-1.5">
        <Button variant="ghost" className="h-8 text-xs" onClick={() => setOpen(false)}>
          {t('Cancelar')}
        </Button>
        <Button variant="primary" className="h-8 flex-1 whitespace-nowrap text-xs" disabled={!ready} onClick={create}>
          {t('Criar os nomes')}
        </Button>
      </div>
    </div>
  );
}
