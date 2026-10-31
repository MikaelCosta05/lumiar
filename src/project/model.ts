import { defaultParams, getPlugin } from '../engine/registry';
import { t } from '../i18n';
import type { AdjustInput, FrameInput, LayerColor, LayerInput, LayerMask, PlacedLayer } from '../engine/renderer';
import { gradeInput, type ColorGrade } from './grade';
import { lutInput, type SavedLut } from './lut';
import { resolveParams, shiftKeyframes } from '../engine/keyframes';
import { pluginInputs } from '../engine/shaders';
import type { EffectInstance, FilterInstance, ParamValues } from '../engine/types';
import { evaluateCamera, type Camera } from './camera';
import type { CaptionTrack } from './captions';
import { createPackTrack, packsAt, type ActivePack, type PackTrack } from './packs';
import { createTextTrack, type TextTrack } from './text';
import type { CursorFx, CursorTrack } from './cursorFx';
import type { ObjectSelection } from './objectMask';
import { pinOverlays, type CornerPin } from './cornerPin';
import { followMask, type MaskFollow } from './maskFollow';
import { gazeEffect, type GazeCorrection } from './gaze';
import type { MotionBlurSettings } from './motionBlur';
import type { ProjectVersion } from './versions';

export type MediaKind = 'video' | 'audio' | 'image';

/** Imagens não têm duração própria: o clipe pode ter qualquer tamanho até isso. */
export const IMAGE_MAX_DURATION = 3600;
export const DEFAULT_IMAGE_DURATION = 5;
/** Menor duração de um clipe na timeline (s). */
export const MIN_LENGTH = 0.1;

/** Um arquivo importado. Os clipes apontam para ele pelo id. */
export interface MediaItem {
  id: string;
  kind: MediaKind;
  name: string;
  file: File;
  url: string;
  thumbnail: string | null;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** Efeito sonoro gerado pelo Lumiar (id do som), para não gerar o mesmo duas vezes */
  sfx?: string;
  /** Gravação de tela: por onde o mouse andou e os cliques */
  cursor?: CursorTrack;
  /** Clipe composto: o trecho de timeline que este vídeo renderiza (abre para editar) */
  compound?: Omit<Project, 'media'>;
}

/** Clipe da trilha de vídeo principal (vídeo ou imagem). */
export interface VideoClip {
  id: string;
  mediaId: string;
  /** Trecho usado (segundos dentro do arquivo) */
  trimIn: number;
  trimOut: number;
  effects: EffectInstance[];
  filter: FilterInstance | null;
  /** Volume do áudio do próprio vídeo (0 a 2) */
  volume: number;
  /** Áudio separado para uma trilha de áudio: o vídeo fica mudo. */
  audioDetached: boolean;
  /** Velocidade (0.1 = câmera lenta, 2 = acelerado). Ausente = 1. */
  speed?: number;
  /** Como criar os quadros que faltam na câmera lenta. */
  interpolation?: Interpolation;
  camera?: Camera;
  /** Espelhar na horizontal / vertical */
  flipX?: boolean;
  flipY?: boolean;
  /** Girar em passos de 90° (sentido horário) */
  turn?: 0 | 90 | 180 | 270;
  /** Remover o fundo (sem tela verde): recortar, desfocar ou trocar por uma cor */
  matte?: { mode: 'cut' | 'blur' | 'color'; color: string };
  /** Correção de cor manual (rodas, saturação e curvas) */
  grade?: ColorGrade;
  /** LUT 3D importada (.cube), com intensidade */
  lut?: { id: string; amount: number };
  /** Gravação de tela: destacar o cursor e os cliques */
  cursorFx?: CursorFx;
  /** Objeto selecionado com cliques (máscara ao longo do clipe); com `use`, substitui a pessoa */
  object?: ObjectSelection;
  /** Olhar para a câmera: os olhos analisados em cada quadro e a intensidade da correção */
  gaze?: GazeCorrection;
}

/** O que aparece onde a mídia não cobre a tela (barras). */
export interface Background {
  kind: 'black' | 'color' | 'blur';
  color: string;
}

/** Marcação na régua da timeline. */
export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

/** Comentário com tempo marcado ("trocar essa música"): vira uma tarefa para marcar como feita. */
export interface TimelineComment {
  id: string;
  time: number;
  text: string;
  done: boolean;
}

/** none = repete quadros; blend = mistura quadros vizinhos; flow = estima o movimento (mais fluido). */
export type Interpolation = 'none' | 'blend' | 'flow';

export interface AudioClip {
  id: string;
  mediaId: string;
  /** Posição na timeline (segundos) */
  start: number;
  trimIn: number;
  trimOut: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  /** Velocidade (muda também o tom do som). Ausente = 1. */
  speed?: number;
  /** Efeito de voz (telefone, rádio, eco…) */
  voice?: VoiceEffect;
  /** Equalizador: graves, médios e agudos (dB, -12 a 12) */
  eq?: Equalizer;
  /** Volume desenhado por trecho: pontos [tempo desde o início do clipe, multiplicador 0 a 2] */
  volumeKeys?: VolumeKey[];
  /** Grupo de itens que andam juntos */
  group?: string;
}

export interface Equalizer {
  low: number;
  mid: number;
  high: number;
}

export interface VolumeKey {
  time: number;
  value: number;
}

/** Volume desenhado no instante (1 sem pontos; entre dois pontos, em linha reta). */
export function volumeAt(keys: VolumeKey[] | undefined, local: number): number {
  if (!keys?.length) return 1;
  if (local <= keys[0].time) return keys[0].value;
  const last = keys[keys.length - 1];
  if (local >= last.time) return last.value;
  const i = keys.findIndex((k) => k.time > local);
  const a = keys[i - 1];
  const b = keys[i];
  return a.value + ((b.value - a.value) * (local - a.time)) / Math.max(1e-6, b.time - a.time);
}

export type VoiceEffect =
  | 'none'
  | 'clean'
  | 'phone'
  | 'radio'
  | 'megaphone'
  | 'echo'
  | 'cave'
  | 'robot'
  | 'underwater'
  | 'deep'
  | 'chipmunk';

/** music = abaixa sozinha quando há voz; voice = narração/dublagem; sfx = efeitos sonoros. */
export type AudioTrackKind = 'other' | 'music' | 'voice' | 'sfx';

export interface AudioTrack {
  id: string;
  name: string;
  muted: boolean;
  clips: AudioClip[];
  kind?: AudioTrackKind;
  /** Mixer: volume da trilha, solo e pan (ausente = 0 dB, sem solo, no centro) */
  mix?: TrackMix;
}

/** Ajustes do mixer de uma trilha. O silenciar continua no `muted` da própria trilha. */
export interface TrackMix {
  /** Volume da trilha em dB (-60 ou menos = sem som, até +6) */
  gainDb?: number;
  /** -1 = só esquerda, 0 = centro, 1 = só direita */
  pan?: number;
  solo?: boolean;
}

/** Como a camada se mistura com o que está embaixo. */
export type BlendMode = 'normal' | 'screen' | 'add' | 'multiply';

/** Fundo verde/azul: deixa transparente a cor escolhida. */
export interface ChromaKey {
  color: string;
  /** Quanto a cor pode variar e ainda sumir (0 a 1) */
  similarity: number;
  /** Suavidade da borda (0 a 1) */
  smoothness: number;
}

