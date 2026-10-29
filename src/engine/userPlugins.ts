import { t } from '../i18n';
import { registerPlugin, unregisterPlugin } from './registry';
import type { ParamDef, ShaderPlugin } from './types';

/**
 * Efeitos criados no editor de efeitos do Lumiar. Ficam guardados neste computador e aparecem na
 * aba Efeitos, na categoria "Meus efeitos", como qualquer outro.
 */
export interface UserEffect {
  id: string;
  name: string;
  description: string;
  params: ParamDef[];
  glsl: string;
}

const KEY = 'lumiar:user-effects';

/** Categoria da biblioteca onde eles aparecem. */
export const USER_EFFECTS_CATEGORY = 'Meus efeitos';

export function listUserEffects(): UserEffect[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as UserEffect[];
  } catch {
    return [];
  }
}

function store(list: UserEffect[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Sem armazenamento: vale só até fechar.
  }
}

export function toPlugin(effect: UserEffect): ShaderPlugin {
  return {
    id: effect.id,
    kind: 'effect',
    // O nome e a descrição são os que a pessoa escreveu: só os textos padrão são traduzidos.
    name: effect.name || t('Meu efeito'),
    description: effect.description || t('Criado por você no editor de efeitos.'),
    category: USER_EFFECTS_CATEGORY,
    params: effect.params,
    previewParams: {},
    glsl: effect.glsl,
  };
}

/** Coloca os efeitos guardados na lista de efeitos (ao abrir o Lumiar). */
export function loadUserEffects(): void {
  for (const effect of listUserEffects()) registerPlugin(toPlugin(effect));
}

export function saveUserEffect(effect: UserEffect): void {
  const list = listUserEffects().filter((e) => e.id !== effect.id);
  store([...list, effect]);
  registerPlugin(toPlugin(effect));
}

export function deleteUserEffect(id: string): void {
  store(listUserEffects().filter((e) => e.id !== id));
  unregisterPlugin(id);
}

/** Ponto de partida de um efeito novo, no idioma da interface (depois de salvo, é texto da pessoa). */
export const STARTER_EFFECT: Omit<UserEffect, 'id'> = {
  name: t('Onda colorida'),
  description: t('A imagem ondula e ganha um brilho de cor que passa.'),
  params: [
    { id: 'forca', label: t('Força da onda'), type: 'float', default: 0.5, min: 0, max: 1 },
    { id: 'cor', label: t('Cor do brilho'), type: 'color', default: '#ff4fd8' },
  ],
  glsl: `// ${t('Seu efeito: recebe a posição do pixel (uv, de 0 a 1) e devolve a cor dele.')}
// ${t('getColor(uv) lê o vídeo · time = segundos desde o começo do clipe')}
// ${t('ratio = largura/altura · resolution = tamanho em pixels')}
// ${t('Os parâmetros da lista ao lado viram variáveis com o mesmo nome (forca, cor…).')}

vec4 effect(vec2 uv) {
  float onda = sin(uv.y * 30.0 + time * 4.0) * forca * 0.02;
  vec4 imagem = getColor(uv + vec2(onda, 0.0));
  float faixa = smoothstep(0.15, 0.0, abs(fract(uv.x - time * 0.3) - 0.5));
  return vec4(mix(imagem.rgb, cor, faixa * forca * 0.5), imagem.a);
}
`,
};
