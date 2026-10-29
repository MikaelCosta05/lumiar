import {
  ArrowDown,
  ArrowUp,
  Activity,
  Clapperboard,
  Mic,
  SlidersVertical,
  Bookmark,
  ArrowLeftRight,
  ArrowUpDown,
  Rewind,
  RotateCcw,
  RotateCw,
  Snowflake,
  Pencil,
  AudioLines,
  Blend,
  Camera,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eraser,
  Film,
  Gauge,
  ImageDown,
  Layers,
  Maximize,
  Move,
  Palette,
  Pause,
  Play,
  Plus,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash,
  Type,
  Unlink,
  Upload,
  Volume2,
  VolumeX,
  WandSparkles,
  Eye,
  EyeOff,
  Package,
  PackagePlus,
  Stamp,
  AudioWaveform,
  Replace,
  Image as ImageIcon,
  ZoomIn,
  Video,
  Group,
  Ungroup,
  Pipette,
  Music,
  MicOff,
  Smartphone,
  Users,
  MousePointerClick,
  Boxes,
  MessageSquare,
  ScanFace,
  Crosshair,
  Layers3,
  ImageUpscale,
} from 'lucide-react';
import { PARALLAX_MOTIONS, type ParallaxMotion } from '../media/parallax';
import { cursorZoomKeyframes, DEFAULT_CURSOR_FX } from '../project/cursorFx';
import { createCamera } from '../project/camera';
import { getPlugin } from '../engine/registry';
import type { ShaderPlugin } from '../engine/types';
import { copyLook, copySelection, duplicate, pasteAt, pasteLook, visualClip, type CopiedItem, type EditResult } from '../project/clipboard';
import {
  addAudioTrack,
  addVideoTrack,
  clipLength,
  createAudioClip,
  createOverlayClip,
  createTransition,
  createVideoClip,
  createEffect,
  createFilter,
  DEFAULT_TRANSFORM,
  demoteToMain,
  findAudioClip,
  findOverlayClip,
  insertVideoClips,
  placeAudioClip,
  placeOverlayClip,
  promoteToOverlay,
  removeAudioClip,
  removeOverlayClip,
  setTransition,
  speedOf,
  updateAudioClip,
  updateAudioTrack,
  updateClip,
  updateOverlayClip,
  MARKER_COLORS,
  removeMarker,
  turnClip,
  updateMarker,
  type BlendMode,
  type VideoClip,
  type LayerTransform,
  type MediaItem,
  type Project,
  type TimelineLayout,
} from '../project/model';
import { addTextTrack, findTextClip, removeTextClip, updateTextClip } from '../project/text';
import {
  addPackTrack,
  createPackClip,
  placePackClip,
  bakePack,
  findPackClip,
  deletePack,
  setSlowMuted,
  templateFromClip,
  updatePackClip,
  updatePackTrack,
  type PackTemplate,
} from '../project/packs';
import { removeUserPack, saveUserPack } from './packStore';
import { VOICE_EFFECTS } from '../media/voiceFx';
import type { MenuEntry } from './ContextMenu';
import { deleteMainClip } from '../project/ripple';
import { groupOf, groupSize, groupWithRange, ungroup } from '../project/groups';
import type { Selection } from './selection';
import type { TimelineTarget } from './Timeline';
import { t } from '../i18n';
import { LassoSelect } from 'lucide-react';
import { startObjectPick } from './objectPick';
import { startGazeFix } from './gazeFix';
import { shortcutLabel } from '../app/shortcuts';
import type { StabilizeStrength } from '../project/stabilize';
import { stabilizeMenu } from './stabilizeMenu';
import { Scan, ScanLine } from 'lucide-react';
import { Infinity as InfinityIcon, Repeat } from 'lucide-react';
import { requestTracking } from './trackingStore';

/** Tudo que os menus precisam do editor. */
export interface EditorApi {
  project: Project;
  timeline: TimelineLayout;
  time: number;
  playing: boolean;
  clipboard: CopiedItem | null;
  selection: Selection;
  edit: (update: (p: Project) => Project) => void;
  apply: (result: EditResult | null, fail?: string) => void;
  select: (selection: Selection) => void;
  seek: (time: number) => void;
  notify: (text: string, error?: boolean) => void;
  setClipboard: (item: CopiedItem | null) => void;
  split: () => void;
  detach: (clipId: string) => void;
  openImport: () => void;
  togglePlay: () => void;
  saveFrame: () => void;
  copyFrame: () => void;
  /** Congela o quadro do cursor num clipe da trilha principal */
  freeze: (clipId: string) => void;
  /** Cria uma cópia do clipe tocando de trás para frente */
  reverse: (target: { kind: 'clip' | 'overlay'; id: string }) => void;
  /** Loop perfeito: o fim do clipe emenda no começo sem pulo */
  seamlessLoop?: (clipId: string) => void;
  /** Boomerang: o clipe vai e volta (cópia invertida logo depois) */
  boomerang?: (clipId: string) => void;
  addMarker: (time: number) => void;
  /** Grava a voz exatamente no trecho do clipe (dublagem) */
  dub: (target: { kind: 'clip' | 'overlay'; id: string }) => void;
  /** Ajusta o volume do clipe de áudio para o pico ficar em -1 dB */
  normalize: (clipId: string) => void;
  /** Aplica um pacote de edição no instante t */
  addPack: (pack: PackTemplate, t: number) => void;
  /** Detecta as batidas da música no instante t */
  markBeats: (t: number) => void;
  /** Corta as pausas dos clipes da trilha principal */
  cutSilences: (clipIds: string[]) => void;
  /** Corta os clipes da trilha principal nas batidas (a cada `every` batidas) */
  beatMontage: (every: number, fill: boolean, t: number) => void;
  /** Projeto vertical, com a câmera seguindo os rostos */
  reframeVertical: () => void;
  /** Cortes na trilha principal levam o resto junto */
  ripple: boolean;
  /** Tira o ruído de fundo do áudio (cria uma cópia limpa) */
  cleanAudio: (target: { kind: 'audio' | 'clip'; id: string }, strength: number, extra?: { wind?: number; clicks?: number }) => void;
  /** Troca a mídia de um clipe da trilha principal (mantém o tempo, a cor e os efeitos) */
  replaceMedia: (clipId: string, mediaId: string) => void;
  /** Criar capa (thumbnail) com o quadro atual */
  makeThumbnail: () => void;
  /** Encaixa o áudio de um microfone separado no vídeo pela forma de onda */
  syncAudio: (audioId: string) => void;
  /** Multicâmera: sincroniza as câmeras das trilhas de cima com a principal */
  syncCameras: () => void;
  /** Multicâmera: corta sozinho para a câmera de quem está falando */
  autoMulticam: () => void;
  /** Juntar um trecho num clipe composto (abre a escolha do trecho) */
  compound: (from: number, to: number) => void;
  /** Editar por dentro um clipe composto */
  openCompound: (mediaId: string) => void;
  /** Encaixar a música numa duração (sem: até o fim do vídeo) */
  fitMusic: (audioId: string, seconds?: number) => void;
  /** Divide o clipe nas mudanças de cena */
  splitScenes: (clipId: string) => void;
  /** Acha os rostos do clipe para desfocar */
  blurFaces: (target: { kind: 'clip' | 'overlay'; id: string }) => void;
  /** O efeito "Apagar objeto" passa a seguir o objeto */
  followEraser: (target: { kind: 'clip' | 'overlay'; id: string }, effectUid: string) => void;
  /** Foto 3D (parallax) a partir de uma foto */
  photo3d: (target: { kind: 'clip' | 'overlay'; id: string }, motion: ParallaxMotion) => void;
  /** Separar a voz da música/fundo */
  splitVoice: (target: { kind: 'clip' | 'audio'; id: string }) => void;
  /** Aumentar a resolução de uma foto (IA) */
  upscalePhoto: (mediaId: string) => void;
  /** Comentários e tarefas na timeline */
  addComment: (time: number) => void;
  openComment: (id: string) => void;
  toggleComment: (id: string) => void;
  deleteComment: (id: string) => void;
  /** Zooms rápidos nos momentos de ênfase da fala */
  punchIn: (clipId?: string) => void;
  /** Capítulos do YouTube ou destaques para Shorts */
  openTool: (tool: 'chapters' | 'highlights' | 'hook') => void;
  /** Igualar a cor de um clipe com a de outro */
  matchColor: (clipId: string, referenceId: string) => void;
  /** Estabilizar o vídeo tremido (null = tirar a estabilização) */
  stabilize: (target: { kind: 'clip' | 'overlay'; id: string }, strength: StabilizeStrength | null) => void;
}