/** Posição de uma camada sobreposta na tela (x, y = centro, 0 a 1, y para baixo). */
export interface LayerTransform {
  x: number;
  y: number;
  /** 1 = a camada cabe inteira na tela */
  scale: number;
  /** Graus */
  rotation: number;
  opacity: number;
  blend: BlendMode;
  chroma: ChromaKey | null;
  /** Cantos arredondados (0 a 0.5 do lado menor) */
  radius: number;
  /** Forma que recorta a camada (círculo, coração, estrela…) */
  mask?: LayerMask | null;
  /** A forma acompanha um ponto rastreado ou o objeto selecionado (ver maskFollow.ts) */
  maskFollow?: MaskFollow | null;
}

/** Clipe numa trilha de vídeo extra: posição livre na timeline e na tela. */
export interface OverlayClip extends VideoClip {
  start: number;
  transform: LayerTransform;
  /** Aparecer/sumir aos poucos (s) */
  fadeIn: number;
  fadeOut: number;
  /** Câmera extra da multicâmera (sincronizada pelo som) */
  multicam?: boolean;
  /** Grupo de itens que andam juntos */
  group?: string;
  /** Trocar a tela: desenhada em perspectiva dentro de quatro cantos do vídeo de baixo (ver cornerPin.ts) */
  cornerPin?: CornerPin;
}

export interface VideoTrack {
  id: string;
  name: string;
  hidden: boolean;
  muted: boolean;
  clips: OverlayClip[];
  /** Mixer: volume, solo e pan do som desta trilha */
  mix?: TrackMix;
}

export interface TransitionInstance {
  pluginId: string;
  duration: number;
  params: ParamValues;
}

/**
 * A edição nunca altera os arquivos: o projeto só descreve quais trechos usar.
 * - Trilha de vídeo: clipes em sequência (magnética); transitions[i] fica entre clips[i] e clips[i + 1].
 * - Trilhas de áudio e de texto: clipes livres, cada um com sua posição.
 */
export interface Project {
  name: string;
  width: number;
  height: number;
  fps: number;
  media: MediaItem[];
  clips: VideoClip[];
  transitions: (TransitionInstance | null)[];
  audioTracks: AudioTrack[];
  textTracks: TextTrack[];
  /** Trilhas de vídeo por cima da principal (a primeira fica logo acima dela). */
  videoTracks: VideoTrack[];
  /** Pacotes de edição: aplicados por cima de todo o vídeo, abaixo dos textos. */
  packTracks: PackTrack[];
  background: Background;
  markers: Marker[];
  /** Volume da música enquanto há voz (0 a 1). */
  duckLevel: number;
  /** Roteiro do teleprompter */
  script: string;
  /** Batidas da música detectadas (tempo da timeline): aparecem na régua e servem de ímã */
  beats?: number[];
  /** Legendas (ausente em projetos antigos) */
  captions?: CaptionTrack;
  /** LUTs importadas (.cube) */
  luts?: SavedLut[];
  /** Comentários e tarefas na timeline */
  comments?: TimelineComment[];
  /** Mixer: som da trilha principal (que não tem `muted` próprio) e volume geral (Master) */
  mainMix?: TrackMix & { muted?: boolean };
  masterMix?: { gainDb?: number };
  /** Desfoque de movimento (ausente = só nos pacotes de câmera, moderado). Ver project/motionBlur.ts. */
  motionBlur?: MotionBlurSettings;
  /** Versões nomeadas guardadas dentro do arquivo ("versão do cliente"…). Ver project/versions.ts. */
  versions?: ProjectVersion[];
}

export const DEFAULT_TRANSITION_ID = 'transitions/dissolver';

export function uid(): string {
  return crypto.randomUUID();
}

export function createProject(): Project {
  return {
    name: t('Projeto sem título'),
    width: 1280,
    height: 720,
    fps: 30,
    media: [],
    clips: [],
    transitions: [],
    audioTracks: [createAudioTrack(1)],
    textTracks: [createTextTrack(1)],
    videoTracks: [],
    packTracks: [createPackTrack(1)],
    background: { kind: 'black', color: '#000000' },
    markers: [],
    duckLevel: 0.3,
    script: '',
  };
}

export const MARKER_COLORS = ['#ffb547', '#ff5c72', '#3ddc97', '#4cc2ff', '#b36bff'];

export function addMarker(project: Project, time: number): { project: Project; id: string } {
  const id = uid();
  const marker: Marker = {
    id,
    time,
    label: t('Marcador {n}', { n: project.markers.length + 1 }),
    color: MARKER_COLORS[project.markers.length % MARKER_COLORS.length],
  };
  return { project: { ...project, markers: [...project.markers, marker].sort((a, b) => a.time - b.time) }, id };
}

export function updateMarker(project: Project, id: string, update: (m: Marker) => Marker): Project {
  return { ...project, markers: project.markers.map((m) => (m.id === id ? update(m) : m)).sort((a, b) => a.time - b.time) };
}

export function removeMarker(project: Project, id: string): Project {
  return { ...project, markers: project.markers.filter((m) => m.id !== id) };
}

/** Pontos de edição (começo/fim de clipes e marcadores), para pular entre eles. */
export function editPoints(project: Project, timeline: TimelineLayout): number[] {
  const points = [
    0,
    timeline.duration,
    ...timeline.clips.flatMap((l) => [l.start, l.start + l.length]),
    ...timeline.overlays.flatMap((l) => [l.start, l.start + l.length]),
    ...project.audioTracks.flatMap((t) => t.clips.flatMap((c) => [c.start, c.start + clipLength(c)])),
    ...project.textTracks.flatMap((t) => t.clips.flatMap((c) => [c.start, c.start + c.duration])),
    ...(project.packTracks ?? []).flatMap((t) => t.clips.flatMap((c) => [c.start, c.start + c.duration])),
    ...project.markers.map((m) => m.time),
  ];
  return [...new Set(points.map((p) => Math.round(p * 1000) / 1000))].sort((a, b) => a - b);
}

function createAudioTrack(number: number): AudioTrack {
  return { id: uid(), name: t('Áudio {n}', { n: number }), muted: false, clips: [] };
}

export function createTransition(pluginId: string, duration = 0.8): TransitionInstance | null {
  const plugin = getPlugin(pluginId);
  return plugin ? { pluginId, duration, params: defaultParams(plugin) } : null;
}

export function createEffect(pluginId: string): EffectInstance | null {
  const plugin = getPlugin(pluginId);
  return plugin ? { uid: uid(), pluginId, enabled: true, params: defaultParams(plugin) } : null;
}

export function createFilter(pluginId: string, intensity = 1): FilterInstance | null {
  const plugin = getPlugin(pluginId);
  return plugin ? { pluginId, intensity, params: defaultParams(plugin) } : null;
}

export function createVideoClip(media: MediaItem): VideoClip {
  return {
    id: uid(),
    mediaId: media.id,
    trimIn: 0,
    trimOut: media.kind === 'image' ? DEFAULT_IMAGE_DURATION : media.duration,
    effects: [],
    filter: null,
    volume: 1,
    audioDetached: false,
  };
}

export function createAudioClip(media: MediaItem, start: number): AudioClip {
  return { id: uid(), mediaId: media.id, start, trimIn: 0, trimOut: media.duration, volume: 1, fadeIn: 0, fadeOut: 0 };
}

export function getMedia(project: Project, mediaId: string): MediaItem | undefined {
  return project.media.find((m) => m.id === mediaId);
}

// ---------- Mídia ----------

export function addMedia(project: Project, items: MediaItem[]): Project {
  return items.length ? { ...project, media: [...project.media, ...items] } : project;
}

