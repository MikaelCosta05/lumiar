import { t } from '../i18n';
import { createCamera } from './camera';
import {
  clipLength,
  createFilter,
  createProject,
  createTransition,
  createVideoClip,
  IMAGE_MAX_DURATION,
  insertVideoClips,
  layoutProject,
  speedOf,
  type MediaItem,
  type Project,
  type VideoClip,
} from './model';
import { createTextClip, placeTextClip, STICKERS, TEXT_PRESETS } from './text';

/**
 * Modelos de projeto: a estrutura pronta (formato, cenas com duração, títulos, transições, filtro)
 * com "espaços" no lugar dos vídeos. Cada espaço é uma imagem marcada; troque pelo seu vídeo
 * (clique direito → Trocar a mídia) e ele ocupa o mesmo tempo.
 */
export interface TemplateText {
  /** Cena em que o texto aparece e quanto depois do começo dela */
  slot: number;
  offset?: number;
  duration?: number;
  preset: string;
  text: string;
  x?: number;
  y?: number;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  width: number;
  height: number;
  /** Cenas: nome do que filmar e duração (s) */
  slots: { label: string; duration: number }[];
  texts: TemplateText[];
  /** Transição entre as cenas (null = corte seco) */
  transition: string | null;
  filter?: string;
  /** Zoom lento em cada cena (fotos ganham vida) */
  kenBurns?: boolean;
  colors: [string, string];
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'receita',
    name: t('Reels de receita'),
    description: t('Prato pronto como gancho, ingredientes, três passos e o resultado. Vertical, com títulos grandes.'),
    emoji: '🍝',
    width: 1080,
    height: 1920,
    slots: [
      { label: t('Prato pronto (gancho)'), duration: 2 },
      { label: t('Ingredientes'), duration: 3 },
      { label: t('Passo {n}', { n: 1 }), duration: 3 },
      { label: t('Passo {n}', { n: 2 }), duration: 3 },
      { label: t('Passo {n}', { n: 3 }), duration: 3 },
      { label: t('Resultado final'), duration: 3 },
    ],
    texts: [
      { slot: 0, preset: 'impacto', text: t('RECEITA EM 15 MIN'), y: 0.2 },
      { slot: 1, preset: 'etiqueta', text: t('INGREDIENTES'), x: 0.5, y: 0.15 },
      { slot: 2, preset: 'vlog', text: t('1. Prepare'), y: 0.8 },
      { slot: 3, preset: 'vlog', text: t('2. Misture'), y: 0.8 },
      { slot: 4, preset: 'vlog', text: t('3. Asse'), y: 0.8 },
      { slot: 5, preset: 'impacto', text: t('FICOU INCRÍVEL!'), y: 0.2 },
      { slot: 5, offset: 0.5, preset: 'sticker/fogo', text: '🔥', x: 0.82, y: 0.32 },
    ],
    transition: 'transitions/whip-pan',
    filter: 'filters/vivido',
    colors: ['#f97316', '#be123c'],
  },
  {
    id: 'viagem',
    name: t('Vlog de viagem'),
    description: t('Abertura de cinema, a chegada, passeios, comida, paisagem e despedida. Cores quentes de filme.'),
    emoji: '✈️',
    width: 1920,
    height: 1080,
    slots: [
      { label: t('Abertura (paisagem)'), duration: 4 },
      { label: t('Chegada'), duration: 4 },
      { label: t('Passeio {n}', { n: 1 }), duration: 4 },
      { label: t('Comida'), duration: 4 },
      { label: t('Passeio {n}', { n: 2 }), duration: 4 },
      { label: t('Despedida'), duration: 4 },
    ],
    texts: [
      { slot: 0, offset: 0.5, duration: 3, preset: 'filme', text: t('DIÁRIO DE VIAGEM') },
      { slot: 1, preset: 'faixa', text: t('Dia 1\nChegando') },
      { slot: 3, preset: 'faixa', text: t('Comida local\nImperdível') },
      { slot: 5, offset: 0.5, preset: 'assinatura', text: t('até a próxima') },
    ],
    transition: 'transitions/dissolver',
    filter: 'filters/kodak-gold',
    colors: ['#0ea5e9', '#f59e0b'],
  },
  {
    id: 'review',
    name: t('Review de produto'),
    description: t('Gancho com a pergunta, unboxing, detalhes, prós, contras e a nota final.'),
    emoji: '📦',
    width: 1920,
    height: 1080,
    slots: [
      { label: t('Gancho: você segurando o produto'), duration: 3 },
      { label: 'Unboxing', duration: 5 },
      { label: t('Detalhes de perto'), duration: 5 },
      { label: t('Prós'), duration: 5 },
      { label: t('Contras'), duration: 5 },
      { label: t('Veredito'), duration: 4 },
    ],
    texts: [
      { slot: 0, preset: 'impacto', text: t('VALE A PENA?') },
      { slot: 1, preset: 'urgente', text: 'UNBOXING' },
      { slot: 3, preset: 'etiqueta', text: t('✅ PRÓS'), x: 0.2, y: 0.15 },
      { slot: 4, preset: 'etiqueta', text: t('❌ CONTRAS'), x: 0.2, y: 0.15 },
      { slot: 5, preset: 'numero', text: '9/10' },
    ],
    transition: 'transitions/zoom',
    filter: 'filters/nitido',
    colors: ['#6366f1', '#0f172a'],
  },
  {
    id: 'antes-depois',
    name: t('Antes e depois'),
    description: t('A transformação: o antes, um clarão e o depois. Ótimo para reforma, maquiagem e treino.'),
    emoji: '✨',
    width: 1080,
    height: 1920,
    slots: [
      { label: t('Antes'), duration: 3 },
      { label: t('Depois'), duration: 4 },
    ],
    texts: [
      { slot: 0, preset: 'etiqueta', text: t('ANTES'), x: 0.5, y: 0.12 },
      { slot: 1, preset: 'etiqueta', text: t('DEPOIS'), x: 0.5, y: 0.12 },
      { slot: 1, offset: 0.3, preset: 'sticker/brilho', text: '✨', x: 0.8, y: 0.3 },
    ],
    transition: 'transitions/explosao-de-luz',
    colors: ['#a855f7', '#ec4899'],
  },
  {
    id: 'top-5',
    name: 'Top 5',
    description: t('Contagem regressiva do 5 ao 1, com número gigante em cada item.'),
    emoji: '🏆',
    width: 1080,
    height: 1920,
    slots: [
      { label: t('Abertura'), duration: 2 },
      { label: t('Número {n}', { n: 5 }), duration: 3 },
      { label: t('Número {n}', { n: 4 }), duration: 3 },
      { label: t('Número {n}', { n: 3 }), duration: 3 },
      { label: t('Número {n}', { n: 2 }), duration: 3 },
      { label: t('Número {n}', { n: 1 }), duration: 4 },
    ],
    texts: [
      { slot: 0, preset: 'impacto', text: 'TOP 5' },
      ...[5, 4, 3, 2, 1].map((n, i): TemplateText => ({ slot: i + 1, duration: 1.4, preset: 'numero', text: String(n) })),
      { slot: 5, offset: 1.4, preset: 'sticker/trofeu', text: '🏆', x: 0.8, y: 0.25 },
    ],
    transition: 'transitions/whip-pan',
    filter: 'filters/pop',
    colors: ['#facc15', '#ea580c'],
  },
  {
    id: 'homenagem',
    name: t('Homenagem (fotos)'),
    description: t('Fotos com zoom lento e passagens suaves, para aniversário, casamento ou homenagem.'),
    emoji: '🎂',
    width: 1920,
    height: 1080,
    slots: [
      { label: t('Foto {n}', { n: 1 }), duration: 4 },
      { label: t('Foto {n}', { n: 2 }), duration: 4 },
      { label: t('Foto {n}', { n: 3 }), duration: 4 },
      { label: t('Foto {n}', { n: 4 }), duration: 4 },
      { label: t('Foto {n}', { n: 5 }), duration: 4 },
      { label: t('Foto {n}', { n: 6 }), duration: 4 },
    ],
    texts: [
      { slot: 0, offset: 0.5, duration: 3.2, preset: 'assinatura', text: t('Feliz aniversário') },
      { slot: 5, offset: 0.5, duration: 3.2, preset: 'assinatura', text: t('com amor') },
      { slot: 5, offset: 0.8, duration: 3, preset: 'sticker/coracao', text: '❤️', x: 0.5, y: 0.28 },
    ],
    transition: 'transitions/dissolver',
    filter: 'filters/pastel',
    kenBurns: true,
    colors: ['#f472b6', '#7c3aed'],
  },
];

