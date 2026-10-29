import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  RotateCw,
  AudioLines,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Layers,
  Lightbulb,
  Mic,
  Move,
  Palette,
  Plus,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Trash,
  Unlink,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { SpeedCurve } from './SpeedCurve';
import { applySpeed } from '../project/packs';
import { BackgroundSection, GradeSection, LutSection, MaskSection } from './ColorTools';
import { ObjectCutoutSection } from './ObjectPicker';
import { GazeSection } from './GazeFixer';
import { CornerPinSection, MaskFollowSection } from './TrackingSections';
import type { SavedLut } from '../project/lut';
import { deleteMainClip } from '../project/ripple';
import { effectPlugins, filterPlugins, getPlugin, paramDefault, transitionPlugins } from '../engine/registry';
import type { Keyframe, KeyframeMap } from '../engine/keyframes';
import type { EffectInstance, FilterInstance, ParamValue } from '../engine/types';
import {
  clipLength,
  layoutProject,
  speedOf,
  type Interpolation,
  createEffect,
  createFilter,
  createTransition,
  findAudioClip,
  findOverlayClip,
  turnClip,
  removeOverlayClip,
  updateOverlayClip,
  type BlendMode,
  type LayerTransform,
  type OverlayClip,
  getMedia,
  moveClip,
  removeAudioClip,
  setTransition,
  updateAudioClip,
  updateClip,
  type AudioClip,
  type MediaItem,
  type Project,
  type TransitionInstance,
  type VideoClip,
} from '../project/model';
import { createCamera } from '../project/camera';
import { deletePack, findPackClip, setSlowMuted, updatePackClip } from '../project/packs';
import { formatTime } from './format';
import { PackInspector, type PackTab } from './PackInspector';
import { Button, cx, IconButton, Kbd, SectionTitle, Segmented, Slider, Switch, Tabs, type TabItem } from './kit';
import { CameraPanel } from './CameraPanel';
import { MotionBlurProvider } from './MotionBlurControl';
import { bindKeyframes, type KeyframeContext } from './keyframeUi';
import { LivePreview } from './LivePreview';
import { ParamControl } from './ParamControl';
import { VOICE_EFFECTS } from '../media/voiceFx';
import { PluginPicker } from './PluginPicker';
import { InspectorHeader, InspectorPanel } from './InspectorPanel';
import { usePluginPreviews } from './previews';
import type { Selection } from './selection';
import { TextInspector, type TextTab } from './TextInspector';
import { findTextClip, removeTextClip, updateTextClip } from '../project/text';
import { t, tc } from '../i18n';
import { requestShortcutsDialog, shortcutLabel, useShortcutsVersion } from '../app/shortcuts';

interface Props {
  project: Project;
  selection: Selection;
  /** Posição do cursor na timeline (para os keyframes) */
  time: number;
  onSeek: (time: number) => void;
  onChange: (update: (project: Project) => Project) => void;
  onSelect: (selection: Selection) => void;
  onDetach: (clipId: string) => void;
  onFollowFace: (clipId: string) => void;
  onPickPoint: (clipId: string) => void;
  /** Desenhar a forma (máscara) de uma camada no vídeo */
  onDrawMask: (clipId: string) => void;
  /** Texto: escolher o ponto do vídeo que ele vai seguir */
  onPickTextPoint: (textId: string) => void;
  /** Leva um clipe sobreposto para a trilha principal */
  onToMain: (clipId: string) => void;
  /** Ajusta o volume do áudio para o pico ficar em -1 dB */
  onNormalize: (clipId: string) => void;
  /** Tira o ruído de fundo (cria uma cópia limpa do áudio) */
  onCleanAudio: (target: { kind: 'audio' | 'clip'; id: string }, strength: number) => void;
  /** Clipe esperando o clique no vídeo para escolher o ponto a seguir */
  picking: string | null;
  notify: (text: string) => void;
  /** Cortes na trilha principal levam o resto junto */
  ripple: boolean;
}

/** O que os painéis de cor precisam do projeto (LUTs importadas). */
interface ColorContext {
  luts: SavedLut[];
  onAddLut: (lut: SavedLut) => void;
  notify: (text: string) => void;
}

