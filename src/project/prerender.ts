import { getPlugin } from '../engine/registry';
import type { ShaderPlugin } from '../engine/types';
import { clipLength, findAudioClip, findOverlayClip, type MediaItem, type Project, type TimelineLayout, type VideoClip } from './model';
import { findPackClip, packTracksOf } from './packs';
import { findTextClip } from './text';

/**
 * Pré-renderização: um trecho com efeitos pesados é renderizado uma vez num vídeo guardado na memória
 * e o preview passa a tocar dele. Aqui fica só a parte pura: qual trecho, quando ele deixa de valer
 * (a "impressão digital" do que aparece nele) e a contabilidade dos trechos guardados.
 */

export interface Span {
  start: number;
  end: number;
}

/** O que a contabilidade precisa saber de cada trecho guardado. */
export interface PrerenderSpan extends Span {
  id: string;
  /** Quando foi criado (o mais novo vale onde há sobreposição) */
  createdAt: number;
  /** Tamanho do vídeo guardado */
  bytes: number;
}

/** Segundos renderizados antes do trecho (sem gravar) para os efeitos que lembram do passado já chegarem "andando". */
export const PRERENDER_WARMUP = 1;
/** Limite de memória de todos os trechos juntos: passando disso, os mais antigos são apagados. */
export const PRERENDER_MEMORY_LIMIT = 1.5 * 1024 ** 3;
/** Lado menor do vídeo guardado (o preview raramente aparece maior que isso na tela). */
export const PRERENDER_SHORT_SIDE = 720;
/** Trecho mais curto que vale a pena guardar (s) */
const MIN_SPAN = 0.1;

// ---------------------------------------------------------------- Qual trecho

/** O que recebeu o clique direito (o mesmo formato do TimelineTarget da timeline). */
export type PrerenderTarget =
  | { kind: 'clip' | 'overlay' | 'audio' | 'text' | 'pack' | 'marker' | 'comment'; id: string }
  | { kind: 'transition'; index: number }
  | { kind: 'empty'; time: number };

/**
 * Trecho a pré-renderizar a partir do clique direito: o próprio item (clipe, camada, bloco, texto),
 * a transição com meio segundo de folga, ou, num ponto vazio da timeline, o que está visível ali
 * (clipe da trilha principal, senão a camada, o bloco ou o texto daquele instante).
 */
export function prerenderSpanFor(project: Project, timeline: TimelineLayout, target: PrerenderTarget): Span | null {
  const clampSpan = (start: number, end: number): Span | null => {
    const s = Math.max(0, start);
    const e = Math.min(timeline.duration, end);
    return e - s >= MIN_SPAN ? { start: s, end: e } : null;
  };
  switch (target.kind) {
    case 'clip': {
      const layout = timeline.clips.find((l) => l.clip.id === target.id);
      return layout ? clampSpan(layout.start, layout.start + layout.length) : null;
    }
    case 'overlay': {
      const found = findOverlayClip(project, target.id);
      return found ? clampSpan(found.clip.start, found.clip.start + clipLength(found.clip)) : null;
    }
    case 'audio': {
      const found = findAudioClip(project, target.id);
      return found ? clampSpan(found.clip.start, found.clip.start + clipLength(found.clip)) : null;
    }
    case 'text': {
      const found = findTextClip(project, target.id);
      return found ? clampSpan(found.clip.start, found.clip.start + found.clip.duration) : null;
    }
    case 'pack': {
      const found = findPackClip(project, target.id);
      return found ? clampSpan(found.clip.start, found.clip.start + found.clip.duration) : null;
    }
    case 'transition': {
      const a = timeline.clips[target.index];
      const b = timeline.clips[target.index + 1];
      if (!a || !b) return null;
      return clampSpan(b.start - 0.5, a.start + a.length + 0.5);
    }
    case 'marker':
    case 'comment': {
      const time =
        target.kind === 'marker' ? project.markers.find((m) => m.id === target.id)?.time : project.comments?.find((c) => c.id === target.id)?.time;
      return time === undefined ? null : spanAt(project, timeline, time, clampSpan);
    }
    case 'empty':
      return spanAt(project, timeline, target.time, clampSpan);
    default:
      return null;
  }
}