export function removeMedia(project: Project, mediaId: string): Project {
  let next = project;
  for (const clip of project.clips) if (clip.mediaId === mediaId) next = removeClip(next, clip.id);
  return {
    ...next,
    media: next.media.filter((m) => m.id !== mediaId),
    audioTracks: next.audioTracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.mediaId !== mediaId) })),
    videoTracks: next.videoTracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.mediaId !== mediaId) })),
  };
}

// ---------- Trilha de vídeo ----------

export function insertVideoClips(project: Project, clips: VideoClip[], index = project.clips.length): Project {
  if (clips.length === 0) return project;
  const all = [...project.clips.slice(0, index), ...clips, ...project.clips.slice(index)];
  const transitions = [...project.transitions];
  // Novas junções ganham a transição padrão.
  const at = Math.max(0, index - 1);
  const added = Math.max(0, all.length - 1 - transitions.length);
  transitions.splice(at, 0, ...Array.from({ length: added }, () => createTransition(DEFAULT_TRANSITION_ID)));
  return { ...project, clips: all, transitions };
}

export function removeClip(project: Project, clipId: string): Project {
  const index = project.clips.findIndex((c) => c.id === clipId);
  if (index < 0) return project;
  const transitions = [...project.transitions];
  if (transitions.length > 0) transitions.splice(Math.min(index, transitions.length - 1), 1);
  return { ...project, clips: project.clips.filter((c) => c.id !== clipId), transitions };
}

export function moveClip(project: Project, clipId: string, delta: number): Project {
  const from = project.clips.findIndex((c) => c.id === clipId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= project.clips.length) return project;
  const clips = [...project.clips];
  [clips[from], clips[to]] = [clips[to], clips[from]];
  return { ...project, clips };
}

export function updateClip(project: Project, clipId: string, update: (clip: VideoClip) => VideoClip): Project {
  return { ...project, clips: project.clips.map((c) => (c.id === clipId ? update(c) : c)) };
}

export function setTransition(project: Project, index: number, transition: TransitionInstance | null): Project {
  const transitions = [...project.transitions];
  transitions[index] = transition;
  return { ...project, transitions };
}

/** Ajusta o corte de um clipe de vídeo respeitando os limites da mídia. */
export function trimVideoClip(project: Project, clipId: string, edge: 'in' | 'out', value: number): Project {
  return updateClip(project, clipId, (c) => {
    const media = getMedia(project, c.mediaId);
    const max = media ? media.duration : c.trimOut;
    return edge === 'in'
      ? { ...c, trimIn: clamp(value, 0, c.trimOut - MIN_LENGTH) }
      : { ...c, trimOut: clamp(value, c.trimIn + MIN_LENGTH, max) };
  });
}

/** Corta um clipe de vídeo em dois no instante t da timeline. */
export function splitVideoClip(project: Project, clipId: string, t: number): { project: Project; newId: string } | null {
  const timeline = layoutProject(project);
  const layout = timeline.clips.find((l) => l.clip.id === clipId);
  if (!layout) return null;
  const offset = t - layout.start;
  if (offset < MIN_LENGTH || offset > layout.length - MIN_LENGTH) return null;

  const { clip } = layout;
  const cut = clip.trimIn + offset * speedOf(clip);
  const first: VideoClip = { ...clip, trimOut: cut };
  // Na segunda parte o tempo do clipe recomeça do zero: os keyframes andam junto.
  const second: VideoClip = {
    ...clip,
    id: uid(),
    trimIn: cut,
    effects: clip.effects.map((e) => ({ ...e, uid: uid(), keyframes: shiftKeyframes(e.keyframes, -offset) })),
    filter: clip.filter && { ...clip.filter, keyframes: shiftKeyframes(clip.filter.keyframes, -offset) },
    camera: clip.camera && { ...clip.camera, keyframes: shiftKeyframes(clip.camera.keyframes, -offset) ?? {} },
  };
  const clips = [...project.clips];
  clips.splice(layout.index, 1, first, second);
  const transitions = [...project.transitions];
  transitions.splice(layout.index, 0, null); // corte seco entre as duas partes
  return { project: { ...project, clips, transitions }, newId: second.id };
}

/**
 * Deixa só os trechos `keep` (segundos dentro do arquivo) de um clipe da trilha principal:
 * o resto sai e a trilha se fecha sozinha (corte de silêncios, cortes no ritmo).
 * Devolve quantos segundos da timeline saíram.
 */
export function keepRanges(project: Project, clipId: string, keep: [number, number][]): { project: Project; removed: number } | null {
  const index = project.clips.findIndex((c) => c.id === clipId);
  const clip = project.clips[index];
  if (!clip) return null;
  const speed = speedOf(clip);
  const ranges = keep
    .map(([a, b]): [number, number] => [Math.max(clip.trimIn, a), Math.min(clip.trimOut, b)])
    .filter(([a, b]) => b - a >= MIN_LENGTH);
  if (ranges.length === 0) return null;
  const pieces = ranges.map(([a, b], k): VideoClip => {
    // O tempo de cada pedaço recomeça do zero: os keyframes andam junto.
    const offset = (a - clip.trimIn) / speed;
    return {
      ...clip,
      id: k === 0 ? clip.id : uid(),
      trimIn: a,
      trimOut: b,
      effects: clip.effects.map((e) => ({ ...e, uid: k === 0 ? e.uid : uid(), keyframes: shiftKeyframes(e.keyframes, -offset) })),
      filter: clip.filter && { ...clip.filter, keyframes: shiftKeyframes(clip.filter.keyframes, -offset) },
      camera: clip.camera && { ...clip.camera, keyframes: shiftKeyframes(clip.camera.keyframes, -offset) ?? {} },
    };
  });
  const clips = [...project.clips];
  clips.splice(index, 1, ...pieces);
  const transitions = [...project.transitions];
  // Cortes secos entre os pedaços; as transições de antes e depois do clipe continuam.
  transitions.splice(index, 0, ...pieces.slice(1).map(() => null));
  const removed = (clip.trimOut - clip.trimIn - ranges.reduce((sum, [a, b]) => sum + b - a, 0)) / speed;
  return { project: { ...project, clips, transitions }, removed };
}

/**
 * Monta a trilha principal no ritmo da música: cada clipe dura `every` batidas e os cortes caem
 * exatamente nas batidas (sem transições). Clipes curtos demais ficam com menos batidas.
 * `fill` repete os clipes (pegando outros trechos dos vídeos) até a última batida.
 */
