import { Eye, LoaderCircle, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { analyzeGaze } from '../media/gaze';
import { createGaze, EYE_VALUES } from '../project/gaze';
import { updateClip, updateOverlayClip, type Project, type TimelineLayout, type VideoClip } from '../project/model';
import { startGazeFix, stopGazeFix, useGazeFix, type GazeFixTarget } from './gazeFix';
import { Button, SectionTitle, Slider, Switch } from './kit';

/**
 * Olhar para a câmera: acha os olhos em cada quadro do clipe (com o andamento em cima do preview) e
 * guarda no clipe. Depois, o preview e a exportação já mostram a correção; o ajuste fica no painel.
 */
export function GazeFixer(props: {
  timeline: TimelineLayout;
  setProject: (update: (p: Project) => Project) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const target = useGazeFix();
  if (!target) return null;
  return <Analysis key={`${target.kind}:${target.id}`} target={target} {...props} />;
}

function Analysis({
  target,
  timeline,
  setProject,
  notify,
}: {
  target: GazeFixTarget;
  timeline: TimelineLayout;
  setProject: (update: (p: Project) => Project) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const [fraction, setFraction] = useState(0);
  const abort = useRef<AbortController | null>(null);
  // O clipe fica fixo durante a análise (a timeline pode mudar enquanto isso).
  const [layout] = useState(() => (target.kind === 'clip' ? timeline.clips : timeline.overlays).find((l) => l.clip.id === target.id) ?? null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const setProjectRef = useRef(setProject);
  setProjectRef.current = setProject;

  useEffect(() => {
    if (!layout || layout.media.kind === 'audio') {
      stopGazeFix();
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    const { clip, media } = layout;
    analyzeGaze(media, clip.trimIn, media.kind === 'image' ? clip.trimIn : clip.trimOut, setFraction, controller.signal)
      .then((frames) => {
        if (controller.signal.aborted) return;
        const open = frames.filter((f) => f.eyes[EYE_VALUES - 1] > 0.5 || f.eyes[EYE_VALUES * 2 - 1] > 0.5).length;
        if (!open) {
          notifyRef.current(t('Não achei olhos abertos nesse clipe (o rosto precisa estar de frente e visível).'), true);
          return;
        }
        // Analisar de novo guarda a intensidade escolhida antes.
        const set = <T extends VideoClip>(c: T): T => ({
          ...c,
          gaze: { ...createGaze(media.id, frames), ...(c.gaze ? { strength: c.gaze.strength, vertical: c.gaze.vertical } : {}) },
        });
        setProjectRef.current((p) => (target.kind === 'clip' ? updateClip(p, target.id, set) : updateOverlayClip(p, target.id, set)));
        notifyRef.current(
          media.kind === 'image'
            ? t('Olhar corrigido. Ajuste a intensidade no painel do clipe, em Olhar para a câmera.')
            : t('Olhos encontrados em {n} quadro(s). Ajuste a intensidade no painel do clipe, em Olhar para a câmera.', { n: frames.length }),
        );
      })
      .catch((error) => {
        // Desmontado no meio (outra análise começou): sem aviso.
        if (controller.signal.aborted) {
          if (abort.current === controller) notifyRef.current(t('Correção do olhar cancelada.'));
        }
        else notifyRef.current(t('Não foi possível analisar o vídeo: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
      })
      .finally(() => abort.current === controller && stopGazeFix());
    return () => controller.abort();
  }, [layout, target]);

  if (!layout) return null;
  return (
    <div className="absolute bottom-4 left-1/2 z-30 flex min-w-64 -translate-x-1/2 flex-col gap-1.5 rounded-xl bg-black/80 px-4 py-2 text-xs text-dim backdrop-blur">
      <span className="flex items-center gap-2">
        <LoaderCircle size={13} className="animate-spin text-accent" />
        {t('Procurando os olhos… {n}%', { n: Math.round(fraction * 100) })}
        <Button className="ml-auto h-6 text-[11px]" icon={<X size={11} />} onClick={() => abort.current?.abort()}>
          {t('Parar')}
        </Button>
      </span>
      <span className="h-1 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(fraction * 100)}%` }} />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Painel do clipe

function Row({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-dim">{label}</span>
        <span className="font-mono text-[11px]">{Math.round(value * 100)}%</span>
      </div>
      <Slider label={label} value={value} min={0} max={1} step={0.01} onChange={onChange} />
    </div>
  );
}

/** "Olhar para a câmera" no painel do clipe: ligar, intensidade, vertical, analisar de novo e remover. */
export function GazeSection({
  clip,
  target,
  onChange,
}: {
  clip: VideoClip;
  target: GazeFixTarget;
  onChange: (update: (clip: VideoClip) => VideoClip) => void;
}) {
  const gaze = clip.gaze;
  if (!gaze) return null;
  const edit = (patch: Partial<NonNullable<VideoClip['gaze']>>) => onChange((c) => (c.gaze ? { ...c, gaze: { ...c.gaze, ...patch } } : c));
  const stale = !!gaze.mediaId && gaze.mediaId !== clip.mediaId;
  return (
    <>
      <SectionTitle extra={<Switch checked={gaze.enabled} onChange={(enabled) => edit({ enabled })} label={t('Corrigir o olhar')} />}>
        {t('Olhar para a câmera')}
      </SectionTitle>
      {stale ? (
        <p className="text-[11px] leading-snug text-amber-300">{t('A mídia do clipe mudou: analise de novo para corrigir o olhar.')}</p>
      ) : (
        <>
          <Row label={t('Intensidade')} value={gaze.strength} onChange={(strength) => edit({ strength })} />
          <Row label={t('Na vertical')} value={gaze.vertical} onChange={(vertical) => edit({ vertical })} />
        </>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Button className="h-7 text-xs" icon={stale ? <Eye size={12} /> : <RotateCcw size={12} />} onClick={() => startGazeFix(target)}>
          {t('Analisar de novo')}
        </Button>
        <Button variant="ghost" className="h-7 text-xs" icon={<Trash2 size={12} />} onClick={() => onChange((c) => ({ ...c, gaze: undefined }))}>
          {t('Remover')}
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-faint">
        {t('Leva a íris para onde ela estaria olhando para a lente, só dentro do olho. Funciona melhor com o rosto de frente e correções pequenas (quem lê logo abaixo da câmera). Olho fechado ou piscando não mexe.')}
      </p>
    </>
  );
}
