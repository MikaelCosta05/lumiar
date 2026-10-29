/**
 * Mixer de áudio: um canal por grupo de som (trilha principal, trilhas de vídeo com som e trilhas de áudio) e o
 * Master. Aqui ficam só as contas (dB, solo/mudo, pan); o preview (preview/mixerBus.ts) e a exportação
 * (media/exporter.ts) montam o mesmo caminho com estes valores, então o arquivo sai igual ao que se ouve.
 */

import { t } from '../i18n';
import { getMedia, type AudioTrackKind, type Project, type TrackMix } from './model';

/** Abaixo disso o fader é "sem som" (−∞). */
export const MIN_DB = -60;
export const MAX_DB = 6;

export type StripId = 'main' | `audio:${string}` | `video:${string}`;

export interface MixerStrip {
  id: StripId;
  kind: 'main' | 'video' | 'audio';
  name: string;
  /** Tipo da trilha de áudio (música, narração, efeitos sonoros…) */
  trackKind?: AudioTrackKind;
}

export interface StripSettings {
  gainDb: number;
  pan: number;
  solo: boolean;
  muted: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** dB → multiplicador. −60 dB ou menos (e −∞) = 0. */
export function dbToGain(db: number): number {
  if (Number.isNaN(db) || db <= MIN_DB) return 0;
  return 10 ** (Math.min(db, MAX_DB) / 20);
}

/** Multiplicador → dB (0 vira −∞). */
export function gainToDb(gain: number): number {
  return gain > 0 ? 20 * Math.log10(gain) : -Infinity;
}

/** Ponto do fader onde fica o 0 dB (o resto do curso, acima, vai até +6). */
const UNITY = 0.75;

/** Posição do fader (0 a 1) → dB. Embaixo é −∞; a curva dá mais curso perto do 0 dB, como nas mesas de som. */
export function faderToDb(position: number): number {
  const p = clamp(position, 0, 1);
  if (p <= 0) return -Infinity;
  if (p >= UNITY) return ((p - UNITY) / (1 - UNITY)) * MAX_DB;
  return MIN_DB * (1 - p / UNITY) ** 2;
}

/** dB → posição do fader (inverso de faderToDb). */
export function dbToFader(db: number): number {
  if (Number.isNaN(db) || db <= MIN_DB) return 0;
  if (db >= 0) return UNITY + (Math.min(db, MAX_DB) / MAX_DB) * (1 - UNITY);
  return UNITY * (1 - Math.sqrt(db / MIN_DB));
}

/** Texto do dB para mostrar ("−∞", "−6.0", "+2.5"). */
export function formatDb(db: number): string {
  if (!Number.isFinite(db) || db <= MIN_DB) return '−∞';
  const v = Math.abs(db) < 0.05 ? 0 : db;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
}

/**
 * Lei do pan (balanço): no centro os dois lados ficam inteiros (projetos antigos soam igual); indo para um lado,
 * o outro cai numa curva de potência constante até sumir. Devolve [esquerda, direita].
 */
export function panGains(pan: number): [number, number] {
  const p = clamp(Number.isFinite(pan) ? pan : 0, -1, 1);
  return [p > 0 ? Math.cos((p * Math.PI) / 2) : 1, p < 0 ? Math.cos((-p * Math.PI) / 2) : 1];
}

/** Trilha de vídeo extra que tem algum clipe com som. */
function hasSound(project: Project, clips: { mediaId: string; audioDetached?: boolean }[]): boolean {
  return clips.some((c) => !c.audioDetached && !!getMedia(project, c.mediaId)?.hasAudio);
}

/** Os canais do mixer, na ordem da tela: trilha principal, trilhas de vídeo com som e trilhas de áudio. */
export function mixerStrips(project: Project): MixerStrip[] {
  const strips: MixerStrip[] = [{ id: 'main', kind: 'main', name: t('Trilha principal') }];
  project.videoTracks.forEach((track, i) => {
    if (hasSound(project, track.clips)) strips.push({ id: `video:${track.id}`, kind: 'video', name: track.name || t('Vídeo {n}', { n: i + 2 }) });
  });
  for (const track of project.audioTracks) strips.push({ id: `audio:${track.id}`, kind: 'audio', name: track.name, trackKind: track.kind });
  return strips;
}

function trackOf(project: Project, id: StripId) {
  if (id.startsWith('audio:')) return project.audioTracks.find((tr) => tr.id === id.slice(6));
  if (id.startsWith('video:')) return project.videoTracks.find((tr) => tr.id === id.slice(6));
  return undefined;
}

/** Ajustes do canal (com os valores padrão para o que não foi mexido). */
export function stripSettings(project: Project, id: StripId): StripSettings {
  const mix: TrackMix | undefined = id === 'main' ? project.mainMix : trackOf(project, id)?.mix;
  const muted = id === 'main' ? !!project.mainMix?.muted : !!trackOf(project, id)?.muted;
  return {
    gainDb: Number.isFinite(mix?.gainDb) ? clamp(mix!.gainDb!, MIN_DB, MAX_DB) : 0,
    pan: Number.isFinite(mix?.pan) ? clamp(mix!.pan!, -1, 1) : 0,
    solo: !!mix?.solo,
    muted,
  };
}

/** Algum canal (dos que aparecem no mixer) está em solo. */
export function anySolo(project: Project): boolean {
  return mixerStrips(project).some((s) => stripSettings(project, s.id).solo);
}

/** Se o canal é ouvido: não está mudo e, se há solo em algum canal, ele é um dos que estão em solo. */
export function isAudible(project: Project, id: StripId, solo = anySolo(project)): boolean {
  const s = stripSettings(project, id);
  return !s.muted && (!solo || s.solo);
}

/** Ganho final do canal (fader × mudo/solo), sem o pan. */
export function stripGain(project: Project, id: StripId, solo = anySolo(project)): number {
  return isAudible(project, id, solo) ? dbToGain(stripSettings(project, id).gainDb) : 0;
}

/** Volume geral (Master). O solo não mexe nele. */
export function masterGainDb(project: Project): number {
  const db = project.masterMix?.gainDb;
  return Number.isFinite(db) ? clamp(db!, MIN_DB, MAX_DB) : 0;
}

export function masterGain(project: Project): number {
  return dbToGain(masterGainDb(project));
}

/** Em qual canal do mixer toca o som de cada clipe (de vídeo ou de áudio), pelo id do clipe. */
export function clipStrips(project: Project): Map<string, StripId> {
  const map = new Map<string, StripId>();
  for (const clip of project.clips) map.set(clip.id, 'main');
  for (const track of project.videoTracks) for (const clip of track.clips) map.set(clip.id, `video:${track.id}`);
  for (const track of project.audioTracks) for (const clip of track.clips) map.set(clip.id, `audio:${track.id}`);
  return map;
}

/**
 * Ganho de um clipe em cada lado depois do mixer: o volume dele (volume, fades, ducking, já calculado por
 * audioAt) × o canal × o Master, repartido pelo pan. Devolve [esquerda, direita].
 */
export function effectiveGains(project: Project, strip: StripId, clipGain: number): [number, number] {
  const g = clipGain * stripGain(project, strip) * masterGain(project);
  const [l, r] = panGains(stripSettings(project, strip).pan);
  return [g * l, g * r];
}

/** Muda os ajustes de um canal. O "mudo" das trilhas é o mesmo botão do cabeçalho da trilha. */
export function setStripMix(project: Project, id: StripId, patch: Partial<StripSettings>): Project {
  const { muted, ...mix } = patch;
  const merge = (current: TrackMix | undefined): TrackMix => {
    const next: TrackMix = { ...current, ...mix };
    if (next.gainDb !== undefined) next.gainDb = clamp(next.gainDb, MIN_DB, MAX_DB);
    if (next.pan !== undefined) next.pan = clamp(next.pan, -1, 1);
    return next;
  };
  if (id === 'main') {
    return { ...project, mainMix: { ...merge(project.mainMix), muted: muted ?? project.mainMix?.muted } };
  }
  const trackId = id.slice(6);
  const update = <T extends { id: string; muted: boolean; mix?: TrackMix }>(track: T): T =>
    track.id === trackId ? { ...track, mix: merge(track.mix), muted: muted ?? track.muted } : track;
  if (id.startsWith('audio:')) return { ...project, audioTracks: project.audioTracks.map(update) };
  return { ...project, videoTracks: project.videoTracks.map(update) };
}

export function setMasterGainDb(project: Project, db: number): Project {
  return { ...project, masterMix: { ...project.masterMix, gainDb: clamp(db, MIN_DB, MAX_DB) } };
}

/** Tira todos os solos de uma vez. */
export function clearSolos(project: Project): Project {
  return mixerStrips(project).reduce((p, s) => (stripSettings(p, s.id).solo ? setStripMix(p, s.id, { solo: false }) : p), project);
}

/** Volta todos os canais para 0 dB, centro, sem solo (o mudo de cada trilha fica como está). */
export function resetMix(project: Project): Project {
  return {
    ...project,
    mainMix: project.mainMix?.muted ? { muted: true } : undefined,
    masterMix: undefined,
    audioTracks: project.audioTracks.map(({ mix: _mix, ...tr }) => tr),
    videoTracks: project.videoTracks.map(({ mix: _mix, ...tr }) => tr),
  };
}