/** O que está visível no instante: clipe principal, senão camada, bloco de pacote ou texto. */
function spanAt(project: Project, timeline: TimelineLayout, time: number, clampSpan: (start: number, end: number) => Span | null): Span | null {
  const inside = (start: number, length: number) => time >= start && time < start + length;
  const main = timeline.clips.find((l) => inside(l.start, l.length));
  if (main) return clampSpan(main.start, main.start + main.length);
  const overlay = [...timeline.overlays].reverse().find((l) => inside(l.start, l.length));
  if (overlay) return clampSpan(overlay.start, overlay.start + overlay.length);
  const pack = packTracksOf(project)
    .flatMap((t) => (t.hidden ? [] : t.clips))
    .find((c) => inside(c.start, c.duration));
  if (pack) return clampSpan(pack.start, pack.start + pack.duration);
  const text = project.textTracks.flatMap((t) => t.clips).find((c) => inside(c.start, c.duration));
  if (text) return clampSpan(text.start, text.start + text.duration);
  return null;
}

/**
 * Acerta o trecho em quadros inteiros do projeto (o vídeo guardado tem exatamente esses quadros),
 * dentro da timeline. null = curto demais.
 */
export function normalizeSpan(span: Span, fps: number, duration: number): Span | null {
  const start = Math.max(0, Math.min(span.start, duration));
  const end = Math.min(duration, span.end);
  const frames = Math.round((end - start) * fps);
  if (frames < 1 || frames / fps < MIN_SPAN) return null;
  return { start, end: start + frames / fps };
}

// ---------------------------------------------------------------- Trechos guardados

/** Trecho que vale no instante t (o mais novo, se dois se sobrepõem). */
export function entryAt<T extends PrerenderSpan>(entries: readonly T[], t: number, usable: (entry: T) => boolean = () => true): T | null {
  let best: T | null = null;
  for (const e of entries) {
    if (t >= e.start && t < e.end && usable(e) && (!best || e.createdAt > best.createdAt)) best = e;
  }
  return best;
}

/** Próximo trecho que começa logo à frente (até `within` s): o vídeo dele já fica no ponto. */
export function nextEntryAfter<T extends PrerenderSpan>(entries: readonly T[], t: number, within: number, usable: (entry: T) => boolean = () => true): T | null {
  let best: T | null = null;
  for (const e of entries) {
    if (e.start > t && e.start - t <= within && usable(e) && (!best || e.start < best.start)) best = e;
  }
  return best;
}

/** Trechos guardados que o novo cobre por inteiro (não servem mais para nada). */
export function coveredBy<T extends Span>(entries: readonly T[], span: Span): T[] {
  const eps = 1e-6;
  return entries.filter((e) => e.start >= span.start - eps && e.end <= span.end + eps);
}

/**
 * Quais trechos apagar para caber no limite de memória: primeiro os desatualizados, depois os mais
 * antigos. O mais novo (o que acabou de ficar pronto) nunca sai.
 */
export function evictionFor<T extends PrerenderSpan>(entries: readonly T[], limit: number, stale: (entry: T) => boolean = () => false): string[] {
  let total = entries.reduce((sum, e) => sum + e.bytes, 0);
  if (total <= limit || entries.length < 2) return [];
  const newest = entries.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
  const order = entries
    .filter((e) => e !== newest)
    .sort((a, b) => Number(stale(b)) - Number(stale(a)) || a.createdAt - b.createdAt);
  const removed: string[] = [];
  for (const e of order) {
    if (total <= limit) break;
    removed.push(e.id);
    total -= e.bytes;
  }
  return removed;
}