/** Agrupar com o que está no mesmo trecho, ou desfazer o grupo. */
function groupEntry(api: EditorApi, id: string): MenuEntry {
  const group = groupOf(api.project, id);
  if (group) {
    return {
      label: t('Desagrupar ({n} itens)', { n: groupSize(api.project, group) }),
      icon: <Ungroup size={14} />,
      onClick: () => api.edit((p) => ungroup(p, group)),
    };
  }
  return {
    label: t('Agrupar com o que está neste trecho'),
    icon: <Group size={14} />,
    onClick: () => {
      let count = 0;
      api.edit((p) => {
        const result = groupWithRange(p, id);
        count = result.count;
        return result.project;
      });
      api.notify(count > 1 ? t('{count} itens agrupados: arraste qualquer um e os outros vão junto.', { count }) : t('Não há outros itens neste trecho para agrupar.'), count <= 1);
    },
  };
}

function cleanMenu(api: EditorApi, target: { kind: 'audio' | 'clip'; id: string }): MenuEntry {
  return {
    label: t('Limpar o áudio (tirar ruído)'),
    icon: <AudioWaveform size={14} />,
    items: [
      { label: t('Leve'), onClick: () => api.cleanAudio(target, 0.35) },
      { label: t('Médio'), onClick: () => api.cleanAudio(target, 0.65) },
      { label: t('Forte'), onClick: () => api.cleanAudio(target, 1) },
      'separator',
      // Vento e estalos de boca: sem mexer no ruído de fundo (ou junto, na última opção).
      { label: t('Tirar o vento'), onClick: () => api.cleanAudio(target, 0, { wind: 1 }) },
      { label: t('Tirar estalos de boca'), onClick: () => api.cleanAudio(target, 0, { clicks: 1 }) },
      { label: t('Tirar ruído, vento e estalos'), onClick: () => api.cleanAudio(target, 0.65, { wind: 1, clicks: 1 }) },
    ],
  };
}

/** Montar os clipes no ritmo da música. */
function montageMenu(api: EditorApi, at: number): MenuEntry {
  return {
    label: t('Montar os clipes no ritmo'),
    icon: <Music size={14} />,
    items: [
      { label: t('Um corte a cada batida'), onClick: () => api.beatMontage(1, false, at) },
      { label: t('Um corte a cada 2 batidas'), onClick: () => api.beatMontage(2, false, at) },
      { label: t('Um corte a cada 4 batidas'), onClick: () => api.beatMontage(4, false, at) },
      'separator',
      { label: t('Repetir os clipes até o fim da música (2 batidas)'), onClick: () => api.beatMontage(2, true, at) },
    ],
  };
}

/** Girar 90° e espelhar, para clipes da trilha principal ou sobrepostos. */
function transformMenu(clip: VideoClip, update: (fn: (c: VideoClip) => VideoClip) => void): MenuEntry {
  return {
    label: t('Girar e espelhar'),
    icon: <RotateCw size={14} />,
    items: [
      { label: t('Girar 90° à direita'), icon: <RotateCw size={14} />, onClick: () => update((c) => turnClip(c, 90)) },
      { label: t('Girar 90° à esquerda'), icon: <RotateCcw size={14} />, onClick: () => update((c) => turnClip(c, -90)) },
      'separator',
      { label: t('Espelhar na horizontal'), icon: <ArrowLeftRight size={14} />, checked: !!clip.flipX, onClick: () => update((c) => ({ ...c, flipX: !c.flipX })) },
      { label: t('Espelhar na vertical'), icon: <ArrowUpDown size={14} />, checked: !!clip.flipY, onClick: () => update((c) => ({ ...c, flipY: !c.flipY })) },
      clip.turn || clip.flipX || clip.flipY
        ? { label: t('Desfazer giro e espelho'), onClick: () => update((c) => ({ ...c, turn: 0, flipX: false, flipY: false })) }
        : null,
    ],
  };
}

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4];
const sep = 'separator' as const;

/** Copiar, recortar, colar, duplicar: iguais para qualquer clipe. */
function clipboardEntries(api: EditorApi, selection: Selection, remove: () => void): MenuEntry[] {
  const { clipboard } = api;
  return [
    { label: t('Dividir no cursor'), icon: <Scissors size={14} />, shortcut: 'S', onClick: api.split },
    { label: t('Duplicar'), icon: <CopyPlus size={14} />, shortcut: shortcutLabel('duplicate'), onClick: () => api.apply(duplicate(api.project, selection)) },
    {
      label: t('Copiar'),
      icon: <Copy size={14} />,
      shortcut: shortcutLabel('copy'),
      onClick: () => api.setClipboard(copySelection(api.project, selection)),
    },
    {
      label: t('Recortar'),
      icon: <Scissors size={14} />,
      shortcut: shortcutLabel('cut'),
      onClick: () => {
        api.setClipboard(copySelection(api.project, selection));
        remove();
      },
    },
    clipboard &&
      clipboard.kind !== 'look' && {
        label: t('Colar no cursor'),
        icon: <ClipboardPaste size={14} />,
        shortcut: shortcutLabel('paste'),
        onClick: () => api.apply(pasteAt(api.project, clipboard, api.time)),
      },
  ];
}