/** Painel da direita: propriedades do que está selecionado. */
export function Inspector(props: Props) {
  const { project, selection, time, onSeek, onChange, onSelect, onDetach } = props;
  const timeline = useMemo(() => layoutProject(project), [project]);
  // A aba aberta continua a mesma ao trocar de clipe (ex.: ajustar a cor de vários clipes seguidos).
  const [clipTab, setClipTab] = useState<ClipTab>('basic');
  const [textTab, setTextTab] = useState<TextTab>('text');
  const [overlayTab, setOverlayTab] = useState<OverlayTab>('place');
  const [packTab, setPackTab] = useState<PackTab>('pack');
  let content: ReactNode = <EmptyInspector />;
  const colors: ColorContext = {
    luts: project.luts ?? [],
    onAddLut: (lut) => onChange((p) => ({ ...p, luts: [...(p.luts ?? []), lut] })),
    notify: props.notify,
  };

  if (selection?.kind === 'clip') {
    const index = project.clips.findIndex((c) => c.id === selection.id);
    const clip = project.clips[index];
    const media = clip && getMedia(project, clip.mediaId);
    const layout = timeline.clips.find((l) => l.clip.id === selection.id);
    if (clip && media && layout) {
      const ctx: KeyframeContext = {
        clipTime: Math.min(Math.max(0, time - layout.start), layout.length),
        seek: (t) => onSeek(layout.start + t),
      };
      content = (
        <ClipInspector
          key={clip.id}
          clip={clip}
          media={media}
          index={index}
          count={project.clips.length}
          ctx={ctx}
          length={layout.length}
          tab={clipTab}
          onTab={setClipTab}
          onFollowFace={() => props.onFollowFace(clip.id)}
          onPickPoint={() => props.onPickPoint(clip.id)}
          picking={props.picking === clip.id}
          onChange={(update) => onChange((p) => updateClip(p, clip.id, update))}
          onMove={(delta) => onChange((p) => moveClip(p, clip.id, delta))}
          onDetach={() => onDetach(clip.id)}
          colors={colors}
          onSpeedCurve={(speeds) => {
            onChange((p) => applySpeed(p, layout.start, layout.length, speeds)?.project ?? p);
            props.notify(t('Curva de velocidade aplicada: o clipe virou pedacinhos com a velocidade de cada ponto.'));
          }}
          onRemove={() => {
            onChange((p) => deleteMainClip(p, clip.id, props.ripple));
            onSelect(null);
          }}
        />
      );
    }
  } else if (selection?.kind === 'overlay') {
    const found = findOverlayClip(project, selection.id);
    const media = found && getMedia(project, found.clip.mediaId);
    if (found && media) {
      const clip = found.clip;
      const ctx: KeyframeContext = {
        clipTime: Math.min(Math.max(0, time - clip.start), clipLength(clip)),
        seek: (t) => onSeek(clip.start + t),
      };
      content = (
        <OverlayInspector
          key={clip.id}
          clip={clip}
          media={media}
          trackName={found.track.name}
          ctx={ctx}
          tab={overlayTab}
          onTab={setOverlayTab}
          onChange={(update) => onChange((p) => updateOverlayClip(p, clip.id, update))}
          onToMain={() => props.onToMain(clip.id)}
          onDrawMask={() => props.onDrawMask(clip.id)}
          colors={colors}
          onRemove={() => {
            onChange((p) => removeOverlayClip(p, clip.id));
            onSelect(null);
          }}
        />
      );
    }
  } else if (selection?.kind === 'pack') {
    const found = findPackClip(project, selection.id);
    if (found) {
      const clip = found.clip;
      const ctx: KeyframeContext = {
        clipTime: Math.min(Math.max(0, time - clip.start), clip.duration),
        seek: (t) => onSeek(clip.start + t),
      };
      content = (
        <PackInspector
          key={clip.id}
          clip={clip}
          trackName={found.track.name}
          ctx={ctx}
          tab={packTab}
          onTab={setPackTab}
          notify={props.notify}
          onChange={(update) => onChange((p) => updatePackClip(p, clip.id, update))}
          onMuteSlow={(muted) => onChange((p) => setSlowMuted(p, clip.id, muted))}
          attachedCount={clip.attached?.length ?? 0}
          onRemove={() => {
            onChange((p) => deletePack(p, clip.id));
            onSelect(null);
          }}
        />
      );
    }
  } else if (selection?.kind === 'audio') {
    const found = findAudioClip(project, selection.id);
    const media = found && getMedia(project, found.clip.mediaId);
    if (found && media) {
      content = (
        <AudioInspector
          key={found.clip.id}
          clip={found.clip}
          media={media}
          trackName={found.track.name}
          onNormalize={() => props.onNormalize(found.clip.id)}
          onClean={(strength) => props.onCleanAudio({ kind: 'audio', id: found.clip.id }, strength)}
          onChange={(update) => onChange((p) => updateAudioClip(p, found.clip.id, update))}
          onRemove={() => {
            onChange((p) => removeAudioClip(p, found.clip.id));
            onSelect(null);
          }}
        />
      );
    }
  } else if (selection?.kind === 'text') {
    const found = findTextClip(project, selection.id);
    if (found) {
      content = (
        <TextInspector
          key={found.clip.id}
          clip={found.clip}
          trackName={found.track.name}
          tab={textTab}
          onTab={setTextTab}
          onChange={(update) => onChange((p) => updateTextClip(p, found.clip.id, update))}
          onPickPoint={() => props.onPickTextPoint(found.clip.id)}
          picking={props.picking === `text:${found.clip.id}`}
          onRemove={() => {
            onChange((p) => removeTextClip(p, found.clip.id));
            onSelect(null);
          }}
        />
      );
    }
  } else if (selection?.kind === 'transition' && selection.index < project.transitions.length) {
    content = (
      <TransitionInspector
        index={selection.index}
        transition={project.transitions[selection.index]}
        onChange={(t) => onChange((p) => setTransition(p, selection.index, t))}
      />
    );
  }

  return (
    <aside className="min-h-0 overflow-y-auto border-l border-line bg-panel">
      <MotionBlurProvider project={project} onChange={onChange}>
        {content}
      </MotionBlurProvider>
    </aside>
  );
}

