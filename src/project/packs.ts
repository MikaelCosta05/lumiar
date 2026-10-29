import { shiftKeyframes, type Easing, type Keyframe, type KeyframeMap } from '../engine/keyframes';
import { t } from '../i18n';
import { defaultParams, getPlugin } from '../engine/registry';
import type { EffectInstance, FilterInstance, ParamValues } from '../engine/types';
import { createCamera, type Camera, type CameraTransform, type TrackPoint } from './camera';
import {
  findAudioClip,
  layoutProject,
  removeAudioClip,
  speedOf,
  splitVideoClip,
  uid,
  updateAudioClip,
  updateClip,
  type Project,
  type TimelineLayout,
  type VideoClip,
} from './model';
import { findTextClip, shiftText, removeTextClip, updateTextClip } from './text';

/**
 * Pacotes de edição: um bloco na timeline que aplica de uma vez filtro, efeitos e movimento de câmera
 * sobre tudo o que está embaixo dele (trilha principal e sobreposições), só naquele trecho.
 * É como uma "action" do Photoshop: o pacote vem pronto e o bloco guarda uma cópia de tudo,
 * então dá para ajustar cada parte sem mexer no pacote original.
 */

/**
 * Ao esticar ou encurtar o bloco:
 * - edges: o que acontece no começo fica no começo e o que acontece no fim acompanha o fim
 *   (entrada e saída mantêm a duração);
 * - stretch: toda a animação estica junto (momentos curtos, como batidas e passagens);
 * - fixed: nada se move (animações presas às batidas da música).
 */
export type PackTiming = 'edges' | 'stretch' | 'fixed';

/** Onde o bloco entra quando o pacote é aplicado. */
export type PackAnchor =
  /** Cobre o clipe selecionado (ou o que está sob o cursor) */
  | 'clip'
  /** Começa no cursor (batidas, impactos) */
  | 'cursor'
  /** Fica centralizado no corte mais perto do cursor (passagens entre clipes) */
  | 'cut'
  /** Começa no início do clipe sob o cursor (aberturas) */
  | 'clip-start'
  /** Termina no fim do clipe sob o cursor (finais) */
  | 'clip-end'
  /** Cobre a música (ou o trecho selecionado) e pulsa em cada batida */
  | 'beats';

/** [tempo (s), valor, curva até o próximo] */
export type PulsePoint = [number, number, Easing?];

/**
 * Animação repetida em cada batida da música. As chaves dizem o que anima:
 * "camera.zoom", "camera.rotation", "camera.x", "camera.y", "filter.intensity"
 * ou "effects.<n>.<parâmetro>" (n = posição do efeito no pacote).
 */
export interface BeatPattern {
  /** Usa uma a cada N batidas (1 = todas) */
  every?: number;
  pulses: Record<string, { rest: number; points: PulsePoint[]; /** Batidas ímpares, quando alternam */ alt?: PulsePoint[] }>;
}

/**
 * Ligação entre um pacote de velocidade e os clipes da trilha principal que ele dividiu.
 * Serve para mover o "momento" da câmera lenta, silenciar o trecho lento e desfazer tudo ao excluir o bloco.
 */
export interface SpeedLink {
  speeds: number[];
  /** Clipes criados pelo pacote, em ordem (um por velocidade) */
  parts: string[];
  /** Pedaços do clipe original antes e depois do trecho (para juntar de volta) */
  before: string | null;
  after: string | null;
  /** Velocidade e volume que o clipe tinha */
  base: number;
  volume: number;
  /** Duração do trecho antes de mudar a velocidade */
  span: number;
  /** Momento (começo da parte mais lenta), em segundos desde o início do bloco */
  moment: number;
  /** Som do trecho lento desligado */
  muted?: boolean;
}

export interface PackClip {
  id: string;
  /** Pacote de origem (só para referência) */
  packId: string;
  name: string;
  /** Cor do bloco na timeline */
  color: string;
  start: number;
  duration: number;
  /** 0 a 1: quanto do pacote aparece por cima da imagem original */
  intensity: number;
  /** Entrada e saída suaves da intensidade (s) */
  fadeIn: number;
  fadeOut: number;
  effects: EffectInstance[];
  filter: FilterInstance | null;
  camera: Camera | null;
  timing: PackTiming;
  /** Textos, stickers e sons que entraram junto em versões antigas (andam com o bloco e saem com ele) */
  attached?: string[];
  /** Pacotes que mudaram a velocidade do vídeo embaixo */
  speed?: SpeedLink;
  /** Grupo de itens que andam juntos */
  group?: string;
}