/** Velocidade em submenu, com a atual marcada. */
function speedMenu(current: number, set: (speed: number) => void): MenuEntry {
  return {
    label: t('Velocidade'),
    icon: <Gauge size={14} />,
    items: SPEEDS.map((s) => ({ label: `${s}×`, checked: Math.abs(current - s) < 0.001, onClick: () => set(s) })),
  };
}

/** Copiar/colar/remover o "visual" (filtro e efeitos) de um clipe. */
function lookEntries(api: EditorApi, selection: Selection): MenuEntry[] {
  const clip = visualClip(api.project, selection);
  if (!clip) return [];
  const hasLook = !!clip.filter || clip.effects.length > 0;
  const { clipboard } = api;
  const media = api.project.media.find((m) => m.id === clip.mediaId);
  const length = selection?.kind === 'clip'
    ? (api.timeline.clips.find((l) => l.clip.id === clip.id)?.length ?? clipLength(clip))
    : clipLength(clip);
  const hasMove = !!clip.camera && Object.keys(clip.camera.keyframes).length > 0;
  return [
    (hasLook || hasMove) && {
      label: t('Salvar visual como pacote'),
      icon: <PackagePlus size={14} />,
      onClick: () => {
        saveUserPack(
          templateFromClip({
            name: t('Visual de {name}', { name: media?.name.replace(/.[^.]+$/, '') ?? t('clipe') }),
            color: '#6f7dff',
            duration: length,
            intensity: 1,
            fadeIn: 0,
            fadeOut: 0,
            effects: clip.effects,
            filter: clip.filter,
            camera: clip.camera ?? null,
            timing: 'edges',
          }),
        );
        api.notify(t('Salvo em Pacotes → Meus pacotes.'));
      },
    },
    hasLook && {
      label: t('Copiar filtro e efeitos'),
      icon: <WandSparkles size={14} />,
      onClick: () => {
        api.setClipboard(copyLook(api.project, selection));
        api.notify(t('Filtro e efeitos copiados. Clique direito em outro clipe → Colar filtro e efeitos.'));
      },
    },
    clipboard?.kind === 'look' && {
      label: t('Colar filtro e efeitos'),
      icon: <ClipboardPaste size={14} />,
      onClick: () => api.edit((p) => pasteLook(p, selection, clipboard)),
    },
    hasLook && {
      label: t('Remover filtro e efeitos'),
      icon: <Eraser size={14} />,
      onClick: () =>
        selection?.kind === 'overlay'
          ? api.edit((p) => updateOverlayClip(p, selection.id, (c) => ({ ...c, filter: null, effects: [] })))
          : selection?.kind === 'clip' && api.edit((p) => updateClip(p, selection.id, (c) => ({ ...c, filter: null, effects: [] }))),
    },
  ];
}

const PLACES: { label: string; transform: Partial<LayerTransform> }[] = [
  { label: t('Tela cheia'), transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, radius: 0 } },
  { label: t('Centro'), transform: { x: 0.5, y: 0.5, scale: 0.6 } },
  { label: t('Canto superior esquerdo'), transform: { x: 0.26, y: 0.27, scale: 0.4 } },
  { label: t('Canto superior direito'), transform: { x: 0.74, y: 0.27, scale: 0.4 } },
  { label: t('Canto inferior esquerdo'), transform: { x: 0.26, y: 0.73, scale: 0.4 } },
  { label: t('Canto inferior direito'), transform: { x: 0.74, y: 0.73, scale: 0.4 } },
];

const BLENDS: [BlendMode, string][] = [
  ['normal', t('Normal')],
  ['screen', t('Clarear')],
  ['add', t('Somar')],
  ['multiply', t('Escurecer')],
];