/** Junta trechos encostados ou sobrepostos (para desenhar a barra na régua). */
export function mergeSpans(spans: readonly Span[], gap = 1e-3): Span[] {
  const sorted = [...spans].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end + gap) last.end = Math.max(last.end, s.end);
    else merged.push({ start: s.start, end: s.end });
  }
  return merged;
}

// ---------------------------------------------------------------- Impressão digital

/**
 * Resumo de tudo o que muda a imagem no trecho (e no aquecimento antes dele): tamanho, fps e fundo do
 * projeto; clipes, camadas, transições, pacotes, textos e legendas que encostam nele, com as mídias,
 * efeitos, filtros, câmera, cor, LUTs e o código dos shaders usados. Na dúvida, entra. O trecho guardado
 * só vale enquanto a impressão digital do projeto atual for a mesma do momento em que foi renderizado.
 */
export function prerenderFingerprint(
  project: Project,
  timeline: TimelineLayout,
  span: Span,
  /** Código de cada plugin (o editor de efeitos muda o shader sem mudar o id) */
  pluginCode: (pluginId: string) => string = defaultPluginCode,
): string {
  const from = Math.max(0, span.start - PRERENDER_WARMUP);
  const to = span.end;
  const hits = (start: number, end: number) => start < to && end > from;
  const parts: string[] = [stable(['v1', project.width, project.height, project.fps, project.background, span.start, span.end])];
  // Desfoque de movimento do projeto (ausente nos antigos: o resumo deles não muda).
  if (project.motionBlur) parts.push(`desfoque:${stable(project.motionBlur)}`);
  const plugins = new Set<string>();
  const luts = new Set<string>();
  const useLook = (look: { effects?: { pluginId: string }[]; filter?: { pluginId: string } | null }) => {
    for (const e of look.effects ?? []) plugins.add(e.pluginId);
    if (look.filter) plugins.add(look.filter.pluginId);
  };
  const useClip = (clip: VideoClip) => {
    useLook(clip);
    if (clip.lut) luts.add(clip.lut.id);
  };

  // Trilha principal (e o último quadro parado, depois do fim do vídeo).
  const main = timeline.clips.filter((l) => hits(l.start, l.start + l.length));
  const last = timeline.clips[timeline.clips.length - 1];
  if (last && to > timeline.videoDuration && !main.includes(last)) main.push(last);
  for (const l of main) {
    const before = l.index > 0 ? (project.transitions[l.index - 1] ?? null) : null;
    const after = project.transitions[l.index] ?? null;
    for (const tr of [before, after]) if (tr) plugins.add(tr.pluginId);
    useClip(l.clip);
    parts.push(`clipe:${l.start}:${l.length}:${l.transitionIn}:${l.transitionOut}:${clipPrint(l.clip)}:${mediaPrint(l.media)}:${stable(before)}:${stable(after)}`);
  }

  // Trilhas de vídeo de cima (as escondidas nem entram no layout).
  for (const l of timeline.overlays) {
    if (!hits(l.start, l.start + l.length)) continue;
    useClip(l.clip);
    parts.push(`camada:${l.track}:${l.start}:${l.length}:${clipPrint(l.clip)}:${mediaPrint(l.media)}`);
  }

  // Pacotes de edição.
  packTracksOf(project).forEach((track, index) => {
    if (track.hidden) return;
    for (const clip of track.clips) {
      if (!hits(clip.start, clip.start + clip.duration)) continue;
      useLook(clip);
      if (clip.lut) luts.add(clip.lut.id);
      parts.push(`pacote:${index}:${memo(packPrints, clip, () => stable(clip, PACK_IGNORED))}`);
    }
  });

  // Textos, stickers e elementos.
  let elements = false;
  project.textTracks.forEach((track, index) => {
    for (const clip of track.clips) {
      if (!hits(clip.start, clip.start + clip.duration)) continue;
      if (clip.shape) elements = true;
      parts.push(`texto:${index}:${memo(textPrints, clip, () => stable(clip, GROUP_ONLY))}`);
    }
  });
  // Elementos como a onda do som e a barra de progresso olham o projeto inteiro (o som e a duração).
  if (elements) {
    parts.push(
      `contexto:${timeline.duration}:${timeline.videoDuration}:${stable(project.audioTracks)}:${stable(
        [...project.clips, ...project.videoTracks.flatMap((t) => t.clips)].map((c) => [c.mediaId, c.trimIn, c.trimOut, c.speed, c.volume, c.audioDetached]),
      )}:${stable(project.videoTracks.map((t) => t.muted))}`,
    );
  }

  // Legendas.
  const captions = project.captions;
  if (captions) {
    const visible = captions.captions.filter((c) => hits(c.start, c.end));
    parts.push(`legendas:${stable([captions.enabled, captions.style, captions.speakers, visible])}`);
  }

  for (const id of [...luts].sort()) {
    const lut = project.luts?.find((l) => l.id === id);
    parts.push(`lut:${id}:${lut ? memo(lutPrints, lut, () => hash(`${lut.size}:${lut.data}`)) : '-'}`);
  }
  for (const id of [...plugins].sort()) parts.push(`plugin:${id}:${pluginCode(id)}`);
  return hash(parts.join('\n'));
}