export interface PackTrack {
  id: string;
  name: string;
  hidden: boolean;
  clips: PackClip[];
}

/** Um pacote pronto (ou salvo pelo usuário). Tempos dos keyframes em segundos dentro de `duration`. */
export interface PackTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  color: string;
  duration: number;
  timing: PackTiming;
  anchor: PackAnchor;
  intensity: number;
  fadeIn: number;
  fadeOut: number;
  effects: { pluginId: string; params?: ParamValues; keyframes?: KeyframeMap }[];
  filter: { pluginId: string; intensity: number; params?: ParamValues; keyframes?: KeyframeMap } | null;
  camera: { base?: Partial<CameraTransform>; keyframes: KeyframeMap } | null;
  /** Silencia o som do vídeo no trecho lento (os efeitos sonoros fazem o clima) */
  muteSlow?: boolean;
  /**
   * Muda a velocidade do clipe da trilha principal embaixo do bloco: o trecho é dividido em partes iguais,
   * cada uma com a sua velocidade (uma só = câmera lenta/acelerado; várias = rampa).
   */
  speed?: number[];
  /** Pulsa nas batidas da música (detectadas na hora de aplicar) */
  beat?: BeatPattern;
  /** A câmera do pacote acompanha o rosto (detectado na hora de aplicar). zoom "auto" = enquadra o rosto. */
  face?: { zoom: number | 'auto'; smoothness: number };
  /** Criado pelo usuário ("Meus pacotes") */
  custom?: boolean;
}

export const MIN_PACK_LENGTH = 0.2;

export function createPackTrack(number: number): PackTrack {
  return { id: uid(), name: number > 1 ? t('Pacotes {number}', { number }) : t('Pacotes'), hidden: false, clips: [] };
}

// ---------------------------------------------------------------- Criar a partir de um pacote

/** Bloco pronto para pôr na timeline, com os keyframes ajustados à duração escolhida. */
export function createPackClip(template: PackTemplate, start: number, duration = template.duration, id = uid()): PackClip {
  const effects = template.effects.flatMap((e): EffectInstance[] => {
    const plugin = getPlugin(e.pluginId);
    if (!plugin) return [];
    return [{ uid: uid(), pluginId: e.pluginId, enabled: true, params: { ...defaultParams(plugin), ...e.params }, keyframes: e.keyframes }];
  });
  const filterPlugin = template.filter && getPlugin(template.filter.pluginId);
  const filter: FilterInstance | null =
    template.filter && filterPlugin
      ? {
          pluginId: template.filter.pluginId,
          intensity: template.filter.intensity,
          params: { ...defaultParams(filterPlugin), ...template.filter.params },
          keyframes: template.filter.keyframes,
        }
      : null;
  const camera: Camera | null = template.camera
    ? { ...createCamera(), base: { ...createCamera().base, ...template.camera.base }, keyframes: template.camera.keyframes }
    : null;
  const clip: PackClip = {
    id,
    packId: template.id,
    name: template.name,
    color: template.color,
    start: Math.max(0, start),
    duration: template.duration,
    intensity: template.intensity,
    fadeIn: template.fadeIn,
    fadeOut: template.fadeOut,
    effects,
    filter,
    camera,
    timing: template.timing,
  };
  return retimePack(clip, Math.max(MIN_PACK_LENGTH, duration));
}

