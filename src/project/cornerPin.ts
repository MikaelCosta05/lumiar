/**
 * Trocar a tela (corner pin): a sobreposição é desenhada em perspectiva dentro de quatro cantos
 * marcados no vídeo de baixo (a tela de um celular, um quadro, uma placa) e, com o rastreamento,
 * os cantos acompanham a câmera quadro a quadro.
 *
 * Os cantos ficam guardados na imagem do clipe de baixo (0 a 1, no instante do arquivo dele), não na
 * tela: assim continuam certos se o clipe mudar de lugar na timeline ou se a câmera dele mudar.
 * Na hora de desenhar, viram posições na tela (com a câmera daquele instante).
 */
import { isConvexQuad, type Quad } from '../engine/homography';
import { evaluateCamera, sourceToScreen } from './camera';
import type { ActiveClip, ActiveOverlay, FrameState, MediaItem, OverlayClip } from './model';

export interface CornerPin {
  /** Clipe da trilha principal onde está a tela */
  clipId: string;
  /** Cantos na imagem desse clipe [x, y, …] (0 a 1, y para baixo): sup. esq., sup. dir., inf. dir., inf. esq. */
  corners: Quad;
  /** Instante do arquivo do clipe de baixo em que os cantos foram marcados */
  at: number;
  /** Cantos rastreados, em ordem de tempo (instante do arquivo do clipe de baixo) */
  track?: { t: number; c: Quad }[];
}

/** Quanto uma correção à mão vale em volta do instante corrigido (s): some aos poucos até aí. */
export const CORRECTION_SPAN = 1.5;

/** Cantos no instante do arquivo: entre duas amostras do rastro, em linha reta; fora dele, a amostra mais perto. */
export function cornersAt(pin: CornerPin, t: number): Quad {
  const track = pin.track;
  if (!track?.length) return pin.corners;
  if (t <= track[0].t) return track[0].c;
  const last = track[track.length - 1];
  if (t >= last.t) return last.c;
  // Procura binária: o rastro pode ter centenas de amostras e isto roda a cada quadro.
  let lo = 0;
  let hi = track.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return a.c.map((v, i) => v + (b.c[i] - v) * k);
}

/**
 * Ajuste à mão num instante: sem rastro, os cantos passam a ser estes; com rastro, a diferença vale
 * inteira no instante e vai sumindo até `span` segundos para cada lado (o resto do rastro fica igual).
 */
export function correctCorners(pin: CornerPin, t: number, corners: Quad, span = CORRECTION_SPAN): CornerPin {
  if (!pin.track?.length) return { ...pin, corners, at: t };
  const before = cornersAt(pin, t);
  const delta = corners.map((v, i) => v - before[i]);
  const track = pin.track.map((s) => {
    const w = Math.max(0, 1 - Math.abs(s.t - t) / span);
    return w > 0 ? { t: s.t, c: s.c.map((v, i) => v + delta[i] * w) } : s;
  });
  // Instante entre duas amostras: entra uma amostra nova para valer exatamente ali.
  if (!track.some((s) => Math.abs(s.t - t) < 1e-3)) {
    track.push({ t, c: corners });
    track.sort((a, b) => a.t - b.t);
  }
  return { ...pin, track };
}

/**
 * Cantos iniciais: um retângulo no meio da imagem de baixo com a proporção da sobreposição
 * (metade da largura), para a pessoa só arrastar cada canto até o lugar certo.
 */
export function defaultCorners(below: { width: number; height: number }, overlay: { width: number; height: number }): Quad {
  const aspect = overlay.width / Math.max(1, overlay.height) || 16 / 9;
  let w = 0.5;
  let h = (w * below.width) / aspect / Math.max(1, below.height);
  // Sobreposição em pé: limita a altura e estreita junto (mantém a proporção).
  if (h > 0.8) {
    w *= 0.8 / h;
    h = 0.8;
  }
  const x0 = 0.5 - w / 2;
  const y0 = 0.5 - h / 2;
  return [x0, y0, x0 + w, y0, x0 + w, y0 + h, x0, y0 + h];
}

/** Os cantos na tela (0 a 1, y para baixo) quando o clipe de baixo está assim neste quadro. */
export function screenCorners(pin: CornerPin, below: ActiveClip, output: { width: number; height: number }): Quad | null {
  const { clip, media } = below.layout;
  const view = { ...evaluateCamera(clip.camera, below.clipTime, below.sourceTime), fill: clip.camera?.fill ?? false };
  const source = cornersAt(pin, below.sourceTime);
  const screen = toScreen(source, view, output, media);
  return isConvexQuad(screen) ? screen : null;
}

function toScreen(source: Quad, view: Parameters<typeof sourceToScreen>[1], output: { width: number; height: number }, media: MediaItem): Quad {
  const out: Quad = [];
  for (let k = 0; k < 4; k++) {
    const p = sourceToScreen({ x: source[k * 2], y: source[k * 2 + 1] }, view, output, media);
    out.push(p.x, p.y);
  }
  return out;
}

/**
 * Sobreposições com a tela trocada: quando o clipe de baixo aparece neste quadro, a camada ganha os
 * cantos na tela. Se ele não aparece (a sobreposição passou do fim dele), fica na posição normal.
 */
export function pinOverlays(overlays: ActiveOverlay[], main: Pick<FrameState, 'a' | 'b'>, output: { width: number; height: number }): ActiveOverlay[] {
  return overlays.map((o) => {
    const pin = (o.active.layout.clip as OverlayClip).cornerPin;
    if (!pin) return o;
    const below = [main.a, main.b].find((a) => a?.layout.clip.id === pin.clipId);
    const corners = below ? screenCorners(pin, below, output) : null;
    return corners ? { ...o, corners } : o;
  });
}