/** O que muda só o som (ou só a timeline) fica de fora. */
const CLIP_IGNORED = new Set(['volume', 'audioDetached', 'group']);
const PACK_IGNORED = new Set(['group', 'name', 'color']);
const GROUP_ONLY = new Set(['group']);

const clipPrints = new WeakMap<object, string>();
const mediaPrints = new WeakMap<object, string>();
const packPrints = new WeakMap<object, string>();
const textPrints = new WeakMap<object, string>();
const lutPrints = new WeakMap<object, string>();
const pluginPrints = new WeakMap<ShaderPlugin, string>();

/** O projeto é imutável: cada objeto é resumido uma vez só. */
function memo(cache: WeakMap<object, string>, key: object, make: () => string): string {
  let value = cache.get(key);
  if (value === undefined) {
    value = make();
    cache.set(key, value);
  }
  return value;
}

function clipPrint(clip: VideoClip): string {
  return memo(clipPrints, clip, () => hash(stable(clip, CLIP_IGNORED)));
}

/** A mídia pelo arquivo (trocar o arquivo muda a url e o tamanho), sem a miniatura. */
function mediaPrint(media: MediaItem): string {
  return memo(mediaPrints, media, () =>
    hash(
      stable({
        id: media.id,
        kind: media.kind,
        url: media.url,
        name: media.name,
        width: media.width,
        height: media.height,
        duration: media.duration,
        size: media.file?.size,
        modified: media.file?.lastModified,
        cursor: media.cursor ? hash(stable(media.cursor)) : null,
        compound: media.compound ? hash(stable(media.compound)) : null,
      }),
    ),
  );
}

function defaultPluginCode(pluginId: string): string {
  const plugin = getPlugin(pluginId);
  if (!plugin) return '-';
  let value = pluginPrints.get(plugin);
  if (value === undefined) {
    value = hash(`${plugin.glsl}\n${stable(plugin.params)}`);
    pluginPrints.set(plugin, value);
  }
  return value;
}

/**
 * JSON com as chaves em ordem e sem os campos ausentes: `{ a: 1, b: undefined }` e `{ a: 1 }`
 * dão o mesmo texto, e a ordem em que os campos foram criados não importa.
 */
export function stable(value: unknown, ignore?: Set<string>): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'object') return 'null';
  if (Array.isArray(value)) return `[${value.map((v) => stable(v)).join(',')}]`;
  if (ArrayBuffer.isView(value)) return `bin:${hash(Array.from(value as Uint8Array).join(','))}`;
  const keys = Object.keys(value as Record<string, unknown>)
    .filter((k) => !ignore?.has(k) && (value as Record<string, unknown>)[k] !== undefined && typeof (value as Record<string, unknown>)[k] !== 'function')
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

/** Hash curto (cyrb53): basta para comparar, não é criptográfico. */
export function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
