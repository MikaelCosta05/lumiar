import { Crosshair, MousePointerClick, ScanLine, Trash2 } from 'lucide-react';
import { t, tc } from '../i18n';
import type { MaskFollow } from '../project/maskFollow';
import { speedOf, type OverlayClip } from '../project/model';
import { Button, SectionTitle, Segmented, SwitchRow } from './kit';
import { startObjectPick } from './objectPick';
import { requestTracking } from './trackingStore';

/** "Trocar a tela" na aba Posição da sobreposição. */
export function CornerPinSection({ clip, onChange }: { clip: OverlayClip; onChange: (update: (clip: OverlayClip) => OverlayClip) => void }) {
  const pin = clip.cornerPin;
  return (
    <>
      <SectionTitle>{t('Trocar a tela (4 cantos)')}</SectionTitle>
      <p className="text-[11px] leading-snug text-faint">
        {pin
          ? pin.track?.length
            ? t('A camada está dentro de 4 cantos do vídeo de baixo, rastreados em {n} quadros. Tamanho e posição acima não valem enquanto isso.', { n: pin.track.length })
            : t('A camada está dentro de 4 cantos parados do vídeo de baixo. Tamanho e posição acima não valem enquanto isso.')
          : t('Ponha esta camada dentro da tela de um celular, de um quadro ou de uma placa do vídeo de baixo: marque os 4 cantos e o Lumiar segue o movimento.')}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Button className="h-7 text-xs" icon={<ScanLine size={12} />} onClick={() => requestTracking({ kind: 'corners', id: clip.id })}>
          {pin ? t('Ajustar os cantos no cursor…') : t('Marcar os 4 cantos…')}
        </Button>
        {pin && (
          <Button variant="ghost" className="h-7 text-xs" icon={<Trash2 size={12} />} onClick={() => onChange((c) => ({ ...c, cornerPin: undefined }))}>
            {t('Desfazer a troca de tela')}
          </Button>
        )}
      </div>
    </>
  );
}

/** "A forma acompanha": logo abaixo da forma (máscara) da sobreposição. */
export function MaskFollowSection({
  clip,
  clipTime,
  onChange,
}: {
  clip: OverlayClip;
  /** Cursor dentro do clipe (s) */
  clipTime: number;
  onChange: (update: (clip: OverlayClip) => OverlayClip) => void;
}) {
  const mask = clip.transform.mask;
  if (!mask) return null;
  const follow = clip.transform.maskFollow ?? null;
  const hasObject = !!clip.object?.frames.some((f) => f.area > 0);
  const now = Math.round((clip.trimIn + clipTime * speedOf(clip)) * 1000) / 1000;
  const set = (next: MaskFollow | null) => onChange((c) => ({ ...c, transform: { ...c.transform, maskFollow: next } }));
  const value = follow?.kind ?? 'none';
  return (
    <>
      <SectionTitle>{t('A forma acompanha')}</SectionTitle>
      <Segmented
        options={[
          { value: 'none', label: tc('forma', 'Nada'), title: t('A forma fica parada (ou com os keyframes dela)') },
          { value: 'point', label: t('Um ponto'), title: t('Um ponto do vídeo rastreado quadro a quadro') },
          { value: 'object', label: t('O objeto'), title: t('O objeto escolhido em "Selecionar objeto"') },
        ]}
        value={value}
        onChange={(kind) => {
          if (kind === 'none') return set(null);
          if (kind === 'object') {
            if (!hasObject) {
              startObjectPick({ kind: 'overlay', id: clip.id });
              return;
            }
            return set({ kind: 'object', at: follow?.at ?? now, scale: follow?.scale ?? true, rotate: false });
          }
          // Ponto: com rastro guardado, volta a usá-lo; sem, rastreia o centro da forma.
          if (follow?.track?.length) return set({ ...follow, kind: 'point' });
          requestTracking({ kind: 'maskCenter', id: clip.id });
        }}
      />
      {follow && (
        <div className="mt-2 flex flex-col gap-1">
          <SwitchRow checked={follow.scale} onChange={(scale) => set({ ...follow, scale })} label={t('Crescer e diminuir junto')} />
          {follow.kind === 'point' && mask.shape === 'path' && (
            <SwitchRow checked={follow.rotate} onChange={(rotate) => set({ ...follow, rotate })} label={t('Girar junto')} />
          )}
        </div>
      )}
      {(value === 'point' || (!follow && mask)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button className="h-7 text-xs" icon={<Crosshair size={12} />} onClick={() => requestTracking({ kind: 'maskCenter', id: clip.id })}>
            {follow?.kind === 'point' ? t('Rastrear de novo o centro') : t('Rastrear o centro da forma')}
          </Button>
          <Button className="h-7 text-xs" icon={<MousePointerClick size={12} />} onClick={() => requestTracking({ kind: 'maskPoint', id: clip.id })}>
            {t('Escolher o ponto no vídeo…')}
          </Button>
        </div>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-faint">
        {follow?.kind === 'object'
          ? t('A forma anda com o centro do objeto selecionado (e cresce com ele, se ligado).')
          : follow?.kind === 'point'
            ? t('A forma anda com o ponto rastreado no vídeo desta camada. Para ajustar, desenhe a forma em qualquer instante.')
            : t('Rastreia um ponto do vídeo desta camada (o rastreamento começa no cursor) ou usa o objeto de "Selecionar objeto".')}
      </p>
    </>
  );
}