/** Guarda um bloco (ou o visual de um clipe) como pacote do usuário, com a câmera lenta se tiver. */
export function templateFromClip(
  original: Pick<PackClip, 'name' | 'color' | 'duration' | 'intensity' | 'fadeIn' | 'fadeOut' | 'effects' | 'filter' | 'camera' | 'timing'> &
    Partial<Pick<PackClip, 'speed'>>,
  anchor: PackAnchor = 'clip',
): PackTemplate {
  // Pacote de velocidade: a duração do pacote é a do trecho antes de mudar a velocidade.
  const link = original.speed;
  const clip = link ? retimePack(original as PackClip, link.span) : original;
  return {
    id: `custom/${uid()}`,
    name: clip.name,
    category: 'Meus pacotes',
    description: t('Criado por você.'),
    color: clip.color,
    duration: clip.duration,
    timing: clip.timing,
    anchor,
    intensity: clip.intensity,
    fadeIn: clip.fadeIn,
    fadeOut: clip.fadeOut,
    effects: clip.effects.filter((e) => e.enabled).map((e) => ({ pluginId: e.pluginId, params: e.params, keyframes: e.keyframes })),
    filter: clip.filter && { pluginId: clip.filter.pluginId, intensity: clip.filter.intensity, params: clip.filter.params, keyframes: clip.filter.keyframes },
    camera: clip.camera && { base: clip.camera.base, keyframes: clip.camera.keyframes },
    // O rastreamento é do vídeo de agora; no próximo uso o rosto é procurado de novo.
    face: clip.camera?.follow?.kind === 'face' ? { zoom: clip.camera.follow.zoom, smoothness: clip.camera.follow.smoothness } : undefined,
    speed: link?.speeds,
    muteSlow: link?.muted,
    custom: true,
  };
}

/** Empurra no tempo os textos, stickers e sons que vieram com o pacote (blocos de projetos antigos). */
export function shiftAttached(project: Project, ids: string[] | undefined, delta: number): Project {
  if (!ids?.length || Math.abs(delta) < 1e-9) return project;
  let next = project;
  for (const id of ids) {
    if (findTextClip(next, id)) next = updateTextClip(next, id, (c) => shiftText(c, Math.max(-c.start, delta)));
    else if (findAudioClip(next, id)) next = updateAudioClip(next, id, (c) => ({ ...c, start: Math.max(0, c.start + delta) }));
  }
  return next;
}

function removeAttached(project: Project, ids: string[] | undefined): Project {
  let next = project;
  for (const id of ids ?? []) next = removeAudioClip(removeTextClip(next, id), id);
  return next;
}

/**
 * Trecho que o bloco ocupa ao aplicar o pacote no instante t.
 * `cover` = trecho do clipe selecionado (pacotes de visual cobrem ele inteiro).
 */
export function packSpan(
  template: PackTemplate,
  timeline: TimelineLayout,
  t: number,
  cover: { start: number; length: number } | null = null,
  music: { start: number; length: number } | null = null,
): { start: number; duration: number } {
  const d = template.duration;
  const under = cover ?? timeline.clips.find((l) => t >= l.start && t < l.start + l.length) ?? null;
  switch (template.anchor) {
    case 'beats': {
      const span = cover ?? music;
      return span ? { start: span.start, duration: span.length } : { start: t, duration: d };
    }
    case 'clip':
      return under ? { start: under.start, duration: under.length } : { start: t, duration: d };
    case 'clip-start':
      return { start: under ? under.start : t, duration: under ? Math.min(d, under.length) : d };
    case 'clip-end': {
      const end = under ? under.start + under.length : t;
      return { start: Math.max(0, end - d), duration: Math.min(d, end) || d };
    }
    case 'cut': {
      // O corte fica no meio da transição (ou na junção, se for corte seco).
      const cuts = timeline.clips.slice(1).map((l) => l.start + l.transitionIn / 2);
      const cut = cuts.reduce((best, c) => (Math.abs(c - t) < Math.abs(best - t) ? c : best), cuts[0] ?? t);
      return { start: Math.max(0, cut - d / 2), duration: d };
    }
    default:
      return { start: t, duration: d };
  }
}

export interface ApplyOptions {
  /** Trecho do clipe selecionado */
  cover?: { start: number; length: number } | null;
  /** Trecho da música (pacotes de batida) */
  music?: { start: number; length: number } | null;
  /** Batidas da música, em tempo da timeline */
  beats?: number[];
  /** Trilha de pacotes preferida */
  track?: number;
  id?: string;
}

