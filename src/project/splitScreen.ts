import { t } from '../i18n';
import { addVideoTrack, createOverlayClip, IMAGE_MAX_DURATION, type MediaItem, type OverlayClip, type Project } from './model';

/** Um quadro da tela dividida: posição e tamanho na tela (0 a 1). */
export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SplitLayout {
  id: string;
  name: string;
  cells: Cell[];
}

const cols = (n: number): Cell[] => Array.from({ length: n }, (_, i) => ({ x: i / n, y: 0, w: 1 / n, h: 1 }));
const rows = (n: number): Cell[] => Array.from({ length: n }, (_, i) => ({ x: 0, y: i / n, w: 1, h: 1 / n }));

export const SPLIT_LAYOUTS: SplitLayout[] = [
  { id: 'lado-a-lado', name: t('Lado a lado'), cells: cols(2) },
  { id: 'em-cima-embaixo', name: t('Em cima e embaixo'), cells: rows(2) },
  { id: 'tres-colunas', name: t('Três colunas'), cells: cols(3) },
  { id: 'tres-linhas', name: t('Três faixas'), cells: rows(3) },
  {
    id: 'um-grande-dois',
    name: t('Um grande e dois'),
    cells: [
      { x: 0, y: 0, w: 2 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 0.5 },
      { x: 2 / 3, y: 0.5, w: 1 / 3, h: 0.5 },
    ],
  },
  {
    id: 'grande-em-cima',
    name: t('Grande em cima e dois embaixo'),
    cells: [
      { x: 0, y: 0, w: 1, h: 0.6 },
      { x: 0, y: 0.6, w: 0.5, h: 0.4 },
      { x: 0.5, y: 0.6, w: 0.5, h: 0.4 },
    ],
  },
  {
    id: 'grade-4',
    name: t('Grade de 4'),
    cells: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
];

/** Cobre o quadro inteiro (sem barras), como um "preencher": devolve a escala e o recorte da camada. */
export function coverCell(cell: Cell, gap: number, output: { width: number; height: number }, media: { width: number; height: number }) {
  // O espaço entre os quadros (fração do lado menor da tela): metade de cada lado, igual na horizontal e na vertical.
  const g = gap / 2;
  const ratio = output.width / output.height;
  const gx = g * Math.min(1, 1 / ratio);
  const gy = g * Math.min(1, ratio);
  const inner = {
    x: cell.x + gx,
    y: cell.y + gy,
    w: Math.max(0.01, cell.w - gx * 2),
    h: Math.max(0.01, cell.h - gy * 2),
  };
  const mediaRatio = media.width / media.height || ratio;
  // Tamanho da camada com escala 1 (inteira na tela), igual ao renderizador.
  const fit = mediaRatio > ratio ? [1, ratio / mediaRatio] : [mediaRatio / ratio, 1];
  const scale = Math.max(inner.w / fit[0], inner.h / fit[1]);
  return {
    x: inner.x + inner.w / 2,
    y: inner.y + inner.h / 2,
    scale,
    mask: { shape: 'rect' as const, x: 0.5, y: 0.5, width: inner.w / (fit[0] * scale), height: inner.h / (fit[1] * scale), feather: 0, invert: false },
  };
}

/** Imagem lisa de uma cor (o fundo que aparece entre os quadros). */
export async function solidImage(color: string, name: string): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 64, 64);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
  return new File([blob], name, { type: 'image/png' });
}

/**
 * Monta a tela dividida a partir de `start`: um fundo liso (se houver espaço entre os quadros) e
 * uma camada por quadro, cada uma numa trilha de vídeo nova, recortada para preencher o quadro.
 * Só o primeiro vídeo fica com som (os outros ficam mudos, para não embolar).
 */
export function applySplitScreen(
  project: Project,
  layout: SplitLayout,
  media: (MediaItem | null)[],
  options: { start: number; duration: number; gap: number; background: MediaItem | null },
): { project: Project; ids: string[] } {
  let next = project;
  const ids: string[] = [];
  const place = (clip: OverlayClip) => {
    next = addVideoTrack(next);
    const index = next.videoTracks.length - 1;
    const name = t('Tela dividida {n}', { n: ids.length + 1 });
    next = { ...next, videoTracks: next.videoTracks.map((track, i) => (i === index ? { ...track, name, clips: [clip] } : track)) };
    ids.push(clip.id);
  };
  const length = (m: MediaItem) => (m.kind === 'image' ? Math.min(IMAGE_MAX_DURATION, options.duration) : Math.min(m.duration, options.duration));

  if (options.background && options.gap > 0) {
    const bg = options.background;
    place({
      ...createOverlayClip(bg, options.start, { x: 0.5, y: 0.5, scale: 4, radius: 0 }),
      trimOut: options.duration,
    });
  }
  let firstSound = true;
  layout.cells.forEach((cell, i) => {
    const m = media[i];
    if (!m) return;
    const cover = coverCell(cell, options.gap, project, m);
    const clip = createOverlayClip(m, options.start, { x: cover.x, y: cover.y, scale: cover.scale, radius: 0, mask: cover.mask });
    clip.trimOut = clip.trimIn + length(m);
    if (m.hasAudio && !firstSound) clip.volume = 0;
    if (m.hasAudio) firstSound = false;
    place(clip);
  });
  return { project: next, ids };
}

/** Quanto dura a tela dividida por padrão: o vídeo mais curto escolhido (ou 6 s, só com fotos). */
export function defaultSplitDuration(media: (MediaItem | null)[]): number {
  const videos = media.filter((m): m is MediaItem => !!m && m.kind !== 'image').map((m) => m.duration);
  return videos.length ? Math.min(...videos) : 6;
}