export function fitToBeats(project: Project, beats: number[], every: number, fill: boolean): { project: Project; cuts: number } | null {
  const media = new Map(project.media.map((m) => [m.id, m]));
  const source = project.clips.filter((c) => media.has(c.mediaId));
  const grid = [...beats].sort((a, b) => a - b).filter((b) => b > 0.15);
  if (source.length === 0 || grid.length === 0) return null;
  const cursor = new Map<string, number>();
  const used = new Set<string>();
  const result: VideoClip[] = [];
  let start = 0;
  let j = 0;
  for (let k = 0; ; k++) {
    if (!fill && k >= source.length) break;
    while (j < grid.length && grid[j] <= start + MIN_LENGTH) j++;
    if (j >= grid.length) {
      // Acabaram as batidas: os clipes que sobraram entram como estão.
      if (!fill) result.push(...source.slice(k));
      break;
    }
    const clip = source[k % source.length];
    const image = media.get(clip.mediaId)!.kind === 'image';
    const speed = speedOf(clip);
    let from = image ? 0 : (cursor.get(clip.id) ?? clip.trimIn);
    const room = () => (image ? IMAGE_MAX_DURATION : (clip.trimOut - from) / speed);
    // Volta para o começo do clipe se o que sobrou não cabe nem uma batida.
    if (!image && grid[j] - start > room() && from > clip.trimIn) from = clip.trimIn;
    let steps = Math.max(1, every);
    while (steps > 1 && (j + steps - 1 >= grid.length || grid[j + steps - 1] - start > room())) steps--;
    const end = grid[j] - start <= room() ? grid[j + steps - 1] : start + room();
    const length = end - start;
    if (length < MIN_LENGTH) break;
    const offset = image ? 0 : (from - clip.trimIn) / speed;
    const first = !used.has(clip.id);
    used.add(clip.id);
    result.push({
      ...clip,
      id: first ? clip.id : uid(),
      trimIn: from,
      trimOut: from + length * (image ? 1 : speed),
      effects: clip.effects.map((e) => ({ ...e, uid: first ? e.uid : uid(), keyframes: shiftKeyframes(e.keyframes, -offset) })),
      filter: clip.filter && { ...clip.filter, keyframes: shiftKeyframes(clip.filter.keyframes, -offset) },
      camera: clip.camera && { ...clip.camera, keyframes: shiftKeyframes(clip.camera.keyframes, -offset) ?? {} },
    });
    if (!image) cursor.set(clip.id, from + length * speed);
    start = end;
    if (fill && j + steps >= grid.length) break;
  }
  if (result.length === 0) return null;
  return {
    project: { ...project, clips: result, transitions: result.slice(1).map(() => null) },
    cuts: result.length,
  };
}

/**
 * Congela o quadro do instante t: divide o clipe ali e põe a imagem parada (still) no meio,
 * com o mesmo filtro, efeitos, giro e espelhamento do clipe.
 */
export function insertFreezeFrame(
  project: Project,
  clipId: string,
  t: number,
  still: MediaItem,
  duration = 2,
): { project: Project; id: string } | null {
  const layout = layoutProject(project).clips.find((l) => l.clip.id === clipId);
  if (!layout) return null;
  const { clip } = layout;
  const freeze: VideoClip = {
    ...createVideoClip(still),
    trimOut: duration,
    filter: clip.filter && { ...clip.filter },
    effects: clip.effects.map((e) => ({ ...e, uid: uid() })),
    flipX: clip.flipX,
    flipY: clip.flipY,
    turn: clip.turn,
  };
  let next = addMedia(project, [still]);
  const split = splitVideoClip(next, clipId, t);
  let index: number;
  if (split) {
    next = split.project;
    index = layout.index + 1;
  } else {
    // Cursor colado numa ponta do clipe: o quadro entra antes ou depois dele.
    index = t - layout.start < layout.length / 2 ? layout.index : layout.index + 1;
  }
  next = insertVideoClips(next, [freeze], index);
  // Corte seco dos dois lados do quadro congelado.
  const transitions = [...next.transitions];
  if (index > 0) transitions[index - 1] = null;
  if (index < transitions.length) transitions[index] = null;
  return { project: { ...next, transitions }, id: freeze.id };
}

/** Gira 90° (sentido horário ou anti-horário). */
export function turnClip<T extends VideoClip>(clip: T, delta: 90 | -90): T {
  const turn = ((((clip.turn ?? 0) + delta) % 360) + 360) % 360;
  return { ...clip, turn: turn as VideoClip['turn'] };
}

// ---------- Voz: narração, dublagem e música que abaixa sozinha ----------

/** Coloca o clipe numa trilha de voz livre (cria "Narração" se precisar). */
export function placeVoiceClip(project: Project, clip: AudioClip): Project {
  const end = clip.start + clipLength(clip);
  const free = project.audioTracks.findIndex((t) => t.kind === 'voice' && !overlaps(t, clip.start, end));
  if (free >= 0) {
    return { ...project, audioTracks: project.audioTracks.map((t, i) => (i === free ? { ...t, clips: [...t.clips, clip] } : t)) };
  }
  const voices = project.audioTracks.filter((t) => t.kind === 'voice').length;
  const track: AudioTrack = { id: uid(), name: voices ? t('Narração {n}', { n: voices + 1 }) : t('Narração'), muted: false, kind: 'voice', clips: [clip] };
  return { ...project, audioTracks: [...project.audioTracks, track] };
}

/** Coloca um efeito sonoro numa trilha "Efeitos sonoros" livre (cria uma se precisar). */
export function placeSfxClip(project: Project, clip: AudioClip): Project {
  const end = clip.start + clipLength(clip);
  const free = project.audioTracks.findIndex((t) => t.kind === 'sfx' && !overlaps(t, clip.start, end));
  if (free >= 0) {
    return { ...project, audioTracks: project.audioTracks.map((t, i) => (i === free ? { ...t, clips: [...t.clips, clip] } : t)) };
  }
  const count = project.audioTracks.filter((t) => t.kind === 'sfx').length;
  const track: AudioTrack = { id: uid(), name: count ? t('Efeitos sonoros {n}', { n: count + 1 }) : t('Efeitos sonoros'), muted: false, kind: 'sfx', clips: [clip] };
  return { ...project, audioTracks: [...project.audioTracks, track] };
}

/** Trechos com voz (trilhas de voz não silenciadas), já juntando os que estão colados. */
export function voiceIntervals(project: Project): [number, number][] {
  const list = project.audioTracks
    .filter((t) => t.kind === 'voice' && !t.muted)
    .flatMap((t) => t.clips.filter((c) => c.volume > 0).map((c): [number, number] => [c.start, c.start + clipLength(c)]))
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of list) {
    const last = merged[merged.length - 1];
    // Pausas curtas entre falas não fazem a música subir e descer.
    if (last && a <= last[1] + DUCK_RAMP * 2) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/** Tempo para a música descer/subir (s). */
export const DUCK_RAMP = 0.35;

/** Quanto a música está abaixada no instante t (1 = volume normal). */
export function duckFactor(level: number, intervals: [number, number][], t: number): number {
  let factor = 1;
  for (const [a, b] of intervals) {
    let f = 1;
    if (t >= a && t <= b) f = level;
    else if (t < a && a - t < DUCK_RAMP) f = level + (1 - level) * ((a - t) / DUCK_RAMP);
    else if (t > b && t - b < DUCK_RAMP) f = level + (1 - level) * ((t - b) / DUCK_RAMP);
    factor = Math.min(factor, f);
  }
  return factor;
}

// ---------- Trilhas de áudio ----------

export function findAudioClip(project: Project, clipId: string) {
  for (let trackIndex = 0; trackIndex < project.audioTracks.length; trackIndex++) {
    const track = project.audioTracks[trackIndex];
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, trackIndex, clip };
  }
  return null;
}

export function addAudioTrack(project: Project): Project {
  return { ...project, audioTracks: [...project.audioTracks, createAudioTrack(project.audioTracks.length + 1)] };
}

export function updateAudioTrack(project: Project, trackId: string, update: (t: AudioTrack) => AudioTrack): Project {
  return { ...project, audioTracks: project.audioTracks.map((t) => (t.id === trackId ? update(t) : t)) };
}

export function removeAudioTrack(project: Project, trackId: string): Project {
  if (project.audioTracks.length <= 1) return project;
  return { ...project, audioTracks: project.audioTracks.filter((t) => t.id !== trackId) };
}