/**
 * Aplica o pacote: muda a velocidade do trecho (se o pacote mexe nisso), põe o bloco na trilha de pacotes
 * e gera as animações nas batidas. Pacotes não trazem textos nem stickers: isso fica a cargo de quem edita.
 */
export function applyPack(
  project: Project,
  timeline: TimelineLayout,
  template: PackTemplate,
  t: number,
  options: ApplyOptions = {},
): { project: Project; id: string; speedApplied: boolean } {
  let span = packSpan(template, timeline, t, options.cover ?? null, options.music ?? null);
  let next = project;
  let link: SpeedLink | undefined;
  if (template.speed?.length) {
    const result = applySpeed(next, span.start, span.duration, template.speed);
    if (result) {
      next = result.project;
      span = { start: result.start, duration: result.duration };
      link = result.link;
    }
  }
  let clip = createPackClip(template, span.start, span.duration, options.id);
  if (template.beat) {
    const local = (options.beats ?? []).map((b) => b - span.start).filter((b) => b >= -1e-6 && b < span.duration);
    clip = applyBeatPattern(clip, template.beat, local);
  }
  clip = { ...clip, speed: link };
  next = placePackClip(next, clip, options.track ?? 0);
  if (link && template.muteSlow) next = setSlowMuted(next, clip.id, true);
  return { project: next, id: clip.id, speedApplied: !!link };
}

// ---------------------------------------------------------------- Velocidade (câmera lenta, rampas)

/**
 * Divide o clipe da trilha principal em [start, start + duration] e dá a cada parte a sua velocidade.
 * Devolve o novo trecho (câmera lenta deixa o trecho mais longo). null se não houver vídeo ali.
 */
export function applySpeed(
  project: Project,
  start: number,
  duration: number,
  speeds: number[],
): { project: Project; start: number; duration: number; link: SpeedLink } | null {
  const layout = layoutProject(project).clips.find((l) => start >= l.start - 1e-6 && start < l.start + l.length);
  if (!layout || layout.media.kind !== 'video') return null;
  const end = Math.min(start + duration, layout.start + layout.length);
  const clipId = layout.clip.id;
  let next = project;
  // Corta o fim e o começo do trecho (as transições viram cortes secos ali).
  const cutEnd = splitVideoClip(next, clipId, end);
  if (cutEnd) next = cutEnd.project;
  let middleId = clipId;
  const cutStart = splitVideoClip(next, clipId, start);
  if (cutStart) {
    next = cutStart.project;
    middleId = cutStart.newId;
  }
  // Partes iguais (no tempo original), uma por velocidade.
  const part = (end - start) / speeds.length;
  const ids = [middleId];
  for (let k = 1; k < speeds.length; k++) {
    const piece = splitVideoClip(next, ids[ids.length - 1], start + part * k);
    if (!piece) break;
    next = piece.project;
    ids.push(piece.newId);
  }
  ids.forEach((id, k) => {
    next = updateClip(next, id, (c) => ({ ...c, speed: Math.min(16, Math.max(0.1, speedOf(c) * (speeds[k] ?? 1))) }));
  });
  const parts = layoutProject(next).clips.filter((l) => ids.includes(l.clip.id));
  const total = parts.reduce((sum, l) => sum + l.length, 0);
  const slowest = slowestPart(speeds);
  const link: SpeedLink = {
    speeds,
    parts: ids,
    before: cutStart ? clipId : null,
    after: cutEnd?.newId ?? null,
    base: speedOf(layout.clip),
    volume: layout.clip.volume,
    span: end - start,
    moment: parts.slice(0, slowest).reduce((sum, l) => sum + l.length, 0),
  };
  return { project: next, start, duration: Math.max(MIN_PACK_LENGTH, total), link };
}

/** A parte mais lenta (a primeira, se houver empate): é onde fica o "momento". */
function slowestPart(speeds: number[]): number {
  return speeds.reduce((best, v, i) => (v < speeds[best] - 1e-9 ? i : best), 0);
}

/**
 * Desfaz a mudança de velocidade: junta as partes (e os pedaços de antes e depois) de volta num clipe só.
 * null se o usuário já mexeu nos clipes (aí não dá para saber como juntar).
 */
