import type { Easing, Keyframe, KeyframeMap } from '../engine/keyframes';

/**
 * Onde o mouse andou durante uma gravação de tela (gravado pelo programa instalado).
 * `points` = [t, x, y, t, x, y, …] com t em segundos do arquivo e x/y de 0 a 1 na imagem;
 * `clicks` = instantes dos cliques (só no Windows; no Linux ficam vazios).
 */
export interface CursorTrack {
  points: number[];
  clicks: number[];
}

/** Destaques desenhados por cima da gravação. */
export interface CursorFx {
  /** Círculo suave em volta do cursor */
  halo: boolean;
  /** Onda que se abre a cada clique */
  clicks: boolean;
  color: string;
}

export const DEFAULT_CURSOR_FX: CursorFx = { halo: true, clicks: true, color: '#ffd23f' };

/** Posição suavizada do mouse no instante t (tira o tremido da mão). */
export function cursorAt(track: CursorTrack, t: number, smooth = 0.06): { x: number; y: number } | null {
  const p = track.points;
  const n = p.length / 3;
  if (n === 0) return null;
  // Busca binária do ponto mais próximo, depois média gaussiana em volta.
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (p[mid * 3] < t) lo = mid + 1;
    else hi = mid;
  }
  if (Math.abs(p[lo * 3] - t) > 1.5 && Math.abs(p[Math.max(0, lo - 1) * 3] - t) > 1.5) return null;
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let i = Math.max(0, lo - 60); i < Math.min(n, lo + 60); i++) {
    const d = p[i * 3] - t;
    if (Math.abs(d) > smooth * 3) continue;
    const w = Math.exp(-(d * d) / (2 * smooth * smooth));
    sx += p[i * 3 + 1] * w;
    sy += p[i * 3 + 2] * w;
    sw += w;
  }
  if (sw < 1e-6) return { x: p[lo * 3 + 1], y: p[lo * 3 + 2] };
  return { x: sx / sw, y: sy / sw };
}

/**
 * Momentos de interesse: os cliques; sem cliques (Linux), os lugares onde o mouse anda e para
 * (quem grava tutorial aponta e para em cima do que está mostrando).
 */
export function interestMoments(track: CursorTrack, from: number, to: number): number[] {
  const clicks = track.clicks.filter((t) => t >= from && t <= to);
  if (clicks.length) return clicks;
  const moments: number[] = [];
  let lastMove = -Infinity;
  let moved = 0;
  let prev: { x: number; y: number } | null = null;
  for (let t = from; t <= to; t += 0.1) {
    // Bem suavizado: o tremido da mão parada não conta como movimento.
    const pos = cursorAt(track, t, 0.15);
    if (!pos) continue;
    const step = prev ? Math.hypot(pos.x - prev.x, pos.y - prev.y) : 0;
    prev = pos;
    if (step > 0.006) {
      lastMove = t;
      moved += step;
    } else if (moved > 0.06 && t - lastMove > 0.5) {
      moments.push(lastMove);
      moved = 0;
    }
  }
  return moments;
}

/**
 * Câmera que se aproxima de onde a pessoa clica e segue o mouse enquanto ela mexe por ali; depois de
 * um tempo sem cliques, volta para a tela inteira. Devolve keyframes (tempo do clipe) de zoom, x e y.
 */
export function cursorZoomKeyframes(
  track: CursorTrack,
  clip: { trimIn: number; trimOut: number; speed?: number },
  zoom = 1.8,
  hold = 2.2,
): { keyframes: KeyframeMap; zooms: number } {
  const speed = clip.speed ?? 1;
  const local = (source: number) => (source - clip.trimIn) / speed;
  const moments = interestMoments(track, clip.trimIn, clip.trimOut);
  // Janelas de zoom (em tempo do arquivo); cliques próximos ficam numa janela só.
  const windows: [number, number][] = [];
  for (const m of moments) {
    const last = windows[windows.length - 1];
    if (last && m - 0.5 - last[1] < 1.2) last[1] = m + hold;
    else windows.push([Math.max(clip.trimIn, m - 0.5), Math.min(clip.trimOut, m + hold)]);
  }
  const zoomKeys: Keyframe[] = [];
  const xKeys: Keyframe[] = [];
  const yKeys: Keyframe[] = [];
  const key = (list: Keyframe[], source: number, value: number, easing: Easing = 'smooth') => {
    const time = Math.max(0, local(source));
    if (list.length && time - list[list.length - 1].time < 1 / 60) return;
    list.push({ time, value: Math.round(value * 1000) / 1000, easing });
  };
  const ramp = 0.6;
  for (const [a, b] of windows) {
    const start = Math.max(clip.trimIn, a - ramp);
    // Antes de entrar: tela inteira.
    key(zoomKeys, start, 1);
    key(xKeys, start, 0.5);
    key(yKeys, start, 0.5);
    // Durante: zoom e o centro acompanhando o mouse (bem suavizado, como um cinegrafista).
    for (let t = a; t <= b; t += 0.5) {
      const pos = cursorAt(track, t, 0.35) ?? { x: 0.5, y: 0.5 };
      key(zoomKeys, t, zoom, 'ease');
      key(xKeys, t, pos.x, 'ease');
      key(yKeys, t, pos.y, 'ease');
    }
    const end = Math.min(clip.trimOut, b + ramp);
    key(zoomKeys, end, 1);
    key(xKeys, end, 0.5);
    key(yKeys, end, 0.5);
  }
  return { keyframes: zoomKeys.length ? { zoom: zoomKeys, x: xKeys, y: yKeys } : {}, zooms: windows.length };
}

/** Cliques que ainda estão "abrindo a onda" no instante t (até 0,6 s depois do clique). */
export function recentClicks(track: CursorTrack, t: number): { at: number; age: number }[] {
  return track.clicks.filter((c) => t >= c && t - c < 0.6).map((c) => ({ at: c, age: t - c }));
}
