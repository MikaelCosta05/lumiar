import {
  ArrowDown,
  ArrowUp,
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
} from 'lucide-react';
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
  removeClip,
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
import { VOICE_EFFECTS } from '../media/voiceFx';
import type { MenuEntry } from './ContextMenu';
import type { Selection } from './selection';
import type { TimelineTarget } from './Timeline';

/** Tudo que os menus precisam do editor. */
export interface EditorApi {
  project: Project;
  timeline: TimelineLayout;
  time: number;
  playing: boolean;
  clipboard: CopiedItem | null;
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
  addMarker: (time: number) => void;
  /** Grava a voz exatamente no trecho do clipe (dublagem) */
  dub: (target: { kind: 'clip' | 'overlay'; id: string }) => void;
  /** Ajusta o volume do clipe de áudio para o pico ficar em -1 dB */
  normalize: (clipId: string) => void;
}

/** Girar 90° e espelhar, para clipes da trilha principal ou sobrepostos. */
function transformMenu(clip: VideoClip, update: (fn: (c: VideoClip) => VideoClip) => void): MenuEntry {
  return {
    label: 'Girar e espelhar',
    icon: <RotateCw size={14} />,
    items: [
      { label: 'Girar 90° à direita', icon: <RotateCw size={14} />, onClick: () => update((c) => turnClip(c, 90)) },
      { label: 'Girar 90° à esquerda', icon: <RotateCcw size={14} />, onClick: () => update((c) => turnClip(c, -90)) },
      'separator',
      { label: 'Espelhar na horizontal', icon: <ArrowLeftRight size={14} />, checked: !!clip.flipX, onClick: () => update((c) => ({ ...c, flipX: !c.flipX })) },
      { label: 'Espelhar na vertical', icon: <ArrowUpDown size={14} />, checked: !!clip.flipY, onClick: () => update((c) => ({ ...c, flipY: !c.flipY })) },
      clip.turn || clip.flipX || clip.flipY
        ? { label: 'Desfazer giro e espelho', onClick: () => update((c) => ({ ...c, turn: 0, flipX: false, flipY: false })) }
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
    { label: 'Dividir no cursor', icon: <Scissors size={14} />, shortcut: 'S', onClick: api.split },
    { label: 'Duplicar', icon: <CopyPlus size={14} />, shortcut: 'Ctrl+D', onClick: () => api.apply(duplicate(api.project, selection)) },
    {
      label: 'Copiar',
      icon: <Copy size={14} />,
      shortcut: 'Ctrl+C',
      onClick: () => api.setClipboard(copySelection(api.project, selection)),
    },
    {
      label: 'Recortar',
      icon: <Scissors size={14} />,
      shortcut: 'Ctrl+X',
      onClick: () => {
        api.setClipboard(copySelection(api.project, selection));
        remove();
      },
    },
    clipboard &&
      clipboard.kind !== 'look' && {
        label: 'Colar no cursor',
        icon: <ClipboardPaste size={14} />,
        shortcut: 'Ctrl+V',
        onClick: () => api.apply(pasteAt(api.project, clipboard, api.time)),
      },
  ];
}

/** Velocidade em submenu, com a atual marcada. */
function speedMenu(current: number, set: (speed: number) => void): MenuEntry {
  return {
    label: 'Velocidade',
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
  return [
    hasLook && {
      label: 'Copiar filtro e efeitos',
      icon: <WandSparkles size={14} />,
      onClick: () => {
        api.setClipboard(copyLook(api.project, selection));
        api.notify('Filtro e efeitos copiados. Clique direito em outro clipe → Colar filtro e efeitos.');
      },
    },
    clipboard?.kind === 'look' && {
      label: 'Colar filtro e efeitos',
      icon: <ClipboardPaste size={14} />,
      onClick: () => api.edit((p) => pasteLook(p, selection, clipboard)),
    },
    hasLook && {
      label: 'Remover filtro e efeitos',
      icon: <Eraser size={14} />,
      onClick: () =>
        selection?.kind === 'overlay'
          ? api.edit((p) => updateOverlayClip(p, selection.id, (c) => ({ ...c, filter: null, effects: [] })))
          : selection?.kind === 'clip' && api.edit((p) => updateClip(p, selection.id, (c) => ({ ...c, filter: null, effects: [] }))),
    },
  ];
}

const PLACES: { label: string; transform: Partial<LayerTransform> }[] = [
  { label: 'Tela cheia', transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, radius: 0 } },
  { label: 'Centro', transform: { x: 0.5, y: 0.5, scale: 0.6 } },
  { label: 'Canto superior esquerdo', transform: { x: 0.26, y: 0.27, scale: 0.4 } },
  { label: 'Canto superior direito', transform: { x: 0.74, y: 0.27, scale: 0.4 } },
  { label: 'Canto inferior esquerdo', transform: { x: 0.26, y: 0.73, scale: 0.4 } },
  { label: 'Canto inferior direito', transform: { x: 0.74, y: 0.73, scale: 0.4 } },
];

const BLENDS: [BlendMode, string][] = [
  ['normal', 'Normal'],
  ['screen', 'Clarear'],
  ['add', 'Somar'],
  ['multiply', 'Escurecer'],
];

export function timelineMenu(api: EditorApi, target: TimelineTarget): MenuEntry[] {
  const { project } = api;

  if (target.kind === 'clip') {
    const layout = api.timeline.clips.find((l) => l.clip.id === target.id);
    if (!layout) return [];
    const { clip, media } = layout;
    const remove = () => {
      api.edit((p) => removeClip(p, clip.id));
      api.select(null);
    };
    return [
      { header: media.name },
      ...clipboardEntries(api, target, remove),
      sep,
      media.kind === 'video' && speedMenu(speedOf(clip), (speed) => api.edit((p) => updateClip(p, clip.id, (c) => ({ ...c, speed })))),
      media.hasAudio &&
        !clip.audioDetached && {
          label: clip.volume > 0 ? 'Silenciar clipe' : 'Ativar som do clipe',
          icon: clip.volume > 0 ? <VolumeX size={14} /> : <Volume2 size={14} />,
          onClick: () => api.edit((p) => updateClip(p, clip.id, (c) => ({ ...c, volume: c.volume > 0 ? 0 : 1 }))),
        },
      media.hasAudio && !clip.audioDetached && { label: 'Separar áudio', icon: <Unlink size={14} />, onClick: () => api.detach(clip.id) },
      transformMenu(clip, (fn) => api.edit((p) => updateClip(p, clip.id, fn))),
      media.kind === 'video' && { label: 'Dublar este clipe (gravar voz)', icon: <Clapperboard size={14} />, onClick: () => api.dub({ kind: 'clip', id: clip.id }) },
      media.kind === 'video' && {
        label: 'Congelar quadro no cursor',
        icon: <Snowflake size={14} />,
        disabled: api.time < layout.start || api.time > layout.start + layout.length,
        onClick: () => api.freeze(clip.id),
      },
      media.kind === 'video' && {
        label: 'Inverter (tocar de trás pra frente)',
        icon: <Rewind size={14} />,
        onClick: () => api.reverse({ kind: 'clip', id: clip.id }),
      },
      {
        label: 'Mover para uma trilha de vídeo acima',
        icon: <ArrowUp size={14} />,
        onClick: () => {
          const result = promoteToOverlay(project, clip.id);
          api.apply(result && { project: result.project, selection: { kind: 'overlay', id: result.id } });
        },
      },
      sep,
      ...lookEntries(api, target),
      sep,
      { label: 'Ir para o início do clipe', icon: <SkipBack size={14} />, onClick: () => api.seek(layout.start) },
      { label: 'Ir para o fim do clipe', icon: <SkipForward size={14} />, onClick: () => api.seek(layout.start + layout.length - 0.01) },
      sep,
      { label: 'Excluir', icon: <Trash size={14} />, shortcut: 'Delete', danger: true, onClick: remove },
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
      { header: media?.name ?? 'Sobreposição' },
      ...clipboardEntries(api, target, remove),
      sep,
      {
        label: 'Posição',
        icon: <Move size={14} />,
        items: PLACES.map((pl) => ({ label: pl.label, onClick: () => setTransform(pl.transform) })),
      },
      {
        label: 'Mesclagem',
        icon: <Blend size={14} />,
        items: BLENDS.map(([value, label]) => ({ label, checked: clip.transform.blend === value, onClick: () => setTransform({ blend: value }) })),
      },
      {
        label: 'Remover fundo verde (chroma key)',
        icon: <Layers size={14} />,
        checked: !!clip.transform.chroma,
        onClick: () => setTransform({ chroma: clip.transform.chroma ? null : { color: '#00ff00', similarity: 0.4, smoothness: 0.2 } }),
      },
      { label: 'Restaurar posição', icon: <Maximize size={14} />, onClick: () => setTransform({ ...DEFAULT_TRANSFORM }) },
      transformMenu(clip, (fn) => api.edit((p) => updateOverlayClip(p, clip.id, (c) => ({ ...c, ...fn(c) })))),
      media?.kind === 'video' && {
        label: 'Inverter (tocar de trás pra frente)',
        icon: <Rewind size={14} />,
        onClick: () => api.reverse({ kind: 'overlay', id: clip.id }),
      },
      media?.kind === 'video' && { label: 'Dublar este clipe (gravar voz)', icon: <Clapperboard size={14} />, onClick: () => api.dub({ kind: 'overlay', id: clip.id }) },
      media?.kind === 'video' &&
        speedMenu(speedOf(clip), (speed) => api.edit((p) => updateOverlayClip(p, clip.id, (c) => ({ ...c, speed })))),
      {
        label: 'Levar para a trilha principal',
        icon: <ArrowDown size={14} />,
        onClick: () => {
          const result = demoteToMain(project, clip.id);
          api.apply(result && { project: result.project, selection: { kind: 'clip', id: result.id } });
        },
      },
      sep,
      ...lookEntries(api, target),
      sep,
      { label: 'Excluir', icon: <Trash size={14} />, shortcut: 'Delete', danger: true, onClick: remove },
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
      { header: project.media.find((m) => m.id === clip.mediaId)?.name ?? 'Áudio' },
      ...clipboardEntries(api, target, remove),
      sep,
      {
        label: 'Volume',
        icon: <Volume2 size={14} />,
        items: [0, 0.5, 1, 1.5, 2].map((v) => ({ label: `${v * 100}%`, checked: Math.abs(clip.volume - v) < 0.01, onClick: () => set({ volume: v }) })),
      },
      {
        label: 'Efeito de voz',
        icon: <Mic size={14} />,
        items: VOICE_EFFECTS.map((v) => ({ label: v.label, checked: (clip.voice ?? 'none') === v.id, onClick: () => set({ voice: v.id }) })),
      },
      { label: 'Normalizar volume', icon: <SlidersVertical size={14} />, onClick: () => api.normalize(clip.id) },
      {
        label: 'Esta trilha é…',
        icon: <AudioLines size={14} />,
        items: [
          { label: 'Música (abaixa quando há voz)', checked: track.kind === 'music', onClick: () => api.edit((p) => updateAudioTrack(p, track.id, (t) => ({ ...t, kind: 'music' }))) },
          { label: 'Voz (narração/dublagem)', checked: track.kind === 'voice', onClick: () => api.edit((p) => updateAudioTrack(p, track.id, (t) => ({ ...t, kind: 'voice' }))) },
          { label: 'Outro som', checked: !track.kind || track.kind === 'other', onClick: () => api.edit((p) => updateAudioTrack(p, track.id, (t) => ({ ...t, kind: 'other' }))) },
        ],
      },
      { label: 'Aparecer aos poucos (1s)', checked: clip.fadeIn > 0, onClick: () => set({ fadeIn: clip.fadeIn > 0 ? 0 : Math.min(1, length / 2) }) },
      { label: 'Sumir aos poucos (1s)', checked: clip.fadeOut > 0, onClick: () => set({ fadeOut: clip.fadeOut > 0 ? 0 : Math.min(1, length / 2) }) },
      speedMenu(speedOf(clip), (speed) => set({ speed })),
      {
        label: track.muted ? `Ativar som da ${track.name}` : `Silenciar a ${track.name}`,
        icon: track.muted ? <Volume2 size={14} /> : <VolumeX size={14} />,
        onClick: () => api.edit((p) => updateAudioTrack(p, track.id, (t) => ({ ...t, muted: !t.muted }))),
      },
      sep,
      { label: 'Excluir', icon: <Trash size={14} />, shortcut: 'Delete', danger: true, onClick: remove },
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
      { header: clip.text.split('\n')[0] || 'Texto' },
      ...clipboardEntries(api, target, remove),
      sep,
      {
        label: 'Posição',
        icon: <Move size={14} />,
        items: [
          ['No topo', 0.15],
          ['No centro', 0.5],
          ['Embaixo', 0.85],
        ].map(([label, y]) => ({
          label: label as string,
          onClick: () => api.edit((p) => updateTextClip(p, clip.id, (c) => ({ ...c, x: 0.5, y: y as number }))),
        })),
      },
      sep,
      { label: 'Excluir', icon: <Trash size={14} />, shortcut: 'Delete', danger: true, onClick: remove },
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
      { header: plugin ? plugin.name : 'Corte seco' },
      transition && {
        label: 'Duração',
        icon: <Gauge size={14} />,
        items: [0.3, 0.5, 0.8, 1.2, 2].map((d) => ({
          label: `${d.toFixed(1)}s`,
          checked: Math.abs(transition.duration - d) < 0.01,
          onClick: () => api.edit((p) => setTransition(p, target.index, { ...transition, duration: d })),
        })),
      },
      {
        label: 'Trocar por',
        icon: <Blend size={14} />,
        items: featured.map((p) => ({ label: p.name, checked: transition?.pluginId === p.id, onClick: () => set(p.id) })),
      },
      transition && {
        label: 'Usar esta em todas as junções',
        icon: <CopyPlus size={14} />,
        onClick: () => api.edit((p) => ({ ...p, transitions: p.transitions.map(() => ({ ...transition, params: { ...transition.params } })) })),
      },
      sep,
      transition
        ? { label: 'Remover (corte seco)', icon: <Trash size={14} />, danger: true, onClick: () => api.edit((p) => setTransition(p, target.index, null)) }
        : { label: 'Adicionar dissolver', icon: <Plus size={14} />, onClick: () => set('transitions/dissolver') },
    ];
  }

  if (target.kind === 'marker') {
    const marker = project.markers.find((m) => m.id === target.id);
    if (!marker) return [];
    return [
      { header: marker.label },
      {
        label: 'Renomear…',
        icon: <Pencil size={14} />,
        onClick: () => {
          const label = prompt('Nome do marcador:', marker.label)?.trim();
          if (label) api.edit((p) => updateMarker(p, marker.id, (m) => ({ ...m, label })));
        },
      },
      {
        label: 'Cor',
        icon: <span className="size-3 rounded-sm" style={{ background: marker.color }} />,
        items: MARKER_COLORS.map((color) => ({
          label: color,
          icon: <span className="size-3 rounded-sm" style={{ background: color }} />,
          checked: marker.color === color,
          onClick: () => api.edit((p) => updateMarker(p, marker.id, (m) => ({ ...m, color }))),
        })),
      },
      { label: 'Mover para o cursor', icon: <SkipForward size={14} />, onClick: () => api.edit((p) => updateMarker(p, marker.id, (m) => ({ ...m, time: api.time }))) },
      sep,
      { label: 'Excluir marcador', icon: <Trash size={14} />, danger: true, onClick: () => api.edit((p) => removeMarker(p, marker.id)) },
      project.markers.length > 1 && {
        label: 'Excluir todos os marcadores',
        danger: true,
        onClick: () => api.edit((p) => ({ ...p, markers: [] })),
      },
    ];
  }

  // Área vazia da timeline
  const { clipboard } = api;
  return [
    clipboard &&
      clipboard.kind !== 'look' && {
        label: 'Colar aqui',
        icon: <ClipboardPaste size={14} />,
        onClick: () => api.apply(pasteAt(project, clipboard, target.time)),
      },
    { label: 'Mover o cursor para cá', icon: <SkipForward size={14} />, onClick: () => api.seek(target.time) },
    { label: 'Adicionar marcador aqui', icon: <Bookmark size={14} />, shortcut: 'M', onClick: () => api.addMarker(target.time) },
    { label: 'Dividir no cursor', icon: <Scissors size={14} />, shortcut: 'S', onClick: api.split },
    sep,
    { label: 'Nova trilha de vídeo', icon: <Film size={14} />, onClick: () => api.edit(addVideoTrack) },
    { label: 'Nova trilha de áudio', icon: <AudioLines size={14} />, onClick: () => api.edit(addAudioTrack) },
    { label: 'Nova trilha de texto', icon: <Type size={14} />, onClick: () => api.edit(addTextTrack) },
    sep,
    { label: 'Importar mídia…', icon: <Upload size={14} />, onClick: api.openImport },
  ];
}

export function mediaMenu(api: EditorApi, media: MediaItem, removeMedia: () => void): MenuEntry[] {
  const visual = media.kind !== 'audio';
  return [
    { header: media.name },
    visual && {
      label: 'Adicionar à trilha principal',
      icon: <Film size={14} />,
      onClick: () => {
        const clip = createVideoClip(media);
        api.apply({ project: insertVideoClips(api.project, [clip]), selection: { kind: 'clip', id: clip.id } });
      },
    },
    visual && {
      label: 'Sobrepor no cursor (picture-in-picture)',
      icon: <Layers size={14} />,
      onClick: () => {
        const clip = createOverlayClip(media, api.time);
        api.apply({ project: placeOverlayClip(api.project, clip), selection: { kind: 'overlay', id: clip.id } });
      },
    },
    visual && {
      label: 'Sobrepor em tela cheia no cursor',
      icon: <Maximize size={14} />,
      onClick: () => {
        const clip = createOverlayClip(media, api.time, { ...DEFAULT_TRANSFORM });
        api.apply({ project: placeOverlayClip(api.project, clip), selection: { kind: 'overlay', id: clip.id } });
      },
    },
    media.hasAudio && {
      label: media.kind === 'audio' ? 'Adicionar no cursor' : 'Adicionar só o áudio no cursor',
      icon: <AudioLines size={14} />,
      onClick: () => {
        const clip = createAudioClip(media, api.time);
        api.apply({ project: placeAudioClip(api.project, clip), selection: { kind: 'audio', id: clip.id } });
      },
    },
    sep,
    { label: 'Remover do projeto', icon: <Trash size={14} />, danger: true, onClick: removeMedia },
  ];
}

/** Clique direito num filtro/efeito/transição da biblioteca. */
export function pluginMenu(api: EditorApi, plugin: ShaderPlugin, applySelected: () => void): MenuEntry[] {
  const applyAll = () => {
    if (plugin.kind === 'transition') {
      api.edit((p) => ({ ...p, transitions: p.transitions.map((t) => createTransition(plugin.id, t?.duration)) }));
      api.notify(`"${plugin.name}" aplicada em todas as junções.`);
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
    api.notify(`"${plugin.name}" aplicado em todos os clipes da trilha principal.`);
  };
  return [
    { header: plugin.name },
    { label: plugin.kind === 'transition' ? 'Aplicar na transição selecionada' : 'Aplicar no clipe selecionado', icon: <Sparkles size={14} />, onClick: applySelected },
    {
      label: plugin.kind === 'transition' ? 'Aplicar em todas as junções' : 'Aplicar em todos os clipes',
      icon: plugin.kind === 'filter' ? <Palette size={14} /> : <CopyPlus size={14} />,
      onClick: applyAll,
    },
  ];
}

export function previewMenu(api: EditorApi): MenuEntry[] {
  return [
    { label: api.playing ? 'Pausar' : 'Tocar', icon: api.playing ? <Pause size={14} /> : <Play size={14} />, shortcut: 'Espaço', onClick: api.togglePlay },
    sep,
    { label: 'Salvar quadro atual (PNG)', icon: <ImageDown size={14} />, onClick: api.saveFrame },
    { label: 'Copiar quadro atual', icon: <Camera size={14} />, onClick: api.copyFrame },
  ];
}