export function undoSpeed(project: Project, link: SpeedLink): { project: Project; clipId: string } | null {
  const indexes = link.parts.map((id) => project.clips.findIndex((c) => c.id === id));
  if (indexes.some((i, k) => i < 0 || i !== indexes[0] + k)) return null;
  const clips = [...project.clips];
  const transitions = [...project.transitions];
  const first = clips[indexes[0]];
  const last = clips[indexes[indexes.length - 1]];
  let at = indexes[0];
  let merged: VideoClip = { ...first, trimOut: last.trimOut, speed: link.base, volume: link.volume };
  clips.splice(at, link.parts.length, merged);
  transitions.splice(at, link.parts.length - 1);
  // Cola de volta nos pedaços de antes e depois, se continuam encostados.
  const joins = (a: VideoClip, b: VideoClip, cut: number) =>
    a.mediaId === b.mediaId && Math.abs(a.trimOut - b.trimIn) < 1e-3 && Math.abs(speedOf(a) - speedOf(b)) < 1e-6 && !transitions[cut];
  const prev = clips[at - 1];
  if (link.before && prev?.id === link.before && joins(prev, merged, at - 1)) {
    merged = { ...prev, trimOut: merged.trimOut };
    clips.splice(at - 1, 2, merged);
    transitions.splice(at - 1, 1);
    at--;
  }
  const after = clips[at + 1];
  if (link.after && after?.id === link.after && joins(merged, after, at)) {
    merged = { ...merged, trimOut: after.trimOut };
    clips.splice(at, 2, merged);
    transitions.splice(at, 1);
  }
  return { project: { ...project, clips, transitions }, clipId: merged.id };
}

/**
 * Leva o momento da câmera lenta (o começo da parte mais lenta) para o instante `momentAt` da timeline:
 * o vídeo volta ao normal e a velocidade é aplicada de novo, com o trecho lento começando ali.
 * Os textos, stickers e sons do pacote vão junto. Usado ao arrastar a alça do momento e o bloco inteiro.
 */
export function moveSpeedPack(project: Project, packId: string, momentAt: number): Project {
  const link = findPackClip(project, packId)?.clip.speed;
  if (!link) return project;
  const part = layoutProject(project).clips.find((l) => l.clip.id === link.parts[slowestPart(link.speeds)]);
  if (!part) return project;
  // Andar `delta` segundos na timeline = andar o mesmo tanto no vídeo, em velocidade normal.
  const delta = momentAt - part.start;
  if (Math.abs(delta) < 0.005) return project;
  return respeed(project, packId, part.clip.id, part.clip.trimIn + delta * link.base);
}

/** Refaz a câmera lenta com o momento no instante `sourceTime` (dentro do arquivo) do clipe `clipId`. */
function respeed(project: Project, packId: string, clipId: string, sourceTime: number): Project {
  const found = findPackClip(project, packId);
  const link = found?.clip.speed;
  if (!found || !link) return project;
  const undone = undoSpeed(project, link);
  if (!undone) return project;
  const touched = [...link.parts, link.before, link.after].includes(clipId);
  const target = layoutProject(undone.project).clips.find((l) => l.clip.id === (touched ? undone.clipId : clipId));
  if (!target) return project;
  const position = target.start + (sourceTime - target.clip.trimIn) / speedOf(target.clip);
  const before = (link.span * slowestPart(link.speeds)) / link.speeds.length;
  const result = applySpeed(undone.project, Math.max(0, position - before), link.span, link.speeds);
  if (!result) return project;
  let next = updatePackClip(result.project, packId, (c) => ({
    ...retimePack(c, result.duration),
    start: result.start,
    speed: result.link,
  }));
  next = shiftAttached(next, found.clip.attached, result.start + result.link.moment - (found.clip.start + link.moment));
  return link.muted ? setSlowMuted(next, packId, true) : next;
}

/** Depois de arrastar o bloco: a câmera lenta acompanha a nova posição. */
export function syncSpeedPack(project: Project, packId: string): Project {
  const clip = findPackClip(project, packId)?.clip;
  return clip?.speed ? moveSpeedPack(project, packId, clip.start + clip.speed.moment) : project;
}

