import {
  findAudioClip,
  findOverlayClip,
  getMedia,
  layoutProject,
  MIN_LENGTH,
  speedOf,
  updateAudioClip,
  updateClip,
  updateOverlayClip,
  type AudioClip,
  type ClipLayout,
  type Project,
  type TimelineLayout,
  type VideoClip,
} from './model';

/**
 * Ferramentas de corte profissionais (como no Premiere e no DaVinci):
 * - slip: arrasta o conteúdo dentro do clipe (entrada e saída andam juntas), sem mudar o lugar nem o tamanho;
 * - slide: move um clipe da trilha principal entre os vizinhos (o anterior termina depois, o próximo começa depois);
 * - roll: move o corte entre dois clipes vizinhos (um cresce, o outro diminui).
 * Slide e roll nunca mudam a duração total nem o lugar dos outros clipes.
 */
export type TrimTool = 'select' | 'slip' | 'slide' | 'roll';

/** Tecla de cada ferramenta (sem Ctrl, Alt nem Shift). */
export const TRIM_TOOL_KEYS: Record<TrimTool, string> = { select: 'V', slip: 'Y', slide: 'U', roll: 'N' };

/** Um quadro mostrado na dica durante o arrasto. */
export interface TrimFrame {
  mediaId: string;
  /** Segundos dentro do arquivo */
  time: number;
  /** Entrada (primeiro quadro) ou saída (último quadro) do clipe */
  edge: 'in' | 'out';
}

export interface TrimResult {
  project: Project;
  /** Quanto andou de fato, já com os limites: segundos do arquivo no slip, da timeline no slide e no roll */
  delta: number;
  /** Quadro da esquerda e da direita (slip: entrada e saída do clipe; slide e roll: os dois lados do corte) */
  left: TrimFrame;
  right: TrimFrame;
  /** Slide: novo início do clipe; roll: novo lugar do corte (timeline) */
  at?: number;
}

const NEAR = 1e-3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Limita ao intervalo, mas sempre deixa ficar onde está (0), mesmo num clipe que já passou de algum limite. */
function limit(value: number, lo: number, hi: number): number {
  return clamp(value, Math.min(0, lo), Math.max(0, hi)) || 0; // sem -0
}

// ---------- Slip ----------

/**
 * Slip: desloca o trecho usado do arquivo em `offset` segundos (positivo = conteúdo mais à frente), sem mudar
 * o lugar nem o tamanho do clipe. Vale para clipes da trilha principal, sobreposições e áudios.
 * Imagens não têm o que deslizar (null).
 */
export function slipClip(project: Project, clipId: string, offset: number): TrimResult | null {
  const main = project.clips.find((c) => c.id === clipId);
  const overlay = main ? undefined : findOverlayClip(project, clipId)?.clip;
  const audio = main || overlay ? undefined : findAudioClip(project, clipId)?.clip;
  const clip = main ?? overlay ?? audio;
  if (!clip) return null;
  const media = getMedia(project, clip.mediaId);
  if (!media || media.kind === 'image') return null;
  // A velocidade não entra aqui: o trecho tem sempre o mesmo tamanho dentro do arquivo.
  const applied = limit(offset, -clip.trimIn, media.duration - clip.trimOut);
  const slip = <T extends { trimIn: number; trimOut: number }>(c: T): T => ({ ...c, trimIn: c.trimIn + applied, trimOut: c.trimOut + applied });
  let next: Project;
  if (main) next = followDetachedAudio(project, updateClip(project, clipId, slip), [clipId]);
  else if (overlay) next = updateOverlayClip(project, clipId, slip);
  else next = updateAudioClip(project, clipId, slip);
  return {
    project: next,
    delta: applied,
    left: { mediaId: clip.mediaId, time: clip.trimIn + applied, edge: 'in' },
    right: { mediaId: clip.mediaId, time: clip.trimOut + applied, edge: 'out' },
  };
}

// ---------- Slide e roll (trilha principal) ----------

/** Menor tamanho que o clipe pode ter sem encolher as transições dele. */
function minLength(layout: ClipLayout): number {
  return Math.max(MIN_LENGTH, 2 * layout.transitionIn, 2 * layout.transitionOut);
}

/**
 * Transições mais longas do que cabem (o clipe é curto) ficam com a duração que de fato aparecem. Assim, quando
 * um clipe cresce, a transição não cresce junto e não puxa a timeline (a duração total fica a mesma).
 */
