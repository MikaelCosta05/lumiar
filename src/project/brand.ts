import { t } from '../i18n';
import { createCaptionTrack } from './captions';
import {
  addVideoTrack,
  createOverlayClip,
  createVideoClip,
  insertVideoClips,
  layoutProject,
  type MediaItem,
  type OverlayClip,
  type Project,
} from './model';
import { packTracksOf } from './packs';

/**
 * Kit da marca: logo, cores, fontes, abertura, encerramento e marca d'água. Fica guardado no
 * computador (vale para todos os projetos) e é aplicado com um clique.
 */
export interface BrandKit {
  name: string;
  /** Cor principal, secundária e de destaque */
  colors: [string, string, string];
  titleFont: string;
  bodyFont: string;
  logo: File | null;
  intro: File | null;
  outro: File | null;
  watermark: {
    corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    /** Altura da logo (fração da altura da tela) */
    size: number;
    opacity: number;
  };
}

export const DEFAULT_BRAND: BrandKit = {
  name: t('Minha marca'),
  colors: ['#ffffff', '#6f7dff', '#ffd23f'],
  titleFont: 'Montserrat Variable',
  bodyFont: 'Inter Variable',
  logo: null,
  intro: null,
  outro: null,
  watermark: { corner: 'top-right', size: 0.12, opacity: 0.85 },
};

export interface BrandOptions {
  logo: boolean;
  intro: boolean;
  outro: boolean;
  texts: boolean;
  captions: boolean;
}

/** Posição e escala da logo no canto escolhido (com margem), para qualquer formato de tela. */
export function logoPlacement(project: Project, logo: { width: number; height: number }, watermark: BrandKit['watermark']) {
  const ratio = project.width / project.height;
  const logoRatio = logo.width / logo.height || 1;
  // Escala 1 = a logo inteira cabendo na tela (igual ao renderizador).
  const fit = logoRatio > ratio ? [1, ratio / logoRatio] : [logoRatio / ratio, 1];
  const scale = Math.min(watermark.size / fit[1], 0.3 / fit[0]);
  const w = fit[0] * scale;
  const h = fit[1] * scale;
  const margin = 0.035;
  const mx = margin * Math.min(1, 1 / ratio);
  const right = watermark.corner.endsWith('right');
  const bottom = watermark.corner.startsWith('bottom');
  return {
    x: right ? 1 - mx - w / 2 : mx + w / 2,
    y: bottom ? 1 - margin - h / 2 : margin + h / 2,
    scale,
    opacity: watermark.opacity,
    radius: 0,
  };
}

/** Empurra tudo (menos a trilha principal) que começa a partir de `from` em `delta` segundos. */
export function shiftAfter(project: Project, from: number, delta: number): Project {
  const shift = (t: number) => (t >= from - 1e-6 ? t + delta : t);
  return {
    ...project,
    audioTracks: project.audioTracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, start: shift(c.start) })) })),
    textTracks: project.textTracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => {
        const start = shift(c.start);
        const moved = start - c.start;
        return { ...c, start, follow: c.follow && { ...c.follow, points: c.follow.points.map((p) => ({ ...p, t: p.t + moved })) } };
      }),
    })),
    videoTracks: project.videoTracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, start: shift(c.start) })) })),
    packTracks: packTracksOf(project).map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, start: shift(c.start) })) })),
    markers: project.markers.map((m) => ({ ...m, time: shift(m.time) })),
    comments: project.comments?.map((c) => ({ ...c, time: shift(c.time) })),
    beats: project.beats?.map(shift),
    captions: project.captions && {
      ...project.captions,
      captions: project.captions.captions.map((c) => ({
        ...c,
        start: shift(c.start),
        end: c.start >= from ? c.end + delta : c.end,
        words: c.words?.map((w) => ({ ...w, start: shift(w.start), end: w.start >= from ? w.end + delta : w.end })),
      })),
    },
  };
}

/**
 * Aplica o kit ao projeto. As mídias (logo, abertura, encerramento) já vêm importadas.
 * A abertura entra no começo e empurra todo o resto; o encerramento vai no fim; a logo fica por
 * cima do vídeo inteiro, numa trilha própria.
 */
export function applyBrand(
  project: Project,
  kit: BrandKit,
  media: { logo: MediaItem | null; intro: MediaItem | null; outro: MediaItem | null },
  options: BrandOptions,
): Project {
  let p = project;
  const added = [media.logo, media.intro, media.outro].filter((m): m is MediaItem => !!m && !p.media.some((x) => x.id === m.id));
  p = { ...p, media: [...p.media, ...added] };

  if (options.intro && media.intro) {
    const clip = createVideoClip(media.intro);
    const before = layoutProject(p).videoDuration;
    p = insertVideoClips(p, [clip], 0);
    // Sem transição automática entre a abertura e o primeiro clipe (entra seco, como vinheta).
    p = { ...p, transitions: p.transitions.map((t, i) => (i === 0 ? null : t)) };
    p = shiftAfter(p, 0, layoutProject(p).videoDuration - before);
  }
  if (options.outro && media.outro) {
    p = insertVideoClips(p, [createVideoClip(media.outro)]);
    p = { ...p, transitions: p.transitions.map((t, i) => (i === p.transitions.length - 1 ? null : t)) };
  }
  if (options.logo && media.logo) {
    const duration = layoutProject(p).duration;
    const place = logoPlacement(p, media.logo, kit.watermark);
    const clip: OverlayClip = { ...createOverlayClip(media.logo, 0, place), trimOut: Math.max(0.5, duration), volume: 0 };
    p = addVideoTrack(p);
    const index = p.videoTracks.length - 1;
    p = { ...p, videoTracks: p.videoTracks.map((t, i) => (i === index ? { ...t, name: 'Logo', clips: [clip] } : t)) };
  }
  if (options.texts) {
    p = {
      ...p,
      textTracks: p.textTracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          // Elementos desenhados e código mantêm o próprio visual.
          c.shape || c.typing || /^\p{Extended_Pictographic}/u.test(c.text)
            ? c
            : { ...c, style: { ...c.style, font: kit.titleFont, color: kit.colors[0], boxColor: c.style.box ? kit.colors[1] : c.style.boxColor, glowColor: kit.colors[1] } },
        ),
      })),
    };
  }
  if (options.captions) {
    const track = p.captions ?? createCaptionTrack();
    p = { ...p, captions: { ...track, style: { ...track.style, font: kit.bodyFont, color: kit.colors[0], highlight: kit.colors[2] } } };
  }
  return p;
}