function overlaps(track: AudioTrack, start: number, end: number, ignoreId?: string): boolean {
  return track.clips.some((c) => c.id !== ignoreId && start < c.start + clipLength(c) && end > c.start);
}

/** Coloca um clipe de áudio na primeira trilha livre naquele trecho (cria uma nova se precisar). */
export function placeAudioClip(project: Project, clip: AudioClip, preferredTrack = 0): Project {
  const end = clip.start + clipLength(clip);
  const order = [preferredTrack, ...project.audioTracks.keys()].filter((i) => i < project.audioTracks.length);
  const free = order.find((i) => !overlaps(project.audioTracks[i], clip.start, end));
  let next = project;
  let index = free;
  if (index === undefined) {
    next = addAudioTrack(project);
    index = next.audioTracks.length - 1;
  }
  return {
    ...next,
    audioTracks: next.audioTracks.map((t, i) => (i === index ? { ...t, clips: [...t.clips, clip] } : t)),
  };
}

export function updateAudioClip(project: Project, clipId: string, update: (clip: AudioClip) => AudioClip): Project {
  return {
    ...project,
    audioTracks: project.audioTracks.map((t) =>
      t.clips.some((c) => c.id === clipId) ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? update(c) : c)) } : t,
    ),
  };
}

export function removeAudioClip(project: Project, clipId: string): Project {
  return {
    ...project,
    audioTracks: project.audioTracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),
  };
}

/** Move um clipe de áudio para outra posição e/ou trilha. */
export function moveAudioClip(project: Project, clipId: string, trackIndex: number, start: number): Project {
  const found = findAudioClip(project, clipId);
  if (!found) return project;
  const target = clamp(trackIndex, 0, project.audioTracks.length - 1);
  const moved = { ...found.clip, start: Math.max(0, start) };
  return {
    ...project,
    audioTracks: project.audioTracks.map((t, i) => {
      const clips = t.clips.filter((c) => c.id !== clipId);
      return { ...t, clips: i === target ? [...clips, moved] : clips };
    }),
  };
}

export function trimAudioClip(project: Project, clipId: string, edge: 'in' | 'out', timelineTime: number): Project {
  return updateAudioClip(project, clipId, (c) => {
    const media = getMedia(project, c.mediaId);
    const max = media ? media.duration : c.trimOut;
    const speed = speedOf(c);
    if (edge === 'out') {
      return { ...c, trimOut: clamp(c.trimIn + (timelineTime - c.start) * speed, c.trimIn + MIN_LENGTH, max) };
    }
    // A borda esquerda move o início na timeline junto com o corte.
    const trimIn = clamp(c.trimIn + (timelineTime - c.start) * speed, 0, c.trimOut - MIN_LENGTH);
    const start = Math.max(0, c.start + (trimIn - c.trimIn) / speed);
    return { ...c, trimIn, start, volumeKeys: c.volumeKeys?.map((k) => ({ ...k, time: k.time - (start - c.start) })) };
  });
}

export function splitAudioClip(project: Project, clipId: string, t: number): { project: Project; newId: string } | null {
  const found = findAudioClip(project, clipId);
  if (!found) return null;
  const { clip } = found;
  const offset = t - clip.start;
  if (offset < MIN_LENGTH || offset > clipLength(clip) - MIN_LENGTH) return null;
  const cut = clip.trimIn + offset * speedOf(clip);
  const first: AudioClip = { ...clip, trimOut: cut, fadeOut: 0 };
  const second: AudioClip = {
    ...clip,
    id: uid(),
    start: t,
    trimIn: cut,
    fadeIn: 0,
    volumeKeys: clip.volumeKeys?.map((k) => ({ ...k, time: k.time - offset })),
  };
  return {
    project: {
      ...project,
      audioTracks: project.audioTracks.map((track) =>
        track === found.track
          ? { ...track, clips: track.clips.flatMap((c) => (c.id === clipId ? [first, second] : [c])) }
          : track,
      ),
    },
    newId: second.id,
  };
}

/** Separa o áudio de um clipe de vídeo para uma trilha de áudio, no mesmo lugar. */
export function detachAudio(project: Project, clipId: string): { project: Project; audioId: string } | null {
  const layout = layoutProject(project).clips.find((l) => l.clip.id === clipId);
  if (!layout || !layout.media.hasAudio || layout.clip.audioDetached) return null;
  const audio: AudioClip = {
    id: uid(),
    mediaId: layout.media.id,
    start: layout.start,
    trimIn: layout.clip.trimIn,
    trimOut: layout.clip.trimOut,
    volume: layout.clip.volume,
    fadeIn: 0,
    fadeOut: 0,
    speed: layout.clip.speed,
  };
  const next = updateClip(project, clipId, (c) => ({ ...c, audioDetached: true }));
  return { project: placeAudioClip(next, audio), audioId: audio.id };
}

// ---------- Trilhas de vídeo extras (sobreposição) ----------

export const DEFAULT_TRANSFORM: LayerTransform = {
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotation: 0,
  opacity: 1,
  blend: 'normal',
  chroma: null,
  radius: 0,
};

/** Clipe sobreposto. Por padrão ocupa um canto da tela (picture-in-picture). */
export function createOverlayClip(media: MediaItem, start: number, transform: Partial<LayerTransform> = {}): OverlayClip {
  return {
    ...createVideoClip(media),
    start,
    transform: { ...DEFAULT_TRANSFORM, x: 0.74, y: 0.27, scale: 0.4, radius: 0.04, ...transform },
    fadeIn: 0,
    fadeOut: 0,
  };
}

function createVideoTrack(number: number): VideoTrack {
  return { id: uid(), name: t('Vídeo {n}', { n: number }), hidden: false, muted: false, clips: [] };
}

export function addVideoTrack(project: Project): Project {
  return { ...project, videoTracks: [...project.videoTracks, createVideoTrack(project.videoTracks.length + 2)] };
}

export function updateVideoTrack(project: Project, trackId: string, update: (t: VideoTrack) => VideoTrack): Project {
  return { ...project, videoTracks: project.videoTracks.map((t) => (t.id === trackId ? update(t) : t)) };
}

export function removeVideoTrack(project: Project, trackId: string): Project {
  return { ...project, videoTracks: project.videoTracks.filter((t) => t.id !== trackId) };
}

export function findOverlayClip(project: Project, clipId: string) {
  for (let trackIndex = 0; trackIndex < project.videoTracks.length; trackIndex++) {
    const track = project.videoTracks[trackIndex];
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, trackIndex, clip };
  }
  return null;
}

function isFree(clips: OverlayClip[], start: number, end: number): boolean {
  return !clips.some((c) => start < c.start + clipLength(c) && end > c.start);
}

/** Coloca o clipe na primeira trilha de vídeo livre naquele trecho (cria uma nova se precisar). */
export function placeOverlayClip(project: Project, clip: OverlayClip, preferredTrack = 0): Project {
  const end = clip.start + clipLength(clip);
  const order = [preferredTrack, ...project.videoTracks.keys()].filter((i) => i >= 0 && i < project.videoTracks.length);
  let index = order.find((i) => isFree(project.videoTracks[i].clips, clip.start, end));
  let next = project;
  if (index === undefined) {
    next = addVideoTrack(project);
    index = next.videoTracks.length - 1;
  }
  return { ...next, videoTracks: next.videoTracks.map((t, i) => (i === index ? { ...t, clips: [...t.clips, clip] } : t)) };
}

