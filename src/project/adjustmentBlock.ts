import { t } from '../i18n';
import { createPackClip, type PackClip, type PackTemplate } from './packs';

/**
 * Bloco de ajuste: um pacote vazio. Entra na trilha de pacotes como qualquer pacote (bordas, intensidade,
 * entrada e saída suaves, salvar como meu pacote) e a pessoa escolhe nele o filtro, os efeitos e a câmera.
 * Vale para tudo o que está embaixo, só naquele trecho, como a camada de ajuste dos outros editores.
 */
export const ADJUSTMENT_ID = 'packs/bloco-de-ajuste';

export const ADJUSTMENT_TEMPLATE: PackTemplate = {
  id: ADJUSTMENT_ID,
  name: t('Bloco de ajuste'),
  category: 'Bloco de ajuste',
  description: t('Um bloco vazio: escolha nele o filtro, os efeitos, a cor e a câmera. Vale para tudo o que está embaixo, só naquele trecho.'),
  color: '#64748b',
  duration: 5,
  // Esticar o bloco não mexe nas animações que a pessoa fizer nele.
  timing: 'fixed',
  anchor: 'clip',
  intensity: 1,
  fadeIn: 0,
  fadeOut: 0,
  effects: [],
  filter: null,
  camera: null,
};

/** O mesmo bloco, começando no instante pedido (clique direito na timeline: "aqui"). */
export const ADJUSTMENT_HERE: PackTemplate = { ...ADJUSTMENT_TEMPLATE, anchor: 'cursor' };

export function createAdjustmentBlock(start: number, duration = ADJUSTMENT_TEMPLATE.duration): PackClip {
  return createPackClip(ADJUSTMENT_TEMPLATE, start, duration);
}

export function isAdjustmentBlock(clip: Pick<PackClip, 'packId'>): boolean {
  return clip.packId === ADJUSTMENT_ID;
}