/** Liga/desliga o som do vídeo nas partes lentas do pacote. */
export function setSlowMuted(project: Project, packId: string, muted: boolean): Project {
  const link = findPackClip(project, packId)?.clip.speed;
  if (!link) return project;
  let next = project;
  link.parts.forEach((id, k) => {
    if (link.speeds[k] < 1) next = updateClip(next, id, (c) => ({ ...c, volume: muted ? 0 : link.volume }));
  });
  return updatePackClip(next, packId, (c) => ({ ...c, speed: c.speed && { ...c.speed, muted } }));
}

/** Exclui o bloco junto com o que veio com ele (textos, stickers, sons) e desfaz a mudança de velocidade. */
export function deletePack(project: Project, packId: string): Project {
  const found = findPackClip(project, packId);
  if (!found) return project;
  let next = removeAttached(project, found.clip.attached);
  if (found.clip.speed) next = undoSpeed(next, found.clip.speed)?.project ?? next;
  return removePackClip(next, packId);
}

// ---------------------------------------------------------------- Batidas

/** Gera, em cada batida, as animações do padrão (zoom, flash, giro…). Tempos já relativos ao bloco. */
export function applyBeatPattern(clip: PackClip, pattern: BeatPattern, beats: number[]): PackClip {
  const every = Math.max(1, pattern.every ?? 1);
  const used = beats.filter((_, i) => i % every === 0);
  const tracks: Record<string, Keyframe[]> = {};
  for (const [key, pulse] of Object.entries(pattern.pulses)) {
    const list: Keyframe[] = [{ time: 0, value: pulse.rest, easing: 'hold' }];
    used.forEach((beat, i) => {
      const nextBeat = used[i + 1] ?? clip.duration;
      const points = pulse.alt && i % 2 === 1 ? pulse.alt : pulse.points;
      points.forEach(([dt, value, easing], j) => {
        const time = beat + dt;
        // Um pulso não invade o próximo.
        if (time >= nextBeat - 0.01 || time > clip.duration) return;
        // O último ponto segura o valor até a próxima batida (sem subir devagar antes dela).
        list.push({ time, value, easing: j === points.length - 1 ? 'hold' : (easing ?? 'ease-out') });
      });
    });
    tracks[key] = list.sort((a, b) => a.time - b.time);
  }

  const withKeys = (map: KeyframeMap | undefined, id: string, kfs: Keyframe[]): KeyframeMap => ({ ...map, [id]: kfs });
  let next: PackClip = { ...clip, timing: 'fixed' };
  for (const [key, kfs] of Object.entries(tracks)) {
    const [kind, a, b] = key.split('.');
    if (kind === 'camera') {
      const camera = next.camera ?? createCamera();
      next = { ...next, camera: { ...camera, keyframes: withKeys(camera.keyframes, a, kfs) } };
    } else if (kind === 'filter' && next.filter) {
      next = { ...next, filter: { ...next.filter, keyframes: withKeys(next.filter.keyframes, a, kfs) } };
    } else if (kind === 'effects') {
      const index = Number(a);
      next = { ...next, effects: next.effects.map((e, i) => (i === index ? { ...e, keyframes: withKeys(e.keyframes, b, kfs) } : e)) };
    }
  }
  return next;
}

// ---------------------------------------------------------------- Seguir rosto

/**
 * Liga o "seguir rosto" na câmera do bloco. `points` em tempo do bloco e posição na tela (0 a 1).
 * zoom "auto" enquadra o rosto ocupando ~22% da largura.
 */
export function setPackFace(project: Project, packId: string, points: TrackPoint[], face: NonNullable<PackTemplate['face']>): Project {
  return updatePackClip(project, packId, (c) => {
    const size = points.reduce((sum, p) => sum + p.size, 0) / Math.max(1, points.length);
    const zoom = face.zoom === 'auto' ? Math.min(3, Math.max(1.3, 0.22 / Math.max(0.01, size))) : face.zoom;
    const camera = c.camera ?? createCamera();
    return { ...c, camera: { ...camera, follow: { kind: 'face', points, zoom, smoothness: face.smoothness, mode: 'center', anchorTime: 0 } } };
  });
}