export function timelineMenu(api: EditorApi, target: TimelineTarget): MenuEntry[] {
  const { project } = api;

  if (target.kind === 'clip') {
    const layout = api.timeline.clips.find((l) => l.clip.id === target.id);
    if (!layout) return [];
    const { clip, media } = layout;
    const remove = () => {
      api.edit((p) => deleteMainClip(p, clip.id, api.ripple));
      api.select(null);
    };
    return [
      { header: media.name },
      media.compound && { label: t('Abrir o clipe composto (editar por dentro)'), icon: <Boxes size={14} />, onClick: () => api.openCompound(media.id) },
      ...clipboardEntries(api, target, remove),
      sep,
      { label: t('Juntar num clipe composto…'), icon: <Boxes size={14} />, onClick: () => api.compound(layout.start, layout.start + layout.length) },
      media.kind === 'video' && { label: t('Dividir nas mudanças de cena'), icon: <Scissors size={14} />, onClick: () => api.splitScenes(clip.id) },
      media.kind === 'image' && {
        label: t('Foto 3D (a câmera entra na foto)'),
        icon: <Layers3 size={14} />,
        items: PARALLAX_MOTIONS.map((m) => ({ label: m.label, onClick: () => api.photo3d({ kind: 'clip', id: clip.id }, m.id) })),
      },
      media.kind === 'image' && { label: t('Aumentar a resolução (IA, 2×)'), icon: <ImageUpscale size={14} />, onClick: () => api.upscalePhoto(media.id) },
      media.hasAudio && !clip.audioDetached && { label: t('Separar a voz da música'), icon: <AudioLines size={14} />, onClick: () => api.splitVoice({ kind: 'clip', id: clip.id }) },
      media.kind !== 'audio' && { label: t('Desfocar rostos automaticamente…'), icon: <ScanFace size={14} />, onClick: () => api.blurFaces({ kind: 'clip', id: clip.id }) },
      media.kind !== 'audio' && { label: t('Selecionar objeto…'), icon: <LassoSelect size={14} />, onClick: () => startObjectPick({ kind: 'clip', id: clip.id }) },
      media.kind !== 'audio' && { label: t('Corrigir o olhar…'), icon: <Eye size={14} />, onClick: () => startGazeFix({ kind: 'clip', id: clip.id }) },
      layout.index < api.timeline.clips.length - 1 && {
        label: t('Corte casado com o próximo clipe'),
        icon: <Scan size={14} />,
        onClick: () => requestTracking({ kind: 'matchCut', index: layout.index }),
      },
      stabilizeMenu(media, clip.camera, (strength) => api.stabilize({ kind: 'clip', id: clip.id }, strength)),
      ...clip.effects
        .filter((e) => e.pluginId === 'effects/apagar-objeto')
        .map((e, i, all) => ({
          label: all.length > 1 ? t('Fazer o apagador {n} seguir o objeto', { n: i + 1 }) : t('Fazer o apagador seguir o objeto'),
          icon: <Crosshair size={14} />,
          onClick: () => api.followEraser({ kind: 'clip', id: clip.id }, e.uid),
        })),
      media.kind === 'video' && speedMenu(speedOf(clip), (speed) => api.edit((p) => updateClip(p, clip.id, (c) => ({ ...c, speed })))),
      media.hasAudio &&
        !clip.audioDetached && {
          label: clip.volume > 0 ? t('Silenciar clipe') : t('Ativar som do clipe'),
          icon: clip.volume > 0 ? <VolumeX size={14} /> : <Volume2 size={14} />,
          onClick: () => api.edit((p) => updateClip(p, clip.id, (c) => ({ ...c, volume: c.volume > 0 ? 0 : 1 }))),
        },
      media.hasAudio && !clip.audioDetached && { label: t('Separar áudio'), icon: <Unlink size={14} />, onClick: () => api.detach(clip.id) },
      media.hasAudio && !clip.audioDetached && cleanMenu(api, { kind: 'clip', id: clip.id }),
      media.hasAudio && !clip.audioDetached && { label: t('Zoom automático na fala'), icon: <ZoomIn size={14} />, onClick: () => api.punchIn(clip.id) },
      media.hasAudio && !clip.audioDetached && { label: t('Detectar batidas do som'), icon: <Activity size={14} />, onClick: () => api.markBeats(layout.start + 0.01) },
      media.hasAudio &&
        !clip.audioDetached && {
          label: t('Cortar as pausas (silêncios)'),
          icon: <MicOff size={14} />,
          items: [
            { label: t('Só deste clipe'), onClick: () => api.cutSilences([clip.id]) },
            { label: t('De todos os clipes da trilha principal'), onClick: () => api.cutSilences(project.clips.map((c) => c.id)) },
          ],
        },
      media.cursor && {
        label: t('Gravação de tela'),
        icon: <MousePointerClick size={14} />,
        items: [
          {
            label: t('Zoom que segue o mouse (refazer)'),
            onClick: () => {
              const { keyframes, zooms } = cursorZoomKeyframes(media.cursor!, clip);
              api.edit((p) => updateClip(p, clip.id, (c) => ({ ...c, camera: { ...(c.camera ?? createCamera()), keyframes } })));
              api.notify(zooms ? t('{zooms} aproximação(ões) onde você clicou. Os keyframes ficam na aba Câmera para ajustar.', { zooms }) : t('Não achei cliques nesse trecho.'), zooms === 0);
            },
          },
          {
            label: t('Tirar o zoom'),
            onClick: () => api.edit((p) => updateClip(p, clip.id, (c) => ({ ...c, camera: c.camera && { ...c.camera, keyframes: {} } }))),
          },
          {
            label: t('Destacar o cursor'),
            checked: !!clip.cursorFx?.halo,
            onClick: () => api.edit((p) => updateClip(p, clip.id, (c) => ({ ...c, cursorFx: { ...(c.cursorFx ?? { ...DEFAULT_CURSOR_FX, clicks: false }), halo: !c.cursorFx?.halo } }))),
          },
          {
            label: t('Onda nos cliques'),
            checked: !!clip.cursorFx?.clicks,
            onClick: () => api.edit((p) => updateClip(p, clip.id, (c) => ({ ...c, cursorFx: { ...(c.cursorFx ?? { ...DEFAULT_CURSOR_FX, halo: false }), clicks: !c.cursorFx?.clicks } }))),
          },
        ],
      },
      transformMenu(clip, (fn) => api.edit((p) => updateClip(p, clip.id, fn))),
      {
        label: t('Trocar a mídia'),
        icon: <Replace size={14} />,
        items: project.media.filter((m) => m.kind !== 'audio' && m.id !== media.id).length
          ? project.media
              .filter((m) => m.kind !== 'audio' && m.id !== media.id)
              .slice(0, 30)
              .map((m) => ({ label: m.name, icon: m.kind === 'image' ? <ImageIcon size={14} /> : <Film size={14} />, onClick: () => api.replaceMedia(clip.id, m.id) }))
          : [{ label: t('Importe vídeos ou fotos primeiro'), disabled: true, onClick: () => {} }],
      },
      media.kind === 'video' && { label: t('Dublar este clipe (gravar voz)'), icon: <Clapperboard size={14} />, onClick: () => api.dub({ kind: 'clip', id: clip.id }) },
      media.kind === 'video' && {
        label: t('Congelar quadro no cursor'),
        icon: <Snowflake size={14} />,
        disabled: api.time < layout.start || api.time > layout.start + layout.length,
        onClick: () => api.freeze(clip.id),
      },
      media.kind === 'video' && {
        label: t('Inverter (tocar de trás pra frente)'),
        icon: <Rewind size={14} />,
        onClick: () => api.reverse({ kind: 'clip', id: clip.id }),
      },
      media.kind === 'video' && api.seamlessLoop && {
        label: t('Loop perfeito (o fim emenda no começo)'),
        icon: <InfinityIcon size={14} />,
        onClick: () => api.seamlessLoop?.(clip.id),
      },
      media.kind === 'video' && api.boomerang && {
        label: t('Boomerang (vai e volta)'),
        icon: <Repeat size={14} />,
        onClick: () => api.boomerang?.(clip.id),
      },
      {
        label: t('Mover para uma trilha de vídeo acima'),
        icon: <ArrowUp size={14} />,
        onClick: () => {
          const result = promoteToOverlay(project, clip.id);
          api.apply(result && { project: result.project, selection: { kind: 'overlay', id: result.id } });
        },
      },
      sep,
      ...lookEntries(api, target),
      api.timeline.clips.length > 1 && {
        label: t('Igualar a cor com…'),
        icon: <Pipette size={14} />,
        items: api.timeline.clips
          .filter((l) => l.clip.id !== clip.id && l.media.kind !== 'audio')
          .slice(0, 30)
          .map((l) => ({ label: `${l.index + 1}. ${l.media.name}`, onClick: () => api.matchColor(clip.id, l.clip.id) })),
      },
      sep,
      { label: t('Ir para o início do clipe'), icon: <SkipBack size={14} />, onClick: () => api.seek(layout.start) },
      { label: t('Ir para o fim do clipe'), icon: <SkipForward size={14} />, onClick: () => api.seek(layout.start + layout.length - 0.01) },
      sep,
      { label: t('Excluir'), icon: <Trash size={14} />, shortcut: shortcutLabel('delete'), danger: true, onClick: remove },
    ];
  }

  if (target.kind === 'overlay') {
    const found = findOverlayClip(project, target.id);
    if (!found) return [];
    const { clip } = found;
    const media = project.media.find((m) => m.id === clip.mediaId);
    const setTransform = (patch: Partial<LayerTransform>) =>
      api.edit((p) => updateOverlayClip(p, clip.id, (c) => ({ ...c, transform: { ...c.transform, ...patch } })));
    const remove = () => {
      api.edit((p) => removeOverlayClip(p, clip.id));
      api.select(null);
    };
    return [
      { header: media?.name ?? t('Sobreposição') },
      media?.compound && { label: t('Abrir o clipe composto (editar por dentro)'), icon: <Boxes size={14} />, onClick: () => api.openCompound(media.id) },
      ...clipboardEntries(api, target, remove),
      sep,
      {
        label: t('Posição'),
        icon: <Move size={14} />,
        items: PLACES.map((pl) => ({ label: pl.label, onClick: () => setTransform(pl.transform) })),
      },
      {
        label: t('Mesclagem'),
        icon: <Blend size={14} />,
        items: BLENDS.map(([value, label]) => ({ label, checked: clip.transform.blend === value, onClick: () => setTransform({ blend: value }) })),
      },
      {
        label: t('Remover fundo verde (chroma key)'),
        icon: <Layers size={14} />,
        checked: !!clip.transform.chroma,
        onClick: () => setTransform({ chroma: clip.transform.chroma ? null : { color: '#00ff00', similarity: 0.4, smoothness: 0.2 } }),
      },
      { label: t('Restaurar posição'), icon: <Maximize size={14} />, onClick: () => setTransform({ ...DEFAULT_TRANSFORM }) },
      transformMenu(clip, (fn) => api.edit((p) => updateOverlayClip(p, clip.id, (c) => ({ ...c, ...fn(c) })))),
      media?.kind === 'video' && {
        label: t('Inverter (tocar de trás pra frente)'),
        icon: <Rewind size={14} />,
        onClick: () => api.reverse({ kind: 'overlay', id: clip.id }),
      },
      media?.kind === 'video' && { label: t('Dublar este clipe (gravar voz)'), icon: <Clapperboard size={14} />, onClick: () => api.dub({ kind: 'overlay', id: clip.id }) },
      media?.kind !== 'audio' && { label: t('Desfocar rostos automaticamente…'), icon: <ScanFace size={14} />, onClick: () => api.blurFaces({ kind: 'overlay', id: clip.id }) },
      media && media.kind !== 'audio' && { label: t('Selecionar objeto…'), icon: <LassoSelect size={14} />, onClick: () => startObjectPick({ kind: 'overlay', id: clip.id }) },
      media && media.kind !== 'audio' && { label: t('Corrigir o olhar…'), icon: <Eye size={14} />, onClick: () => startGazeFix({ kind: 'overlay', id: clip.id }) },
      media && media.kind !== 'audio' && {
        label: clip.cornerPin ? t('Ajustar a tela trocada (cantos)…') : t('Trocar a tela (rastrear 4 cantos)…'),
        icon: <ScanLine size={14} />,
        onClick: () => requestTracking({ kind: 'corners', id: clip.id }),
      },
      stabilizeMenu(media, clip.camera, (strength) => api.stabilize({ kind: 'overlay', id: clip.id }, strength)),
      media?.kind === 'image' && {
        label: t('Foto 3D (a câmera entra na foto)'),
        icon: <Layers3 size={14} />,
        items: PARALLAX_MOTIONS.map((m) => ({ label: m.label, onClick: () => api.photo3d({ kind: 'overlay', id: clip.id }, m.id) })),
      },
      ...clip.effects
        .filter((e) => e.pluginId === 'effects/apagar-objeto')
        .map((e) => ({ label: t('Fazer o apagador seguir o objeto'), icon: <Crosshair size={14} />, onClick: () => api.followEraser({ kind: 'overlay', id: clip.id }, e.uid) })),
      media?.kind === 'video' &&
        speedMenu(speedOf(clip), (speed) => api.edit((p) => updateOverlayClip(p, clip.id, (c) => ({ ...c, speed })))),
      media?.kind === 'video' &&
        media.hasAudio && { label: t('Multicâmera: sincronizar as câmeras pelo som'), icon: <Video size={14} />, onClick: api.syncCameras },
      clip.multicam && { label: t('Multicâmera: cortar sozinho para quem fala'), icon: <Users size={14} />, onClick: api.autoMulticam },
      groupEntry(api, clip.id),
      {
        label: t('Levar para a trilha principal'),
        icon: <ArrowDown size={14} />,
        onClick: () => {
          const result = demoteToMain(project, clip.id);
          api.apply(result && { project: result.project, selection: { kind: 'clip', id: result.id } });
        },
      },
      sep,
      ...lookEntries(api, target),
      sep,
      { label: t('Excluir'), icon: <Trash size={14} />, shortcut: shortcutLabel('delete'), danger: true, onClick: remove },
    ];
  }

  if (target.kind === 'audio') {
    const found = findAudioClip(project, target.id);
    if (!found) return [];
    const { clip, track } = found;
    const length = clipLength(clip);
    const set = (patch: Partial<typeof clip>) => api.edit((p) => updateAudioClip(p, clip.id, (c) => ({ ...c, ...patch })));
    const remove = () => {
      api.edit((p) => removeAudioClip(p, clip.id));
      api.select(null);
    };
    return [
      { header: project.media.find((m) => m.id === clip.mediaId)?.name ?? t('Áudio') },
      ...clipboardEntries(api, target, remove),
      sep,
      {
        label: t('Volume'),
        icon: <Volume2 size={14} />,
        items: [0, 0.5, 1, 1.5, 2].map((v) => ({ label: `${v * 100}%`, checked: Math.abs(clip.volume - v) < 0.01, onClick: () => set({ volume: v }) })),
      },
      {
        label: t('Efeito de voz'),
        icon: <Mic size={14} />,
        items: VOICE_EFFECTS.map((v) => ({ label: v.label, checked: (clip.voice ?? 'none') === v.id, onClick: () => set({ voice: v.id }) })),
      },
      { label: t('Normalizar volume'), icon: <SlidersVertical size={14} />, onClick: () => api.normalize(clip.id) },
      cleanMenu(api, { kind: 'audio', id: clip.id }),
      { label: t('Sincronizar com o vídeo (pelo som)'), icon: <AudioWaveform size={14} />, onClick: () => api.syncAudio(clip.id) },
      { label: t('Separar a voz da música'), icon: <AudioLines size={14} />, onClick: () => api.splitVoice({ kind: 'audio', id: clip.id }) },
      {
        label: t('Encaixar a música na duração'),
        icon: <Music size={14} />,
        items: [
          api.timeline.videoDuration > clip.start + 1 && {
            label: t('Terminar junto com o vídeo ({seconds}s)', { seconds: (api.timeline.videoDuration - clip.start).toFixed(1) }),
            onClick: () => api.fitMusic(clip.id),
          },
          ...[15, 30, 60].map((seconds) => ({ label: t('{seconds} segundos', { seconds }), onClick: () => api.fitMusic(clip.id, seconds) })),
        ],
      },
      groupEntry(api, clip.id),
      { label: t('Detectar batidas da música'), icon: <Activity size={14} />, onClick: () => api.markBeats(clip.start + 0.01) },
      project.clips.length > 0 && montageMenu(api, clip.start + 0.01),
      {
        label: t('Esta trilha é…'),
        icon: <AudioLines size={14} />,
        items: [
          { label: t('Música (abaixa quando há voz)'), checked: track.kind === 'music', onClick: () => api.edit((p) => updateAudioTrack(p, track.id, (tr) => ({ ...tr, kind: 'music' }))) },
          { label: t('Voz (narração/dublagem)'), checked: track.kind === 'voice', onClick: () => api.edit((p) => updateAudioTrack(p, track.id, (tr) => ({ ...tr, kind: 'voice' }))) },
          { label: t('Efeitos sonoros'), checked: track.kind === 'sfx', onClick: () => api.edit((p) => updateAudioTrack(p, track.id, (tr) => ({ ...tr, kind: 'sfx' }))) },
          { label: t('Outro som'), checked: !track.kind || track.kind === 'other', onClick: () => api.edit((p) => updateAudioTrack(p, track.id, (tr) => ({ ...tr, kind: 'other' }))) },
        ],
      },
      { label: t('Aparecer aos poucos (1s)'), checked: clip.fadeIn > 0, onClick: () => set({ fadeIn: clip.fadeIn > 0 ? 0 : Math.min(1, length / 2) }) },
      { label: t('Sumir aos poucos (1s)'), checked: clip.fadeOut > 0, onClick: () => set({ fadeOut: clip.fadeOut > 0 ? 0 : Math.min(1, length / 2) }) },
      speedMenu(speedOf(clip), (speed) => set({ speed })),
      {
        label: track.muted ? t('Ativar som da {track}', { track: track.name }) : t('Silenciar a {track}', { track: track.name }),
        icon: track.muted ? <Volume2 size={14} /> : <VolumeX size={14} />,
        onClick: () => api.edit((p) => updateAudioTrack(p, track.id, (tr) => ({ ...tr, muted: !tr.muted }))),
      },
      sep,
      { label: t('Excluir'), icon: <Trash size={14} />, shortcut: shortcutLabel('delete'), danger: true, onClick: remove },
    ];
  }

  if (target.kind === 'text') {
    const found = findTextClip(project, target.id);
    if (!found) return [];
    const { clip } = found;
    const remove = () => {
      api.edit((p) => removeTextClip(p, clip.id));
      api.select(null);
    };
    return [
      { header: clip.text.split('\n')[0] || t('Texto') },
      ...clipboardEntries(api, target, remove),
      sep,
      {
        label: t('Posição'),
        icon: <Move size={14} />,
        items: [
          [t('No topo'), 0.15],
          [t('No centro'), 0.5],
          [t('Embaixo'), 0.85],
        ].map(([label, y]) => ({
          label: label as string,
          onClick: () => api.edit((p) => updateTextClip(p, clip.id, (c) => ({ ...c, x: 0.5, y: y as number }))),
        })),
      },
      {
        label: t('Atrás da pessoa'),
        checked: !!clip.behind,
        onClick: () => api.edit((p) => updateTextClip(p, clip.id, (c) => ({ ...c, behind: c.behind ? undefined : true }))),
      },
      groupEntry(api, clip.id),
      sep,
      { label: t('Excluir'), icon: <Trash size={14} />, shortcut: shortcutLabel('delete'), danger: true, onClick: remove },
    ];
  }

  if (target.kind === 'pack') {
    const found = findPackClip(project, target.id);
    if (!found) return [];
    const { clip, track } = found;
    const set = (patch: Partial<typeof clip>) => api.edit((p) => updatePackClip(p, clip.id, (c) => ({ ...c, ...patch })));
    const remove = () => {
      api.edit((p) => deletePack(p, clip.id));
      api.select(null);
    };
    return [
      { header: clip.name },
      ...clipboardEntries(api, target, remove),
      sep,
      {
        label: t('Intensidade'),
        icon: <Gauge size={14} />,
        items: [0.25, 0.5, 0.75, 1].map((v) => ({ label: `${v * 100}%`, checked: Math.abs(clip.intensity - v) < 0.01, onClick: () => set({ intensity: v }) })),
      },
      { label: t('Entrada suave (0,5s)'), checked: clip.fadeIn > 0, onClick: () => set({ fadeIn: clip.fadeIn > 0 ? 0 : Math.min(0.5, clip.duration / 2) }) },
      clip.speed?.speeds.some((v) => v < 1) && {
        label: t('Silenciar o som no trecho lento'),
        icon: <VolumeX size={14} />,
        checked: !!clip.speed.muted,
        onClick: () => api.edit((p) => setSlowMuted(p, clip.id, !clip.speed?.muted)),
      },
      { label: t('Saída suave (0,5s)'), checked: clip.fadeOut > 0, onClick: () => set({ fadeOut: clip.fadeOut > 0 ? 0 : Math.min(0.5, clip.duration / 2) }) },
      {
        label: t('Salvar como meu pacote'),
        icon: <PackagePlus size={14} />,
        onClick: () => {
          saveUserPack(templateFromClip(clip, 'cursor'));
          api.notify(t('"{name}" salvo em Pacotes → Meus pacotes.', { name: clip.name }));
        },
      },
      {
        label: track.hidden ? t('Mostrar a trilha {track}', { track: track.name }) : t('Esconder a trilha {track}', { track: track.name }),
        icon: track.hidden ? <Eye size={14} /> : <EyeOff size={14} />,
        onClick: () => api.edit((p) => updatePackTrack(p, track.id, (tr) => ({ ...tr, hidden: !tr.hidden }))),
      },
      groupEntry(api, clip.id),
      sep,
      clip.speed && { label: t('Ir para o momento da câmera lenta'), icon: <Gauge size={14} />, onClick: () => api.seek(clip.start + (clip.speed?.moment ?? 0)) },
      { label: t('Ir para o início do bloco'), icon: <SkipBack size={14} />, onClick: () => api.seek(clip.start) },
      { label: t('Ir para o fim do bloco'), icon: <SkipForward size={14} />, onClick: () => api.seek(clip.start + clip.duration - 0.01) },
      sep,
      { label: t('Excluir'), icon: <Trash size={14} />, shortcut: shortcutLabel('delete'), danger: true, onClick: remove },
    ];
  }

  if (target.kind === 'transition') {
    const transition = project.transitions[target.index];
    const plugin = transition && getPlugin(transition.pluginId);
    const featured = ['dissolver', 'onda-de-choque', 'zoom-de-tensao', 'terremoto', 'vidro-quebrado', 'flash-de-vinheta', 'nuvem', 'empilhar']
      .map((id) => getPlugin(`transitions/${id}`))
      .filter((p): p is ShaderPlugin => !!p);
    const set = (pluginId: string) =>
      api.edit((p) => setTransition(p, target.index, createTransition(pluginId, p.transitions[target.index]?.duration)));
    return [
      { header: plugin ? plugin.name : t('Corte seco') },
      transition && {
        label: t('Duração'),
        icon: <Gauge size={14} />,
        items: [0.3, 0.5, 0.8, 1.2, 2].map((d) => ({
          label: `${d.toFixed(1)}s`,
          checked: Math.abs(transition.duration - d) < 0.01,
          onClick: () => api.edit((p) => setTransition(p, target.index, { ...transition, duration: d })),
        })),
      },
      {
        label: t('Trocar por'),
        icon: <Blend size={14} />,
        items: featured.map((p) => ({ label: p.name, checked: transition?.pluginId === p.id, onClick: () => set(p.id) })),
      },
      {
        label: t('Corte casado automático'),
        icon: <Scan size={14} />,
        onClick: () => requestTracking({ kind: 'matchCut', index: target.index }),
      },
      transition && {
        label: t('Usar esta em todas as junções'),
        icon: <CopyPlus size={14} />,
        onClick: () => api.edit((p) => ({ ...p, transitions: p.transitions.map(() => ({ ...transition, params: { ...transition.params } })) })),
      },
      sep,
      transition
        ? { label: t('Remover (corte seco)'), icon: <Trash size={14} />, danger: true, onClick: () => api.edit((p) => setTransition(p, target.index, null)) }
        : { label: t('Adicionar dissolver'), icon: <Plus size={14} />, onClick: () => set('transitions/dissolver') },
    ];
  }

  if (target.kind === 'comment') {
    const comment = project.comments?.find((c) => c.id === target.id);
    if (!comment) return [];
    return [
      { header: comment.text || t('Comentário') },
      { label: t('Abrir'), icon: <MessageSquare size={14} />, onClick: () => api.openComment(comment.id) },
      { label: comment.done ? t('Marcar como a fazer') : t('Marcar como feito'), checked: comment.done, onClick: () => api.toggleComment(comment.id) },
      { label: t('Ir para este ponto'), icon: <SkipForward size={14} />, onClick: () => api.seek(comment.time) },
      sep,
      { label: t('Apagar comentário'), icon: <Trash size={14} />, danger: true, onClick: () => api.deleteComment(comment.id) },
    ];
  }

  if (target.kind === 'marker') {
    const marker = project.markers.find((m) => m.id === target.id);
    if (!marker) return [];
    return [
      { header: marker.label },
      {
        label: t('Renomear…'),
        icon: <Pencil size={14} />,
        onClick: () => {
          const label = prompt(t('Nome do marcador:'), marker.label)?.trim();
          if (label) api.edit((p) => updateMarker(p, marker.id, (m) => ({ ...m, label })));
        },
      },
      {
        label: t('Cor'),
        icon: <span className="size-3 rounded-sm" style={{ background: marker.color }} />,
        items: MARKER_COLORS.map((color) => ({
          label: color,
          icon: <span className="size-3 rounded-sm" style={{ background: color }} />,
          checked: marker.color === color,
          onClick: () => api.edit((p) => updateMarker(p, marker.id, (m) => ({ ...m, color }))),
        })),
      },
      { label: t('Mover para o cursor'), icon: <SkipForward size={14} />, onClick: () => api.edit((p) => updateMarker(p, marker.id, (m) => ({ ...m, time: api.time }))) },
      sep,
      { label: t('Excluir marcador'), icon: <Trash size={14} />, danger: true, onClick: () => api.edit((p) => removeMarker(p, marker.id)) },
      project.markers.length > 1 && {
        label: t('Excluir todos os marcadores'),
        danger: true,
        onClick: () => api.edit((p) => ({ ...p, markers: [] })),
      },
    ];
  }

  if (target.kind !== 'empty') return [];
  // Área vazia da timeline
  const { clipboard } = api;
  return [
    clipboard &&
      clipboard.kind !== 'look' && {
        label: t('Colar aqui'),
        icon: <ClipboardPaste size={14} />,
        onClick: () => api.apply(pasteAt(project, clipboard, target.time)),
      },
    { label: t('Mover o cursor para cá'), icon: <SkipForward size={14} />, onClick: () => api.seek(target.time) },
    { label: t('Adicionar marcador aqui'), icon: <Bookmark size={14} />, shortcut: 'M', onClick: () => api.addMarker(target.time) },
    { label: t('Adicionar comentário aqui'), icon: <MessageSquare size={14} />, onClick: () => api.addComment(target.time) },
    { label: t('Detectar batidas da música aqui'), icon: <Activity size={14} />, onClick: () => api.markBeats(target.time) },
    project.clips.length > 1 && montageMenu(api, target.time),
    project.clips.length > 0 && { label: t('Zoom automático na fala (todos os clipes)'), icon: <ZoomIn size={14} />, onClick: () => api.punchIn() },
    project.clips.length > 0 && { label: t('Destaques para Shorts e Reels…'), icon: <Smartphone size={14} />, onClick: () => api.openTool('highlights') },
    { label: t('Capítulos para o YouTube…'), icon: <Bookmark size={14} />, onClick: () => api.openTool('chapters') },
    project.videoTracks.some((tr) => tr.clips.length > 0) && { label: t('Multicâmera: sincronizar as câmeras pelo som'), icon: <Video size={14} />, onClick: api.syncCameras },
    project.videoTracks.some((tr) => tr.clips.some((c) => c.multicam)) && { label: t('Multicâmera: cortar sozinho para quem fala'), icon: <Users size={14} />, onClick: api.autoMulticam },
    project.clips.length > 0 && {
      label: t('Cortar as pausas de todos os clipes'),
      icon: <MicOff size={14} />,
      onClick: () => api.cutSilences(project.clips.map((c) => c.id)),
    },
    project.width > project.height &&
      project.clips.length > 0 && { label: t('Converter para vertical (seguindo rostos)'), icon: <Smartphone size={14} />, onClick: api.reframeVertical },
    (project.beats?.length ?? 0) > 0 && {
      label: t('Limpar as {n} batidas marcadas', { n: project.beats!.length }),
      icon: <Eraser size={14} />,
      onClick: () => api.edit((p) => ({ ...p, beats: [] })),
    },
    { label: t('Dividir no cursor'), icon: <Scissors size={14} />, shortcut: 'S', onClick: api.split },
    project.clips.length > 0 && { label: t('Clipe composto a partir daqui…'), icon: <Boxes size={14} />, onClick: () => api.compound(target.time, target.time + 5) },
    sep,
    { label: t('Nova trilha de vídeo'), icon: <Film size={14} />, onClick: () => api.edit(addVideoTrack) },
    { label: t('Nova trilha de áudio'), icon: <AudioLines size={14} />, onClick: () => api.edit(addAudioTrack) },
    { label: t('Nova trilha de texto'), icon: <Type size={14} />, onClick: () => api.edit(addTextTrack) },
    { label: t('Nova trilha de pacotes'), icon: <Package size={14} />, onClick: () => api.edit(addPackTrack) },
    sep,
    { label: t('Importar mídia…'), icon: <Upload size={14} />, onClick: api.openImport },
  ];
}