export function updateOverlayClip(project: Project, clipId: string, update: (clip: OverlayClip) => OverlayClip): Project {
  return {
    ...project,
    videoTracks: project.videoTracks.map((t) =>
      t.clips.some((c) => c.id === clipId) ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? update(c) : c)) } : t,
    ),
  };
}

export function removeOverlayClip(project: Project, clipId: string): Project {
  return { ...project, videoTracks: project.videoTracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })) };
}

/** Move um clipe sobreposto para outra posição e/ou trilha de vídeo. */
export function moveOverlayClip(project: Project, clipId: string, trackIndex: number, start: number): Project {
  const found = findOverlayClip(project, clipId);
  if (!found) return project;
  const target = clamp(trackIndex, 0, project.videoTracks.length - 1);
  const moved = { ...found.clip, start: Math.max(0, start) };
  return {
    ...project,
    videoTracks: project.videoTracks.map((t, i) => {
      const clips = t.clips.filter((c) => c.id !== clipId);
      return { ...t, clips: i === target ? [...clips, moved] : clips };
    }),
  };
}

export function trimOverlayClip(project: Project, clipId: string, edge: 'in' | 'out', timelineTime: number): Project {
  return updateOverlayClip(project, clipId, (c) => {
    const media = getMedia(project, c.mediaId);
    const max = media ? media.duration : c.trimOut;
    const speed = speedOf(c);
    if (edge === 'out') {
      return { ...c, trimOut: clamp(c.trimIn + (timelineTime - c.start) * speed, c.trimIn + MIN_LENGTH, max) };
    }
    // A borda esquerda move o início na timeline junto com o corte.
    const trimIn = clamp(c.trimIn + (timelineTime - c.start) * speed, 0, c.trimOut - MIN_LENGTH);
    return { ...c, trimIn, start: Math.max(0, c.start + (trimIn - c.trimIn) / speed) };
  });
}

export function splitOverlayClip(project: Project, clipId: string, t: number): { project: Project; newId: string } | null {
  const found = findOverlayClip(project, clipId);
  if (!found) return null;
  const { clip } = found;
  const offset = t - clip.start;
  if (offset < MIN_LENGTH || offset > clipLength(clip) - MIN_LENGTH) return null;
  const cut = clip.trimIn + offset * speedOf(clip);
  const first: OverlayClip = { ...clip, trimOut: cut, fadeOut: 0 };
  const second: OverlayClip = {
    ...clip,
    id: uid(),
    start: t,
    trimIn: cut,
    fadeIn: 0,
    effects: clip.effects.map((e) => ({ ...e, uid: uid(), keyframes: shiftKeyframes(e.keyframes, -offset) })),
    filter: clip.filter && { ...clip.filter, keyframes: shiftKeyframes(clip.filter.keyframes, -offset) },
  };
  return {
    project: {
      ...project,
      videoTracks: project.videoTracks.map((track) =>
        track === found.track ? { ...track, clips: track.clips.flatMap((c) => (c.id === clipId ? [first, second] : [c])) } : track,
      ),
    },
    newId: second.id,
  };
}

/** Leva um clipe da trilha principal para uma trilha de vídeo extra (no mesmo lugar, tela cheia). */
export function promoteToOverlay(project: Project, clipId: string): { project: Project; id: string } | null {
  const layout = layoutProject(project).clips.find((l) => l.clip.id === clipId);
  if (!layout) return null;
  const overlay: OverlayClip = {
    ...layout.clip,
    start: layout.start,
    transform: { ...DEFAULT_TRANSFORM },
    fadeIn: 0,
    fadeOut: 0,
  };
  return { project: placeOverlayClip(removeClip(project, clipId), overlay), id: overlay.id };
}

/** Leva um clipe sobreposto para o fim da trilha principal. */
export function demoteToMain(project: Project, clipId: string): { project: Project; id: string } | null {
  const found = findOverlayClip(project, clipId);
  if (!found) return null;
  const { start: _start, transform: _transform, fadeIn: _fadeIn, fadeOut: _fadeOut, ...clip } = found.clip;
  return { project: insertVideoClips(removeOverlayClip(project, clipId), [clip]), id: clip.id };
}

export function speedOf(clip: { speed?: number }): number {
  return clip.speed && clip.speed > 0 ? clip.speed : 1;
}