/**
 * "Fixa" o pacote direto num clipe, como uma action do Photoshop: o filtro do pacote substitui o do clipe,
 * os efeitos entram no fim da lista e o movimento de câmera troca o do clipe. Sem bloco na timeline.
 */
export function bakePack<T extends VideoClip>(template: PackTemplate, clip: T, length: number): T {
  const pack = createPackClip(template, 0, length);
  const scale = pack.intensity;
  return {
    ...clip,
    effects: [...clip.effects, ...pack.effects],
    filter: pack.filter ? { ...pack.filter, intensity: pack.filter.intensity * scale } : clip.filter,
    camera: pack.camera
      ? { ...pack.camera, fill: clip.camera?.fill ?? false, follow: clip.camera?.follow ?? null, stabilize: clip.camera?.stabilize }
      : clip.camera,
  };
}

// ---------------------------------------------------------------- Tempo dos keyframes

function retimeTime(t: number, from: number, to: number, timing: PackTiming): number {
  if (timing === 'fixed') return t;
  if (timing === 'stretch') return from > 0 ? (t * to) / from : t;
  // Primeira metade presa ao começo, segunda metade presa ao fim.
  return t > from / 2 ? Math.max(0, t + to - from) : t;
}

function retimeMap(map: KeyframeMap | undefined, from: number, to: number, timing: PackTiming): KeyframeMap | undefined {
  if (!map) return map;
  return Object.fromEntries(
    Object.entries(map).map(([id, kfs]) => [id, kfs.map((k) => ({ ...k, time: retimeTime(k.time, from, to, timing) }))]),
  );
}

/** Muda a duração do bloco, levando junto as animações (ver PackTiming). */
export function retimePack(clip: PackClip, duration: number): PackClip {
  const from = clip.duration;
  if (Math.abs(from - duration) < 1e-9) return clip;
  const map = (m: KeyframeMap | undefined) => retimeMap(m, from, duration, clip.timing);
  return {
    ...clip,
    duration,
    effects: clip.effects.map((e) => ({ ...e, keyframes: map(e.keyframes) })),
    filter: clip.filter && { ...clip.filter, keyframes: map(clip.filter.keyframes) },
    camera: clip.camera && { ...clip.camera, keyframes: map(clip.camera.keyframes) ?? {} },
    // Entrada e saída suaves não podem passar da metade do bloco.
    fadeIn: Math.min(clip.fadeIn, duration / 2),
    fadeOut: Math.min(clip.fadeOut, duration / 2),
  };
}

// ---------------------------------------------------------------- Operações na trilha

export function packTracksOf(project: Project): PackTrack[] {
  return project.packTracks ?? [];
}

export function addPackTrack(project: Project): Project {
  const tracks = packTracksOf(project);
  return { ...project, packTracks: [...tracks, createPackTrack(tracks.length + 1)] };
}

export function updatePackTrack(project: Project, trackId: string, update: (t: PackTrack) => PackTrack): Project {
  return { ...project, packTracks: packTracksOf(project).map((t) => (t.id === trackId ? update(t) : t)) };
}

export function removePackTrack(project: Project, trackId: string): Project {
  const tracks = packTracksOf(project);
  if (tracks.length <= 1) return project;
  return { ...project, packTracks: tracks.filter((t) => t.id !== trackId) };
}

export function findPackClip(project: Project, clipId: string) {
  const tracks = packTracksOf(project);
  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex];
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, trackIndex, clip };
  }
  return null;
}

/** Coloca o bloco na primeira trilha de pacotes livre naquele trecho (cria uma nova se precisar). */
export function placePackClip(project: Project, clip: PackClip, preferredTrack = 0): Project {
  let tracks = packTracksOf(project);
  if (tracks.length === 0) tracks = [createPackTrack(1)];
  const end = clip.start + clip.duration;
  const free = (t: PackTrack) => !t.clips.some((c) => clip.start < c.start + c.duration && end > c.start);
  const order = [preferredTrack, ...tracks.keys()].filter((i) => i >= 0 && i < tracks.length);
  let index = order.find((i) => free(tracks[i]));
  if (index === undefined) {
    tracks = [...tracks, createPackTrack(tracks.length + 1)];
    index = tracks.length - 1;
  }
  return { ...project, packTracks: tracks.map((t, i) => (i === index ? { ...t, clips: [...t.clips, clip] } : t)) };
}