export function mediaMenu(api: EditorApi, media: MediaItem, removeMedia: () => void): MenuEntry[] {
  const visual = media.kind !== 'audio';
  return [
    { header: media.name },
    visual && {
      label: t('Adicionar à trilha principal'),
      icon: <Film size={14} />,
      onClick: () => {
        const clip = createVideoClip(media);
        api.apply({ project: insertVideoClips(api.project, [clip]), selection: { kind: 'clip', id: clip.id } });
      },
    },
    visual && {
      label: t('Sobrepor no cursor (picture-in-picture)'),
      icon: <Layers size={14} />,
      onClick: () => {
        const clip = createOverlayClip(media, api.time);
        api.apply({ project: placeOverlayClip(api.project, clip), selection: { kind: 'overlay', id: clip.id } });
      },
    },
    visual && {
      label: t('Sobrepor em tela cheia no cursor'),
      icon: <Maximize size={14} />,
      onClick: () => {
        const clip = createOverlayClip(media, api.time, { ...DEFAULT_TRANSFORM });
        api.apply({ project: placeOverlayClip(api.project, clip), selection: { kind: 'overlay', id: clip.id } });
      },
    },
    visual &&
      api.selection?.kind === 'clip' && {
        label: t('Trocar o clipe selecionado por esta'),
        icon: <Replace size={14} />,
        onClick: () => api.selection?.kind === 'clip' && api.replaceMedia(api.selection.id, media.id),
      },
    media.hasAudio && {
      label: media.kind === 'audio' ? t('Adicionar no cursor') : t('Adicionar só o áudio no cursor'),
      icon: <AudioLines size={14} />,
      onClick: () => {
        const clip = createAudioClip(media, api.time);
        api.apply({ project: placeAudioClip(api.project, clip), selection: { kind: 'audio', id: clip.id } });
      },
    },
    sep,
    { label: t('Remover do projeto'), icon: <Trash size={14} />, danger: true, onClick: removeMedia },
  ];
}