function settleTransitions(project: Project, layout: TimelineLayout, indices: number[]): Project {
  let transitions = project.transitions;
  for (const i of new Set(indices)) {
    const transition = transitions[i];
    const overlap = layout.clips[i]?.transitionOut;
    if (!transition || overlap === undefined || transition.duration <= overlap + 1e-9) continue;
    if (transitions === project.transitions) transitions = [...transitions];
    transitions[i] = { ...transition, duration: overlap };
  }
  return transitions === project.transitions ? project : { ...project, transitions };
}

/**
 * O fim do clipe `left` e o começo do clipe `right` andam `delta` segundos juntos (roll: vizinhos; slide: os dois
 * em volta do clipe deslizado). O que fica no meio só muda de lugar, e o resto da timeline não se mexe.
 */
function moveEdges(project: Project, layout: TimelineLayout, left: number, right: number, delta: number) {
  const a = layout.clips[left];
  const b = layout.clips[right];
  const sa = speedOf(a.clip);
  const sb = speedOf(b.clip);
  // Uma imagem à direita não tem "começo do arquivo" para voltar: ela cresce (ou encolhe) pelo fim, que na
  // tela dá no mesmo. Sem isso, o corte antes de uma foto não andava para a esquerda (trimIn já é 0).
  const still = b.media.kind === 'image';
  // Limites: o arquivo do clipe da esquerda acaba; o da direita começa no 0; nenhum dos dois fica curto demais.
  const lo = Math.max(minLength(a) - a.length, still ? -(b.media.duration - b.clip.trimOut) / sb : -b.clip.trimIn / sb);
  const hi = Math.min((a.media.duration - a.clip.trimOut) / sa, b.length - minLength(b));
  const d = limit(delta, lo, hi);
  let next = settleTransitions(project, layout, [left - 1, left, right - 1, right]);
  next = updateClip(next, a.clip.id, (c) => ({ ...c, trimOut: c.trimOut + d * sa }));
  next = updateClip(next, b.clip.id, (c) => (still ? { ...c, trimOut: c.trimOut - d * sb } : { ...c, trimIn: c.trimIn + d * sb }));
  const ids = layout.clips.slice(left, right + 1).map((l) => l.clip.id);
  return {
    project: followDetachedAudio(project, next, ids),
    delta: d,
    left: { mediaId: a.clip.mediaId, time: a.clip.trimOut + d * sa, edge: 'out' } satisfies TrimFrame,
    right: { mediaId: b.clip.mediaId, time: still ? b.clip.trimIn : b.clip.trimIn + d * sb, edge: 'in' } satisfies TrimFrame,
  };
}

/**
 * Slide: o clipe anda `delta` segundos na timeline entre os vizinhos; o anterior termina depois (ou antes) e o
 * próximo começa depois (ou antes). Precisa de um clipe de cada lado (o primeiro e o último dão null).
 */
export function slideClip(project: Project, clipId: string, delta: number): TrimResult | null {
  const layout = layoutProject(project);
  const i = layout.clips.findIndex((l) => l.clip.id === clipId);
  if (i <= 0 || i >= layout.clips.length - 1) return null;
  const moved = moveEdges(project, layout, i - 1, i + 1, delta);
  return { ...moved, at: layout.clips[i].start + moved.delta };
}

/** Roll: o corte entre o clipe `clipId` e o próximo anda `delta` segundos (o da esquerda cresce, o da direita encolhe). */
export function rollEdit(project: Project, clipId: string, delta: number): TrimResult | null {
  const layout = layoutProject(project);
  const i = layout.clips.findIndex((l) => l.clip.id === clipId);
  if (i < 0 || i >= layout.clips.length - 1) return null;
  const moved = moveEdges(project, layout, i, i + 1, delta);
  return { ...moved, at: layout.clips[i + 1].start + moved.delta };
}

/**
 * Qual corte o roll pega ao clicar num clipe: o da borda mais perto (`leftHalf` = clicou na metade esquerda).
 * Devolve o id do clipe que fica antes do corte, ou null se o clipe não tem vizinhos.
 */
export function rollTarget(layout: TimelineLayout, clipId: string, leftHalf: boolean): string | null {
  const i = layout.clips.findIndex((l) => l.clip.id === clipId);
  if (i < 0) return null;
  const before = i > 0 ? layout.clips[i - 1].clip.id : null;
  const after = i < layout.clips.length - 1 ? clipId : null;
  return leftHalf ? (before ?? after) : (after ?? before);
}

// ---------- Áudio separado ----------

/**
 * O áudio que foi separado de um clipe da trilha principal (mesma mídia, mesmo lugar e mesmo trecho) acompanha
 * o clipe depois de um slip, slide ou roll, para continuar sincronizado.
 */