/** Duração na timeline: o trecho do arquivo dividido pela velocidade. */
export function clipLength(clip: { trimIn: number; trimOut: number; speed?: number }): number {
  return Math.max(0, clip.trimOut - clip.trimIn) / speedOf(clip);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------- Timeline ----------

export interface ClipLayout {
  clip: VideoClip;
  media: MediaItem;
  index: number;
  /** Posição na timeline (segundos) */
  start: number;
  length: number;
  /** Duração real das transições de entrada e saída (já limitadas ao tamanho dos clipes) */
  transitionIn: number;
  transitionOut: number;
}

/** Clipe de uma trilha de vídeo extra já posicionado. */
export interface OverlayLayout extends ClipLayout {
  clip: OverlayClip;
  track: number;
}

export interface TimelineLayout {
  clips: ClipLayout[];
  /** Clipes das trilhas de vídeo extras, da trilha mais baixa para a mais alta */
  overlays: OverlayLayout[];
  /** Fim da trilha de vídeo */
  videoDuration: number;
  /** Fim de tudo (vídeo e áudio) */
  duration: number;
}

export function layoutProject(project: Project): TimelineLayout {
  const media = new Map(project.media.map((m) => [m.id, m]));
  const valid = project.clips.filter((c) => media.has(c.mediaId));
  const lengths = valid.map(clipLength);
  // A transição sobrepõe o fim de um clipe com o começo do próximo.
  const overlaps = valid.slice(0, -1).map((_, i) => {
    const t = project.transitions[i];
    return t ? Math.max(0, Math.min(t.duration, lengths[i] / 2, lengths[i + 1] / 2)) : 0;
  });

  let start = 0;
  const clips = valid.map((clip, index) => {
    const layout: ClipLayout = {
      clip,
      media: media.get(clip.mediaId)!,
      index,
      start,
      length: lengths[index],
      transitionIn: index > 0 ? overlaps[index - 1] : 0,
      transitionOut: overlaps[index] ?? 0,
    };
    start += lengths[index] - (overlaps[index] ?? 0);
    return layout;
  });
  const overlays: OverlayLayout[] = project.videoTracks.flatMap((track, trackIndex) =>
    track.hidden
      ? []
      : track.clips
          .filter((c) => media.has(c.mediaId))
          .map((clip) => ({
            clip,
            media: media.get(clip.mediaId)!,
            index: -1,
            track: trackIndex,
            start: clip.start,
            length: clipLength(clip),
            transitionIn: 0,
            transitionOut: 0,
          })),
  );
  const last = clips[clips.length - 1];
  const videoDuration = last ? last.start + last.length : 0;
  const overlayEnd = Math.max(0, ...project.videoTracks.flatMap((t) => t.clips.map((c) => c.start + clipLength(c))));
  const audioEnd = Math.max(0, ...project.audioTracks.flatMap((t) => t.clips.map((c) => c.start + clipLength(c))));
  const textEnd = Math.max(0, ...project.textTracks.flatMap((t) => t.clips.map((c) => c.start + c.duration)));
  const captionEnd = Math.max(0, ...(project.captions?.captions.map((c) => c.end) ?? []));
  const packEnd = Math.max(0, ...(project.packTracks ?? []).flatMap((t) => t.clips.map((c) => c.start + c.duration)));
  return { clips, overlays, videoDuration, duration: Math.max(videoDuration, overlayEnd, audioEnd, textEnd, captionEnd, packEnd) };
}

export interface ActiveClip {
  layout: ClipLayout;
  /** Tempo dentro do arquivo */
  sourceTime: number;
  /** Tempo desde o início do clipe */
  clipTime: number;
}

/** Camada sobreposta visível no instante, com a opacidade já com os fades. */
export interface ActiveOverlay {
  active: ActiveClip;
  transform: LayerTransform;
  opacity: number;
  /** Tela trocada: os quatro cantos na tela neste quadro (0 a 1, y para baixo) */
  corners?: number[];
}

export interface FrameState {
  a: ActiveClip | null;
  b: ActiveClip | null;
  transition: { instance: TransitionInstance; progress: number } | null;
  overlays: ActiveOverlay[];
  /** Pacotes de edição que valem neste instante */
  packs: ActivePack[];
}

function activeAt(layout: ClipLayout, t: number): ActiveClip {
  const clipTime = clamp(t - layout.start, 0, layout.length);
  return { layout, clipTime, sourceTime: layout.clip.trimIn + clipTime * speedOf(layout.clip) };
}

/** Camadas das trilhas de vídeo extras que aparecem no instante t. */
function overlaysAt(timeline: TimelineLayout, t: number): ActiveOverlay[] {
  return timeline.overlays
    .filter((l) => t >= l.start && t < l.start + l.length)
    .map((l) => {
      const active = activeAt(l, t);
      return { active, transform: l.clip.transform, opacity: l.clip.transform.opacity * fadeGain(l.clip, active.clipTime) };
    });
}

/** O que aparece na tela no instante t. */
export function resolveFrame(project: Project, timeline: TimelineLayout, t: number): FrameState {
  const main = resolveMain(project, timeline, t);
  return { ...main, overlays: pinOverlays(overlaysAt(timeline, t), main, project), packs: packsAt(project, t) };
}

function resolveMain(project: Project, timeline: TimelineLayout, t: number): Omit<FrameState, 'overlays' | 'packs'> {
  const { clips } = timeline;
  for (let i = 0; i < clips.length; i++) {
    const current = clips[i];
    if (t < current.start || t >= current.start + current.length) continue;
    const next = clips[i + 1];
    const transition = project.transitions[i];
    if (next && transition && current.transitionOut > 0 && t >= next.start) {
      return {
        a: activeAt(current, t),
        b: activeAt(next, t),
        transition: { instance: transition, progress: (t - next.start) / current.transitionOut },
      };
    }
    return { a: activeAt(current, t), b: null, transition: null };
  }
  // Depois do último clipe (enquanto ainda há áudio), mantém o último quadro.
  const last = clips[clips.length - 1];
  if (last && t >= timeline.videoDuration) {
    return { a: activeAt(last, last.start + last.length - 0.001), b: null, transition: null };
  }
  return { a: null, b: null, transition: null };
}

export interface AudioSource {
  /** Id do clipe (de vídeo ou de áudio) que toca esse som */
  clipId: string;
  media: MediaItem;
  sourceTime: number;
  gain: number;
  speed: number;
}

/** Tudo que deve estar soando no instante t, com o volume de cada um. */
export function audioAt(project: Project, timeline: TimelineLayout, t: number): AudioSource[] {
  const sources: AudioSource[] = [];
  if (t < timeline.videoDuration) {
    const frame = resolveFrame(project, timeline, t);
    const progress = frame.transition?.progress ?? 0;
    for (const [active, crossfade] of [
      [frame.a, frame.b ? 1 - progress : 1],
      [frame.b, progress],
    ] as const) {
      if (!active || !active.layout.media.hasAudio || active.layout.clip.audioDetached) continue;
      sources.push({
        clipId: active.layout.clip.id,
        media: active.layout.media,
        sourceTime: active.sourceTime,
        gain: active.layout.clip.volume * crossfade,
        speed: speedOf(active.layout.clip),
      });
    }
  }
  for (const layout of timeline.overlays) {
    const { clip, media } = layout;
    const local = t - layout.start;
    if (!media.hasAudio || clip.audioDetached || project.videoTracks[layout.track]?.muted) continue;
    if (local < 0 || local >= layout.length) continue;
    sources.push({
      clipId: clip.id,
      media,
      sourceTime: clip.trimIn + local * speedOf(clip),
      gain: clip.volume * fadeGain(clip, local),
      speed: speedOf(clip),
    });
  }
  const voices = project.audioTracks.some((tr) => tr.kind === 'music') ? voiceIntervals(project) : [];
  for (const track of project.audioTracks) {
    if (track.muted) continue;
    const duck = track.kind === 'music' ? duckFactor(project.duckLevel ?? 0.3, voices, t) : 1;
    for (const clip of track.clips) {
      const media = getMedia(project, clip.mediaId);
      const local = t - clip.start;
      const length = clipLength(clip);
      if (!media || local < 0 || local >= length) continue;
      sources.push({
        clipId: clip.id,
        media,
        sourceTime: clip.trimIn + local * speedOf(clip),
        gain: clip.volume * fadeGain(clip, local) * duck * volumeAt(clip.volumeKeys, local),
        speed: speedOf(clip),
      });
    }
  }
  return sources;
}

export function fadeGain(
  clip: { trimIn: number; trimOut: number; speed?: number; fadeIn: number; fadeOut: number },
  local: number,
): number {
  const length = clipLength(clip);
  let gain = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) gain = Math.min(gain, local / clip.fadeIn);
  if (clip.fadeOut > 0 && local > length - clip.fadeOut) gain = Math.min(gain, (length - local) / clip.fadeOut);
  return clamp(gain, 0, 1);
}

/** Forma desenhada no instante t do clipe: entre dois keyframes, os pontos andam em linha reta. */
export function maskAt(mask: LayerMask | null | undefined, t: number): LayerMask | null | undefined {
  if (!mask || mask.shape !== 'path' || !mask.keys?.length) return mask;
  const keys = [...mask.keys].sort((a, b) => a.time - b.time);
  if (t <= keys[0].time) return { ...mask, points: keys[0].points };
  const last = keys[keys.length - 1];
  if (t >= last.time) return { ...mask, points: last.points };
  const i = keys.findIndex((k) => k.time > t);
  const a = keys[i - 1];
  const b = keys[i];
  const k = (t - a.time) / Math.max(1e-6, b.time - a.time);
  const n = Math.min(a.points.length, b.points.length);
  return { ...mask, points: Array.from({ length: n }, (_, j) => a.points[j] + (b.points[j] - a.points[j]) * k) };
}

/** O que precisa ser calculado para um clipe além do quadro. */
export interface LayerNeeds {
  /** Onde está a pessoa (fundo removido, efeitos na pessoa, texto atrás dela) */
  person: boolean;
  /** Profundidade (efeitos com o céu, o foco e a neblina) */
  depth: boolean;
}

const NO_NEEDS: LayerNeeds = { person: false, depth: false };

/** O que os efeitos e o filtro (filtros também podem usar a pessoa e a profundidade) precisam. */
function effectNeeds(effects: EffectInstance[], filter?: FilterInstance | null): LayerNeeds {
  const needs = { ...NO_NEEDS };
  const ids = effects.filter((e) => e.enabled).map((e) => e.pluginId);
  if (filter && filter.intensity > 0) ids.push(filter.pluginId);
  for (const id of ids) {
    const plugin = getPlugin(id);
    if (!plugin) continue;
    const inputs = pluginInputs(plugin);
    needs.person ||= inputs.person;
    needs.depth ||= inputs.depth;
  }
  return needs;
}

