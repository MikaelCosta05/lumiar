import { t, tc } from '../i18n';

/** Tamanhos de projeto prontos, agrupados como nos editores de celular e de computador. */
export interface FormatPreset {
  name: string;
  /** Onde é usado (aparece menor, embaixo do nome) */
  hint: string;
  width: number;
  height: number;
}

export interface FormatGroup {
  title: string;
  presets: FormatPreset[];
}

export const FORMAT_GROUPS: FormatGroup[] = [
  {
    title: t('Paisagem 16:9'),
    presets: [
      { name: '360p', hint: tc('arquivo', 'Leve'), width: 640, height: 360 },
      { name: '480p', hint: 'SD', width: 854, height: 480 },
      { name: 'HD', hint: '720p', width: 1280, height: 720 },
      { name: 'Full HD', hint: '1080p · YouTube', width: 1920, height: 1080 },
      { name: '2K', hint: '1440p · QHD', width: 2560, height: 1440 },
      { name: '4K', hint: '2160p · UHD', width: 3840, height: 2160 },
    ],
  },
  {
    title: 'Vertical 9:16',
    presets: [
      { name: t('HD vertical'), hint: t('Stories leve'), width: 720, height: 1280 },
      { name: t('Full HD vertical'), hint: 'Reels · TikTok · Shorts', width: 1080, height: 1920 },
      { name: t('2K vertical'), hint: '1440×2560', width: 1440, height: 2560 },
      { name: t('4K vertical'), hint: '2160×3840', width: 2160, height: 3840 },
    ],
  },
  {
    title: t('Quadrado e retrato'),
    presets: [
      { name: t('Quadrado'), hint: '1:1 · 720', width: 720, height: 720 },
      { name: t('Quadrado'), hint: '1:1 · Feed', width: 1080, height: 1080 },
      { name: t('Retrato 4:5'), hint: t('Feed do Instagram'), width: 1080, height: 1350 },
      { name: t('Retrato 3:4'), hint: '1080×1440', width: 1080, height: 1440 },
      { name: t('Retrato 2:3'), hint: 'Pinterest', width: 1000, height: 1500 },
    ],
  },
  {
    title: t('Clássico'),
    presets: [
      { name: '4:3', hint: t('TV antiga'), width: 1440, height: 1080 },
      { name: '4:3', hint: '1024×768', width: 1024, height: 768 },
      { name: '3:2', hint: t('Fotografia'), width: 1620, height: 1080 },
      { name: '5:4', hint: '1350×1080', width: 1350, height: 1080 },
    ],
  },
  {
    title: t('Cinema'),
    presets: [
      { name: 'Ultrawide 21:9', hint: '2560×1080', width: 2560, height: 1080 },
      { name: 'Scope 2.39:1', hint: t('Anamórfico'), width: 1920, height: 804 },
      { name: 'Flat 1.85:1', hint: '1998×1080', width: 1998, height: 1080 },
      { name: 'DCI 2K', hint: '2048×1080', width: 2048, height: 1080 },
      { name: 'DCI 4K', hint: '4096×2160', width: 4096, height: 2160 },
    ],
  },
];

export const FPS_CHOICES = [12, 15, 24, 25, 30, 48, 50, 60];

/** Menor fração (16:9, 4:5…) para mostrar a proporção. */
export function aspectLabel(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(width, height);
  const w = width / g;
  const h = height / g;
  if (w <= 32 && h <= 32) return `${w}:${h}`;
  return width >= height ? `${(width / height).toFixed(2)}:1` : `1:${(height / width).toFixed(2)}`;
}

export function presetName(width: number, height: number): string {
  for (const group of FORMAT_GROUPS) {
    const found = group.presets.find((p) => p.width === width && p.height === height);
    if (found) return found.name;
  }
  return t('Personalizado');
}

/** Limita e arredonda para número par (os codificadores de vídeo exigem). */
export function normalizeSize(value: number): number {
  return Math.min(7680, Math.max(64, Math.round(value / 2) * 2));
}
