import { Package, PackagePlus, Palette, SlidersHorizontal, Sparkles, Trash, Video } from 'lucide-react';
import type { ReactNode } from 'react';
import { getPlugin } from '../engine/registry';
import type { EffectInstance } from '../engine/types';
import { createCamera } from '../project/camera';
import { MIN_PACK_LENGTH, retimePack, templateFromClip, type PackClip } from '../project/packs';
import { gradeIsNeutral } from '../project/grade';
import type { SavedLut } from '../project/lut';
import { CameraPanel } from './CameraPanel';
import { GradeSection, LutSection } from './ColorTools';
import { formatTime } from './format';
import { isAdjustmentBlock } from '../project/adjustmentBlock';
import { Chip, EffectsPanel, FilterPanel, LabeledSlider, QuickAdjust, Tip } from './Inspector';
import { InspectorHeader, InspectorPanel } from './InspectorPanel';
import { cx, IconButton, SectionTitle, Segmented, SwitchRow, Tabs, type TabItem } from './kit';
import type { KeyframeContext } from './keyframeUi';
import { saveUserPack } from './packStore';
import { t, tc } from '../i18n';

export type PackTab = 'pack' | 'color' | 'effects' | 'camera';

/** Painel de um bloco de pacote de edição. */
export function PackInspector({
  clip,
  trackName,
  ctx,
  tab,
  onTab,
  onChange,
  onRemove,
  notify,
  onMuteSlow,
  attachedCount,
  colors,
}: {
  clip: PackClip;
  trackName: string;
  ctx: KeyframeContext;
  tab: PackTab;
  onTab: (tab: PackTab) => void;
  onChange: (update: (clip: PackClip) => PackClip) => void;
  onRemove: () => void;
  notify: (text: string) => void;
  /** Liga/desliga o som do vídeo no trecho lento (pacotes de velocidade) */
  onMuteSlow: (muted: boolean) => void;
  /** Textos, stickers e sons que vieram com o pacote (só em blocos de versões antigas) */
  attachedCount: number;
  /** LUTs do projeto (a aba Cor importa e escolhe, como no clipe) */
  colors: { luts: SavedLut[]; onAddLut: (lut: SavedLut) => void; notify: (text: string) => void };
}) {
  const setEffects = (update: (effects: EffectInstance[]) => EffectInstance[]) => onChange((c) => ({ ...c, effects: update(c.effects) }));
  const moving = !!clip.camera && Object.keys(clip.camera.keyframes).length > 0;
  const zoomed = !!clip.camera && (clip.camera.base.zoom !== 1 || clip.camera.base.rotation !== 0);
  const dot = <span className="size-1.5 shrink-0 rounded-full bg-accent" />;
  const save = () => {
    saveUserPack(templateFromClip(clip, 'cursor', colors.luts));
    notify(t('"{name}" salvo em Pacotes → Meus pacotes.', { name: clip.name }));
  };

  const tabs: TabItem<PackTab>[] = [
    { id: 'pack', label: t('Pacote'), icon: <SlidersHorizontal size={14} /> },
    { id: 'color', label: t('Cor'), icon: <Palette size={14} />, badge: clip.filter || !gradeIsNeutral(clip.grade) || clip.lut ? dot : undefined },
    {
      id: 'effects',
      label: t('Efeitos'),
      icon: <Sparkles size={14} />,
      badge: clip.effects.length > 0 ? <span className="rounded-full bg-accent-2 px-1 text-[9px] leading-[14px] text-white">{clip.effects.length}</span> : undefined,
    },
    { id: 'camera', label: t('Câmera'), icon: <Video size={14} />, badge: moving || zoomed ? dot : undefined },
  ];

  const maxFade = Math.min(3, clip.duration / 2);
  const adjustment = isAdjustmentBlock(clip);

  return (
    <InspectorPanel
      header={
        <InspectorHeader
          thumb={
            <span className="flex size-full items-center justify-center text-white" style={{ background: clip.color }}>
              <Package size={20} />
            </span>
          }
          kicker={adjustment ? t('Bloco de ajuste · {track}', { track: trackName }) : t('Pacote de edição · {track}', { track: trackName })}
          title={clip.name}
          chips={
            <>
              <Chip>{formatTime(clip.duration)}</Chip>
              <Chip>{Math.round(clip.intensity * 100)}%</Chip>
            </>
          }
          actions={
            <>
              <IconButton label={t('Salvar como meu pacote')} onClick={save}>
                <PackagePlus size={14} />
              </IconButton>
              <IconButton label={t('Remover bloco')} className="hover:!text-danger" onClick={onRemove}>
                <Trash size={14} />
              </IconButton>
            </>
          }
        />
      }
      tabs={<Tabs tabs={tabs} value={tab} onChange={onTab} />}
    >
      {tab === 'pack' && (
        <>
          {adjustment && (
            <Tip>
              {t('Bloco de ajuste: escolha o filtro e a cor na aba Cor, os efeitos na aba Efeitos e o movimento na aba Câmera. Tudo vale para o que está embaixo do bloco, só neste trecho.')}
            </Tip>
          )}
          <SectionTitle>{t('Nome')}</SectionTitle>
          <input
            className="field w-full"
            value={clip.name}
            onChange={(e) => {
              const name = e.target.value;
              onChange((c) => ({ ...c, name }));
            }}
          />

          <SectionTitle>{t('Quanto aparece')}</SectionTitle>
          <LabeledSlider
            label={t('Intensidade')}
            value={clip.intensity}
            display={`${Math.round(clip.intensity * 100)}%`}
            min={0}
            max={1}
            step={0.01}
            onChange={(intensity) => onChange((c) => ({ ...c, intensity }))}
          />
          <LabeledSlider
            label={t('Entrada suave')}
            value={Math.min(clip.fadeIn, maxFade)}
            display={`${clip.fadeIn.toFixed(1)}s`}
            min={0}
            max={maxFade}
            step={0.05}
            onChange={(fadeIn) => onChange((c) => ({ ...c, fadeIn }))}
          />
          <LabeledSlider
            label={t('Saída suave')}
            value={Math.min(clip.fadeOut, maxFade)}
            display={`${clip.fadeOut.toFixed(1)}s`}
            min={0}
            max={maxFade}
            step={0.05}
            onChange={(fadeOut) => onChange((c) => ({ ...c, fadeOut }))}
          />

          <SectionTitle>{tc('seção', 'Tempo')}</SectionTitle>
          <LabeledSlider
            label={t('Duração')}
            value={clip.duration}
            display={formatTime(clip.duration)}
            min={MIN_PACK_LENGTH}
            max={Math.max(30, clip.duration)}
            step={0.05}
            onChange={(d) => onChange((c) => retimePack(c, d))}
          />
          <p className="mb-1.5 mt-2 text-xs text-dim">{t('Ao mudar o tamanho do bloco')}</p>
          <Segmented
            value={clip.timing}
            onChange={(timing) => onChange((c) => ({ ...c, timing }))}
            options={[
              { value: 'edges', label: t('Entrada e saída'), title: t('O que acontece no começo e no fim mantém a duração; o meio estica') },
              { value: 'stretch', label: t('Esticar tudo'), title: t('A animação inteira fica mais lenta ou mais rápida junto com o bloco') },
              { value: 'fixed', label: t('Fixo'), title: t('Nada se move: as animações ficam no mesmo instante (ideal para pacotes presos às batidas)') },
            ]}
          />

          {clip.speed && (
            <>
              <SectionTitle>{t('Câmera lenta')}</SectionTitle>
              <Tip>
                {t('A linha branca com ◆ no bloco marca o momento da câmera lenta. Arraste-a até o instante exato (o tombo, o susto…) e o vídeo é refeito ali.')}
              </Tip>
              {clip.speed.speeds.some((v) => v < 1) && (
                <div className="mt-2">
                  <SwitchRow checked={!!clip.speed.muted} onChange={onMuteSlow} label={t('Silenciar o som do vídeo no trecho lento')} />
                </div>
              )}
            </>
          )}
          {attachedCount > 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              {attachedCount === 1
                ? t('1 texto, sticker ou som veio com o pacote: eles andam junto com o bloco e saem quando ele é excluído.')
                : t('{n} textos, stickers e sons vieram com o pacote: eles andam junto com o bloco e saem quando ele é excluído.', { n: attachedCount })}
            </p>
          )}

          <SectionTitle>{t('O que tem neste pacote')}</SectionTitle>
          <div className="space-y-1.5">
            <Part
              icon={<Palette size={13} />}
              label={t('Filtro')}
              detail={clip.filter ? (getPlugin(clip.filter.pluginId)?.name ?? t('Filtro')) : t('Nenhum')}
              onOpen={() => onTab('color')}
            />
            {clip.effects.map((effect) => (
              <Part
                key={effect.uid}
                icon={<Sparkles size={13} />}
                label={t('Efeito')}
                detail={getPlugin(effect.pluginId)?.name ?? effect.pluginId}
                dim={!effect.enabled}
                onOpen={() => onTab('effects')}
                toggle={{
                  checked: effect.enabled,
                  onChange: (enabled) => setEffects((list) => list.map((e) => (e.uid === effect.uid ? { ...e, enabled } : e))),
                }}
              />
            ))}
            <Part
              icon={<Video size={13} />}
              label={t('Câmera')}
              detail={moving ? t('Com movimento') : zoomed ? t('Enquadramento fixo') : t('Parada')}
              onOpen={() => onTab('camera')}
            />
          </div>
          <Tip>
            {t('O pacote vale para tudo o que está embaixo dele na timeline (vídeo principal e sobreposições), só neste trecho. Arraste as bordas do bloco para encaixar no seu vídeo.')}
          </Tip>
        </>
      )}

      {tab === 'color' && (
        <>
          {/* Correção de cor do pacote: brilho, contraste, saturação e temperatura (o efeito "Ajuste de cor"). */}
          <QuickAdjust effects={clip.effects} onChange={setEffects} />
          <FilterPanel ctx={ctx} filter={clip.filter} onChange={(filter) => onChange((c) => ({ ...c, filter }))} />
          {/* Cor manual e LUT, como na aba Cor do clipe: valem para tudo o que está embaixo do bloco. */}
          <GradeSection grade={clip.grade} onChange={(grade) => onChange((c) => ({ ...c, grade }))} />
          <LutSection {...colors} lut={clip.lut} onChange={(lut) => onChange((c) => ({ ...c, lut }))} onImport={colors.onAddLut} />
        </>
      )}

      {tab === 'effects' && <EffectsPanel ctx={ctx} effects={clip.effects} onChange={setEffects} title={t('Neste pacote')} />}

      {tab === 'camera' && (
        <CameraPanel
          camera={clip.camera}
          ctx={ctx}
          clipLength={clip.duration}
          onCamera={(update) => onChange((c) => ({ ...c, camera: update(c.camera ?? createCamera()) }))}
        />
      )}
    </InspectorPanel>
  );
}

function Part({
  icon,
  label,
  detail,
  dim,
  onOpen,
  toggle,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  dim?: boolean;
  onOpen: () => void;
  toggle?: { checked: boolean; onChange: (v: boolean) => void };
}) {
  return (
    <div className={cx('flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5', dim && 'opacity-50')}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={t('Abrir para ajustar')}>
        <span className="text-faint">{icon}</span>
        <span className="text-[11px] text-faint">{label}</span>
        <span className="truncate text-xs text-fg">{detail}</span>
      </button>
      {toggle && <SwitchRow checked={toggle.checked} label={t('Ligar {name}', { name: detail })} onChange={toggle.onChange} />}
    </div>
  );
}