export function updatePackClip(project: Project, clipId: string, update: (clip: PackClip) => PackClip): Project {
  return {
    ...project,
    packTracks: packTracksOf(project).map((t) =>
      t.clips.some((c) => c.id === clipId) ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? update(c) : c)) } : t,
    ),
  };
}

export function removePackClip(project: Project, clipId: string): Project {
  return { ...project, packTracks: packTracksOf(project).map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })) };
}

export function movePackClip(project: Project, clipId: string, trackIndex: number, start: number): Project {
  const found = findPackClip(project, clipId);
  if (!found) return project;
  const tracks = packTracksOf(project);
  const target = Math.min(Math.max(0, trackIndex), tracks.length - 1);
  const moved = { ...found.clip, start: Math.max(0, start) };
  // Textos, stickers e sons do pacote andam junto com o bloco.
  const next = shiftAttached(project, found.clip.attached, moved.start - found.clip.start);
  return {
    ...next,
    packTracks: tracks.map((t, i) => {
      const clips = t.clips.filter((c) => c.id !== clipId);
      return { ...t, clips: i === target ? [...clips, moved] : clips };
    }),
  };
}

/**
 * Puxa uma borda do bloco até `time`. Calculado sempre a partir do bloco como estava
 * no começo do arraste (`original`), para as animações não irem se deformando aos poucos.
 */
export function resizePackClip(project: Project, original: PackClip, edge: 'in' | 'out', time: number): Project {
  return updatePackClip(project, original.id, () => {
    if (edge === 'out') return retimePack(original, Math.max(MIN_PACK_LENGTH, time - original.start));
    const end = original.start + original.duration;
    const start = Math.min(Math.max(0, time), end - MIN_PACK_LENGTH);
    return { ...retimePack(original, end - start), start };
  });
}

export function splitPackClip(project: Project, clipId: string, t: number): { project: Project; newId: string } | null {
  const found = findPackClip(project, clipId);
  if (!found) return null;
  const { clip } = found;
  const offset = t - clip.start;
  if (offset < MIN_PACK_LENGTH / 2 || offset > clip.duration - MIN_PACK_LENGTH / 2) return null;
  const first: PackClip = { ...clip, duration: offset, fadeOut: 0 };
  const second: PackClip = {
    ...clip,
    id: uid(),
    start: t,
    duration: clip.duration - offset,
    fadeIn: 0,
    attached: undefined,
    speed: undefined,
    effects: clip.effects.map((e) => ({ ...e, uid: uid(), keyframes: shiftKeyframes(e.keyframes, -offset) })),
    filter: clip.filter && { ...clip.filter, keyframes: shiftKeyframes(clip.filter.keyframes, -offset) },
    camera: clip.camera && { ...clip.camera, keyframes: shiftKeyframes(clip.camera.keyframes, -offset) ?? {} },
  };
  return {
    project: {
      ...project,
      packTracks: packTracksOf(project).map((track) =>
        track === found.track ? { ...track, clips: track.clips.flatMap((c) => (c.id === clipId ? [first, second] : [c])) } : track,
      ),
    },
    newId: second.id,
  };
}

// ---------------------------------------------------------------- No quadro

export interface ActivePack {
  clip: PackClip;
  /** Tempo desde o início do bloco */
  local: number;
  /** Intensidade já com a entrada e a saída suaves */
  amount: number;
}

/** Blocos que valem no instante t, da primeira trilha para a última. */
export function packsAt(project: Project, t: number): ActivePack[] {
  const active: ActivePack[] = [];
  for (const track of packTracksOf(project)) {
    if (track.hidden) continue;
    for (const clip of track.clips) {
      const local = t - clip.start;
      if (local < 0 || local >= clip.duration) continue;
      let fade = 1;
      if (clip.fadeIn > 0) fade = Math.min(fade, local / clip.fadeIn);
      if (clip.fadeOut > 0) fade = Math.min(fade, (clip.duration - local) / clip.fadeOut);
      active.push({ clip, local, amount: clip.intensity * Math.min(1, Math.max(0, fade)) });
    }
  }
  return active;
}