function joinNeeds(...list: LayerNeeds[]): LayerNeeds {
  return { person: list.some((n) => n.person), depth: list.some((n) => n.depth) };
}

/** O clipe precisa da pessoa ou da profundidade (pelos próprios efeitos ou pelo fundo removido)? */
export function clipNeeds(clip: Pick<VideoClip, 'effects' | 'matte'> & { filter?: FilterInstance | null }): LayerNeeds {
  const needs = effectNeeds(clip.effects, clip.filter);
  return { person: needs.person || !!clip.matte, depth: needs.depth };
}

/** Algo no projeto usa a pessoa ou a profundidade? (para carregar os modelos antes de exportar) */
export function projectNeeds(project: Project): LayerNeeds {
  const clips = [...project.clips, ...project.videoTracks.flatMap((t) => t.clips)];
  const transitions = project.transitions.map((tr) => (tr ? getPlugin(tr.pluginId) : undefined));
  return joinNeeds(
    ...clips.map(clipNeeds),
    ...project.packTracks.flatMap((t) => t.clips).map((c) => effectNeeds(c.effects, c.filter)),
    {
      person: transitions.some((p) => p && pluginInputs(p).person) || project.textTracks.some((t) => t.clips.some((c) => c.behind)),
      depth: transitions.some((p) => p && pluginInputs(p).depth),
    },
  );
}

/** Pacotes, transições e textos atrás da pessoa usam a pessoa e a profundidade da trilha principal. */
function baseNeeds(state: FrameState, behind: boolean): LayerNeeds {
  const transitionPlugin = state.transition ? getPlugin(state.transition.instance.pluginId) : undefined;
  return joinNeeds(...state.packs.map((p) => effectNeeds(p.clip.effects, p.clip.filter)), {
    person: behind || (!!transitionPlugin && pluginInputs(transitionPlugin).person),
    depth: !!transitionPlugin && pluginInputs(transitionPlugin).depth,
  });
}

/** Cada clipe visível no quadro e o que ele precisa (para calcular antes de desenhar). */
export function frameNeeds(state: FrameState, behind = false): { active: ActiveClip; needs: LayerNeeds }[] {
  const base = baseNeeds(state, behind);
  const list: { active: ActiveClip; needs: LayerNeeds }[] = [];
  for (const active of [state.a, state.b]) if (active) list.push({ active, needs: joinNeeds(clipNeeds(active.layout.clip), base) });
  for (const o of state.overlays) list.push({ active: o.active, needs: clipNeeds(o.active.layout.clip) });
  return list;
}

/** O que o player/exportador fornece para cada clipe visível: o quadro (e o anterior, na câmera lenta suave). */
export type SourceProvider = (active: ActiveClip, needs: LayerNeeds) => Pick<LayerInput, 'source' | 'interpolation'> & {
  /** Máscara da pessoa no quadro (fundo removido, efeitos na pessoa) */
  mask?: TexImageSource | null;
  /** Profundidade do quadro (claro = perto) */
  depth?: TexImageSource | null;
};

/** Cor manual e LUT de um pacote (null quando não muda nada). */
function packColor(clip: Pick<VideoClip, 'grade' | 'lut'>, luts: SavedLut[] | undefined): LayerColor | null {
  const color = { ...gradeInput(clip.grade), lut: lutInput(luts, clip.lut) };
  return color.grade || color.curves || color.lut ? color : null;
}

/** Efeitos e filtro com os keyframes resolvidos no instante t: o renderizador só recebe valores prontos. */
function resolveLook(source: { effects: EffectInstance[]; filter: FilterInstance | null }, t: number) {
  const effects = source.effects.map((e) => (e.keyframes ? { ...e, params: resolveParams(e.params, e.keyframes, t) } : e));
  let filter = source.filter;
  if (filter?.keyframes) {
    const values = resolveParams({ ...filter.params, intensity: filter.intensity }, filter.keyframes, t);
    const { intensity, ...params } = values;
    filter = { ...filter, intensity: typeof intensity === 'number' ? intensity : filter.intensity, params };
  }
  return { effects, filter };
}

export function toFrameInput(
  state: FrameState,
  provide: SourceProvider,
  background: Background | null = null,
  luts: SavedLut[] | undefined = undefined,
  /** Há textos atrás da pessoa neste instante (a trilha principal precisa da máscara dela) */
  behind = false,
): FrameInput {
  const base = baseNeeds(state, behind);
  const layer = (active: ActiveClip | null, extra: LayerNeeds, stretch = false): LayerInput | null => {
    if (!active) return null;
    const { clip, media, length } = active.layout;
    const t = active.clipTime;
    const needs = joinNeeds(clipNeeds(clip), extra);
    const { mask, depth, ...provided } = provide(active, needs);
    const color = { ...gradeInput(clip.grade), lut: lutInput(luts, clip.lut) };
    const look = resolveLook(clip, t);
    const camera = clip.camera ? { ...evaluateCamera(clip.camera, t, active.sourceTime), fill: clip.camera.fill } : null;
    // Olhar para a câmera: corrige a imagem original, antes dos efeitos do clipe.
    const gaze = gazeEffect(clip, media, active.sourceTime, camera, stretch);
    const effects = gaze ? [gaze, ...look.effects] : look.effects;
    const filter = look.filter;
    const sideways = clip.turn === 90 || clip.turn === 270;
    return {
      key: clip.id,
      ...provided,
      person: needs.person ? (mask ?? null) : null,
      depth: needs.depth ? (depth ?? null) : null,
      matte: clip.matte && mask ? { mode: clip.matte.mode, color: clip.matte.color } : null,
      color: color.grade || color.curves || color.lut ? color : null,
      width: sideways ? media.height : media.width,
      height: sideways ? media.width : media.height,
      turn: clip.turn ?? 0,
      flipX: !!clip.flipX,
      flipY: !!clip.flipY,
      background,
      time: t,
      duration: length,
      effects,
      filter,
      camera,
    };
  };
  return {
    a: layer(state.a, base),
    b: layer(state.b, base),
    layers: state.overlays.map((o): PlacedLayer => ({
      ...layer(o.active, NO_NEEDS, true)!,
      // A camada é processada "esticada" (a mídia ocupa o quadro todo) e depois posicionada.
      stretch: true,
      place: {
        ...o.transform,
        mask: followMask(maskAt(o.transform.mask, o.active.clipTime), o.transform.maskFollow, o.active.layout.clip, o.active.layout.media, o.active.sourceTime),
        opacity: o.opacity,
        corners: o.corners ?? null,
      },
    })),
    // Bloco sem nada ligado (o bloco de ajuste recém-posto) não muda a imagem: não custa passadas na placa.
    adjust: state.packs.flatMap(({ clip, local, amount }): AdjustInput[] => {
      const color = packColor(clip, luts);
      if (!clip.filter && !clip.camera && !color && !clip.effects.some((e) => e.enabled)) return [];
      return [
        {
          key: `pacote:${clip.id}`,
          ...resolveLook(clip, local),
          time: local,
          duration: clip.duration,
          camera: clip.camera ? { ...evaluateCamera(clip.camera, local, local), fill: false } : null,
          amount,
          // Só com cor manual: os outros pacotes seguem iguais (e sem passada a mais).
          ...(color ? { color } : {}),
        },
      ];
    }),
    transition: state.transition && {
      pluginId: state.transition.instance.pluginId,
      params: state.transition.instance.params,
      progress: state.transition.progress,
    },
  };
}