/** Imagem que marca o lugar de uma cena ("troque pelo seu vídeo"). */
export async function placeholderImage(template: ProjectTemplate, slot: number): Promise<File> {
  const scale = 960 / Math.max(template.width, template.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(template.width * scale);
  canvas.height = Math.round(template.height * scale);
  const ctx = canvas.getContext('2d')!;
  const { width: W, height: H } = canvas;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, template.colors[0]);
  g.addColorStop(1, template.colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, W, H);
  ctx.setLineDash([18, 12]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  const unit = Math.min(W, H);
  ctx.font = `900 ${unit * 0.16}px "Montserrat Variable", sans-serif`;
  ctx.fillText(String(slot + 1), W / 2, H / 2 - unit * 0.16);
  ctx.font = `700 ${unit * 0.07}px "Montserrat Variable", sans-serif`;
  ctx.fillText(template.slots[slot].label, W / 2, H / 2 + unit * 0.02, W - 80);
  ctx.font = `500 ${unit * 0.035}px "Inter Variable", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(t('Troque pelo seu vídeo: clique direito → Trocar a mídia'), W / 2, H / 2 + unit * 0.12, W - 80);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  return new File([blob], `${t('Modelo · {n} {cena}', { n: slot + 1, cena: template.slots[slot].label })}.png`, { type: 'image/png' });
}

/** Monta o projeto do modelo com as imagens de cada cena (já importadas). */
export function buildTemplateProject(template: ProjectTemplate, slots: MediaItem[]): Project {
  let project: Project = {
    ...createProject(),
    name: template.name,
    width: template.width,
    height: template.height,
    media: slots,
  };
  const clips = template.slots.map((slot, i): VideoClip => {
    const clip: VideoClip = { ...createVideoClip(slots[i]), trimOut: slot.duration };
    const filter = template.filter ? createFilter(template.filter, 0.8) : null;
    const camera = template.kenBurns
      ? {
          ...createCamera(),
          fill: true,
          keyframes: {
            zoom: [
              { time: 0, value: i % 2 ? 1.15 : 1, easing: 'linear' as const },
              { time: slot.duration, value: i % 2 ? 1 : 1.15, easing: 'linear' as const },
            ],
          },
        }
      : { ...createCamera(), fill: true };
    return { ...clip, filter, camera };
  });
  project = insertVideoClips(project, clips);
  project = { ...project, transitions: project.transitions.map(() => (template.transition ? createTransition(template.transition, 0.5) : null)) };
  const layout = layoutProject(project);
  for (const t of template.texts) {
    const at = layout.clips[t.slot];
    const preset = TEXT_PRESETS.find((p) => p.id === t.preset) ?? STICKERS.find((p) => p.id === t.preset);
    if (!at || !preset) continue;
    const start = at.start + (t.offset ?? 0.2);
    const duration = t.duration ?? Math.max(0.5, at.length - (t.offset ?? 0.2) - 0.2);
    const text = { ...createTextClip(preset, start, duration), text: t.text, ...(t.x !== undefined ? { x: t.x } : {}), ...(t.y !== undefined ? { y: t.y } : {}) };
    project = placeTextClip(project, text);
  }
  return project;
}

/**
 * Troca a mídia de um clipe da trilha principal mantendo o tempo que ele ocupa,
 * o filtro, os efeitos e o movimento de câmera (o "seguir" e a estabilização saem: eram do vídeo antigo).
 */
export function replaceClipMedia(project: Project, clipId: string, media: MediaItem): Project {
  return {
    ...project,
    media: project.media.some((m) => m.id === media.id) ? project.media : [...project.media, media],
    clips: project.clips.map((c) => {
      if (c.id !== clipId) return c;
      const length = clipLength(c);
      const speed = speedOf(c);
      const trimOut = media.kind === 'image' ? Math.min(IMAGE_MAX_DURATION, length) : Math.min(media.duration, length * speed);
      return { ...c, mediaId: media.id, trimIn: 0, trimOut, camera: c.camera && { ...c.camera, follow: null, stabilize: undefined }, matte: undefined };
    }),
  };
}