/** Clique direito num filtro/efeito/transição da biblioteca. */
export function pluginMenu(api: EditorApi, plugin: ShaderPlugin, applySelected: () => void): MenuEntry[] {
  const applyAll = () => {
    if (plugin.kind === 'transition') {
      api.edit((p) => ({ ...p, transitions: p.transitions.map((tr) => createTransition(plugin.id, tr?.duration)) }));
      api.notify(t('"{name}" aplicada em todas as junções.', { name: plugin.name }));
      return;
    }
    api.edit((p) => ({
      ...p,
      clips: p.clips.map((c) => {
        if (plugin.kind === 'filter') return { ...c, filter: createFilter(plugin.id, c.filter?.intensity ?? 1) };
        const effect = createEffect(plugin.id);
        return effect ? { ...c, effects: [...c.effects, effect] } : c;
      }),
    }));
    api.notify(t('"{name}" aplicado em todos os clipes da trilha principal.', { name: plugin.name }));
  };
  return [
    { header: plugin.name },
    { label: plugin.kind === 'transition' ? t('Aplicar na transição selecionada') : t('Aplicar no clipe selecionado'), icon: <Sparkles size={14} />, onClick: applySelected },
    {
      label: plugin.kind === 'transition' ? t('Aplicar em todas as junções') : t('Aplicar em todos os clipes'),
      icon: plugin.kind === 'filter' ? <Palette size={14} /> : <CopyPlus size={14} />,
      onClick: applyAll,
    },
  ];
}