function followDetachedAudio(before: Project, after: Project, clipIds: string[]): Project {
  const was = layoutProject(before);
  const now = layoutProject(after);
  let next = after;
  for (const id of clipIds) {
    const a = was.clips.find((l) => l.clip.id === id);
    const b = now.clips.find((l) => l.clip.id === id);
    if (!a || !b || !a.clip.audioDetached) continue;
    const same = (c: AudioClip) =>
      c.mediaId === a.clip.mediaId &&
      Math.abs(c.start - a.start) < NEAR &&
      Math.abs(c.trimIn - a.clip.trimIn) < NEAR &&
      Math.abs(c.trimOut - a.clip.trimOut) < NEAR &&
      speedOf(c) === speedOf(a.clip);
    const linked = before.audioTracks.flatMap((t) => t.clips).filter(same);
    for (const audio of linked) {
      const moved = b.start - a.start;
      next = updateAudioClip(next, audio.id, (c) => ({
        ...c,
        start: b.start,
        trimIn: b.clip.trimIn,
        trimOut: b.clip.trimOut,
        // O volume desenhado fica no mesmo lugar da timeline.
        volumeKeys: moved ? c.volumeKeys?.map((k) => ({ ...k, time: k.time - moved })) : c.volumeKeys,
      }));
    }
  }
  return next;
}

// ---------- Arrastar ----------

/** Um arrasto em andamento: tudo é recalculado a partir do projeto de quando o arrasto começou. */
export interface TrimSession {
  tool: Exclude<TrimTool, 'select'>;
  /** Slip e slide: o clipe arrastado; roll: o clipe que fica antes do corte */
  clipId: string;
  base: Project;
  /** Velocidade do clipe (o slip converte o arrasto em segundos do arquivo) */
  speed: number;
}

function run(session: TrimSession, project: Project, amount: number): TrimResult | null {
  switch (session.tool) {
    case 'slip':
      // O conteúdo acompanha o mouse: arrastar para a direita mostra o que vinha antes.
      return slipClip(project, session.clipId, -amount * session.speed);
    case 'slide':
      return slideClip(project, session.clipId, amount);
    case 'roll':
      return rollEdit(project, session.clipId, amount);
  }
}

/** Começa um arrasto (null = a ferramenta não vale para esse clipe). */
export function beginTrim(project: Project, tool: Exclude<TrimTool, 'select'>, clipId: string): TrimSession | null {
  const clip: VideoClip | AudioClip | undefined =
    project.clips.find((c) => c.id === clipId) ?? findOverlayClip(project, clipId)?.clip ?? findAudioClip(project, clipId)?.clip;
  if (!clip) return null;
  const session: TrimSession = { tool, clipId, base: project, speed: speedOf(clip) };
  return run(session, project, 0) ? session : null;
}

/**
 * Aplica o arrasto de `amount` segundos da timeline (desde o começo do arrasto) sobre o projeto atual.
 * Só os itens que a ferramenta mexe são trocados; o resto do projeto atual fica como está.
 */
export function applyTrim(current: Project, session: TrimSession, amount: number): TrimResult | null {
  const result = run(session, session.base, amount);
  return result && { ...result, project: mergeEdit(current, session.base, result.project) };
}

/** Leva para `current` o que mudou de `base` para `edited` (clipes, transições, sobreposições e áudios). */
function mergeEdit(current: Project, base: Project, edited: Project): Project {
  const changed = <T extends { id: string }>(before: T[], after: T[]) => {
    const old = new Map(before.map((c) => [c.id, c]));
    return new Map(after.filter((c) => old.get(c.id) !== c).map((c) => [c.id, c]));
  };
  const clips = changed(base.clips, edited.clips);
  const overlays = changed(base.videoTracks.flatMap((t) => t.clips), edited.videoTracks.flatMap((t) => t.clips));
  const audios = changed(base.audioTracks.flatMap((t) => t.clips), edited.audioTracks.flatMap((t) => t.clips));
  // As transições são por posição: só valem se a trilha principal continua com os mesmos clipes.
  const sameTrack = current.clips.length === base.clips.length && current.clips.every((c, i) => c.id === base.clips[i].id);
  return {
    ...current,
    clips: clips.size ? current.clips.map((c) => clips.get(c.id) ?? c) : current.clips,
    transitions:
      sameTrack && edited.transitions !== base.transitions
        ? current.transitions.map((t, i) => (edited.transitions[i] !== base.transitions[i] ? edited.transitions[i] : t))
        : current.transitions,
    videoTracks: overlays.size ? current.videoTracks.map((t) => ({ ...t, clips: t.clips.map((c) => overlays.get(c.id) ?? c) })) : current.videoTracks,
    audioTracks: audios.size ? current.audioTracks.map((t) => ({ ...t, clips: t.clips.map((c) => audios.get(c.id) ?? c) })) : current.audioTracks,
  };
}