function EmptyInspector() {
  useShortcutsVersion();
  // Os atalhos que valem agora (a pessoa pode ter mudado em "Atalhos do teclado").
  const current = (...ids: string[]): ReactNode => {
    const labels = ids.map(shortcutLabel).filter(Boolean);
    return labels.length ? labels.map((label) => <Kbd key={label}>{label}</Kbd>) : '—';
  };
  const shortcuts: [ReactNode, string][] = [
    [current('playPause'), t('Tocar / pausar')],
    [current('split'), t('Dividir no cursor')],
    [current('undo'), t('Desfazer')],
    [current('redo'), t('Refazer')],
    [current('frameBack', 'frameForward'), t('Quadro a quadro')],
    [current('goStart', 'goEnd'), t('Início / fim')],
    [current('delete'), t('Excluir selecionado')],
    [current('copy', 'paste'), t('Copiar / colar no cursor')],
    [current('duplicate'), t('Duplicar')],
    [current('marker'), t('Marcador no cursor')],
    [current('prevEdit', 'nextEdit'), t('Pular entre cortes e marcadores')],
    [<Kbd>{t('Botão direito')}</Kbd>, t('Mais opções')],
  ];
  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-panel-3 text-faint">
          <Layers size={22} />
        </span>
        <p className="font-medium">{t('Nada selecionado')}</p>
        <p className="text-xs leading-relaxed text-faint">
          {t('Clique num clipe, num áudio ou numa transição')} <span className="text-amber">◆</span> {t('na timeline para editar.')}
        </p>
      </div>
      <SectionTitle
        extra={
          <button className="text-[11px] text-faint transition-colors hover:text-accent" onClick={requestShortcutsDialog} title={t('Ver todos e mudar as teclas')}>
            {t('Ver todos / mudar')}
          </button>
        }
      >
        {t('Atalhos')}
      </SectionTitle>
      <ul className="space-y-2">
        {shortcuts.map(([combo, label]) => (
          <li key={label} className="flex items-center justify-between text-xs text-dim">
            <span>{label}</span>
            <span className="flex items-center gap-1 text-faint">{combo}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded bg-panel-3 px-1.5 font-mono text-[10px] text-dim">
      {children}
    </span>
  );
}

export function LabeledSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-dim">{label}</span>
        <span className="font-mono text-[11px]">{display}</span>
      </div>
      <Slider label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------------- Clipe de vídeo / imagem

export type ClipTab = 'basic' | 'speed' | 'camera' | 'color' | 'effects';

function ClipInspector({
  clip,
  media,
  index,
  count,
  ctx,
  length,
  tab,
  onTab,
  onFollowFace,
  onPickPoint,
  picking,
  onChange,
  onMove,
  onDetach,
  onRemove,
  colors,
  onSpeedCurve,
}: {
  colors: ColorContext;
  onSpeedCurve: (speeds: number[]) => void;
  clip: VideoClip;
  media: MediaItem;
  index: number;
  count: number;
  ctx: KeyframeContext;
  length: number;
  tab: ClipTab;
  onTab: (tab: ClipTab) => void;
  onFollowFace: () => void;
  onPickPoint: () => void;
  picking: boolean;
  onChange: (update: (clip: VideoClip) => VideoClip) => void;
  onMove: (delta: number) => void;
  onDetach: () => void;
  onRemove: () => void;
}) {
  const setEffects = (update: (effects: EffectInstance[]) => EffectInstance[]) =>
    onChange((c) => ({ ...c, effects: update(c.effects) }));
  const isImage = media.kind === 'image';
  // Imagens não têm velocidade: cai na aba básica.
  const current = isImage && tab === 'speed' ? 'basic' : tab;
  const cameraActive = !!clip.camera && (!!clip.camera.follow || Object.keys(clip.camera.keyframes).length > 0);
  const dot = <span className="size-1.5 shrink-0 rounded-full bg-accent" />;

  const tabs: TabItem<ClipTab>[] = [
    { id: 'basic', label: t('Básico'), icon: <SlidersHorizontal size={14} /> },
    ...(isImage ? [] : [{ id: 'speed' as const, label: t('Velocidade'), icon: <Gauge size={14} />, badge: speedOf(clip) !== 1 ? dot : undefined }]),
    { id: 'camera', label: t('Câmera'), icon: <Video size={14} />, badge: cameraActive ? dot : undefined },
    { id: 'color', label: t('Cor'), icon: <Palette size={14} />, badge: clip.filter ? dot : undefined },
    {
      id: 'effects',
      label: t('Efeitos'),
      icon: <Sparkles size={14} />,
      badge: clip.effects.length > 0 ? <span className="rounded-full bg-accent-2 px-1 text-[9px] leading-[14px] text-white">{clip.effects.length}</span> : undefined,
    },
  ];

  return (
    <InspectorPanel
      header={
        <InspectorHeader
          thumb={media.thumbnail && <img src={media.thumbnail} alt="" className="size-full object-cover" />}
          kicker={t('{kind} · clipe {n} de {count}', { kind: isImage ? t('Imagem') : t('Vídeo'), n: index + 1, count })}
          title={media.name}
          chips={
            <>
              <Chip>
                {media.width}×{media.height}
              </Chip>
              <Chip>{formatTime(length)}</Chip>
              {!isImage && <Chip>{media.hasAudio ? <Volume2 size={11} /> : <VolumeX size={11} />}</Chip>}
            </>
          }
          actions={
            <>
              <IconButton label={t('Mover para a esquerda')} disabled={index === 0} onClick={() => onMove(-1)}>
                <ChevronLeft size={15} />
              </IconButton>
              <IconButton label={t('Mover para a direita')} disabled={index === count - 1} onClick={() => onMove(1)}>
                <ChevronRight size={15} />
              </IconButton>
              {media.hasAudio && !clip.audioDetached && (
                <IconButton label={t('Separar áudio (vai para uma trilha de áudio)')} onClick={onDetach}>
                  <Unlink size={14} />
                </IconButton>
              )}
              <IconButton label={t('Remover clipe')} className="hover:!text-danger" onClick={onRemove}>
                <Trash size={14} />
              </IconButton>
            </>
          }
        />
      }
      tabs={<Tabs tabs={tabs} value={current} onChange={onTab} />}
    >
      {current === 'basic' && (
        <>
          {isImage ? (
            <>
              <SectionTitle>{t('Duração')}</SectionTitle>
              <LabeledSlider
                label={t('Tempo na tela')}
                value={clipLength(clip)}
                display={`${clipLength(clip).toFixed(1)}s`}
                min={0.5}
                max={30}
                step={0.1}
                onChange={(v) => onChange((c) => ({ ...c, trimIn: 0, trimOut: v }))}
              />
              <Tip>{t('O efeito “Zoom lento (Ken Burns)” ou um movimento na aba Câmera dão vida a fotos.')}</Tip>
            </>
          ) : (
            <TrimSection
              trimIn={clip.trimIn}
              trimOut={clip.trimOut}
              duration={media.duration}
              onChange={(trimIn, trimOut) => onChange((c) => ({ ...c, trimIn, trimOut }))}
            />
          )}

          {media.hasAudio && (
            <>
              <SectionTitle extra={<AudioLines size={12} className="text-faint" />}>{t('Áudio')}</SectionTitle>
              {clip.audioDetached ? (
                <p className="rounded-lg bg-teal-400/10 px-3 py-2 text-xs text-teal-200">
                  {t('O áudio deste clipe foi separado e está numa trilha de áudio.')}
                </p>
              ) : (
                <LabeledSlider
                  label={t('Volume')}
                  value={clip.volume}
                  display={`${Math.round(clip.volume * 100)}%`}
                  min={0}
                  max={2}
                  step={0.01}
                  onChange={(volume) => onChange((c) => ({ ...c, volume }))}
                />
              )}
            </>
          )}
        </>
      )}

      {current === 'basic' && (
        <>
          <TurnFlip clip={clip} onChange={onChange} />
          <BackgroundSection matte={clip.matte} allowCut={false} onChange={(matte) => onChange((c) => ({ ...c, matte }))} />
          <ObjectCutoutSection clip={clip} target={{ kind: 'clip', id: clip.id }} onChange={onChange} />
          <GazeSection clip={clip} target={{ kind: 'clip', id: clip.id }} onChange={onChange} />
        </>
      )}

      {current === 'speed' && <SpeedSection clip={clip} onChange={onChange} onSpeedCurve={onSpeedCurve} />}

      {current === 'camera' && (
        <CameraPanel
          camera={clip.camera}
          ctx={ctx}
          clipLength={length}
          onCamera={(update) => onChange((c) => ({ ...c, camera: update(c.camera ?? createCamera()) }))}
          follow={{ onFollowFace, onPickPoint, picking }}
        />
      )}

      {current === 'color' && (
        <>
          <QuickAdjust effects={clip.effects} onChange={setEffects} />
          <FilterPanel ctx={ctx} filter={clip.filter} onChange={(filter) => onChange((c) => ({ ...c, filter }))} />
          <GradeSection grade={clip.grade} onChange={(grade) => onChange((c) => ({ ...c, grade }))} />
          <LutSection {...colors} lut={clip.lut} onChange={(lut) => onChange((c) => ({ ...c, lut }))} onImport={colors.onAddLut} />
        </>
      )}

      {current === 'effects' && <EffectsPanel ctx={ctx} effects={clip.effects} onChange={setEffects} />}
    </InspectorPanel>
  );
}

/** Girar 90° e espelhar. */
function TurnFlip({ clip, onChange }: { clip: VideoClip; onChange: (update: (clip: VideoClip) => VideoClip) => void }) {
  const tool = (label: string, icon: ReactNode, onClick: () => void, active = false) => (
    <button
      title={label}
      onClick={onClick}
      className={cx(
        'flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10px] transition-colors',
        active ? 'border-accent bg-accent/15 text-fg' : 'border-line text-dim hover:border-line-strong hover:text-fg',
      )}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <>
      <SectionTitle extra={clip.turn ? <span className="font-mono text-[11px] text-faint">{clip.turn}°</span> : undefined}>{t('Girar e espelhar')}</SectionTitle>
      <div className="grid grid-cols-4 gap-1.5">
        {tool(t('Girar ↺'), <RotateCcw size={15} />, () => onChange((c) => turnClip(c, -90)))}
        {tool(t('Girar ↻'), <RotateCw size={15} />, () => onChange((c) => turnClip(c, 90)))}
        {tool(t('Espelhar'), <ArrowLeftRight size={15} />, () => onChange((c) => ({ ...c, flipX: !c.flipX })), !!clip.flipX)}
        {tool(t('De ponta-cabeça'), <ArrowUpDown size={15} />, () => onChange((c) => ({ ...c, flipY: !c.flipY })), !!clip.flipY)}
      </div>
    </>
  );
}

const ADJUST_ID = 'effects/ajuste-cor';

/** Brilho, contraste, saturação e temperatura direto na aba Cor (usa o efeito "Ajuste de cor"). */
function QuickAdjust({ effects, onChange }: { effects: EffectInstance[]; onChange: (update: (effects: EffectInstance[]) => EffectInstance[]) => void }) {
  const plugin = getPlugin(ADJUST_ID);
  if (!plugin) return null;
  const effect = effects.find((e) => e.pluginId === ADJUST_ID);
  const set = (id: string, value: ParamValue) =>
    onChange((list) => {
      const existing = list.find((e) => e.pluginId === ADJUST_ID);
      if (existing) return list.map((e) => (e === existing ? { ...e, params: { ...e.params, [id]: value } } : e));
      const created = createEffect(ADJUST_ID);
      // Entra primeiro: o ajuste vem antes dos outros efeitos.
      return created ? [{ ...created, params: { ...created.params, [id]: value } }, ...list] : list;
    });
  return (
    <>
      <SectionTitle
        extra={
          effect && (
            <IconButton label={t('Zerar ajustes')} onClick={() => onChange((list) => list.filter((e) => e.pluginId !== ADJUST_ID))}>
              <RotateCcw size={12} />
            </IconButton>
          )
        }
      >
        {t('Ajustes rápidos')}
      </SectionTitle>
      {plugin.params.map((def) => (
        <ParamControl key={def.id} def={def} value={effect?.params[def.id] ?? paramDefault(def)} onChange={(v) => set(def.id, v)} />
      ))}
    </>
  );
}

export function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-panel-2 px-2.5 py-2 text-[11px] leading-snug text-faint">
      <Lightbulb size={12} className="mt-px shrink-0 text-amber/80" />
      <span>{children}</span>
    </p>
  );
}