export function previewMenu(api: EditorApi): MenuEntry[] {
  return [
    { label: api.playing ? t('Pausar') : t('Tocar'), icon: api.playing ? <Pause size={14} /> : <Play size={14} />, shortcut: t('Espaço'), onClick: api.togglePlay },
    sep,
    { label: t('Salvar quadro atual (PNG)'), icon: <ImageDown size={14} />, onClick: api.saveFrame },
    { label: t('Copiar quadro atual'), icon: <Camera size={14} />, onClick: api.copyFrame },
    { label: t('Criar capa com este quadro…'), icon: <ImageIcon size={14} />, onClick: api.makeThumbnail },
  ];
}

/** Clique direito num pacote da biblioteca. */
export function packMenu(api: EditorApi, template: PackTemplate): MenuEntry[] {
  const selected = api.selection;
  const clip = visualClip(api.project, selected);
  const layout = selected?.kind === 'clip' ? api.timeline.clips.find((l) => l.clip.id === selected.id) : null;
  return [
    { header: template.name },
    {
      label: t('Aplicar no cursor'),
      icon: <Package size={14} />,
      onClick: () => api.addPack(template, api.time),
    },
    template.timing === 'stretch' &&
      template.anchor === 'cursor' && {
        label: (api.project.beats?.length ?? 0) > 0 ? t('Repetir em cada batida marcada') : t('Repetir em cada batida (detecta antes)'),
        icon: <Activity size={14} />,
        disabled: (api.project.beats?.length ?? 0) === 0,
        onClick: () => {
          // No trecho do clipe selecionado ou em todas as batidas.
          const span = layout ? { start: layout.start, end: layout.start + layout.length } : null;
          const beats = (api.project.beats ?? []).filter((b) => !span || (b >= span.start && b < span.end)).slice(0, 300);
          api.edit((p) => beats.reduce((acc, b) => placePackClip(acc, createPackClip(template, b)), p));
          api.notify(t('"{name}" repetido em {n} batidas.', { name: template.name, n: beats.length }));
        },
      },
    {
      label: t('Fixar direto no clipe selecionado'),
      icon: <Stamp size={14} />,
      disabled: !clip,
      onClick: () => {
        if (!clip || !selected || (selected.kind !== 'clip' && selected.kind !== 'overlay')) return;
        const length = layout?.length ?? clipLength(clip);
        if (selected.kind === 'clip') api.edit((p) => updateClip(p, selected.id, (c) => bakePack(template, c, length)));
        else api.edit((p) => updateOverlayClip(p, selected.id, (c) => bakePack(template, c, length)));
        api.notify(t('"{name}" fixado no clipe (filtro, efeitos e câmera agora são do clipe).', { name: template.name }));
      },
    },
    template.custom && sep,
    template.custom && {
      label: t('Excluir dos meus pacotes'),
      icon: <Trash size={14} />,
      danger: true,
      onClick: () => removeUserPack(template.id),
    },
  ];
}
