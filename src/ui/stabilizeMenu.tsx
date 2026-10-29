import { Vibrate } from 'lucide-react';
import { t, tc } from '../i18n';
import type { Camera } from '../project/camera';
import type { MediaItem } from '../project/model';
import type { StabilizeStrength } from '../project/stabilize';
import type { MenuEntry } from './ContextMenu';

const STRENGTHS: [StabilizeStrength, string][] = [
  ['suave', tc('estabilizar', 'Suave')],
  ['media', tc('estabilizar', 'Média')],
  ['forte', tc('estabilizar', 'Forte')],
];

/** "Estabilizar vídeo" no menu de um clipe de vídeo, com a força atual marcada. */
export function stabilizeMenu(
  media: MediaItem | undefined,
  camera: Camera | undefined,
  apply: (strength: StabilizeStrength | null) => void,
): MenuEntry {
  if (media?.kind !== 'video' || media.compound) return null;
  const current = camera?.stabilize?.strength;
  return {
    label: t('Estabilizar vídeo (tirar o tremido)'),
    icon: <Vibrate size={14} />,
    items: [
      ...STRENGTHS.map(([strength, label]) => ({ label, checked: current === strength, onClick: () => apply(strength) })),
      current ? 'separator' : null,
      current ? { label: t('Remover estabilização'), onClick: () => apply(null) } : null,
    ],
  };
}