export function EffectsPanel({
  ctx,
  effects,
  onChange,
  title = t('Neste clipe'),
}: {
  ctx: KeyframeContext;
  effects: EffectInstance[];
  title?: string;
  onChange: (update: (effects: EffectInstance[]) => EffectInstance[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const showPicker = adding || effects.length === 0;
  return (
    <>
      {effects.length > 0 && (
        <>
          <SectionTitle extra={<span className="text-[11px] text-faint">{t('aplicados em ordem')}</span>}>{title}</SectionTitle>
          <div className="space-y-2">
            {effects.map((effect, i) => (
              <EffectCard
                key={effect.uid}
                ctx={ctx}
                effect={effect}
                first={i === 0}
                last={i === effects.length - 1}
                onChange={(updated) => onChange((list) => list.map((e) => (e.uid === effect.uid ? updated : e)))}
                onMove={(delta) =>
                  onChange((list) => {
                    const next = [...list];
                    [next[i], next[i + delta]] = [next[i + delta], next[i]];
                    return next;
                  })
                }
                onRemove={() => onChange((list) => list.filter((e) => e.uid !== effect.uid))}
              />
            ))}
          </div>
          {!adding && (
            <Button variant="secondary" icon={<Plus size={14} />} className="mt-3 w-full" onClick={() => setAdding(true)}>
              {t('Adicionar efeito')}
            </Button>
          )}
        </>
      )}
      {showPicker && (
        <>
          <SectionTitle
            extra={
              adding &&
              effects.length > 0 && (
                <IconButton label={t('Fechar')} onClick={() => setAdding(false)}>
                  <X size={13} />
                </IconButton>
              )
            }
          >
            {t('Adicionar efeito')}
          </SectionTitle>
          <PluginPicker
            kind="effect"
            plugins={effectPlugins}
            onPick={(p) => {
              const effect = createEffect(p.id);
              if (effect) onChange((list) => [...list, effect]);
              setAdding(false);
            }}
          />
        </>
      )}
    </>
  );
}

const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2, 4];

const INTERPOLATIONS: { id: Interpolation; label: string; hint: string }[] = [
  { id: 'flow', label: t('Fluida'), hint: t('Estima o movimento e cria os quadros que faltam.') },
  { id: 'blend', label: t('Misturar'), hint: t('Mistura os quadros vizinhos (rápido, um pouco borrado).') },
  { id: 'none', label: t('Desligada'), hint: t('Repete os quadros (efeito "travado").') },
];

function SpeedSection({
  clip,
  onChange,
  onSpeedCurve,
}: {
  clip: VideoClip;
  onChange: (update: (clip: VideoClip) => VideoClip) => void;
  /** Só na trilha principal: aplica uma rampa de velocidade (o clipe é dividido) */
  onSpeedCurve?: (speeds: number[]) => void;
}) {
  const speed = speedOf(clip);
  const interpolation = clip.interpolation ?? 'flow';
  // Escala logarítmica: 0,1× a 4× com 1× no meio do controle.
  const toSlider = (s: number) => Math.log(s) / Math.log(4);
  const fromSlider = (v: number) => Math.round(Math.pow(4, v) * 100) / 100;
  return (
    <>
      <SectionTitle>{t('Velocidade')}</SectionTitle>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs text-dim">{speed < 1 ? t('Câmera lenta') : speed > 1 ? t('Acelerado') : t('Normal')}</span>
        <span className="font-mono text-lg font-semibold tabular-nums">{speed}×</span>
      </div>
      <Slider label={t('Velocidade')} value={toSlider(speed)} min={toSlider(0.1)} max={1} step={0.01} onChange={(v) => onChange((c) => ({ ...c, speed: fromSlider(v) }))} />
      <div className="mt-3">
        <Segmented
          mono
          options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
          value={SPEEDS.find((s) => Math.abs(speed - s) < 0.001) ?? null}
          onChange={(s) => onChange((c) => ({ ...c, speed: s }))}
        />
      </div>
      {speed < 1 ? (
        <>
          <SectionTitle>{t('Câmera lenta suave')}</SectionTitle>
          <Segmented
            options={INTERPOLATIONS.map((i) => ({ value: i.id, label: i.label, title: i.hint }))}
            value={interpolation}
            onChange={(id) => onChange((c) => ({ ...c, interpolation: id }))}
          />
          <Tip>{INTERPOLATIONS.find((i) => i.id === interpolation)?.hint}</Tip>
        </>
      ) : (
        <Tip>{t('Abaixo de 1× o Lumiar cria os quadros que faltam, para a câmera lenta ficar fluida.')}</Tip>
      )}
      {onSpeedCurve && <SpeedCurve onApply={onSpeedCurve} />}
    </>
  );
}

/** Liga os keyframes de um parâmetro de efeito/filtro ao seu mapa de keyframes. */
function bindParam(
  ctx: KeyframeContext,
  map: KeyframeMap | undefined,
  id: string,
  base: ParamValue,
  setBase: (v: ParamValue) => void,
  setMap: (map: KeyframeMap | undefined) => void,
) {
  return bindKeyframes(ctx, map?.[id], base, setBase, (kfs: Keyframe[] | undefined) => {
    const next = { ...map };
    if (kfs) next[id] = kfs;
    else delete next[id];
    setMap(Object.keys(next).length ? next : undefined);
  });
}

function TrimSection({
  trimIn,
  trimOut,
  duration,
  onChange,
}: {
  trimIn: number;
  trimOut: number;
  duration: number;
  onChange: (trimIn: number, trimOut: number) => void;
}) {
  const start = (trimIn / duration) * 100;
  const end = (trimOut / duration) * 100;
  return (
    <>
      <SectionTitle extra={<Scissors size={12} className="text-faint" />}>{t('Corte')}</SectionTitle>
      <div className="relative mb-3 h-2 rounded-full bg-panel-3">
        <div
          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-accent to-accent-2"
          style={{ left: `${start}%`, width: `${Math.max(0, end - start)}%` }}
        />
      </div>
      <TrimRow label={t('Início')} value={trimIn} max={duration} onChange={(v) => onChange(Math.min(v, trimOut - 0.1), trimOut)} />
      <TrimRow label={t('Fim')} value={trimOut} max={duration} onChange={(v) => onChange(trimIn, Math.max(v, trimIn + 0.1))} />
      <p className="mt-1 text-right text-[11px] text-faint">
        {t('Duração:')} <span className="font-mono text-dim">{formatTime(trimOut - trimIn)}</span> · {t('ou puxe as bordas na timeline')}
      </p>
    </>
  );
}

function TrimRow({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-10 text-xs text-dim">{label}</span>
      <Slider label={label} value={value} min={0} max={max} step={0.01} onChange={onChange} />
      <span className="w-16 text-right font-mono text-[11px]">{formatTime(value)}</span>
    </div>
  );
}

/** Aba "Cor": ajustes do filtro escolhido e a grade para trocar. */
export function FilterPanel({
  ctx,
  filter,
  onChange,
}: {
  ctx: KeyframeContext;
  filter: FilterInstance | null;
  onChange: (filter: FilterInstance | null) => void;
}) {
  return (
    <>
      {filter && <FilterCard ctx={ctx} filter={filter} onChange={onChange} />}
      <SectionTitle>{filter ? t('Trocar filtro') : t('Escolha um filtro')}</SectionTitle>
      <PluginPicker
        kind="filter"
        plugins={filterPlugins}
        selected={filter?.pluginId ?? null}
        none={{ label: t('Nenhum'), onPick: () => onChange(null) }}
        onPick={(p) => onChange(createFilter(p.id, filter?.intensity ?? 1))}
      />
    </>
  );
}

function FilterCard({
  ctx,
  filter,
  onChange,
}: {
  ctx: KeyframeContext;
  filter: FilterInstance;
  onChange: (filter: FilterInstance | null) => void;
}) {
  const previews = usePluginPreviews();
  const plugin = getPlugin(filter.pluginId);
  const setMap = (keyframes: KeyframeMap | undefined) => onChange({ ...filter, keyframes });
  const intensity = bindParam(ctx, filter.keyframes, 'intensity', filter.intensity, (v) => onChange({ ...filter, intensity: v as number }), setMap);

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-2.5">
      <div className="flex items-center gap-2.5">
        <div className="aspect-video w-16 shrink-0 overflow-hidden rounded-md bg-panel-3 ring-2 ring-pink">
          {plugin && previews.get(plugin.id) && <img src={previews.get(plugin.id)} alt="" className="size-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-faint">{plugin ? t(plugin.category) : t('Filtro')}</p>
          <p className="truncate font-medium">{plugin?.name ?? filter.pluginId}</p>
        </div>
        <IconButton label={t('Remover filtro')} className="hover:!text-danger" onClick={() => onChange(null)}>
          <X size={14} />
        </IconButton>
      </div>
      {plugin && (
        <div className="mt-1.5">
          <ParamControl
            def={{ id: 'intensity', label: t('Intensidade'), type: 'float', default: 1, min: 0, max: 1, step: 0.01 }}
            value={intensity.value}
            onChange={intensity.onChange}
            keyframes={intensity.control}
          />
          {plugin.params.map((def) => {
            const binding = bindParam(
              ctx,
              filter.keyframes,
              def.id,
              filter.params[def.id] ?? paramDefault(def),
              (v) => onChange({ ...filter, params: { ...filter.params, [def.id]: v } }),
              setMap,
            );
            return <ParamControl key={def.id} def={def} value={binding.value} onChange={binding.onChange} keyframes={binding.control} />;
          })}
        </div>
      )}
    </div>
  );
}

function EffectCard({
  ctx,
  effect,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  ctx: KeyframeContext;
  effect: EffectInstance;
  first: boolean;
  last: boolean;
  onChange: (effect: EffectInstance) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const plugin = getPlugin(effect.pluginId);
  if (!plugin) {
    return <div className="rounded-lg bg-danger/10 p-3 text-xs text-danger">{t('Efeito não encontrado: {id}', { id: effect.pluginId })}</div>;
  }
  const setParam = (id: string, value: ParamValue) => onChange({ ...effect, params: { ...effect.params, [id]: value } });

  return (
    <div className={cx('rounded-xl border border-line bg-panel-2 transition-opacity', !effect.enabled && 'opacity-50')}>
      <div className="flex items-center gap-2 py-1.5 pl-3 pr-1.5">
        <Switch checked={effect.enabled} label={t('Ligar/desligar')} onChange={(enabled) => onChange({ ...effect, enabled })} />
        <button className="flex min-w-0 flex-1 items-center gap-1 text-left" onClick={() => setOpen(!open)}>
          <span className="truncate font-medium">{plugin.name}</span>
          <ChevronDown size={14} className={cx('shrink-0 text-faint transition-transform', !open && '-rotate-90')} />
        </button>
        <IconButton label={t('Remover')} className="hover:!text-danger" onClick={onRemove}>
          <X size={14} />
        </IconButton>
      </div>
      {open && (
        <div className="border-t border-line px-3 pb-2 pt-1.5">
          {plugin.params.map((def) => {
            const binding = bindParam(
              ctx,
              effect.keyframes,
              def.id,
              effect.params[def.id] ?? paramDefault(def),
              (v) => setParam(def.id, v),
              (keyframes) => onChange({ ...effect, keyframes }),
            );
            return <ParamControl key={def.id} def={def} value={binding.value} onChange={binding.onChange} keyframes={binding.control} />;
          })}
          {effect.keyframes && (
            <p className="mt-1 text-[11px] leading-snug text-amber/80">
              {t('Animado com keyframes: mexer num controle cria um keyframe no cursor.')}
            </p>
          )}
          <div className="mt-1 flex items-center gap-0.5 border-t border-line/60 pt-2">
            <IconButton label={t('Aplicar antes (subir)')} disabled={first} onClick={() => onMove(-1)}>
              <ArrowUp size={13} />
            </IconButton>
            <IconButton label={t('Aplicar depois (descer)')} disabled={last} onClick={() => onMove(1)}>
              <ArrowDown size={13} />
            </IconButton>
            <span className="flex-1" />
            <Button
              variant="ghost"
              className="h-7 px-2 text-xs"
              icon={<RotateCcw size={12} />}
              onClick={() =>
                onChange({ ...effect, keyframes: undefined, params: Object.fromEntries(plugin.params.map((d) => [d.id, paramDefault(d)])) })
              }
            >
              {tc('ajuste', 'Restaurar')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Clipe de áudio

function AudioInspector({
  clip,
  media,
  trackName,
  onChange,
  onRemove,
  onNormalize,
  onClean,
}: {
  clip: AudioClip;
  media: MediaItem;
  trackName: string;
  onChange: (update: (clip: AudioClip) => AudioClip) => void;
  onRemove: () => void;
  onNormalize: () => void;
  onClean: (strength: number) => void;
}) {
  const eq = clip.eq ?? { low: 0, mid: 0, high: 0 };
  const setEq = (patch: Partial<NonNullable<AudioClip['eq']>>) => onChange((c) => ({ ...c, eq: { ...eq, ...patch } }));
  const length = clipLength(clip);
  const maxFade = Math.max(0.1, Math.min(10, length / 2));
  return (
    <InspectorPanel
      header={
        <InspectorHeader
          thumb={
            <span className="flex size-full items-center justify-center bg-gradient-to-br from-[#115e59] to-[#0b2f3a] text-teal-200">
              <AudioLines size={22} />
            </span>
          }
          kicker={t('Áudio · {track}', { track: trackName })}
          title={media.name}
          chips={
            <>
              <Chip>{t('início {time}', { time: formatTime(clip.start) })}</Chip>
              <Chip>{formatTime(length)}</Chip>
            </>
          }
          actions={
            <IconButton label={t('Remover áudio')} className="hover:!text-danger" onClick={onRemove}>
              <Trash size={14} />
            </IconButton>
          }
        />
      }
    >
      <SectionTitle extra={<Volume2 size={12} className="text-faint" />}>{t('Volume')}</SectionTitle>
      <LabeledSlider
        label={t('Volume')}
        value={clip.volume}
        display={`${Math.round(clip.volume * 100)}%`}
        min={0}
        max={2}
        step={0.01}
        onChange={(volume) => onChange((c) => ({ ...c, volume }))}
      />
      <LabeledSlider
        label={t('Aparecer (fade in)')}
        value={Math.min(clip.fadeIn, maxFade)}
        display={`${clip.fadeIn.toFixed(1)}s`}
        min={0}
        max={maxFade}
        step={0.1}
        onChange={(fadeIn) => onChange((c) => ({ ...c, fadeIn }))}
      />
      <LabeledSlider
        label={t('Sumir (fade out)')}
        value={Math.min(clip.fadeOut, maxFade)}
        display={`${clip.fadeOut.toFixed(1)}s`}
        min={0}
        max={maxFade}
        step={0.1}
        onChange={(fadeOut) => onChange((c) => ({ ...c, fadeOut }))}
      />

      <Button variant="secondary" icon={<SlidersHorizontal size={13} />} className="mt-1 h-7 w-full text-xs" onClick={onNormalize}>
        {t('Normalizar volume (pico em -1 dB)')}
      </Button>

      <SectionTitle extra={clip.volumeKeys?.length ? <span className="text-[11px] text-faint">{t('{n} ponto(s)', { n: clip.volumeKeys.length })}</span> : undefined}>
        {t('Volume por trecho')}
      </SectionTitle>
      <p className="text-[11px] leading-snug text-faint">
        {t('Dê dois cliques no clipe na timeline para criar um ponto na linha amarela e arraste para cima ou para baixo (o meio é 100%). Duplo clique num ponto apaga.')}
      </p>
      {!!clip.volumeKeys?.length && (
        <button className="mt-1 text-[11px] text-faint hover:text-accent" onClick={() => onChange((c) => ({ ...c, volumeKeys: undefined }))}>
          {t('Apagar os pontos de volume')}
        </button>
      )}

      <SectionTitle
        extra={
          clip.eq && (
            <IconButton label={t('Zerar o equalizador')} onClick={() => onChange((c) => ({ ...c, eq: undefined }))}>
              <RotateCcw size={12} />
            </IconButton>
          )
        }
      >
        {t('Equalizador')}
      </SectionTitle>
      <div className="mb-1.5 flex flex-wrap gap-1">
        {(
          [
            [t('Voz mais clara'), { low: -4, mid: 2, high: 4 }],
            [t('Mais grave'), { low: 6, mid: 0, high: -1 }],
            [t('Tirar chiado'), { low: 0, mid: 0, high: -8 }],
            [t('Rádio'), { low: -10, mid: 5, high: -6 }],
          ] as const
        ).map(([label, preset]) => (
          <button
            key={label}
            onClick={() => onChange((c) => ({ ...c, eq: { ...preset } }))}
            className="rounded-full border border-line px-2 py-0.5 text-[11px] text-dim transition-colors hover:border-line-strong hover:text-fg"
          >
            {label}
          </button>
        ))}
      </div>
      {(
        [
          ['low', t('Graves')],
          ['mid', t('Médios')],
          ['high', t('Agudos')],
        ] as const
      ).map(([key, label]) => (
        <LabeledSlider
          key={key}
          label={label}
          value={eq[key]}
          display={`${eq[key] > 0 ? '+' : ''}${eq[key].toFixed(0)} dB`}
          min={-12}
          max={12}
          step={1}
          onChange={(v) => setEq({ [key]: v })}
        />
      ))}

      <SectionTitle>{t('Limpar o áudio')}</SectionTitle>
      <p className="mb-1.5 text-[11px] leading-snug text-faint">
        {t('Tira chiado, ventilador, ar-condicionado e ronco de fundo. Cria uma cópia limpa do áudio (o arquivo original fica intacto).')}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {(
          [
            [t('Leve'), 0.35],
            [t('Médio'), 0.65],
            [t('Forte'), 1],
          ] as const
        ).map(([label, strength]) => (
          <Button key={label} variant="secondary" className="h-7 text-xs" onClick={() => onClean(strength)}>
            {label}
          </Button>
        ))}
      </div>

      <SectionTitle extra={<Mic size={12} className="text-faint" />}>{t('Efeito de voz')}</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        {VOICE_EFFECTS.map((v) => {
          const active = (clip.voice ?? 'none') === v.id;
          return (
            <button
              key={v.id}
              title={v.hint}
              onClick={() => onChange((c) => ({ ...c, voice: v.id }))}
              className={cx(
                'truncate rounded-lg border px-1 py-1.5 text-center text-[11px] transition-colors',
                active ? 'border-accent bg-accent/15 text-fg' : 'border-line text-dim hover:border-line-strong hover:text-fg',
              )}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <TrimSection
        trimIn={clip.trimIn}
        trimOut={clip.trimOut}
        duration={media.duration}
        onChange={(trimIn, trimOut) => onChange((c) => ({ ...c, trimIn, trimOut }))}
      />
      <Tip>
        {t('Arraste o clipe na timeline para mudar de lugar ou de trilha. Use')} <Kbd>{shortcutLabel('split') || '—'}</Kbd> {t('para dividir no cursor.')}
      </Tip>
    </InspectorPanel>
  );
}

// ---------------------------------------------------------------- Transição

function TransitionInspector({
  index,
  transition,
  onChange,
}: {
  index: number;
  transition: TransitionInstance | null;
  onChange: (transition: TransitionInstance | null) => void;
}) {
  const plugin = transition && getPlugin(transition.pluginId);

  return (
    <InspectorPanel
      header={
        <>
          <p className="text-[11px] text-faint">
            {t('Transição · entre o clipe {a} e o {b}', { a: index + 1, b: index + 2 })}
          </p>
          <h3 className="mb-3 text-sm font-semibold">{plugin ? plugin.name : t('Corte seco')}</h3>
          <div className="relative aspect-video overflow-hidden rounded-xl bg-panel-3 ring-1 ring-line">
            {plugin ? (
              <LivePreview plugin={plugin} />
            ) : (
              <div className="flex size-full items-center justify-center text-xs text-faint">{t('Sem transição')}</div>
            )}
          </div>
          {plugin?.description && <p className="mt-2 text-xs leading-snug text-dim">{plugin.description}</p>}
        </>
      }
    >
      {transition && (
        <>
          <SectionTitle>{t('Ajustes')}</SectionTitle>
          <LabeledSlider
            label={t('Duração')}
            value={transition.duration}
            display={`${transition.duration.toFixed(2)}s`}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(duration) => onChange({ ...transition, duration })}
          />
          {plugin?.params.map((def) => (
            <ParamControl
              key={def.id}
              def={def}
              value={transition.params[def.id] ?? paramDefault(def)}
              onChange={(v) => onChange({ ...transition, params: { ...transition.params, [def.id]: v } })}
            />
          ))}
        </>
      )}

      <SectionTitle>{transition ? t('Trocar transição') : t('Escolha uma transição')}</SectionTitle>
      <PluginPicker
        kind="transition"
        plugins={transitionPlugins}
        selected={transition?.pluginId ?? null}
        none={{ label: t('Corte seco'), onPick: () => onChange(null) }}
        onPick={(p) => onChange(createTransition(p.id, transition?.duration))}
      />
    </InspectorPanel>
  );
}

// ---------------------------------------------------------------- Camada sobreposta (trilhas de vídeo extras)

export type OverlayTab = 'basic' | 'place' | 'speed' | 'color' | 'effects';

/** Posições prontas: tela cheia, cantos (picture-in-picture) e metades. */
const PLACEMENTS: { label: string; transform: Partial<LayerTransform> }[] = [
  { label: t('Tela cheia'), transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, radius: 0 } },
  { label: t('Centro'), transform: { x: 0.5, y: 0.5, scale: 0.6, rotation: 0 } },
  { label: t('↖ Canto'), transform: { x: 0.26, y: 0.27, scale: 0.4, rotation: 0 } },
  { label: t('↗ Canto'), transform: { x: 0.74, y: 0.27, scale: 0.4, rotation: 0 } },
  { label: t('↙ Canto'), transform: { x: 0.26, y: 0.73, scale: 0.4, rotation: 0 } },
  { label: t('↘ Canto'), transform: { x: 0.74, y: 0.73, scale: 0.4, rotation: 0 } },
  { label: t('Metade esq.'), transform: { x: 0.25, y: 0.5, scale: 0.5, rotation: 0, radius: 0 } },
  { label: t('Metade dir.'), transform: { x: 0.75, y: 0.5, scale: 0.5, rotation: 0, radius: 0 } },
];

const BLENDS: { value: BlendMode; label: string; title: string }[] = [
  { value: 'normal', label: t('Normal'), title: t('Cobre o que está embaixo') },
  { value: 'screen', label: t('Clarear'), title: t('Só as partes claras aparecem (bom para luz, fogo, partículas)') },
  { value: 'add', label: t('Somar'), title: t('Soma a luz das duas camadas') },
  { value: 'multiply', label: t('Escurecer'), title: t('Só as partes escuras aparecem') },
];

function OverlayInspector({
  clip,
  media,
  trackName,
  ctx,
  tab,
  onTab,
  onChange,
  onRemove,
  onToMain,
  onDrawMask,
  colors,
}: {
  clip: OverlayClip;
  media: MediaItem;
  trackName: string;
  ctx: KeyframeContext;
  tab: OverlayTab;
  onTab: (tab: OverlayTab) => void;
  onChange: (update: (clip: OverlayClip) => OverlayClip) => void;
  onRemove: () => void;
  onToMain: () => void;
  onDrawMask: () => void;
  colors: ColorContext;
}) {
  const isImage = media.kind === 'image';
  const current = isImage && tab === 'speed' ? 'basic' : tab;
  const length = clipLength(clip);
  const tf = clip.transform;
  const setTransform = (patch: Partial<LayerTransform>) => onChange((c) => ({ ...c, transform: { ...c.transform, ...patch } }));
  const setVideo = (update: (c: VideoClip) => VideoClip) => onChange((c) => ({ ...c, ...update(c) }));
  const dot = <span className="size-1.5 shrink-0 rounded-full bg-accent" />;
  const maxFade = Math.max(0.1, Math.min(10, length / 2));

  const tabs: TabItem<OverlayTab>[] = [
    { id: 'basic', label: t('Básico'), icon: <SlidersHorizontal size={14} /> },
    { id: 'place', label: t('Posição'), icon: <Move size={14} />, badge: tf.chroma ? dot : undefined },
    ...(isImage ? [] : [{ id: 'speed' as const, label: t('Velocidade'), icon: <Gauge size={14} />, badge: speedOf(clip) !== 1 ? dot : undefined }]),
    { id: 'color', label: t('Cor'), icon: <Palette size={14} />, badge: clip.filter ? dot : undefined },
    {
      id: 'effects',
      label: t('Efeitos'),
      icon: <Sparkles size={14} />,
      badge: clip.effects.length > 0 ? <span className="rounded-full bg-accent-2 px-1 text-[9px] leading-[14px] text-white">{clip.effects.length}</span> : undefined,
    },
  ];

  return (
    <InspectorPanel
      header={
        <InspectorHeader
          thumb={media.thumbnail && <img src={media.thumbnail} alt="" className="size-full object-cover" />}
          kicker={t('Sobreposição · {track}', { track: trackName })}
          title={media.name}
          chips={
            <>
              <Chip>{t('início {time}', { time: formatTime(clip.start) })}</Chip>
              <Chip>{formatTime(length)}</Chip>
            </>
          }
          actions={
            <>
              <IconButton label={t('Levar para a trilha principal')} onClick={onToMain}>
                <ArrowDown size={14} />
              </IconButton>
              <IconButton label={t('Remover')} className="hover:!text-danger" onClick={onRemove}>
                <Trash size={14} />
              </IconButton>
            </>
          }
        />
      }
      tabs={<Tabs tabs={tabs} value={current} onChange={onTab} />}
    >
      {current === 'basic' && (
        <>
          {isImage ? (
            <>
              <SectionTitle>{t('Duração')}</SectionTitle>
              <LabeledSlider
                label={t('Tempo na tela')}
                value={length}
                display={`${length.toFixed(1)}s`}
                min={0.5}
                max={30}
                step={0.1}
                onChange={(v) => onChange((c) => ({ ...c, trimIn: 0, trimOut: v }))}
              />
            </>
          ) : (
            <TrimSection
              trimIn={clip.trimIn}
              trimOut={clip.trimOut}
              duration={media.duration}
              onChange={(trimIn, trimOut) => onChange((c) => ({ ...c, trimIn, trimOut }))}
            />
          )}
          <SectionTitle>{t('Aparecer e sumir')}</SectionTitle>
          <LabeledSlider label={t('Aparecer (fade in)')} value={Math.min(clip.fadeIn, maxFade)} display={`${clip.fadeIn.toFixed(1)}s`} min={0} max={maxFade} step={0.1} onChange={(fadeIn) => onChange((c) => ({ ...c, fadeIn }))} />
          <LabeledSlider label={t('Sumir (fade out)')} value={Math.min(clip.fadeOut, maxFade)} display={`${clip.fadeOut.toFixed(1)}s`} min={0} max={maxFade} step={0.1} onChange={(fadeOut) => onChange((c) => ({ ...c, fadeOut }))} />
          {media.hasAudio && (
            <>
              <SectionTitle extra={<AudioLines size={12} className="text-faint" />}>{t('Áudio')}</SectionTitle>
              <LabeledSlider
                label={t('Volume')}
                value={clip.volume}
                display={`${Math.round(clip.volume * 100)}%`}
                min={0}
                max={2}
                step={0.01}
                onChange={(volume) => onChange((c) => ({ ...c, volume }))}
              />
            </>
          )}
          <TurnFlip clip={clip} onChange={setVideo} />
          <BackgroundSection matte={clip.matte} allowCut onChange={(matte) => onChange((c) => ({ ...c, matte }))} />
          <ObjectCutoutSection clip={clip} target={{ kind: 'overlay', id: clip.id }} onChange={setVideo} />
          <GazeSection clip={clip} target={{ kind: 'overlay', id: clip.id }} onChange={setVideo} />
          <Tip>{t('Arraste o clipe na timeline para mudar de lugar ou de trilha. Trilhas mais altas ficam por cima.')}</Tip>
        </>
      )}

      {current === 'place' && (
        <>
          <SectionTitle>{t('Posições prontas')}</SectionTitle>
          <div className="grid grid-cols-4 gap-1.5">
            {PLACEMENTS.map((p) => (
              <button
                key={p.label}
                onClick={() => setTransform(p.transform)}
                className="truncate rounded-lg border border-line px-1 py-1.5 text-center text-[10px] text-dim transition-colors hover:border-accent hover:text-fg"
              >
                {p.label}
              </button>
            ))}
          </div>

          <SectionTitle>{t('Tamanho e posição')}</SectionTitle>
          <LabeledSlider label={t('Tamanho')} value={tf.scale} display={`${Math.round(tf.scale * 100)}%`} min={0.05} max={2} step={0.01} onChange={(scale) => setTransform({ scale })} />
          <LabeledSlider label={t('Horizontal')} value={tf.x} display={`${Math.round(tf.x * 100)}%`} min={-0.25} max={1.25} step={0.005} onChange={(x) => setTransform({ x })} />
          <LabeledSlider label={t('Vertical')} value={tf.y} display={`${Math.round(tf.y * 100)}%`} min={-0.25} max={1.25} step={0.005} onChange={(y) => setTransform({ y })} />
          <LabeledSlider label={t('Rotação')} value={tf.rotation} display={`${Math.round(tf.rotation)}°`} min={-180} max={180} step={1} onChange={(rotation) => setTransform({ rotation })} />
          <LabeledSlider label={t('Cantos arredondados')} value={tf.radius} display={`${Math.round(tf.radius * 200)}%`} min={0} max={0.5} step={0.005} onChange={(radius) => setTransform({ radius })} />
          <LabeledSlider label={t('Opacidade')} value={tf.opacity} display={`${Math.round(tf.opacity * 100)}%`} min={0} max={1} step={0.01} onChange={(opacity) => setTransform({ opacity })} />
          <p className="mt-1 text-[11px] text-faint">{t('Dica: com este clipe selecionado, arraste a imagem direto no preview.')}</p>
          <CornerPinSection clip={clip} onChange={onChange} />

          <SectionTitle>{t('Mesclagem')}</SectionTitle>
          <Segmented options={BLENDS} value={tf.blend} onChange={(blend) => setTransform({ blend })} />

          <SectionTitle
            extra={<Switch checked={!!tf.chroma} label={t('Chroma key')} onChange={(on) => setTransform({ chroma: on ? { color: '#00ff00', similarity: 0.4, smoothness: 0.2 } : null })} />}
          >
            {t('Fundo verde (chroma key)')}
          </SectionTitle>
          {tf.chroma ? (
            <>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-dim">{t('Cor a remover')}</span>
                <div className="flex items-center gap-1.5">
                  {['#00ff00', '#0047ff', '#ffffff', '#000000'].map((color) => (
                    <button
                      key={color}
                      title={color}
                      onClick={() => setTransform({ chroma: { ...tf.chroma!, color } })}
                      className={cx('size-5 rounded ring-1 ring-white/20', tf.chroma!.color === color && 'ring-2 ring-accent')}
                      style={{ background: color }}
                    />
                  ))}
                  <label className="relative size-5 cursor-pointer overflow-hidden rounded ring-1 ring-white/20" title={t('Outra cor')} style={{ background: tf.chroma.color }}>
                    <input
                      type="color"
                      className="absolute inset-0 cursor-pointer opacity-0"
                      value={tf.chroma.color}
                      onChange={(e) => setTransform({ chroma: { ...tf.chroma!, color: e.target.value } })}
                    />
                  </label>
                </div>
              </div>
              <LabeledSlider label={t('Alcance da cor')} value={tf.chroma.similarity} display={`${Math.round(tf.chroma.similarity * 100)}%`} min={0} max={1} step={0.01} onChange={(similarity) => setTransform({ chroma: { ...tf.chroma!, similarity } })} />
              <LabeledSlider label={t('Suavidade da borda')} value={tf.chroma.smoothness} display={`${Math.round(tf.chroma.smoothness * 100)}%`} min={0} max={1} step={0.01} onChange={(smoothness) => setTransform({ chroma: { ...tf.chroma!, smoothness } })} />
            </>
          ) : (
            <p className="text-[11px] leading-snug text-faint">{t('Ligue para apagar o fundo verde (ou azul) de um vídeo gravado com tela de chroma.')}</p>
          )}
          <MaskSection mask={tf.mask} onChange={(mask) => setTransform({ mask })} onDraw={onDrawMask} />
          <MaskFollowSection clip={clip} clipTime={ctx.clipTime} onChange={onChange} />
        </>
      )}

      {current === 'speed' && <SpeedSection clip={clip} onChange={setVideo} />}
      {current === 'color' && (
        <>
          <QuickAdjust effects={clip.effects} onChange={(update) => onChange((c) => ({ ...c, effects: update(c.effects) }))} />
          <FilterPanel ctx={ctx} filter={clip.filter} onChange={(filter) => onChange((c) => ({ ...c, filter }))} />
          <GradeSection grade={clip.grade} onChange={(grade) => onChange((c) => ({ ...c, grade }))} />
          <LutSection {...colors} lut={clip.lut} onChange={(lut) => onChange((c) => ({ ...c, lut }))} onImport={colors.onAddLut} />
        </>
      )}
      {current === 'effects' && <EffectsPanel ctx={ctx} effects={clip.effects} onChange={(update) => onChange((c) => ({ ...c, effects: update(c.effects) }))} />}
    </InspectorPanel>
  );
}
