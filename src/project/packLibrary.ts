import { hexToRgb } from '../engine/color';
import { t } from '../i18n';
import type { Easing, Keyframe, KeyframeMap } from '../engine/keyframes';
import type { ParamValue, ParamValues } from '../engine/types';
import type { CameraTransform } from './camera';
import type { BeatPattern, PackAnchor, PackTemplate, PackTiming, PulsePoint } from './packs';

/**
 * Pacotes prontos. Cada um é uma receita: filtro + efeitos + movimento de câmera (sem textos nem stickers),
 * com as animações em segundos dentro da duração sugerida. Ao esticar o bloco na timeline,
 * as animações se ajustam sozinhas (ver PackTiming).
 */

type Value = number | number[] | string;
/** [tempo (s), valor, curva até o próximo] */
type Point = [number, Value, Easing?];

const color = (v: Value): ParamValue => (typeof v === 'string' ? hexToRgb(v) : v);

function keyframes(anim: Record<string, Point[]>): KeyframeMap | undefined {
  const entries = Object.entries(anim);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(
    entries.map(([id, points]) => [
      id,
      points.map(([time, value, easing]): Keyframe => ({ time, value: color(value), easing: easing ?? 'ease' })),
    ]),
  );
}

function params(values: Record<string, Value>): ParamValues {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, color(v)]));
}

/** Efeito com parâmetros fixos e, se quiser, animados. */
function fx(id: string, values: Record<string, Value> = {}, anim: Record<string, Point[]> = {}) {
  return { pluginId: `effects/${id}`, params: params(values), keyframes: keyframes(anim) };
}

function look(id: string, intensity = 1, anim: Record<string, Point[]> = {}, values: Record<string, Value> = {}) {
  return { pluginId: `filters/${id}`, intensity, params: params(values), keyframes: keyframes(anim) };
}

function cam(anim: Partial<Record<keyof CameraTransform, Point[]>>, base: Partial<CameraTransform> = {}) {
  return { base, keyframes: keyframes(anim as Record<string, Point[]>) ?? {} };
}

const CATEGORY_COLORS: Record<string, string> = {
  'Edits virais': '#e11d48',
  'Batidas da música': '#9333ea',
  Cinematográfico: '#d97706',
  'Câmera em movimento': '#0284c7',
  'Seguir rosto': '#059669',
  'Câmera lenta e velocidade': '#4f46e5',
  'Comédia e memes': '#c026d3',
  'Impacto e ritmo': '#dc2626',
  'Passagens no corte': '#2563eb',
  'Aberturas e finais': '#ca8a04',
  'Vlog e lifestyle': '#16a34a',
  'Retrô e nostalgia': '#ea580c',
  'Sonho e romance': '#db2777',
  'Suspense e terror': '#6d28d9',
  'Terror analógico': '#4d5a24',
  'Ação e games': '#0891b2',
  'Documentário e notícia': '#475569',
  'Clima e estações': '#0d9488',
};

/** Ordem das linhas na biblioteca. */
export const PACK_CATEGORIES = Object.keys(CATEGORY_COLORS);

interface Recipe {
  description: string;
  duration?: number;
  timing?: PackTiming;
  anchor?: PackAnchor;
  intensity?: number;
  fadeIn?: number;
  fadeOut?: number;
  effects?: PackTemplate['effects'];
  filter?: PackTemplate['filter'];
  camera?: PackTemplate['camera'];
  speed?: number[];
  beat?: BeatPattern;
  face?: PackTemplate['face'];
  muteSlow?: boolean;
}

function pack(id: string, name: string, category: string, recipe: Recipe): PackTemplate {
  return {
    id: `packs/${id}`,
    name,
    category,
    color: CATEGORY_COLORS[category] ?? '#6f7dff',
    duration: recipe.duration ?? 6,
    timing: recipe.timing ?? 'edges',
    anchor: recipe.anchor ?? 'clip',
    intensity: recipe.intensity ?? 1,
    fadeIn: recipe.fadeIn ?? 0,
    fadeOut: recipe.fadeOut ?? 0,
    description: recipe.description,
    effects: recipe.effects ?? [],
    filter: recipe.filter ?? null,
    camera: recipe.camera ?? null,
    speed: recipe.speed,
    beat: recipe.beat,
    face: recipe.face,
    muteSlow: recipe.muteSlow,
  };
}

/** Pacote que pulsa nas batidas: cobre a música e as animações ficam presas a cada batida. */
const onBeats = (pulses: BeatPattern['pulses'], every = 1) => ({
  duration: 8,
  timing: 'fixed' as const,
  anchor: 'beats' as const,
  beat: { every, pulses },
});

/** Pulso numa batida: valor parado e o que acontece logo depois de cada batida. */
const pulse = (rest: number, points: PulsePoint[], alt?: PulsePoint[]) => ({ rest, points, alt });

/**
 * Onde cai, no bloco já com a velocidade mudada, um ponto do trecho original (0 a 1),
 * em segundos do pacote (duração d). Para pôr um flash exatamente onde a câmera lenta começa.
 */
function speedTime(speeds: number[], d: number, fraction: number): number {
  const part = 1 / speeds.length;
  let total = 0;
  let at = 0;
  speeds.forEach((sp, k) => {
    const from = k * part;
    total += part / sp;
    if (fraction > from) at += Math.min(part, fraction - from) / sp;
  });
  return (d * at) / total;
}

/** Trecho que começa no cursor e muda de velocidade (d = segundos do vídeo original). */
const slow = (speeds: number[], d: number) => ({ duration: d, timing: 'stretch' as const, anchor: 'cursor' as const, speed: speeds });

/** Momentos curtos (batidas, passagens): animação inteira estica junto com o bloco. */
const moment = (duration: number, anchor: PackAnchor = 'cursor') => ({ duration, timing: 'stretch' as const, anchor });

const BASE_PACKS: PackTemplate[] = [
  // ------------------------------------------------------------ Cinematográfico
  pack('abertura-de-cinema', t('Abertura de cinema'), 'Cinematográfico', {
    anchor: 'clip-start',
    description: t('Sai do preto, as barras de cinema entram, cor de blockbuster e um zoom lento.'),
    effects: [
      fx('barras-cinema', { aspect: 2.39 }, { aspect: [[0, 1.78], [1.4, 2.39], [4.6, 2.39], [6, 1.78]] }),
      fx('vinheta', { intensity: 0.45, size: 0.5 }),
      fx('granulado', { amount: 0.12, flicker: 0.1 }),
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 1], [1.2, 0]] }),
    ],
    filter: look('blockbuster', 0.85),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [6, 1.12]] }),
  }),
  pack('teal-orange', t('Teal & orange'), 'Cinematográfico', {
    description: t('A cor clássica de filme de ação: pele quente, sombras azuladas, barras finas.'),
    effects: [fx('ajuste-cor', { contrast: 1.1, saturation: 1.08 }), fx('vinheta', { intensity: 0.35 }), fx('barras-cinema', { aspect: 2.0 })],
    filter: look('cinema', 0.9),
  }),
  pack('trailer-epico', t('Trailer épico'), 'Cinematográfico', {
    description: t('Contraste pesado, brilho nas luzes e a câmera avançando devagar, como em trailer.'),
    effects: [
      fx('brilho', { threshold: 0.65, intensity: 0.7, radius: 18 }),
      fx('vinheta', { intensity: 0.55, size: 0.4 }),
      fx('barras-cinema', { aspect: 2.39 }),
    ],
    filter: look('dramatico', 0.9),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [6, 1.18]] }),
    fadeIn: 0.4,
    fadeOut: 0.4,
  }),
  pack('drama-noir', t('Drama noir'), 'Cinematográfico', {
    description: t('Preto e branco duro, grão de filme e vinheta fechada. Para cenas tensas.'),
    effects: [fx('granulado', { amount: 0.3, size: 1.6 }), fx('vinheta', { intensity: 0.75, size: 0.35 })],
    filter: look('noir'),
    camera: cam({ zoom: [[0, 1.04, 'linear'], [6, 1.14]] }),
  }),
  pack('neo-noir', t('Noite neo-noir'), 'Cinematográfico', {
    description: t('Noite de cidade com néon estourado, contraste alto e barras largas.'),
    effects: [fx('brilho', { threshold: 0.55, intensity: 1.1, radius: 20 }), fx('barras-cinema', { aspect: 2.39 }), fx('vinheta', { intensity: 0.5 })],
    filter: look('neo-noir'),
  }),
  pack('fabula', t('Fábula'), 'Cinematográfico', {
    description: t('Cores de conto de fadas, brilho suave e partículas de luz flutuando.'),
    effects: [fx('brilho', { threshold: 0.5, intensity: 0.8, radius: 22 }), fx('particulas-de-luz', { amount: 0.6, hue: 0.12 })],
    filter: look('fabula', 0.9),
    fadeIn: 0.6,
    fadeOut: 0.6,
  }),

  // ------------------------------------------------------------ Vlog e lifestyle
  pack('vlog-ensolarado', t('Vlog ensolarado'), 'Vlog e lifestyle', {
    description: t('Dia de sol: tons quentes, um pouco mais de cor e luz vazando na lente.'),
    effects: [fx('ajuste-cor', { brightness: 0.03, saturation: 1.12, temperature: 0.15 }), fx('luz-vazada', { amount: 0.35, speed: 0.6 })],
    filter: look('kodak-gold', 0.6),
  }),
  pack('limpo-e-claro', t('Limpo e claro'), 'Vlog e lifestyle', {
    description: t('Visual de vídeo de estúdio: claro, nítido e com as sombras abertas.'),
    effects: [fx('ajuste-cor', { brightness: 0.04, contrast: 1.05, saturation: 1.05 })],
    filter: look('clarear-sombras', 0.7),
  }),
  pack('viagem', t('Diário de viagem'), 'Vlog e lifestyle', {
    description: t('Cores vivas, reflexo de sol na lente e um movimento de câmera tipo Ken Burns.'),
    effects: [fx('lens-flare', { amount: 0.6, source: [0.8, 0.82] }), fx('vinheta', { intensity: 0.25 })],
    filter: look('tropical', 0.75),
    camera: cam({ zoom: [[0, 1.08, 'linear'], [6, 1.25]], x: [[0, 0.46, 'linear'], [6, 0.54]] }),
  }),
  pack('comida', t('Comida apetitosa'), 'Vlog e lifestyle', {
    description: t('Realça as cores quentes e os detalhes: deixa a comida com cara de gostosa.'),
    effects: [fx('ajuste-cor', { contrast: 1.08, saturation: 1.2, temperature: 0.2 }), fx('vinheta', { intensity: 0.3 })],
    filter: look('amplificar', 0.5),
    camera: cam({ zoom: [[0, 1.05, 'linear'], [6, 1.15]] }),
  }),
  pack('pastel', t('Pastel suave'), 'Vlog e lifestyle', {
    description: t('Tons claros e desbotados com brilho leve. Combina com moda e estética.'),
    effects: [fx('brilho', { threshold: 0.6, intensity: 0.5, radius: 14 })],
    filter: look('pastel'),
  }),
  pack('zoom-no-ritmo', t('Pulsando no ritmo'), 'Vlog e lifestyle', {
    description: t('A imagem pulsa a cada batida (120 BPM, ajustável no efeito). Para trechos com música.'),
    effects: [fx('zoom-pulsante', { amount: 0.08, bpm: 120, flash: 0.12 })],
    filter: look('vivido', 0.5),
  }),

  // ------------------------------------------------------------ Impacto e ritmo
  pack('batida', t('Batida'), 'Impacto e ritmo', {
    ...moment(0.5),
    description: t('Zoom rápido, flash e separação de cor numa batida. Coloque o cursor na batida da música.'),
    effects: [
      fx('rgb-split', {}, { amount: [[0, 0.02, 'ease-out'], [0.3, 0]] }),
      fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.65, 'ease-out'], [0.25, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.06, 1.16], [0.5, 1.0]] }),
  }),
  pack('soco-de-zoom', t('Soco de zoom'), 'Impacto e ritmo', {
    ...moment(0.8),
    description: t('A câmera avança de uma vez com desfoque de movimento e volta. Ótimo para reações.'),
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0.7, 'ease-out'], [0.35, 0]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.12, 1.4], [0.8, 1.0]] }),
  }),
  pack('tremor-de-impacto', t('Tremor de impacto'), 'Impacto e ritmo', {
    ...moment(0.9),
    description: t('Tremida forte que vai acalmando, com flash e cor separada. Para quedas, socos e explosões.'),
    effects: [
      fx('tremor', { speed: 18, rotation: 0.6 }, { intensity: [[0, 1, 'ease-out'], [0.9, 0]] }),
      fx('rgb-split', {}, { amount: [[0, 0.025, 'ease-out'], [0.5, 0]] }),
      fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.5, 'ease-out'], [0.2, 0]] }),
    ],
    camera: cam({}, { zoom: 1.12 }),
  }),
  pack('flash-branco', t('Flash branco'), 'Impacto e ritmo', {
    ...moment(0.45),
    description: t('Um clarão rápido, como flash de foto.'),
    effects: [fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 0], [0.07, 1, 'ease-out'], [0.45, 0]] })],
  }),
  pack('piscada', t('Piscada'), 'Impacto e ritmo', {
    ...moment(0.6),
    description: t('A tela apaga e acende duas vezes. Dá ritmo a cortes secos e sustos.'),
    effects: [
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0, 'hold'], [0.08, 1, 'hold'], [0.18, 0, 'hold'], [0.3, 1, 'hold'], [0.4, 0, 'hold']] }),
    ],
  }),
  pack('glitch-rapido', t('Glitch rápido'), 'Impacto e ritmo', {
    ...moment(0.6),
    description: t('Falha digital curta, com blocos, cor separada e a imagem tremendo.'),
    effects: [
      fx('glitch-digital', { blocks: 14, rate: 20 }, { amount: [[0, 0.9], [0.6, 0]] }),
      fx('rgb-split', { angle: 90 }, { amount: [[0, 0.03], [0.6, 0]] }),
      fx('tremor', { speed: 25, rotation: 0.2 }, { intensity: [[0, 0.5], [0.6, 0]] }),
    ],
  }),
  pack('estouro-de-luz', t('Estouro de luz'), 'Impacto e ritmo', {
    ...moment(0.8),
    description: t('As luzes estouram com brilho e raios e voltam ao normal.'),
    effects: [
      fx('brilho', { threshold: 0.35, radius: 30 }, { intensity: [[0, 0], [0.15, 2, 'ease-out'], [0.8, 0]] }),
      fx('raios-de-luz', { source: [0.5, 0.6] }, { amount: [[0, 0], [0.15, 1.6, 'ease-out'], [0.8, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.15, 1.08], [0.8, 1.0]] }),
  }),

  // ------------------------------------------------------------ Passagens no corte
  pack('passagem-whoosh', t('Whoosh'), 'Passagens no corte', {
    ...moment(0.6, 'cut'),
    description: t('Zoom com desfoque de movimento que "puxa" de um clipe para o outro. Fica centrado no corte.'),
    effects: [
      fx('desfoque-radial', {}, { strength: [[0, 0], [0.3, 0.9], [0.6, 0]] }),
      fx('flash', { tint: '#ffffff' }, { amount: [[0, 0], [0.3, 0.35], [0.6, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [0.3, 1.3, 'ease-out'], [0.6, 1.0]] }),
  }),
  pack('passagem-giro', t('Giro rápido'), 'Passagens no corte', {
    ...moment(0.7, 'cut'),
    description: t('A câmera gira e volta no corte, com desfoque. Muito usado em vídeos de viagem.'),
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0], [0.35, 0.8], [0.7, 0]] })],
    camera: cam({
      zoom: [[0, 1.0, 'ease-in'], [0.35, 1.45, 'ease-out'], [0.7, 1.0]],
      rotation: [[0, 0, 'ease-in'], [0.35, -18, 'ease-out'], [0.7, 0]],
    }),
  }),
  pack('passagem-luz', t('Corte com luz'), 'Passagens no corte', {
    ...moment(0.9, 'cut'),
    description: t('Uma luz quente invade a tela e esconde o corte. Suave e bonito.'),
    effects: [
      fx('luz-vazada', { speed: 1.5 }, { amount: [[0, 0], [0.45, 1], [0.9, 0]] }),
      fx('flash', { tint: '#ffd9a8', glow: 0.8 }, { amount: [[0, 0], [0.45, 0.75], [0.9, 0]] }),
    ],
  }),
  pack('passagem-glitch', t('Corte com glitch'), 'Passagens no corte', {
    ...moment(0.5, 'cut'),
    description: t('Falha digital bem no corte, como se o vídeo pulasse de canal.'),
    effects: [
      fx('glitch', { speed: 8, bands: 24 }, { intensity: [[0, 0], [0.25, 1], [0.5, 0]] }),
      fx('rgb-split', {}, { amount: [[0, 0], [0.25, 0.035], [0.5, 0]] }),
    ],
  }),
  pack('passagem-desfoque', t('Desfoque de passagem'), 'Passagens no corte', {
    ...moment(0.8, 'cut'),
    description: t('Desfoca até sumir e volta já no próximo clipe.'),
    effects: [fx('desfoque', {}, { radius: [[0, 0], [0.4, 26], [0.8, 0]] })],
  }),
  pack('passagem-preto', t('Mergulho no preto'), 'Passagens no corte', {
    ...moment(1, 'cut'),
    description: t('Escurece até o preto e volta no próximo clipe. A passagem de tempo clássica.'),
    effects: [fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0], [0.5, 1], [1, 0]] })],
  }),

  // ------------------------------------------------------------ Aberturas e finais
  pack('entrada-do-preto', t('Entrada do preto'), 'Aberturas e finais', {
    duration: 1.5,
    anchor: 'clip-start',
    description: t('O vídeo surge do preto, aos poucos.'),
    effects: [fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 1], [1.5, 0]] })],
  }),
  pack('saida-para-o-preto', t('Saída para o preto'), 'Aberturas e finais', {
    duration: 1.5,
    anchor: 'clip-end',
    description: t('O vídeo escurece até o preto no fim do clipe.'),
    effects: [fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0], [1.5, 1]] })],
  }),
  pack('abertura-com-luz', t('Abertura com luz'), 'Aberturas e finais', {
    duration: 2,
    anchor: 'clip-start',
    description: t('Começa num clarão branco e a câmera se afasta, revelando a cena.'),
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 1], [0.9, 0]] }),
      fx('brilho', { threshold: 0.4, radius: 24 }, { intensity: [[0, 1.6], [1.6, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.3, 'ease-out'], [2, 1.0]] }),
  }),
  pack('abertura-desfocada', t('Abertura desfocada'), 'Aberturas e finais', {
    duration: 2.5,
    anchor: 'clip-start',
    description: t('Começa fora de foco e vai ficando nítido.'),
    effects: [
      fx('desfoque', {}, { radius: [[0, 22], [2, 0]] }),
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0.6], [1.5, 0]] }),
    ],
  }),
  pack('final-de-video', t('Final de vídeo'), 'Aberturas e finais', {
    duration: 3,
    anchor: 'clip-end',
    description: t('A imagem desfoca e escurece para o encerramento.'),
    effects: [
      fx('desfoque', {}, { radius: [[0, 0], [1.2, 14]] }),
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0], [1.2, 0.55], [3, 0.55]] }),
    ],
  }),
  pack('final-com-zoom', t('Final com zoom'), 'Aberturas e finais', {
    duration: 2,
    anchor: 'clip-end',
    description: t('A câmera avança devagar e tudo some num branco suave.'),
    effects: [fx('flash', { tint: '#ffffff', glow: 0.7 }, { amount: [[0, 0, 'ease-in'], [2, 1]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [2, 1.35]] }),
  }),

  // ------------------------------------------------------------ Retrô e nostalgia
  pack('fita-vhs', t('Fita VHS'), 'Retrô e nostalgia', {
    description: t('Fita de videocassete: cor lavada, linhas, chiado e a imagem dançando.'),
    effects: [fx('vhs', { noise: 0.35, lines: 0.4 }), fx('estatica-tv', { amount: 0.12 })],
    filter: look('cor-de-vhs'),
  }),
  pack('super-8', t('Super 8'), 'Retrô e nostalgia', {
    description: t('Filme caseiro dos anos 70: grão forte, luz piscando, cantos escuros e quadro tremendo.'),
    effects: [
      fx('granulado', { amount: 0.5, size: 2, flicker: 0.6 }),
      fx('luz-vazada', { amount: 0.3, speed: 0.8 }),
      fx('vinheta', { intensity: 0.6, size: 0.35 }),
      fx('tremor', { intensity: 0.06, speed: 6, rotation: 0.15 }),
    ],
    filter: look('super-8'),
    camera: cam({}, { zoom: 1.04 }),
  }),
  pack('filme-antigo', t('Filme antigo'), 'Retrô e nostalgia', {
    description: t('Cinema mudo: preto e branco gasto, grão e tremor do projetor.'),
    effects: [
      fx('granulado', { amount: 0.6, size: 1.8, flicker: 0.8 }),
      fx('vinheta', { intensity: 0.7, size: 0.3 }),
      fx('tremor', { intensity: 0.05, speed: 10, rotation: 0.1 }),
    ],
    filter: look('ruido-de-filme'),
    camera: cam({}, { zoom: 1.04 }),
  }),
  pack('anos-80', t('Anos 80 neon'), 'Retrô e nostalgia', {
    description: t('Synthwave: néon rosa e azul, brilho e linhas de TV de tubo.'),
    effects: [fx('brilho', { threshold: 0.5, intensity: 1, radius: 18 }), fx('rgb-split', { amount: 0.004 }), fx('crt', { curvature: 0.2, lines: 0.35 })],
    filter: look('miami'),
  }),
  pack('memoria', t('Memória'), 'Retrô e nostalgia', {
    description: t('Lembrança distante: cores desbotadas, bordas claras e um leve desfoque.'),
    effects: [
      fx('desfoque', { radius: 1.5 }),
      fx('brilho', { threshold: 0.45, intensity: 0.8, radius: 20 }),
      fx('vinheta', { intensity: 0.45, tint: '#fff6e0', size: 0.4 }),
    ],
    filter: look('nostalgia'),
    fadeIn: 0.8,
    fadeOut: 0.8,
  }),
  pack('polaroid', t('Foto Polaroid'), 'Retrô e nostalgia', {
    description: t('Cor de foto instantânea com cantos escuros e um flash no começo.'),
    effects: [
      fx('vinheta', { intensity: 0.4 }),
      fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 0.9], [0.5, 0]] }),
    ],
    filter: look('polaroid-600'),
  }),

  // ------------------------------------------------------------ Sonho e romance
  pack('sonho', t('Sonho'), 'Sonho e romance', {
    description: t('Brilho difuso, tons pastel e partículas de luz. Entra e sai suave.'),
    effects: [fx('brilho', { threshold: 0.4, intensity: 1.2, radius: 24 }), fx('particulas-de-luz', { amount: 0.6, size: 1.2, hue: 0.9 })],
    filter: look('pastel', 0.8),
    fadeIn: 1,
    fadeOut: 1,
  }),
  pack('romantico', t('Romântico'), 'Sonho e romance', {
    description: t('Tons rosados, pele suave e luz quente vazando.'),
    effects: [fx('brilho', { threshold: 0.55, intensity: 0.7, radius: 18 }), fx('luz-vazada', { amount: 0.3, speed: 0.5 })],
    filter: look('rosado'),
    fadeIn: 0.6,
    fadeOut: 0.6,
  }),
  pack('flashback', t('Flashback'), 'Sonho e romance', {
    description: t('Entra com clarão e desfoque, fica desbotado e sai do mesmo jeito. Para lembranças.'),
    effects: [
      fx('desfoque', { radius: 2 }, { radius: [[0, 14], [0.8, 2], [5.2, 2], [6, 14]] }),
      fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 0.9], [0.8, 0], [5.2, 0], [6, 0.9]] }),
      fx('vinheta', { intensity: 0.5, tint: '#ffffff', size: 0.45 }),
    ],
    filter: look('mono-suave', 0.8),
  }),
  pack('golden-hour', t('Hora dourada'), 'Sonho e romance', {
    description: t('Luz de fim de tarde: dourado, reflexo de sol e brilho nas altas luzes.'),
    effects: [fx('lens-flare', { amount: 0.8, source: [0.78, 0.8] }), fx('brilho', { threshold: 0.6, intensity: 0.6, radius: 16 })],
    filter: look('brilho-dourado'),
  }),

  // ------------------------------------------------------------ Suspense e terror
  pack('suspense', t('Suspense'), 'Suspense e terror', {
    description: t('Tudo mais escuro e frio, com a câmera chegando perto bem devagar.'),
    effects: [fx('vinheta', { intensity: 0.8, size: 0.3 }), fx('granulado', { amount: 0.2 })],
    filter: look('sombrio'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [6, 1.22]] }),
  }),
  pack('terror', t('Terror'), 'Suspense e terror', {
    description: t('Cor doentia, chiado, visão dobrada e tremidas. Para cenas de susto.'),
    effects: [
      fx('visao-dupla', { amount: 0.25, speed: 0.8 }),
      fx('estatica-tv', { amount: 0.12 }),
      fx('tremor', { intensity: 0.08, speed: 12, rotation: 0.3 }),
      fx('vinheta', { intensity: 0.85, size: 0.28 }),
    ],
    filter: look('terror'),
    camera: cam({}, { zoom: 1.06 }),
  }),
  pack('camera-de-seguranca', t('Câmera de segurança'), 'Suspense e terror', {
    description: t('Gravação de vigilância: preto e branco granulado e chiado.'),
    effects: [fx('granulado', { amount: 0.45, size: 1.4 }), fx('estatica-tv', { amount: 0.18 }), fx('crt', { curvature: 0.15, lines: 0.5 })],
    filter: look('preto-e-branco', 1, {}, { contrast: 1.3 }),
  }),
  pack('visao-noturna', t('Visão noturna'), 'Suspense e terror', {
    description: t('Câmera de visão noturna verde, com grão e brilho.'),
    effects: [fx('visao-noturna', { gain: 2.2, grain: 0.45, binocular: 0 })],
  }),

  // ------------------------------------------------------------ Ação e games
  pack('adrenalina', t('Adrenalina'), 'Ação e games', {
    description: t('Contraste alto, cores fortes e a câmera avançando. Para esporte e ação.'),
    effects: [fx('ajuste-cor', { contrast: 1.2, saturation: 1.2 }), fx('vinheta', { intensity: 0.45 })],
    filter: look('hdr', 0.8),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [6, 1.12]] }),
  }),
  pack('gamer', t('Gamer'), 'Ação e games', {
    description: t('Visual de stream: cyberpunk, brilho nas luzes e falhas digitais leves.'),
    effects: [
      fx('brilho', { threshold: 0.5, intensity: 1, radius: 16 }),
      fx('rgb-split', { amount: 0.004 }),
      fx('glitch-digital', { amount: 0.12, rate: 4 }),
    ],
    filter: look('cyberpunk'),
  }),
  pack('momento-epico', t('Momento épico'), 'Ação e games', {
    description: t('Para o lance decisivo: entra com flash, fica dramático e com barras de cinema.'),
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 0.8], [0.5, 0]] }),
      fx('barras-cinema', { aspect: 2.39 }, { aspect: [[0, 1.78], [0.5, 2.39]] }),
      fx('vinheta', { intensity: 0.5 }),
    ],
    filter: look('dramatico', 0.8),
    camera: cam({ zoom: [[0, 1.15, 'ease-out'], [1.2, 1.25, 'linear'], [6, 1.32]] }),
    duration: 4,
  }),
  pack('matrix', t('Matrix'), 'Ação e games', {
    description: t('Tudo verde com chuva de código ao fundo. Dá para dosar na intensidade.'),
    effects: [fx('matrix', { backdrop: 0.75 })],
    filter: look('matrix'),
    intensity: 0.85,
  }),

  // ------------------------------------------------------------ Documentário e notícia
  pack('documentario', t('Documentário'), 'Documentário e notícia', {
    description: t('Imagem natural e caprichada e movimento lento de câmera.'),
    effects: [fx('vinheta', { intensity: 0.25 })],
    filter: look('aprimorar', 0.8),
    camera: cam({ zoom: [[0, 1.06, 'linear'], [6, 1.16]], x: [[0, 0.47, 'linear'], [6, 0.53]] }),
  }),
  pack('entrevista', t('Entrevista'), 'Documentário e notícia', {
    description: t('Pele suave e enquadramento mais fechado (segundo ângulo).'),
    effects: [fx('ajuste-cor', { temperature: 0.08, contrast: 1.04 })],
    filter: look('pele-suave', 0.7),
    camera: cam({}, { zoom: 1.2, y: 0.45 }),
  }),
  pack('plantao', t('Plantão'), 'Documentário e notícia', {
    description: t('Urgente: entra com flash e imagem contrastada.'),
    effects: [fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.8], [0.35, 0]] })],
    filter: look('contraste', 0.8),
    camera: cam({ zoom: [[0, 1.12, 'ease-out'], [0.4, 1.0]] }),
    duration: 5,
  }),
  pack('arquivo', t('Imagem de arquivo'), 'Documentário e notícia', {
    description: t('Parece material antigo de acervo: sépia, grão e cantos gastos.'),
    effects: [fx('granulado', { amount: 0.35, flicker: 0.4 }), fx('vinheta', { intensity: 0.55 })],
    filter: look('sepia'),
  }),

  // ------------------------------------------------------------ Clima e estações
  pack('dia-de-chuva', t('Dia de chuva'), 'Clima e estações', {
    description: t('Céu fechado, cor fria e chuva caindo por cima de tudo.'),
    effects: [fx('chuva', { amount: 0.7, slant: 0.15 }), fx('vinheta', { intensity: 0.4 })],
    filter: look('dias-de-chuva'),
  }),
  pack('inverno', t('Inverno com neve'), 'Clima e estações', {
    description: t('Tons gelados e neve caindo devagar.'),
    effects: [fx('neve', { amount: 0.85, speed: 0.5 })],
    filter: look('inverno'),
  }),
  pack('verao', t('Verão'), 'Clima e estações', {
    description: t('Calor: cores quentes e saturadas, sol na lente e a imagem ondulando de leve.'),
    effects: [fx('lens-flare', { amount: 0.9, source: [0.75, 0.82] }), fx('calor', { amount: 0.4, bottom: 0.4 })],
    filter: look('por-do-sol', 0.8),
  }),
  pack('outono', t('Outono'), 'Clima e estações', {
    description: t('Laranjas e marrons acolhedores, com luz vazando suave.'),
    effects: [fx('luz-vazada', { amount: 0.25, speed: 0.5 })],
    filter: look('outono'),
  }),

  // ------------------------------------------------------------ Edits virais
  pack('velocity', t('Velocity'), 'Edits virais', {
    duration: 3,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [1.8, 1.8, 0.25, 0.25, 1.8],
    description: t('O edit do TikTok: acelera, freia quase parando com um flash e acelera de novo. Ponha o cursor antes do momento alto.'),
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, {
        amount: [[0, 0], [speedTime([1.8, 1.8, 0.25, 0.25, 1.8], 3, 0.4), 0.9, 'ease-out'], [speedTime([1.8, 1.8, 0.25, 0.25, 1.8], 3, 0.48), 0]],
      }),
      fx('desfoque-radial', {}, {
        strength: [[0, 0.45], [speedTime([1.8, 1.8, 0.25, 0.25, 1.8], 3, 0.4), 0.1], [speedTime([1.8, 1.8, 0.25, 0.25, 1.8], 3, 0.8), 0.1], [3, 0.5]],
      }),
      fx('rgb-split', { amount: 0.004 }),
    ],
    filter: look('vivido', 0.6),
    camera: cam({
      zoom: [[0, 1.0, 'ease-in'], [speedTime([1.8, 1.8, 0.25, 0.25, 1.8], 3, 0.4), 1.25, 'linear'], [speedTime([1.8, 1.8, 0.25, 0.25, 1.8], 3, 0.8), 1.32, 'ease-out'], [3, 1.0]],
    }),
  }),
  pack('glow-edit', t('Glow edit'), 'Edits virais', {
    description: t('Brilho estourado nas luzes, cores vivas e partículas. O visual "aesthetic" das edições de fã.'),
    effects: [
      fx('brilho', { threshold: 0.35, intensity: 1.6, radius: 30 }),
      fx('particulas-de-luz', { amount: 0.7, size: 1.1, hue: 0.85 }),
      fx('vinheta', { intensity: 0.4 }),
    ],
    filter: look('vivido', 0.7),
    camera: cam({ zoom: [[0, 1.02, 'linear'], [6, 1.1]] }),
    fadeIn: 0.3,
    fadeOut: 0.3,
  }),
  pack('edit-de-carro', t('Edit de carro'), 'Edits virais', {
    description: t('Noite de cidade, sensação de velocidade (desfoque de movimento e tremor) e brilho nos faróis.'),
    effects: [
      fx('desfoque-radial', { strength: 0.22 }),
      fx('tremor', { intensity: 0.12, speed: 14, rotation: 0.2 }),
      fx('brilho', { threshold: 0.5, intensity: 1.2, radius: 20 }),
      fx('vinheta', { intensity: 0.55 }),
    ],
    filter: look('neo-noir', 0.9),
    camera: cam({ zoom: [[0, 1.12, 'linear'], [6, 1.22]] }),
  }),
  pack('edit-sombrio', t('Edit sombrio'), 'Edits virais', {
    duration: 4,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.6],
    description: t('Mais lento, escuro e granulado, com a câmera chegando perto. Para edits "dark".'),
    effects: [fx('granulado', { amount: 0.3, size: 1.5 }), fx('vinheta', { intensity: 0.8, size: 0.3 }), fx('rgb-split', { amount: 0.003 })],
    filter: look('sombrio'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4, 1.18]] }),
    fadeIn: 0.3,
    fadeOut: 0.3,
  }),
  pack('shake-edit', t('Shake de edit'), 'Edits virais', {
    ...moment(1.2),
    description: t('Três tremidas fortes em sequência, com cor separada. Para o drop da música.'),
    effects: [
      fx('tremor', { speed: 22, rotation: 0.7 }, { intensity: [[0, 0.9, 'ease-out'], [0.18, 0.1], [0.4, 0.9, 'ease-out'], [0.58, 0.1], [0.8, 0.9, 'ease-out'], [1.2, 0]] }),
      fx('rgb-split', {}, { amount: [[0, 0.025], [0.18, 0.004], [0.4, 0.025], [0.58, 0.004], [0.8, 0.025], [1.2, 0]] }),
    ],
    camera: cam({}, { zoom: 1.14 }),
  }),
  pack('anime-edit', t('Edit de anime'), 'Edits virais', {
    duration: 4,
    timing: 'stretch',
    anchor: 'cursor',
    description: t('Entra com clarão, cores de anime, linhas de velocidade (desfoque radial) e brilho.'),
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 1], [0.4, 0]] }),
      fx('desfoque-radial', {}, { strength: [[0, 0.7], [0.8, 0.15], [4, 0.15]] }),
      fx('brilho', { threshold: 0.45, intensity: 1.2, radius: 22 }),
      fx('particulas-de-luz', { amount: 0.5, hue: 0.55 }),
    ],
    filter: look('pop', 0.7),
    camera: cam({ zoom: [[0, 1.35, 'ease-out'], [0.8, 1.1, 'linear'], [4, 1.18]] }),
  }),
  pack('dolly-3d', t('Zoom 3D'), 'Edits virais', {
    ...moment(1.6),
    description: t('A câmera avança enquanto a imagem entorta nas bordas, dando sensação de profundidade.'),
    effects: [fx('olho-de-peixe', {}, { strength: [[0, 0], [0.8, 0.45], [1.6, 0]] })],
    camera: cam({ zoom: [[0, 1.0], [0.8, 1.45], [1.6, 1.0]] }),
  }),
  pack('pov', t('POV'), 'Edits virais', {
    duration: 5,
    anchor: 'cursor',
    description: t('Cor suave e a câmera respirando, no clima dos vídeos de POV.'),
    effects: [fx('vinheta', { intensity: 0.3 })],
    filter: look('suave', 0.7),
    camera: cam({ zoom: [[0, 1.04], [2.5, 1.1], [5, 1.04]] }),
  }),
  pack('flash-de-drop', t('Drop'), 'Edits virais', {
    ...moment(1.4),
    description: t('O drop da música: tela branca, zoom de impacto, tremida e brilho que vai baixando.'),
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 1, 'ease-out'], [0.35, 0]] }),
      fx('tremor', { speed: 20, rotation: 0.5 }, { intensity: [[0, 0.8, 'ease-out'], [1.0, 0]] }),
      fx('brilho', { threshold: 0.4, radius: 26 }, { intensity: [[0, 2, 'ease-out'], [1.4, 0.2]] }),
    ],
    camera: cam({ zoom: [[0, 1.4, 'ease-out'], [0.6, 1.12], [1.4, 1.05]] }),
  }),

  // ------------------------------------------------------------ Batidas da música
  pack('zoom-nas-batidas', t('Zoom nas batidas'), 'Batidas da música', {
    ...onBeats({ 'camera.zoom': pulse(1, [[0, 1.12, 'ease-out'], [0.28, 1]]) }),
    description: t('Detecta as batidas da música e dá um zoom rápido em cada uma.'),
  }),
  pack('flash-nas-batidas', t('Flash nas batidas'), 'Batidas da música', {
    ...onBeats({ 'effects.0.amount': pulse(0, [[0, 0.6], [0.18, 0]]) }),
    description: t('Um clarão branco em cada batida.'),
    effects: [fx('flash', { tint: '#ffffff', glow: 0.6, amount: 0 })],
  }),
  pack('tremida-nas-batidas', t('Tremida nas batidas'), 'Batidas da música', {
    ...onBeats({ 'effects.0.intensity': pulse(0, [[0, 0.85], [0.3, 0]]) }),
    description: t('A imagem treme em cada batida e acalma até a próxima.'),
    effects: [fx('tremor', { speed: 20, rotation: 0.5, intensity: 0 })],
    camera: cam({}, { zoom: 1.1 }),
  }),
  pack('zoom-alternado', t('Zoom alternado'), 'Batidas da música', {
    ...onBeats({ 'camera.zoom': pulse(1.08, [[0, 1.24, 'ease-out'], [0.3, 1.08]], [[0, 1.0, 'ease-out'], [0.3, 1.08]]) }),
    description: t('Aproxima numa batida, afasta na outra. Dá muito ritmo a vídeos de dança.'),
  }),
  pack('giro-nas-batidas', t('Giro nas batidas'), 'Batidas da música', {
    ...onBeats({
      'camera.rotation': pulse(0, [[0, 5, 'ease-out'], [0.3, 0]], [[0, -5, 'ease-out'], [0.3, 0]]),
      'camera.zoom': pulse(1.15, [[0, 1.24, 'ease-out'], [0.3, 1.15]]),
    }),
    description: t('A câmera inclina para um lado e para o outro a cada batida.'),
  }),
  pack('rgb-nas-batidas', t('Cor separada nas batidas'), 'Batidas da música', {
    ...onBeats({ 'effects.0.amount': pulse(0, [[0, 0.03], [0.22, 0]]), 'camera.zoom': pulse(1, [[0, 1.06, 'ease-out'], [0.22, 1]]) }),
    description: t('O vermelho e o azul se separam em cada batida, com um zoom leve.'),
    effects: [fx('rgb-split', { amount: 0 })],
  }),
  pack('brilho-nas-batidas', t('Brilho nas batidas'), 'Batidas da música', {
    ...onBeats({ 'effects.0.intensity': pulse(0.2, [[0, 1.9], [0.35, 0.2]]) }),
    description: t('As luzes estouram em cada batida e voltam ao normal.'),
    effects: [fx('brilho', { threshold: 0.4, radius: 26, intensity: 0.2 })],
  }),
  pack('pb-nas-batidas', t('P&B nas batidas'), 'Batidas da música', {
    ...onBeats({ 'filter.intensity': pulse(0, [[0, 1, 'hold'], [0.16, 0]]) }),
    description: t('A imagem pisca em preto e branco em cada batida.'),
    filter: look('alto-contraste-pb', 0),
  }),
  pack('estrobo', t('Estrobo'), 'Batidas da música', {
    ...onBeats({ 'effects.0.amount': pulse(0, [[0, 1, 'hold'], [0.06, 0]]) }),
    description: t('Luz de balada: um piscão branco seco em cada batida.'),
    effects: [fx('flash', { tint: '#ffffff', glow: 0.3, amount: 0 })],
  }),
  pack('batida-forte', t('Batida forte (a cada 4)'), 'Batidas da música', {
    ...onBeats(
      {
        'camera.zoom': pulse(1, [[0, 1.3, 'ease-out'], [0.4, 1]]),
        'effects.0.amount': pulse(0, [[0, 0.7], [0.25, 0]]),
        'effects.1.amount': pulse(0, [[0, 0.035], [0.35, 0]]),
      },
      4,
    ),
    description: t('Um impacto grande (zoom, flash e cor separada) a cada quatro batidas, no tempo forte do compasso.'),
    effects: [fx('flash', { tint: '#ffffff', glow: 0.6, amount: 0 }), fx('rgb-split', { amount: 0 })],
  }),
  pack('glitch-nas-batidas', t('Glitch nas batidas'), 'Batidas da música', {
    ...onBeats({ 'effects.0.amount': pulse(0, [[0, 0.85], [0.16, 0]]) }),
    description: t('Uma falha digital curta em cada batida.'),
    effects: [fx('glitch-digital', { blocks: 16, rate: 24, amount: 0 })],
  }),
  pack('desfoque-nas-batidas', t('Puxão nas batidas'), 'Batidas da música', {
    ...onBeats({ 'effects.0.strength': pulse(0, [[0, 0.55], [0.26, 0]]), 'camera.zoom': pulse(1, [[0, 1.1, 'ease-out'], [0.26, 1]]) }),
    description: t('Zoom com desfoque de movimento em cada batida, como se a câmera fosse puxada.'),
    effects: [fx('desfoque-radial', { strength: 0 })],
  }),
  pack('cores-nas-batidas', t('Cores alternadas'), 'Batidas da música', {
    ...onBeats({
      'effects.0.amount': pulse(0, [[0, 0.45], [0.22, 0]], [[0, 0]]),
      'effects.1.amount': pulse(0, [[0, 0]], [[0, 0.45], [0.22, 0]]),
    }),
    description: t('Piscadas rosa e azul alternando a cada batida.'),
    effects: [fx('flash', { tint: '#ff2f92', glow: 0.7, amount: 0 }), fx('flash', { tint: '#2fd5ff', glow: 0.7, amount: 0 })],
  }),
  pack('vinheta-nas-batidas', t('Pulso escuro'), 'Batidas da música', {
    ...onBeats({ 'effects.0.intensity': pulse(0.3, [[0, 0.95], [0.3, 0.3]]), 'camera.zoom': pulse(1.02, [[0, 1.08, 'ease-out'], [0.3, 1.02]]) }),
    description: t('As bordas fecham no escuro a cada batida, como um coração batendo.'),
    effects: [fx('vinheta', { intensity: 0.3, size: 0.3 })],
  }),
  pack('neon-nas-batidas', t('Neon pulsante'), 'Batidas da música', {
    ...onBeats({ 'effects.0.intensity': pulse(0.5, [[0, 2], [0.35, 0.5]]), 'camera.zoom': pulse(1, [[0, 1.07, 'ease-out'], [0.3, 1]]) }),
    description: t('Cor de noite neon com o brilho pulsando no ritmo.'),
    effects: [fx('brilho', { threshold: 0.45, radius: 24, intensity: 0.5 })],
    filter: look('noite-neon'),
  }),

  // ------------------------------------------------------------ Câmera em movimento
  pack('camera-na-mao', t('Câmera na mão'), 'Câmera em movimento', {
    description: t('Balanço natural de câmera na mão, com um deslize lento. Tira a cara de vídeo parado.'),
    effects: [fx('tremor', { intensity: 0.07, speed: 2.5, rotation: 0.35 })],
    camera: cam({ x: [[0, 0.48, 'linear'], [6, 0.52]] }, { zoom: 1.1 }),
  }),
  pack('aproximacao', t('Aproximação lenta'), 'Câmera em movimento', {
    description: t('A câmera vai chegando perto devagar, como num carrinho (dolly) de cinema.'),
    camera: cam({ zoom: [[0, 1.0], [6, 1.3]] }),
  }),
  pack('revelacao', t('Revelação'), 'Câmera em movimento', {
    description: t('Começa fechado e vai abrindo até mostrar a cena inteira.'),
    camera: cam({ zoom: [[0, 1.4], [6, 1.0]] }),
  }),
  pack('crash-zoom', t('Crash zoom'), 'Câmera em movimento', {
    ...moment(0.7),
    description: t('Zoom violento e rápido que fica parado lá na frente. Clássico de filme de ação e de comédia.'),
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0], [0.18, 0.85], [0.4, 0]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [0.2, 1.8, 'hold']] }),
  }),
  pack('orbita', t('Órbita'), 'Câmera em movimento', {
    description: t('A câmera gira devagar em volta do assunto enquanto se aproxima.'),
    camera: cam({ rotation: [[0, -3.5, 'linear'], [6, 3.5]], zoom: [[0, 1.15, 'linear'], [6, 1.28]], x: [[0, 0.47, 'linear'], [6, 0.53]] }),
  }),
  pack('angulo-holandes', t('Ângulo holandês'), 'Câmera em movimento', {
    description: t('A imagem fica inclinada, dando tensão. Entra e sai inclinando suave.'),
    camera: cam({ rotation: [[0, 0, 'ease-out'], [0.8, -7], [5.2, -7], [6, 0]], zoom: [[0, 1.0], [0.8, 1.2], [5.2, 1.2], [6, 1.0]] }),
  }),
  pack('descendo', t('Descendo pela cena'), 'Câmera em movimento', {
    description: t('A câmera começa no alto e desce, revelando o que está embaixo.'),
    camera: cam({ y: [[0, 0.3], [6, 0.65]] }, { zoom: 1.4 }),
  }),
  pack('subindo', t('Subindo pela cena'), 'Câmera em movimento', {
    description: t('A câmera sobe do chão até o céu.'),
    camera: cam({ y: [[0, 0.7], [6, 0.35]] }, { zoom: 1.4 }),
  }),
  pack('travelling', t('Travelling lateral'), 'Câmera em movimento', {
    description: t('A câmera desliza de lado, como num trilho.'),
    camera: cam({ x: [[0, 0.36, 'linear'], [6, 0.64]] }, { zoom: 1.32 }),
  }),
  pack('terremoto-camera', t('Terremoto'), 'Câmera em movimento', {
    duration: 3,
    anchor: 'cursor',
    fadeIn: 0.3,
    fadeOut: 0.6,
    description: t('Chão tremendo de verdade: tremor forte e contínuo, que entra e sai aos poucos.'),
    effects: [fx('tremor', { intensity: 0.6, speed: 14, rotation: 0.8 }), fx('desfoque-radial', { strength: 0.12 })],
    camera: cam({}, { zoom: 1.18 }),
  }),
  pack('pendulo', t('Pêndulo'), 'Câmera em movimento', {
    description: t('A câmera balança de um lado para o outro, como se estivesse pendurada. Bom para sonhos e embriaguez.'),
    timing: 'stretch',
    camera: cam({ rotation: [[0, 0], [1.5, 4], [3, -4], [4.5, 4], [6, 0]] }, { zoom: 1.16 }),
  }),
  pack('flutuando', t('Flutuando'), 'Câmera em movimento', {
    description: t('A imagem flutua suave, como se a câmera estivesse na água ou no espaço.'),
    timing: 'stretch',
    camera: cam(
      { x: [[0, 0.5], [1.5, 0.53], [3, 0.5], [4.5, 0.47], [6, 0.5]], y: [[0, 0.48], [1.5, 0.5], [3, 0.52], [4.5, 0.5], [6, 0.48]] },
      { zoom: 1.14 },
    ),
  }),
  pack('drone-subindo', t('Drone decolando'), 'Câmera em movimento', {
    description: t('Visão de drone subindo: afasta, sobe e gira de leve.'),
    camera: cam({ zoom: [[0, 1.45], [6, 1.05]], y: [[0, 0.56], [6, 0.46]], rotation: [[0, -2.5, 'linear'], [6, 2.5]] }),
  }),
  pack('push-dramatico', t('Push dramático'), 'Câmera em movimento', {
    duration: 4,
    anchor: 'cursor',
    description: t('Avanço que acelera e escurece as bordas. Para a frase mais importante.'),
    effects: [fx('vinheta', { size: 0.35 }, { intensity: [[0, 0.2], [4, 0.75]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [4, 1.5]] }),
  }),
  pack('giro-completo', t('Giro completo'), 'Câmera em movimento', {
    ...moment(1, 'cut'),
    description: t('A imagem dá uma volta inteira no corte, com desfoque. Fica centrado na junção.'),
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0], [0.5, 0.9], [1, 0]] })],
    camera: cam({ rotation: [[0, 0, 'ease-in'], [0.5, 180, 'ease-out'], [1, 360]], zoom: [[0, 1.0, 'ease-in'], [0.5, 2.1, 'ease-out'], [1, 1.0]] }),
  }),

  // ------------------------------------------------------------ Seguir rosto
  pack('close-no-rosto', t('Close no rosto'), 'Seguir rosto', {
    description: t('Encontra o rosto em cada momento e mantém a pessoa enquadrada de perto. Ótimo para vídeos verticais.'),
    face: { zoom: 'auto', smoothness: 0.6 },
    camera: cam({}),
  }),
  pack('chegando-no-rosto', t('Chegando no rosto'), 'Seguir rosto', {
    description: t('A câmera vai se aproximando do rosto ao longo do trecho, sempre com a pessoa no centro.'),
    face: { zoom: 1, smoothness: 0.6 },
    camera: cam({ zoom: [[0, 1.0], [6, 1.8]] }),
  }),
  pack('entrevista-dinamica', t('Entrevista dinâmica'), 'Seguir rosto', {
    duration: 12,
    timing: 'stretch',
    description: t('Alterna entre plano aberto e fechado a cada poucos segundos, sempre no rosto, como se fossem duas câmeras.'),
    face: { zoom: 1, smoothness: 0.5 },
    camera: cam({ zoom: [[0, 1.05, 'hold'], [3, 1.45, 'hold'], [6, 1.05, 'hold'], [9, 1.45, 'hold']] }),
  }),
  pack('foco-no-rosto', t('Foco no rosto'), 'Seguir rosto', {
    description: t('Rosto no centro, pele suave e o resto da imagem escurecendo em volta.'),
    face: { zoom: 1.3, smoothness: 0.8 },
    effects: [fx('vinheta', { intensity: 0.65, size: 0.3, softness: 0.5 })],
    filter: look('pele-suave', 0.6),
    camera: cam({}),
  }),

  // ------------------------------------------------------------ Câmera lenta e velocidade
  pack('camera-lenta', t('Câmera lenta 50%'), 'Câmera lenta e velocidade', {
    duration: 3,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.5],
    description: t('Deixa os próximos 3 segundos na metade da velocidade, com os quadros criados pelo movimento (fluido).'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [3, 1.06]] }),
  }),
  pack('camera-lenta-dramatica', t('Câmera lenta dramática'), 'Câmera lenta e velocidade', {
    duration: 2,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.25],
    description: t('Quatro vezes mais lento, com barras de cinema entrando, cor dramática e grão.'),
    effects: [
      fx('barras-cinema', { aspect: 2.39 }, { aspect: [[0, 1.78], [0.25, 2.39]] }),
      fx('vinheta', { intensity: 0.5 }),
      fx('granulado', { amount: 0.18 }),
    ],
    filter: look('dramatico', 0.75),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [2, 1.15]] }),
  }),
  pack('rampa-suave', t('Rampa de velocidade'), 'Câmera lenta e velocidade', {
    duration: 4,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [1, 0.7, 0.45, 0.3, 0.3, 0.45, 0.7, 1],
    description: t('Vai freando até ficar bem lento e depois volta à velocidade normal, em degraus suaves.'),
  }),
  pack('rampa-de-acao', t('Rampa de ação'), 'Câmera lenta e velocidade', {
    duration: 3,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [2, 2, 0.3, 0.3, 0.3, 2],
    description: t('Rápido, quase parando no momento da ação (com flash) e rápido de novo.'),
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, {
        amount: [[0, 0], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.333), 0.8, 'ease-out'], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.4), 0]],
      }),
      fx('desfoque-radial', {}, { strength: [[0, 0.35], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.333), 0], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.84), 0], [3, 0.35]] }),
    ],
    camera: cam({ zoom: [[0, 1.0], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.333), 1.2], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.84), 1.25], [3, 1.0]] }),
  }),
  pack('acelera-e-freia', t('Acelera e freia'), 'Câmera lenta e velocidade', {
    duration: 4,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.5, 1, 2, 3, 1, 0.4],
    description: t('Começa lento, dispara e freia no fim. Bom para entradas de personagem e manobras.'),
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0], [speedTime([0.5, 1, 2, 3, 1, 0.4], 4, 0.55), 0.4], [speedTime([0.5, 1, 2, 3, 1, 0.4], 4, 0.7), 0]] })],
  }),
  pack('acelerado-2x', t('Acelerado 2×'), 'Câmera lenta e velocidade', {
    duration: 4,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [2],
    description: t('Os próximos 4 segundos passam no dobro da velocidade.'),
  }),
  pack('timelapse', t('Timelapse'), 'Câmera lenta e velocidade', {
    duration: 12,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [6],
    description: t('Seis vezes mais rápido, com cores realçadas. Para céu, trânsito e preparo de comida.'),
    effects: [fx('ajuste-cor', { saturation: 1.15, contrast: 1.08 })],
    filter: look('hdr', 0.6),
  }),
  pack('bullet-time', t('Bullet time'), 'Câmera lenta e velocidade', {
    duration: 1.5,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.2],
    description: t('Quase parado, com a câmera girando em volta e as cores lavadas. O efeito do Matrix.'),
    effects: [fx('desfoque-radial', { strength: 0.12 }), fx('brilho', { threshold: 0.55, intensity: 0.8, radius: 18 })],
    filter: look('bleach-bypass', 0.8),
    camera: cam({ rotation: [[0, -6, 'linear'], [1.5, 6]], zoom: [[0, 1.2, 'linear'], [1.5, 1.32]] }),
  }),
  pack('lento-com-flash', t('Lento com flash'), 'Câmera lenta e velocidade', {
    duration: 2,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [1, 0.35, 0.35, 0.35],
    description: t('Velocidade normal, um flash e o resto do trecho em câmera lenta.'),
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, {
        amount: [[0, 0], [speedTime([1, 0.35, 0.35, 0.35], 2, 0.25), 0.9, 'ease-out'], [speedTime([1, 0.35, 0.35, 0.35], 2, 0.3), 0]],
      }),
    ],
  }),
  pack('lento-sonhador', t('Lento e sonhador'), 'Câmera lenta e velocidade', {
    duration: 3,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.4],
    fadeIn: 0.5,
    fadeOut: 0.5,
    description: t('Câmera lenta com brilho difuso e tons pastel. Para momentos bonitos.'),
    effects: [fx('brilho', { threshold: 0.4, intensity: 1.1, radius: 24 })],
    filter: look('pastel', 0.8),
  }),
  pack('avanco-rapido', t('Avanço rápido'), 'Câmera lenta e velocidade', {
    duration: 8,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [4],
    description: t('Como apertar o avanço do videocassete: quatro vezes mais rápido, com cara de VHS.'),
    effects: [fx('vhs', { noise: 0.3, lines: 0.5, wobble: 0.6 })],
  }),

  // ------------------------------------------------------------ Comédia e memes
  pack('zoom-dramatico', t('Zoom dramático'), 'Comédia e memes', {
    ...moment(1.6),
    description: t('O zoom de novela no rosto de quem reagiu, com cara de drama. Procura o rosto sozinho.'),
    face: { zoom: 1, smoothness: 0.25 },
    effects: [fx('vinheta', { size: 0.35 }, { intensity: [[0, 0], [0.3, 0.7]] })],
    filter: look('dramatico', 0.7),
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.3, 2.2, 'hold']] }),
  }),
  pack('olhar-pra-camera', t('Olhar pra câmera'), 'Comédia e memes', {
    duration: 3,
    anchor: 'cursor',
    description: t('O zoom lento de "The Office" quando alguém encara a câmera depois de uma situação absurda.'),
    face: { zoom: 1, smoothness: 0.8 },
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [3, 1.6]] }),
  }),
  pack('zoom-triplo', t('Zoom triplo'), 'Comédia e memes', {
    ...moment(2),
    description: t('Tum, tum, TUM: três zooms secos cada vez mais perto do rosto.'),
    face: { zoom: 1, smoothness: 0.2 },
    effects: [fx('tremor', { speed: 20, rotation: 0.4 }, { intensity: [[0, 0], [1.2, 0.5, 'ease-out'], [1.6, 0]] })],
    camera: cam({ zoom: [[0, 1.0, 'hold'], [0.4, 1.35, 'hold'], [0.8, 1.75, 'hold'], [1.2, 2.3, 'hold']] }),
  }),
  pack('vine-boom', t('Vine boom'), 'Comédia e memes', {
    ...moment(1),
    description: t('Zoom seco, tremida e cor estourada: o "BOOM" dos memes.'),
    effects: [
      fx('tremor', { speed: 24, rotation: 0.6 }, { intensity: [[0, 0.9, 'ease-out'], [0.45, 0]] }),
      fx('rgb-split', {}, { amount: [[0, 0.035], [0.35, 0]] }),
      fx('ajuste-cor', { contrast: 1.35, saturation: 1.5 }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.08, 1.38, 'hold']] }),
  }),
  pack('meme-frito', t('Meme frito'), 'Comédia e memes', {
    duration: 3,
    anchor: 'cursor',
    description: t('Contraste e saturação absurdos, nitidez exagerada e chiado. O famoso "deep fried".'),
    effects: [
      fx('ajuste-cor', { contrast: 1.9, saturation: 2, brightness: 0.06 }),
      fx('rgb-split', { amount: 0.006 }),
      fx('granulado', { amount: 0.35, size: 1.2 }),
      fx('tremor', { intensity: 0.05, speed: 18, rotation: 0.2 }),
    ],
    filter: look('nitidez-4k'),
    camera: cam({}, { zoom: 1.06 }),
  }),
  pack('silencio-constrangedor', t('Silêncio constrangedor'), 'Comédia e memes', {
    duration: 4,
    anchor: 'cursor',
    description: t('Cores sem graça e zoom lento, para aquele silêncio que ninguém sabe quebrar.'),
    filter: look('mono-suave', 0.55),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4, 1.15]] }),
  }),
  pack('e-foi-ai', t('E foi aí que…'), 'Comédia e memes', {
    duration: 4,
    anchor: 'cursor',
    description: t('A imagem fica em preto e branco, no clima de "e foi aí que tudo deu errado".'),
    effects: [fx('vinheta', { intensity: 0.6 }), fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 0.8], [0.4, 0]] })],
    filter: look('preto-e-branco'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4, 1.12]] }),
  }),
  pack('reacao', t('Reação'), 'Comédia e memes', {
    ...moment(1.8),
    description: t('Zoom de susto no rosto com flash.'),
    face: { zoom: 1, smoothness: 0.2 },
    effects: [fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.7, 'ease-out'], [0.25, 0]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.12, 1.9, 'hold']] }),
  }),
  pack('falhou', t('Falhou'), 'Comédia e memes', {
    ...moment(1.6),
    description: t('Falha digital e tremida: deu ruim.'),
    effects: [
      fx('glitch-digital', { blocks: 18, rate: 18 }, { amount: [[0, 0.9], [0.5, 0.2], [1.6, 0.1]] }),
      fx('tremor', { speed: 18, rotation: 0.3 }, { intensity: [[0, 0.6], [0.6, 0]] }),
    ],
    filter: look('desbotado', 0.8),
  }),
  pack('momento-triste', t('Momento triste'), 'Comédia e memes', {
    duration: 4,
    anchor: 'cursor',
    fadeIn: 0.4,
    description: t('Chuva, cores frias e câmera chegando perto. Para quando algo dá muito errado (ou muito certo).'),
    effects: [fx('chuva', { amount: 0.6, slant: 0.1 }), fx('vinheta', { intensity: 0.5 })],
    filter: look('melancolia'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4, 1.15]] }),
  }),
  pack('surto', t('Surto'), 'Comédia e memes', {
    duration: 2,
    anchor: 'cursor',
    description: t('Tela vermelha, tremida e zoom: alguém perdeu a paciência.'),
    effects: [
      fx('flash', { tint: '#ff1a1a', glow: 0 }, { amount: [[0, 0.5], [0.3, 0.25], [2, 0.25]] }),
      fx('tremor', { intensity: 0.55, speed: 22, rotation: 0.6 }),
      fx('rgb-split', { amount: 0.012 }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.15, 1.3]] }),
  }),
  pack('pensando', t('Pensando…'), 'Comédia e memes', {
    duration: 3,
    anchor: 'cursor',
    fadeIn: 0.4,
    fadeOut: 0.4,
    description: t('Bordas claras e enevoadas de imaginação.'),
    effects: [fx('vinheta', { intensity: 0.7, tint: '#ffffff', size: 0.35 }), fx('brilho', { threshold: 0.45, intensity: 0.9, radius: 22 })],
    filter: look('pastel', 0.6),
  }),
  pack('quadrinho', t('Quadrinho'), 'Comédia e memes', {
    ...moment(1.6),
    description: t('Vira página de gibi por um instante, com zoom.'),
    effects: [fx('meio-tom', { size: 6, colorful: 1 }), fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.8], [0.2, 0]] })],
    filter: look('pop'),
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.12, 1.25, 'hold']] }),
  }),
  pack('plot-twist', t('Plot twist'), 'Comédia e memes', {
    ...moment(2.4),
    description: t('Efeito vertigem (a cena "estica") e clarão: a reviravolta.'),
    effects: [
      fx('olho-de-peixe', {}, { strength: [[0, 0], [1.2, 0.5], [2.4, 0.3]] }),
      fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.8], [0.3, 0]] }),
    ],
    filter: look('dramatico', 0.8),
    camera: cam({ zoom: [[0, 1.6, 'ease'], [2.4, 1.05]] }),
  }),
  pack('camera-escondida', t('Câmera escondida'), 'Comédia e memes', {
    description: t('Imagem de pegadinha: bordas fechadas, granulada e balançando.'),
    effects: [
      fx('vinheta', { intensity: 0.9, size: 0.22, softness: 0.6 }),
      fx('granulado', { amount: 0.35 }),
      fx('tremor', { intensity: 0.06, speed: 3, rotation: 0.2 }),
    ],
    filter: look('desbotado', 0.6),
    camera: cam({}, { zoom: 1.1 }),
  }),
  pack('bonk', t('Bonk'), 'Comédia e memes', {
    ...moment(0.6),
    description: t('Pancada de desenho animado: a imagem chacoalha de lado e volta.'),
    camera: cam({ rotation: [[0, 0], [0.05, 7], [0.13, -5], [0.22, 3], [0.32, -1.5], [0.42, 0]], zoom: [[0, 1.0], [0.05, 1.22], [0.42, 1.08], [0.6, 1.0]] }),
    effects: [fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.5], [0.12, 0]] })],
  }),
  pack('modo-acelerado', t('Modo acelerado'), 'Comédia e memes', {
    duration: 6,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [3],
    description: t('Três vezes mais rápido, cores vivas e tremidinha: a pessoa correndo de um jeito engraçado.'),
    effects: [fx('tremor', { intensity: 0.08, speed: 16, rotation: 0.2 })],
    filter: look('vivido', 0.6),
    camera: cam({}, { zoom: 1.06 }),
  }),

  // ---------------- Comédia em câmera lenta
  pack('queda-epica', t('Queda épica'), 'Comédia e memes', {
    ...slow([1, 0.25, 0.25, 0.25], 2),
    description: t('Velocidade normal até o tombo, que vira câmera lenta de filme.'),
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 0], [speedTime([1, 0.25, 0.25, 0.25], 2, 0.25), 0.7, 'ease-out'], [speedTime([1, 0.25, 0.25, 0.25], 2, 0.3), 0]] }),
      fx('vinheta', { intensity: 0.55 }),
      fx('barras-cinema', { aspect: 2.39 }, { aspect: [[0, 1.78], [speedTime([1, 0.25, 0.25, 0.25], 2, 0.3), 2.39]] }),
    ],
    filter: look('dramatico', 0.7),
    camera: cam({ zoom: [[0, 1.0], [speedTime([1, 0.25, 0.25, 0.25], 2, 0.25), 1.05, 'linear'], [2, 1.3]] }),
  }),
  pack('nao-acredito', t('Não acredito'), 'Comédia e memes', {
    ...slow([0.3], 1.5),
    description: t('Câmera lenta chegando no rosto de quem não acredita no que viu, com cor lavada.'),
    face: { zoom: 1, smoothness: 0.6 },
    effects: [fx('vinheta', { intensity: 0.5 })],
    filter: look('mono-suave', 0.6),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [1.5, 1.9]] }),
  }),
  pack('derrota-dramatica', t('Derrota dramática'), 'Comédia e memes', {
    ...slow([0.35], 2),
    fadeIn: 0.3,
    description: t('Perdeu: câmera lenta, chuva e cor triste.'),
    effects: [fx('chuva', { amount: 0.7, slant: 0.12 }), fx('vinheta', { intensity: 0.65 })],
    filter: look('melancolia'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [2, 1.2]] }),
  }),
  pack('vitoria-epica', t('Vitória épica'), 'Comédia e memes', {
    ...slow([1, 0.3, 0.3], 2),
    description: t('Ganhou (nem que seja no par ou ímpar): câmera lenta dourada e raios de luz.'),
    effects: [
      fx('flash', { tint: '#ffe7a8', glow: 0.7 }, { amount: [[0, 0], [speedTime([1, 0.3, 0.3], 2, 0.333), 0.9, 'ease-out'], [speedTime([1, 0.3, 0.3], 2, 0.4), 0]] }),
      fx('raios-de-luz', { amount: 1.2, source: [0.5, 0.85] }),
      fx('brilho', { threshold: 0.5, intensity: 1, radius: 22 }),
      fx('lens-flare', { amount: 0.7, source: [0.75, 0.8] }),
    ],
    filter: look('ouro', 0.8),
    camera: cam({ zoom: [[0, 1.0], [speedTime([1, 0.3, 0.3], 2, 0.333), 1.1, 'linear'], [2, 1.25]] }),
  }),
  pack('comemoracao', t('Comemoração em câmera lenta'), 'Comédia e memes', {
    ...slow([0.4], 2),
    description: t('O grito de gol de qualquer coisa: câmera lenta, partículas, brilho e tremidinha.'),
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 0.8], [0.3, 0]] }),
      fx('particulas-de-luz', { amount: 1.4, size: 1.4, speed: 1, hue: 0.12 }),
      fx('brilho', { threshold: 0.45, intensity: 1.1, radius: 22 }),
      fx('tremor', { intensity: 0.12, speed: 10, rotation: 0.3 }),
    ],
    filter: look('vivido', 0.7),
    camera: cam({ zoom: [[0, 1.15, 'ease-out'], [0.4, 1.08, 'linear'], [2, 1.2]] }),
  }),
  pack('esse-sou-eu', t('Esse sou eu'), 'Comédia e memes', {
    ...slow([1, 0.1], 1.2),
    description: t('A imagem quase congela no meio da confusão e começa o clássico "pois é, esse sou eu".'),
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.3 }, { amount: [[0, 0], [speedTime([1, 0.1], 1.2, 0.5), 0.9, 'ease-out'], [speedTime([1, 0.1], 1.2, 0.55), 0]] }),
    ],
    filter: look('desbotado', 0.5),
    camera: cam({ zoom: [[0, 1.0], [speedTime([1, 0.1], 1.2, 0.5), 1.0, 'hold'], [speedTime([1, 0.1], 1.2, 0.51), 1.12, 'linear'], [1.2, 1.2]] }),
  }),
  pack('camera-lenta-desnecessaria', t('Câmera lenta desnecessária'), 'Comédia e memes', {
    ...slow([0.25], 1.5),
    description: t('Transforma um momento banal (abrir a geladeira, sentar no sofá) em cena de filme.'),
    effects: [
      fx('barras-cinema', { aspect: 2.39 }, { aspect: [[0, 1.78], [0.15, 2.39]] }),
      fx('brilho', { threshold: 0.5, intensity: 0.9, radius: 20 }),
      fx('granulado', { amount: 0.15 }),
    ],
    filter: look('blockbuster', 0.8),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [1.5, 1.15]] }),
  }),
  pack('quase', t('Quaaase'), 'Comédia e memes', {
    ...slow([1, 0.5, 0.25, 0.2], 2),
    description: t('Vai freando aos poucos enquanto a câmera chega no rosto. Para a cesta que bateu no aro.'),
    face: { zoom: 1, smoothness: 0.5 },
    camera: cam({ zoom: [[0, 1.0], [2, 1.7]] }),
    effects: [fx('vinheta', { size: 0.35 }, { intensity: [[0, 0], [2, 0.6]] })],
  }),
  pack('tropeco', t('Tropeço'), 'Comédia e memes', {
    ...slow([1, 0.2, 0.2, 1.5], 2),
    description: t('O tropeção fica em câmera lenta e depois a vida segue acelerada, com uma pancadinha de desenho.'),
    effects: [fx('flash', { tint: '#ffffff' }, { amount: [[0, 0], [speedTime([1, 0.2, 0.2, 1.5], 2, 0.75), 0.6], [speedTime([1, 0.2, 0.2, 1.5], 2, 0.8), 0]] })],
    camera: cam({
      zoom: [[0, 1.0], [speedTime([1, 0.2, 0.2, 1.5], 2, 0.25), 1.05, 'linear'], [speedTime([1, 0.2, 0.2, 1.5], 2, 0.75), 1.3, 'ease-out'], [2, 1.0]],
      rotation: [
        [0, 0, 'hold'],
        [speedTime([1, 0.2, 0.2, 1.5], 2, 0.75), 6, 'ease-out'],
        [speedTime([1, 0.2, 0.2, 1.5], 2, 0.8), -4],
        [speedTime([1, 0.2, 0.2, 1.5], 2, 0.86), 0],
      ],
    }),
  }),
  pack('revelacao-dramatica', t('Revelação dramática'), 'Comédia e memes', {
    ...slow([0.3], 1.6),
    description: t('Câmera lenta e zoom no rosto, com efeito vertigem: a pessoa acabou de descobrir tudo.'),
    face: { zoom: 1, smoothness: 0.4 },
    effects: [fx('olho-de-peixe', {}, { strength: [[0, 0], [1.6, 0.35]] }), fx('vinheta', { intensity: 0.6 })],
    filter: look('dramatico', 0.8),
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [1.6, 2.1]] }),
  }),
  pack('filme-mudo', t('Filme mudo'), 'Comédia e memes', {
    duration: 6,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [1.4],
    description: t('Comédia dos anos 20: um pouco acelerado, preto e branco gasto e projetor tremendo.'),
    effects: [
      fx('granulado', { amount: 0.55, size: 1.8, flicker: 0.9 }),
      fx('vinheta', { intensity: 0.75, size: 0.3 }),
      fx('tremor', { intensity: 0.05, speed: 10, rotation: 0.1 }),
    ],
    filter: look('ruido-de-filme'),
    camera: cam({}, { zoom: 1.05 }),
  }),
  pack('perseguicao', t('Perseguição acelerada'), 'Comédia e memes', {
    duration: 6,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [2.5],
    description: t('Todo mundo correndo rápido demais, cores vivas e câmera sacudindo. Perseguição de comédia antiga.'),
    effects: [fx('tremor', { intensity: 0.12, speed: 14, rotation: 0.3 }), fx('ajuste-cor', { saturation: 1.35, contrast: 1.1 })],
    camera: cam({}, { zoom: 1.08 }),
  }),

  // ---------------- Mais comédia
  pack('disfarca', t('Disfarça'), 'Comédia e memes', {
    duration: 2.5,
    anchor: 'cursor',
    description: t('A câmera desvia rápido para o lado, fingindo que não viu nada.'),
    camera: cam({ x: [[0, 0.5, 'ease'], [0.35, 0.78]], zoom: [[0, 1.0, 'ease-out'], [0.35, 1.5]] }),
    effects: [fx('desfoque', {}, { radius: [[0, 0], [0.18, 8], [0.35, 0]] })],
  }),
  pack('censurado', t('Censurado'), 'Comédia e memes', {
    duration: 2,
    anchor: 'cursor',
    description: t('Pixela tudo, como se alguém tivesse feito algo que não podia aparecer.'),
    effects: [fx('pixelar', { size: 34 })],
  }),
  pack('modo-detetive', t('Modo detetive'), 'Comédia e memes', {
    duration: 4,
    anchor: 'cursor',
    description: t('Noir de investigação: preto e branco, sombra fechando e zoom desconfiado no rosto.'),
    face: { zoom: 1, smoothness: 0.7 },
    effects: [fx('vinheta', { intensity: 0.8, size: 0.28 }), fx('granulado', { amount: 0.25 })],
    filter: look('noir'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4, 1.5]] }),
  }),
  pack('piada-sem-graca', t('Piada sem graça'), 'Comédia e memes', {
    duration: 3.5,
    anchor: 'cursor',
    description: t('A cor some e a câmera se afasta devagar: silêncio constrangedor.'),
    filter: look('mono-suave', 0.7),
    camera: cam({ zoom: [[0, 1.25, 'linear'], [3.5, 1.0]] }),
  }),
  pack('susto', t('Susto'), 'Comédia e memes', {
    ...moment(1.2),
    description: t('Clarão, tremida forte e zoom no rosto de quem levou o susto.'),
    face: { zoom: 1, smoothness: 0.2 },
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 1, 'ease-out'], [0.25, 0]] }),
      fx('tremor', { speed: 26, rotation: 0.9 }, { intensity: [[0, 1, 'ease-out'], [0.9, 0]] }),
      fx('rgb-split', {}, { amount: [[0, 0.04], [0.4, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.08, 1.7, 'hold']] }),
  }),
  pack('novela', t('Cena de novela'), 'Comédia e memes', {
    duration: 4,
    anchor: 'cursor',
    description: t('Zoom lento no rosto e brilho cor-de-rosa, para a revelação absurda que toda novela tem.'),
    face: { zoom: 1, smoothness: 0.6 },
    effects: [fx('brilho', { threshold: 0.45, intensity: 1, radius: 24 }), fx('vinheta', { intensity: 0.55 })],
    filter: look('rosado'),
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [4, 1.6]] }),
  }),
  pack('carregando', t('Carregando…'), 'Comédia e memes', {
    duration: 3,
    anchor: 'cursor',
    description: t('O cérebro travou: cor lavada e falhas leves.'),
    effects: [fx('glitch-digital', { amount: 0.15, rate: 3 }), fx('desfoque', { radius: 1.5 })],
    filter: look('mono-suave', 0.8),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [3, 1.1]] }),
  }),
  pack('cringe', t('Cringe'), 'Comédia e memes', {
    ...moment(1.6),
    description: t('Vergonha alheia: o rosto distorce, a cor fica estranha e a imagem treme.'),
    face: { zoom: 1, smoothness: 0.3 },
    effects: [
      fx('olho-de-peixe', {}, { strength: [[0, 0, 'ease-out'], [0.15, 0.55]] }),
      fx('ajuste-cor', { saturation: 1.6, contrast: 1.3, temperature: 0.3 }),
      fx('tremor', { intensity: 0.2, speed: 16, rotation: 0.4 }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.15, 1.6]] }),
  }),
  pack('mente-explodida', t('Mente explodida'), 'Comédia e memes', {
    ...moment(1.8),
    description: t('A ideia genial: clarão, a imagem estufa, brilho e partículas saindo da cabeça.'),
    face: { zoom: 1, smoothness: 0.3 },
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 0.9, 'ease-out'], [0.3, 0]] }),
      fx('olho-de-peixe', {}, { strength: [[0, 0.6, 'ease-out'], [0.6, 0.1]] }),
      fx('particulas-de-luz', { amount: 1.6, size: 1.5, speed: 1.5, hue: 0.7 }),
      fx('brilho', { threshold: 0.4, radius: 26 }, { intensity: [[0, 2], [1.8, 0.4]] }),
    ],
    camera: cam({ zoom: [[0, 1.5, 'ease-out'], [1.8, 1.3]] }),
  }),
  pack('enquanto-isso', t('Enquanto isso…'), 'Comédia e memes', {
    ...moment(2.4, 'cut'),
    description: t('Passagem de desenho animado no corte: a imagem desfoca e escurece.'),
    effects: [
      fx('desfoque', {}, { radius: [[0, 0], [0.6, 18], [1.8, 18], [2.4, 0]] }),
      fx('flash', { tint: '#1a1033', glow: 0 }, { amount: [[0, 0], [0.6, 0.6], [1.8, 0.6], [2.4, 0]] }),
    ],
  }),
  pack('horas-depois', t('Algumas horas depois…'), 'Comédia e memes', {
    ...moment(2.4, 'cut'),
    description: t('A passagem de tempo dos documentários de desenho, centrada no corte.'),
    effects: [
      fx('desfoque', {}, { radius: [[0, 0], [0.6, 16], [1.8, 16], [2.4, 0]] }),
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0], [0.6, 0.55], [1.8, 0.55], [2.4, 0]] }),
    ],
  }),
  pack('nao-e-possivel', t('Não é possível'), 'Comédia e memes', {
    ...moment(2.2),
    description: t('Três zooms secos em câmera lenta no rosto, cada um com um clarão. Para o absurdo total.'),
    speed: [0.5],
    face: { zoom: 1, smoothness: 0.2 },
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.4 }, {
        amount: [[0, 0.6, 'ease-out'], [0.2, 0, 'hold'], [0.7, 0.6, 'ease-out'], [0.9, 0, 'hold'], [1.4, 0.6, 'ease-out'], [1.6, 0]],
      }),
    ],
    filter: look('dramatico', 0.6),
    camera: cam({ zoom: [[0, 1.3, 'hold'], [0.7, 1.7, 'hold'], [1.4, 2.2, 'hold']] }),
  }),
  pack('morri-de-rir', t('Morri de rir'), 'Comédia e memes', {
    ...moment(2.4),
    description: t('Tremidinha de gargalhada, zoom e cor viva.'),
    effects: [
      fx('tremor', { speed: 14, rotation: 0.4 }, { intensity: [[0, 0.5, 'ease-out'], [2.4, 0.15]] }),
      fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.6, 'ease-out'], [0.25, 0]] }),
    ],
    filter: look('vivido', 0.6),
    camera: cam({ zoom: [[0, 1.25, 'ease-out'], [0.3, 1.12, 'linear'], [2.4, 1.18]] }),
  }),
  pack('tive-uma-ideia', t('Tive uma ideia'), 'Comédia e memes', {
    ...moment(2),
    description: t('A ideia acende: brilho e zoom no rosto.'),
    face: { zoom: 1, smoothness: 0.3 },
    effects: [
      fx('flash', { tint: '#fff6c8', glow: 0.6 }, { amount: [[0, 0.7, 'ease-out'], [0.35, 0]] }),
      fx('brilho', { threshold: 0.45, radius: 24 }, { intensity: [[0, 1.6], [2, 0.6]] }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.25, 1.35, 'linear'], [2, 1.45]] }),
  }),
  pack('olhos-suspeitos', t('Suspeito…'), 'Comédia e memes', {
    ...moment(3),
    description: t('Algo não bate: zoom lento no rosto e a vinheta fechando.'),
    face: { zoom: 1, smoothness: 0.6 },
    effects: [fx('vinheta', { size: 0.4 }, { intensity: [[0, 0], [1, 0.75]] })],
    filter: look('dramatico', 0.6),
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [3, 1.6]] }),
  }),
  pack('errou-feio', t('Errou feio'), 'Comédia e memes', {
    ...moment(2.2),
    description: t('Cor lavada, flash vermelho e um tranco na câmera.'),
    effects: [
      fx('tremor', { speed: 20, rotation: 0.5 }, { intensity: [[0, 0.7, 'ease-out'], [0.5, 0]] }),
      fx('flash', { tint: '#ff4040', glow: 0.3 }, { amount: [[0, 0.5, 'ease-out'], [0.4, 0]] }),
    ],
    filter: look('mono-suave', 0.7),
    camera: cam({ zoom: [[0, 1.2, 'ease-out'], [0.4, 1.08]] }),
  }),
  pack('ganhou', t('Ganhou!'), 'Comédia e memes', {
    ...moment(3),
    description: t('Vitória: clarão, confete de luz, brilho e cor vibrante.'),
    effects: [
      fx('flash', { tint: '#ffe7a8', glow: 0.6 }, { amount: [[0, 0.8, 'ease-out'], [0.4, 0]] }),
      fx('particulas-de-luz', { amount: 1.5, size: 1.3, speed: 1.2, hue: 0.13 }),
      fx('brilho', { threshold: 0.45, intensity: 1.1, radius: 22 }),
    ],
    filter: look('vivido', 0.8),
    camera: cam({ zoom: [[0, 1.15, 'ease-out'], [0.5, 1.05, 'linear'], [3, 1.12]] }),
  }),
  pack('olha-isso', t('Olha isso!'), 'Comédia e memes', {
    ...moment(2.5),
    description: t('Zoom para o detalhe com a vinheta fechando. Para destacar algo no vídeo.'),
    effects: [fx('vinheta', { size: 0.45 }, { intensity: [[0, 0], [0.4, 0.6]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.35, 1.3, 'linear'], [2.5, 1.35]] }),
  }),
  pack('coracao-partido', t('Coração partido'), 'Comédia e memes', {
    ...slow([0.5], 2.4),
    description: t('Câmera lenta e cor sumindo. Drama total.'),
    effects: [fx('vinheta', { intensity: 0.7 }), fx('granulado', { amount: 0.12 })],
    filter: look('melancolia', 0.9, { intensity: [[0, 0.2], [1.5, 0.9]] }),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4.8, 1.2]] }),
    muteSlow: true,
  }),
  pack('pulo-de-desenho', t('Pulo de desenho'), 'Comédia e memes', {
    ...moment(1),
    description: t('A imagem pula como mola de desenho animado, com o "boing".'),
    camera: cam({
      y: [[0, 0.5], [0.12, 0.42, 'ease-out'], [0.3, 0.53], [0.45, 0.47], [0.6, 0.515], [0.75, 0.49], [1, 0.5]],
      zoom: [[0, 1.1], [1, 1.1]],
    }),
  }),
  pack('em-chamas', t('Em chamas'), 'Comédia e memes', {
    ...moment(2.5),
    description: t('Mandou muito bem: cor quente, brilho, calor e impacto.'),
    effects: [
      fx('flash', { tint: '#ffb347', glow: 0.5 }, { amount: [[0, 0.7, 'ease-out'], [0.35, 0]] }),
      fx('brilho', { threshold: 0.45, intensity: 1.2, radius: 22 }),
      fx('calor', { amount: 0.4 }),
    ],
    filter: look('por-do-sol', 0.7),
    camera: cam({ zoom: [[0, 1.2, 'ease-out'], [0.3, 1.08, 'linear'], [2.5, 1.14]] }),
  }),

  // ------------------------------------------------------------ Mais cinema
  pack('simetrico-pastel', t('Simétrico pastel'), 'Cinematográfico', {
    description: t('Cores pastel, contraste suave e barras finas, no estilo dos filmes simétricos de Wes Anderson.'),
    effects: [fx('barras-cinema', { aspect: 1.85 }), fx('vinheta', { intensity: 0.2 })],
    filter: look('pastel-simetrico'),
  }),
  pack('ficcao-cientifica', t('Ficção científica'), 'Cinematográfico', {
    description: t('Tons gelados, brilho nas luzes, grão fino e tela larga. Para futuro, espaço e tecnologia.'),
    effects: [fx('brilho', { threshold: 0.55, intensity: 0.9, radius: 20 }), fx('granulado', { amount: 0.12 }), fx('barras-cinema', { aspect: 2.39 })],
    filter: look('artico', 0.9),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [6, 1.1]] }),
  }),
  pack('faroeste', t('Faroeste'), 'Cinematográfico', {
    description: t('Deserto amarelado, grão de filme e tela larga. Duelo ao meio-dia.'),
    effects: [fx('granulado', { amount: 0.25 }), fx('vinheta', { intensity: 0.55 }), fx('barras-cinema', { aspect: 2.39 })],
    filter: look('deserto'),
  }),
  pack('epico-dourado', t('Épico dourado'), 'Cinematográfico', {
    description: t('Luz dourada com raios, brilho e a câmera subindo devagar. Para finais grandiosos.'),
    effects: [fx('raios-de-luz', { amount: 0.9, source: [0.5, 0.85] }), fx('brilho', { threshold: 0.55, intensity: 0.8, radius: 20 })],
    filter: look('ouro', 0.8),
    camera: cam({ zoom: [[0, 1.1, 'linear'], [6, 1.2]], y: [[0, 0.55, 'linear'], [6, 0.45]] }),
  }),

  // ------------------------------------------------------------ Mais impacto
  pack('explosao', t('Explosão'), 'Impacto e ritmo', {
    ...moment(1.2),
    description: t('Clarão alaranjado, tremida forte e brilho, como uma explosão perto da câmera.'),
    effects: [
      fx('flash', { tint: '#ffb35c', glow: 0.8 }, { amount: [[0, 0.9, 'ease-out'], [0.6, 0]] }),
      fx('tremor', { speed: 20, rotation: 0.8 }, { intensity: [[0, 1, 'ease-out'], [1.2, 0]] }),
      fx('brilho', { threshold: 0.35, radius: 30 }, { intensity: [[0, 2], [1.2, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.25, 'ease-out'], [1.2, 1.08]] }),
  }),
  pack('pancada-lateral', t('Pancada lateral'), 'Impacto e ritmo', {
    ...moment(0.6),
    description: t('A imagem é empurrada de lado e volta, como se levasse um golpe.'),
    camera: cam({ x: [[0, 0.5, 'ease-out'], [0.06, 0.62], [0.25, 0.46], [0.6, 0.5]] }, { zoom: 1.3 }),
    effects: [fx('rgb-split', { angle: 0 }, { amount: [[0, 0.03], [0.3, 0]] })],
  }),
  pack('onda-de-impacto', t('Onda de impacto'), 'Impacto e ritmo', {
    ...moment(0.9),
    description: t('A imagem estufa e volta, como uma onda de choque passando.'),
    effects: [
      fx('olho-de-peixe', {}, { strength: [[0, 0.6, 'ease-out'], [0.5, 0]] }),
      fx('desfoque-radial', {}, { strength: [[0, 0.6], [0.4, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.15, 'ease-out'], [0.9, 1.0]] }),
  }),

  // ------------------------------------------------------------ Mais passagens
  pack('passagem-chicote', t('Chicote'), 'Passagens no corte', {
    ...moment(0.5, 'cut'),
    description: t('A câmera "chicoteia" de lado no corte e chega no próximo clipe vindo do outro lado.'),
    effects: [fx('desfoque', {}, { radius: [[0, 0], [0.25, 14], [0.5, 0]] })],
    camera: cam({
      x: [[0, 0.5, 'ease-in'], [0.249, 0.82, 'hold'], [0.25, 0.18, 'ease-out'], [0.5, 0.5]],
      zoom: [[0, 1.0, 'ease-in'], [0.2, 1.5], [0.3, 1.5, 'ease-out'], [0.5, 1.0]],
    }),
  }),
  pack('passagem-pixel', t('Pixelado'), 'Passagens no corte', {
    ...moment(0.8, 'cut'),
    description: t('A imagem vira pixels grandes no corte e volta já no próximo clipe.'),
    effects: [fx('pixelar', {}, { size: [[0, 1], [0.4, 60], [0.8, 1]] })],
  }),
  pack('passagem-cor', t('Flash colorido'), 'Passagens no corte', {
    ...moment(0.6, 'cut'),
    description: t('Um clarão rosa e azul esconde o corte.'),
    effects: [
      fx('flash', { tint: '#ff3fa4', glow: 0.7 }, { amount: [[0, 0], [0.25, 0.8], [0.35, 0]] }),
      fx('flash', { tint: '#3fd2ff', glow: 0.7 }, { amount: [[0, 0], [0.3, 0], [0.38, 0.7], [0.6, 0]] }),
    ],
  }),
  pack('passagem-tremor', t('Tranco'), 'Passagens no corte', {
    ...moment(0.6, 'cut'),
    description: t('Uma tremida forte bem no corte, como um tranco de câmera.'),
    effects: [fx('tremor', { speed: 24, rotation: 0.7 }, { intensity: [[0, 0], [0.3, 1], [0.6, 0]] })],
    camera: cam({ zoom: [[0, 1.0], [0.3, 1.2], [0.6, 1.0]] }),
  }),
  pack('passagem-zoom-out', t('Zoom para trás'), 'Passagens no corte', {
    ...moment(0.7, 'cut'),
    description: t('O primeiro clipe se afasta e o segundo chega de perto, com desfoque.'),
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0], [0.35, 0.8], [0.7, 0]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [0.349, 1.0, 'hold'], [0.35, 1.6, 'ease-out'], [0.7, 1.0]] }),
  }),

  // ------------------------------------------------------------ Mais aberturas e finais
  pack('abertura-vlog', t('Abertura de vlog'), 'Aberturas e finais', {
    duration: 3,
    anchor: 'clip-start',
    description: t('Clarão e a câmera se afasta com energia.'),
    effects: [fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 1], [0.5, 0]] })],
    filter: look('vivido', 0.5),
    camera: cam({ zoom: [[0, 1.35, 'ease-out'], [1.2, 1.0]] }),
  }),
  pack('abertura-glitch', t('Abertura glitch'), 'Aberturas e finais', {
    duration: 2.5,
    anchor: 'clip-start',
    description: t('O vídeo liga com falhas digitais.'),
    effects: [
      fx('glitch-digital', { blocks: 20, rate: 20 }, { amount: [[0, 1], [1.2, 0]] }),
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 1, 'hold'], [0.15, 0, 'hold'], [0.3, 1, 'hold'], [0.4, 0]] }),
    ],
  }),
  pack('fim-inscreva-se', t('Inscreva-se'), 'Aberturas e finais', {
    duration: 4,
    anchor: 'clip-end',
    description: t('Imagem desfocando no fundo, deixando espaço para o convite de se inscrever.'),
    effects: [fx('desfoque', {}, { radius: [[0, 0], [1, 10]] }), fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0], [1, 0.4]] })],
  }),

  // ------------------------------------------------------------ Mais retrô
  pack('game-boy', t('Game Boy'), 'Retrô e nostalgia', {
    description: t('Quatro tons de verde e pixels grandes, como na tela do videogame portátil.'),
    effects: [fx('game-boy', { pixels: 144 })],
  }),
  pack('filmadora-90', t('Filmadora anos 90'), 'Retrô e nostalgia', {
    description: t('Fita de filmadora de família, com a imagem dos anos 90.'),
    effects: [fx('vhs', { noise: 0.25, lines: 0.3, wobble: 0.3 }), fx('granulado', { amount: 0.2 })],
    filter: look('infancia'),
  }),
  pack('tv-antiga', t('TV antiga'), 'Retrô e nostalgia', {
    description: t('Televisão de tubo em preto e branco, com chiado e tela curva.'),
    effects: [fx('crt', { curvature: 0.6, lines: 0.7 }), fx('estatica-tv', { amount: 0.2 })],
    filter: look('preto-e-branco'),
  }),
  pack('filme-16mm', t('Filme 16mm'), 'Retrô e nostalgia', {
    description: t('Película de 16mm: cores do Kodachrome, grão forte e luz vazando nas bordas.'),
    effects: [fx('granulado', { amount: 0.45, size: 1.8, flicker: 0.4 }), fx('luz-vazada', { amount: 0.35 }), fx('vinheta', { intensity: 0.5 })],
    filter: look('kodachrome'),
  }),

  // ------------------------------------------------------------ Mais sonho, terror, games, notícia e clima
  pack('conto-de-fadas', t('Conto de fadas'), 'Sonho e romance', {
    fadeIn: 0.8,
    fadeOut: 0.8,
    description: t('Brilho mágico, partículas douradas e a câmera flutuando.'),
    effects: [fx('brilho', { threshold: 0.45, intensity: 1.1, radius: 24 }), fx('particulas-de-luz', { amount: 0.9, hue: 0.12, size: 1.3 })],
    filter: look('fabula'),
    camera: cam({ zoom: [[0, 1.05, 'linear'], [6, 1.15]], y: [[0, 0.52, 'linear'], [6, 0.48]] }),
  }),
  pack('verao-99', t('Verão de 99'), 'Sonho e romance', {
    description: t('Férias de infância: cores quentes desbotadas, luz vazando e grão.'),
    effects: [fx('luz-vazada', { amount: 0.4 }), fx('granulado', { amount: 0.2 })],
    filter: look('verao-99'),
  }),
  pack('found-footage', t('Filmagem encontrada'), 'Suspense e terror', {
    description: t('Gravação amadora achada depois: imagem lavada, tremendo e com chiado.'),
    effects: [
      fx('tremor', { intensity: 0.14, speed: 5, rotation: 0.4 }),
      fx('estatica-tv', { amount: 0.12 }),
      fx('granulado', { amount: 0.4 }),
      fx('vinheta', { intensity: 0.6 }),
    ],
    filter: look('desbotado'),
    camera: cam({}, { zoom: 1.12 }),
  }),
  pack('sinal-perdido', t('Sinal perdido'), 'Suspense e terror', {
    ...moment(1.5),
    description: t('O sinal cai: chiado tomando a tela e falhas.'),
    effects: [
      fx('estatica-tv', {}, { amount: [[0, 0.2], [0.4, 0.9], [1.1, 0.9], [1.5, 0.2]] }),
      fx('glitch', { speed: 6 }, { intensity: [[0, 0.3], [0.5, 1], [1.5, 0.2]] }),
    ],
  }),
  pack('possuido', t('Possuído'), 'Suspense e terror', {
    duration: 3,
    anchor: 'cursor',
    description: t('Imagem dobrada, cor doentia, giro lento e tremida: algo está muito errado.'),
    effects: [fx('visao-dupla', { amount: 0.5, speed: 2 }), fx('tremor', { intensity: 0.2, speed: 9, rotation: 0.5 }), fx('vinheta', { intensity: 0.85, size: 0.25 })],
    filter: look('terror'),
    camera: cam({ rotation: [[0, 0, 'linear'], [3, 8]], zoom: [[0, 1.12, 'linear'], [3, 1.3]] }),
  }),
  pack('levou-dano', t('Levou dano'), 'Ação e games', {
    ...moment(0.8),
    description: t('Tela vermelha nas bordas, tremida e flash: o personagem levou um golpe.'),
    effects: [
      fx('vinheta', { tint: '#ff0000', size: 0.3 }, { intensity: [[0, 0.95, 'ease-out'], [0.8, 0]] }),
      fx('tremor', { speed: 22, rotation: 0.6 }, { intensity: [[0, 0.8, 'ease-out'], [0.6, 0]] }),
      fx('flash', { tint: '#ff4040', glow: 0 }, { amount: [[0, 0.4], [0.2, 0]] }),
    ],
    camera: cam({}, { zoom: 1.1 }),
  }),
  pack('nivel-completo', t('Nível completo'), 'Ação e games', {
    duration: 3,
    anchor: 'cursor',
    description: t('Vitória de videogame: brilho e partículas.'),
    effects: [fx('brilho', { threshold: 0.45, intensity: 1.2, radius: 22 }), fx('particulas-de-luz', { amount: 1.2, hue: 0.15 })],
    filter: look('vivido', 0.6),
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.5, 1.12, 'linear'], [3, 1.16]] }),
  }),
  pack('pixel-art', t('Pixel art'), 'Ação e games', {
    description: t('O vídeo vira um jogo antigo: pixels grandes e poucas cores.'),
    effects: [fx('pixelar', { size: 6 })],
    filter: look('posterizado', 1, {}, { levels: 5 }),
  }),
  pack('ao-vivo', t('Ao vivo'), 'Documentário e notícia', {
    description: t('Transmissão ao vivo: imagem contrastada.'),
    effects: [fx('ajuste-cor', { contrast: 1.08, saturation: 1.05 })],
    filter: look('nitido', 0.6),
  }),
  pack('tempestade', t('Tempestade'), 'Clima e estações', {
    timing: 'stretch',
    description: t('Chuva pesada, céu escuro e relâmpagos clareando a cena de tempos em tempos.'),
    effects: [
      fx('chuva', { amount: 0.95, speed: 1.6, slant: 0.25 }),
      fx('flash', { tint: '#dfe8ff', glow: 0.8 }, {
        amount: [[0, 0], [1.2, 0, 'hold'], [1.25, 0.8, 'hold'], [1.32, 0, 'hold'], [1.42, 0.6], [1.7, 0, 'hold'], [4.1, 0, 'hold'], [4.15, 0.9], [4.6, 0]],
      }),
      fx('vinheta', { intensity: 0.5 }),
    ],
    filter: look('tempestade'),
  }),
  pack('neblina', t('Neblina'), 'Clima e estações', {
    description: t('Névoa leve, luz difusa e um pouco menos de nitidez. Manhã fria ou mistério.'),
    effects: [fx('desfoque', { radius: 1.2 }), fx('brilho', { threshold: 0.4, intensity: 0.9, radius: 26 })],
    filter: look('nevoa'),
  }),
];

/**
 * Os efeitos que usam a pessoa ou a profundidade (contorno, clones, foco…) veem a máscara no enquadramento da tela:
 * por isso os pacotes com eles não mexem a câmera. E os que marcam o momento em segundos (congelar, desintegrar,
 * time warp, troca de foco) usam timing "fixed": esticar o bloco não muda quando a coisa acontece.
 */
const MORE_PACKS: PackTemplate[] = [
  // ------------------------------------------------------------ Terror analógico
  pack('fita-do-porao', t('Fita do porão'), 'Terror analógico', {
    duration: 8,
    description: t('VHS achada numa caixa velha: cor borrada e doente, faixa torta no pé da imagem, tracking falhando de vez em quando e a câmera na mão.'),
    effects: [
      fx('cor-borrada-vhs', { vazamento: 0.6, atraso: 0.5, maciez: 0.4, ruidoCor: 0.5 }),
      fx('troca-de-cabeca', { altura: 0.05, deslocamento: 0.6 }),
      fx('erro-de-tracking', { largura: 0.14 }, {
        intensidade: [[0, 0, 'hold'], [2.2, 0], [2.35, 0.85], [3.1, 0, 'hold'], [5.5, 0], [5.6, 0.7], [6.2, 0]],
      }),
      fx('vhs', { noise: 0.3, lines: 0.35, bleed: 0, wobble: 0.5 }),
      fx('tremor', { intensity: 0.08, speed: 3, rotation: 0.3 }),
      fx('vinheta', { intensity: 0.5 }),
    ],
    filter: look('vhs-doente', 0.9),
    camera: cam({}, { zoom: 1.08 }),
  }),
  pack('transmissao-de-emergencia', t('Transmissão de emergência'), 'Terror analógico', {
    description: t('Aviso de emergência na TV aberta, de madrugada: imagem lavada e chiada, linhas entrelaçadas, faixa de interferência subindo e a câmera chegando perto devagar.'),
    effects: [
      fx('sinal-fraco', { forca: 0.45, neve: 0.3, oscilacao: 0.4 }),
      fx('entrelacado', { forca: 0.8, escurecer: 0.2 }),
      fx('oscilacao-de-brilho', { forca: 0.2, quedas: 0.1, faixa: 0.45 }),
      fx('crt', { curvature: 0.25, lines: 0.45 }),
      fx('vinheta', { intensity: 0.4 }),
    ],
    filter: look('transmissao-de-emergencia'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [6, 1.15]] }),
  }),
  pack('perdeu-o-vertical', t('Perdeu o vertical'), 'Terror analógico', {
    ...moment(1.6),
    description: t('A imagem rola duas vezes pela tela, com a faixa preta passando, e trava de volta no lugar.'),
    effects: [
      fx('rolagem-vertical', { velocidade: 0, barra: 0.6, tremor: 0.4 }, { deslocamento: [[0, 0, 'ease'], [1.3, 2]] }),
      fx('erro-de-tracking', {}, { intensidade: [[0, 0.3], [0.6, 0.9], [1.6, 0]] }),
      fx('sinal-fraco', { neve: 0.3 }, { forca: [[0, 0.2], [0.8, 0.6], [1.6, 0]] }),
    ],
  }),
  pack('vigilancia-noturna', t('Vigilância noturna'), 'Terror analógico', {
    duration: 8,
    description: t('Câmera de segurança no escuro: infravermelho granulado, lente grande-angular, poucos quadros por segundo e linhas entrelaçadas.'),
    effects: [
      fx('quadros-travando', { passo: 0.2, irregular: 0, tranco: 0 }),
      fx('entrelacado', { forca: 0.6, desvio: 0, escurecer: 0.12 }),
      fx('olho-de-peixe', { strength: 0.25 }),
      fx('granulado', { amount: 0.45, size: 1.4 }),
      fx('vinheta', { intensity: 0.55 }),
    ],
    filter: look('vigilancia-infravermelha'),
    camera: cam({}, { zoom: 1.05 }),
  }),
  pack('camera-que-vigia', t('Câmera que vigia'), 'Terror analógico', {
    duration: 10,
    timing: 'stretch',
    anchor: 'cursor',
    description: t('Câmera de segurança antiga que gira de um lado para o outro, para um pouco e volta, em preto e branco e com poucos quadros por segundo.'),
    effects: [
      fx('quadros-travando', { passo: 0.25, irregular: 0, tranco: 0.1 }),
      fx('olho-de-peixe', { strength: 0.3 }),
      fx('granulado', { amount: 0.4, size: 1.3 }),
      fx('troca-de-cabeca', { altura: 0.03, deslocamento: 0.4, ruido: 0.4 }),
    ],
    filter: look('camera-de-vigilancia'),
    camera: cam({ x: [[0, 0.4, 'hold'], [1.5, 0.4], [4, 0.6, 'hold'], [6, 0.6], [8.5, 0.4, 'hold']] }, { zoom: 1.3 }),
  }),
  pack('corredor-liminar', t('Corredor liminar'), 'Terror analógico', {
    duration: 10,
    description: t('Espaço vazio que dá aflição: amarelo doente, pretos lavados, imagem mole e a câmera avançando sem parar, devagar demais.'),
    effects: [
      fx('cor-borrada-vhs', { vazamento: 0.4, atraso: 0.3, maciez: 0.5, ruidoCor: 0.25 }),
      fx('oscilacao-de-brilho', { forca: 0.12, quedas: 0, faixa: 0.2 }),
      fx('desfoque', { radius: 1 }),
      fx('granulado', { amount: 0.15 }),
      fx('vinheta', { intensity: 0.5, size: 0.45 }),
    ],
    filter: look('sepia-doente', 0.9),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [10, 1.3]] }),
  }),
  pack('video-caseiro-amaldicoado', t('Vídeo caseiro amaldiçoado'), 'Terror analógico', {
    duration: 8,
    description: t('Parece um aniversário filmado nos anos 90, até a fita falhar: o rosto se deforma por um instante e tudo volta ao normal, como se nada tivesse acontecido.'),
    face: { zoom: 1.2, smoothness: 0.8 },
    effects: [
      fx('vhs', { noise: 0.25, lines: 0.3, wobble: 0.4 }),
      fx('cor-borrada-vhs'),
      fx('troca-de-cabeca'),
      fx('rosto-deformado', { centro: [0.5, 0.5], tremor: 0.6 }, {
        forca: [[0, 0, 'hold'], [3.4, 0.9, 'hold'], [3.7, 0, 'hold'], [5.8, 0.7, 'hold'], [5.95, 0, 'hold']],
      }),
      fx('erro-de-tracking', {}, {
        intensidade: [[0, 0, 'hold'], [3.35, 0.9, 'hold'], [3.75, 0, 'hold'], [5.75, 0.8, 'hold'], [6, 0, 'hold']],
      }),
      fx('tremor', { intensity: 0.07, speed: 3, rotation: 0.3 }),
    ],
    filter: look('infancia', 0.7),
    camera: cam({}),
  }),
  pack('nao-e-ele', t('Não é ele'), 'Terror analógico', {
    ...moment(3),
    description: t('A câmera chega no rosto e ele começa a se deformar devagar, como se a pessoa tivesse sido trocada por outra coisa.'),
    face: { zoom: 1, smoothness: 0.5 },
    effects: [
      fx('rosto-deformado', { centro: [0.5, 0.5], esticar: 0.7, sorriso: 0.55, derreter: 0.4, tremor: 0.5 }, { forca: [[0, 0, 'ease-in'], [2.4, 0.9], [3, 1]] }),
      fx('sinal-fraco', { neve: 0.3 }, { forca: [[0, 0.1], [3, 0.5]] }),
      fx('vinheta', { size: 0.35 }, { intensity: [[0, 0.3], [3, 0.85]] }),
    ],
    filter: look('terror', 0.7),
    camera: cam({ zoom: [[0, 1.2, 'ease-in'], [3, 1.9]] }),
  }),
  pack('zoom-subito-no-rosto', t('Zoom súbito no rosto'), 'Terror analógico', {
    ...moment(1.4),
    description: t('Corte seco para um close enorme do rosto, com estática e a imagem tremendo. O susto clássico das fitas amaldiçoadas.'),
    face: { zoom: 1, smoothness: 0.1 },
    effects: [
      fx('rosto-deformado', { forca: 0.35, centro: [0.5, 0.5], esticar: 0.3, sorriso: 0.2, derreter: 0, tremor: 0.9 }),
      fx('tremor', { speed: 18, rotation: 0.5 }, { intensity: [[0, 0.8], [1.4, 0.2]] }),
      fx('rgb-split', { amount: 0.012 }),
      fx('estatica-tv', {}, { amount: [[0, 0.9, 'hold'], [0.12, 0.3], [1.4, 0.1]] }),
    ],
    filter: look('terror', 0.8),
    camera: cam({ zoom: [[0, 1.0, 'hold'], [0.05, 2.6, 'hold']] }),
  }),
  pack('pausa-na-fita', t('Pausa na fita'), 'Terror analógico', {
    duration: 3,
    timing: 'fixed',
    anchor: 'cursor',
    description: t('Alguém apertou o pause: a imagem para tremendo, com as faixas de chiado, e volta a tocar com o tracking embaralhado.'),
    effects: [
      fx('pausa-de-fita', { momento: 0.3, pausa: 1.8, ruido: 0.7, tremor: 0.6 }),
      fx('erro-de-tracking', { largura: 0.2 }, { intensidade: [[0, 0, 'hold'], [2.1, 1], [3, 0]] }),
      fx('cor-borrada-vhs'),
    ],
  }),
  pack('quadros-perdidos', t('Quadros perdidos'), 'Terror analógico', {
    duration: 4,
    anchor: 'cursor',
    description: t('A fita pula: a imagem engasga aos trancos, some em quadros escuros e riscos brancos atravessam a tela.'),
    effects: [
      fx('quadros-travando', { passo: 0.3, irregular: 0.5, tranco: 0.6 }),
      fx('fita-amassada', { amassados: 0.3, dropouts: 0.9 }),
      fx('oscilacao-de-brilho', { forca: 0.3, quedas: 0.6, faixa: 0 }),
      fx('cor-borrada-vhs'),
    ],
    filter: look('fita-mofada', 0.7),
  }),
  pack('vulto-na-fita', t('Vulto na fita'), 'Terror analógico', {
    description: t('Sinal com fantasma: tudo ganha um vulto apagado ao lado, a imagem chia e o movimento deixa um rastro lento.'),
    effects: [
      fx('fantasma-de-imagem', { distancia: 0.03, forca: 0.7, contorno: 0.5, oscilacao: 0.4 }),
      fx('eco-temporal', { modo: 0, copias: 4, espaco: 0.1, brilho: 0 }),
      fx('sinal-fraco', { forca: 0.3, neve: 0.25 }),
      fx('vinheta', { intensity: 0.55 }),
    ],
    filter: look('copia-de-copia', 0.8),
  }),
  pack('fita-mofada', t('Fita mofada'), 'Terror analógico', {
    description: t('Fita guardada por décadas num lugar úmido: amassados com cor de arco-íris, riscos, cor escorrida e quadros que pulam.'),
    effects: [
      fx('quadros-travando', { passo: 0.12, irregular: 0.8, tranco: 0.4 }),
      fx('fita-amassada', { amassados: 0.8, dropouts: 0.8, tamanho: 0.6 }),
      fx('cor-borrada-vhs', { vazamento: 0.8, atraso: 0.6, maciez: 0.5, ruidoCor: 0.7 }),
      fx('troca-de-cabeca', { altura: 0.06, deslocamento: 0.8, ruido: 0.6 }),
      fx('erro-de-tracking', { intensidade: 0.35, largura: 0.15 }),
    ],
    filter: look('fita-mofada'),
  }),
  pack('ultima-gravacao', t('Última gravação'), 'Terror analógico', {
    duration: 4,
    anchor: 'clip-end',
    timing: 'stretch',
    description: t('O fim da fita: a imagem vai se desfazendo em tracking, rolagem e estática até sobrar só o chiado.'),
    effects: [
      fx('rolagem-vertical', { velocidade: 0, barra: 0.6 }, { deslocamento: [[0, 0, 'hold'], [1.5, 0, 'ease-in'], [3.4, 1.6]] }),
      fx('erro-de-tracking', {}, { intensidade: [[0, 0], [2.5, 1]] }),
      fx('sinal-fraco', {}, { forca: [[0, 0], [3, 1]] }),
      fx('estatica-tv', {}, { amount: [[0, 0], [2.6, 0.2, 'ease-in'], [3.4, 1]] }),
    ],
  }),
  pack('comeco-da-fita', t('Começo da fita'), 'Terror analógico', {
    duration: 3,
    anchor: 'clip-start',
    timing: 'stretch',
    description: t('Tela azul do videocassete, chiado, a imagem entra rolando e o tracking se acerta até tudo travar no lugar.'),
    effects: [
      fx('rolagem-vertical', { velocidade: 0, barra: 0.6 }, { deslocamento: [[0, 1.2], [1.6, 2, 'ease-out']] }),
      fx('erro-de-tracking', { largura: 0.2 }, { intensidade: [[0, 1], [2.6, 0]] }),
      fx('estatica-tv', {}, { amount: [[0, 0.9], [0.5, 0.9], [1.2, 0]] }),
      fx('flash', { tint: '#1f35c9', glow: 0 }, { amount: [[0, 1, 'hold'], [0.5, 0]] }),
    ],
  }),
  pack('transmissao-invadida', t('Transmissão invadida'), 'Terror analógico', {
    duration: 3,
    anchor: 'cursor',
    description: t('Alguém tomou o sinal: a imagem rola, ganha fantasmas, pisca em negativo e treme, como uma invasão de transmissão dos anos 80.'),
    effects: [
      fx('rolagem-vertical', { velocidade: 0.35, barra: 0.4, tremor: 0.8 }),
      fx('fantasma-de-imagem', { distancia: 0.05, forca: 0.8, contorno: 0.7 }),
      fx('sinal-fraco', { forca: 0.5, neve: 0.3, oscilacao: 1 }),
      fx('rgb-split', { amount: 0.006 }),
    ],
    filter: look('negativo', 1, { intensity: [[0, 0, 'hold'], [0.7, 1, 'hold'], [0.8, 0, 'hold'], [1.9, 1, 'hold'], [1.98, 0, 'hold']] }),
  }),
  pack('tv-de-madrugada', t('TV de madrugada'), 'Terror analógico', {
    description: t('O canal que só passa coisa estranha depois das três da manhã: tela de tubo curva, linhas entrelaçadas, imagem fria e um chuvisco fino.'),
    effects: [
      fx('entrelacado', { forca: 0.7 }),
      fx('sinal-fraco', { forca: 0.3, neve: 0.2, oscilacao: 0.3 }),
      fx('oscilacao-de-brilho', { forca: 0.15, quedas: 0.05, faixa: 0.35 }),
      fx('crt', { curvature: 0.45, lines: 0.55 }),
    ],
    filter: look('estatica-fria'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [6, 1.08]] }),
  }),
  pack('rolo-amaldicoado', t('Rolo amaldiçoado'), 'Terror analógico', {
    description: t('Filme antigo que ninguém devia ter revelado: sépia doente, grão pesado, luz piscando e o projetor engasgando.'),
    effects: [
      fx('quadros-travando', { passo: 0.08, irregular: 0.6, tranco: 0.8 }),
      fx('granulado', { amount: 0.65, size: 2, flicker: 0.8 }),
      fx('oscilacao-de-brilho', { forca: 0.5, quedas: 0.35, faixa: 0 }),
      fx('tremor', { intensity: 0.05, speed: 10, rotation: 0.1 }),
      fx('vinheta', { intensity: 0.75, size: 0.3 }),
    ],
    filter: look('filme-queimado'),
    camera: cam({}, { zoom: 1.04 }),
  }),
  pack('lanterna-no-escuro', t('Lanterna no escuro'), 'Terror analógico', {
    description: t('Só a luz da lanterna mostra alguma coisa: o resto some no preto, a luz falha e a câmera anda nervosa.'),
    effects: [
      fx('vinheta', { intensity: 0.5, size: 0.3 }),
      fx('oscilacao-de-brilho', { forca: 0.35, velocidade: 1.6, quedas: 0.4, faixa: 0 }),
      fx('granulado', { amount: 0.35 }),
      fx('tremor', { intensity: 0.12, speed: 4, rotation: 0.4 }),
    ],
    filter: look('luz-de-lanterna'),
    camera: cam({ x: [[0, 0.47, 'linear'], [6, 0.53]] }, { zoom: 1.12 }),
  }),
  pack('noite-sem-lua', t('Noite sem lua'), 'Terror analógico', {
    duration: 8,
    description: t('Dia filmado virado numa noite doentia: luar esverdeado, rostos pálidos, o fundo engolido pelas sombras e a câmera avançando com medo do que vai encontrar.'),
    effects: [
      fx('granulado', { amount: 0.35, size: 1.5 }),
      fx('oscilacao-de-brilho', { forca: 0.1, quedas: 0.05, faixa: 0 }),
      fx('tremor', { intensity: 0.06, speed: 2.5, rotation: 0.3 }),
      fx('vinheta', { intensity: 0.7, size: 0.35 }),
    ],
    filter: look('noite-americana-sinistra'),
    camera: cam({ zoom: [[0, 1.06, 'linear'], [8, 1.2]] }),
  }),
  pack('aproximacao-inquietante', t('Aproximação inquietante'), 'Terror analógico', {
    duration: 8,
    timing: 'stretch',
    anchor: 'cursor',
    description: t('Um zoom lento demais no rosto, enquanto a cor some, as bordas escurecem e a imagem começa a falhar.'),
    face: { zoom: 1, smoothness: 0.8 },
    effects: [
      fx('cor-borrada-vhs'),
      fx('sinal-fraco', { neve: 0.3 }, { forca: [[0, 0], [8, 0.45]] }),
      fx('vinheta', { size: 0.3 }, { intensity: [[0, 0.2], [8, 0.9]] }),
    ],
    filter: look('terror', 1, { intensity: [[0, 0], [8, 1]] }),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [8, 1.9]] }),
  }),

  // ------------------------------------------------------------ Edits virais
  pack('aura-neon', t('Aura neon'), 'Edits virais', {
    description: t('Uma linha de néon contorna a pessoa e pulsa entre azul e rosa, com a cena em tons de noite. Para edits de dança e de entrada.'),
    effects: [
      fx('contorno-neon', { cor: '#00e5ff', cor2: '#ff2bd6', largura: 0.5, distancia: 0.2, brilho: 1.1, pulso: 2 }),
      fx('brilho', { threshold: 0.5, intensity: 0.9, radius: 20 }),
    ],
    filter: look('noite-neon', 0.7),
  }),
  pack('edit-com-rabiscos', t('Edit com rabiscos'), 'Edits virais', {
    description: t('Traços de caneta tremendo em volta da pessoa, com estrelinhas e corações rabiscados, como um edit feito no caderno.'),
    effects: [fx('rabiscos', { desenhos: 0.7 }), fx('ajuste-cor', { saturation: 1.15, contrast: 1.05 })],
  }),
  pack('time-warp', t('Time warp'), 'Edits virais', {
    duration: 5,
    timing: 'fixed',
    anchor: 'cursor',
    description: t('A linha azul desce pela tela congelando tudo o que ficou para trás. Mexa-se junto com ela para esticar o rosto ou "duplicar" o corpo.'),
    effects: [fx('time-warp-scan', { inicio: 0.3, varredura: 4, direcao: 0 })],
  }),
  pack('congela-no-auge', t('Congela no auge'), 'Edits virais', {
    duration: 2.5,
    timing: 'fixed',
    anchor: 'cursor',
    description: t('No ponto alto, a imagem congela com um clarão, perde a cor e vai chegando perto. Ponha o cursor um pouco antes do momento.'),
    effects: [
      fx('pausa-de-fita', { momento: 0.35, pausa: 0, ruido: 0, tremor: 0 }),
      fx('zoom-lento', { zoomStart: 1, zoomEnd: 1.25 }),
      fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 0], [0.35, 0.9, 'ease-out'], [0.75, 0]] }),
      fx('vinheta', { size: 0.4 }, { intensity: [[0, 0], [0.35, 0.6]] }),
    ],
    filter: look('mono-suave', 0.8, { intensity: [[0, 0, 'hold'], [0.35, 0.8]] }),
  }),

  // ------------------------------------------------------------ Cinematográfico
  pack('troca-de-foco', t('Troca de foco'), 'Cinematográfico', {
    duration: 5,
    timing: 'fixed',
    anchor: 'cursor',
    description: t('O foco sai de quem está perto e vai para o fundo, como o assistente de câmera girando a lente. A IA estima a profundidade.'),
    effects: [
      fx('foco-que-muda', { de: 1, para: 0, inicio: 0.8, duracaoFoco: 1.6, forca: 0.7, nitido: 0.15 }),
      fx('barras-cinema', { aspect: 2.39 }),
      fx('granulado', { amount: 0.12 }),
    ],
    filter: look('cinema', 0.6),
  }),
  pack('so-o-vermelho', t('Só o vermelho'), 'Cinematográfico', {
    description: t('Preto e branco duro em que só o vermelho sobrevive, com grão e sombras fundas. Visual de graphic novel.'),
    effects: [
      fx('brilho', { threshold: 0.6, intensity: 0.6, radius: 16 }),
      fx('granulado', { amount: 0.25 }),
      fx('vinheta', { intensity: 0.6 }),
      fx('barras-cinema', { aspect: 2.39 }),
    ],
    filter: look('sin-city'),
  }),
  pack('filme-de-guerra', t('Filme de guerra'), 'Cinematográfico', {
    description: t('Cor prateada e sem vida, grão, câmera tremendo e um movimento picado, de obturador rápido. Para cenas de batalha e caos.'),
    effects: [
      fx('quadros-travando', { passo: 0.05, irregular: 0.2, tranco: 0 }),
      fx('tremor', { intensity: 0.18, speed: 9, rotation: 0.5 }),
      fx('granulado', { amount: 0.3, size: 1.3 }),
      fx('vinheta', { intensity: 0.4 }),
    ],
    filter: look('bleach-bypass', 0.9),
    camera: cam({}, { zoom: 1.08 }),
  }),

  // ------------------------------------------------------------ Câmera em movimento
  pack('caminhando', t('Caminhando'), 'Câmera em movimento', {
    duration: 6,
    timing: 'stretch',
    anchor: 'cursor',
    description: t('Steadicam andando junto: a câmera avança devagar e balança de leve a cada passo.'),
    camera: cam(
      {
        zoom: [[0, 1.12, 'linear'], [6, 1.24]],
        y: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map((s, i): Point => [s, i % 2 ? 0.507 : 0.5]),
        x: [[0, 0.49], [1.5, 0.51], [3, 0.49], [4.5, 0.51], [6, 0.49]],
        rotation: [[0, -0.6], [1.5, 0.6], [3, -0.6], [4.5, 0.6], [6, -0.6]],
      },
    ),
  }),
  pack('correndo-com-a-camera', t('Correndo com a câmera'), 'Câmera em movimento', {
    duration: 3,
    timing: 'stretch',
    anchor: 'cursor',
    description: t('Câmera na mão correndo atrás de alguém: sobe e desce a cada passada, treme e borra nas bordas.'),
    effects: [fx('tremor', { intensity: 0.35, speed: 7, rotation: 0.6 }), fx('desfoque-radial', { strength: 0.08 })],
    camera: cam(
      { y: Array.from({ length: 17 }, (_, i): Point => [i * 0.1875, i % 2 ? 0.53 : 0.5, i % 2 ? 'ease-in' : 'ease-out']) },
      { zoom: 1.2 },
    ),
  }),
  pack('espiral', t('Espiral'), 'Câmera em movimento', {
    ...moment(3),
    description: t('A câmera gira e mergulha na cena ao mesmo tempo, cada vez mais rápido. Para tontura, transe ou o momento em que tudo sai do controle.'),
    effects: [
      fx('desfoque-radial', {}, { strength: [[0, 0, 'ease-in'], [3, 0.35]] }),
      fx('vinheta', { size: 0.4 }, { intensity: [[0, 0.2], [3, 0.6]] }),
    ],
    camera: cam({ rotation: [[0, 0, 'ease-in'], [3, 28]], zoom: [[0, 1.0, 'ease-in'], [3, 1.7]] }),
  }),

  // ------------------------------------------------------------ Seguir rosto
  pack('rosto-nas-batidas', t('Rosto nas batidas'), 'Seguir rosto', {
    ...onBeats({ 'camera.zoom': pulse(1.15, [[0, 1.38, 'ease-out'], [0.3, 1.15]]) }),
    description: t('Mantém o rosto no centro e dá um zoom nele em cada batida da música.'),
    face: { zoom: 1, smoothness: 0.4 },
  }),
  pack('close-sonhador', t('Close sonhador'), 'Seguir rosto', {
    fadeIn: 0.6,
    fadeOut: 0.6,
    description: t('O rosto no centro, com brilho difuso, tons pastel e a câmera chegando perto bem devagar.'),
    face: { zoom: 1, smoothness: 0.9 },
    effects: [fx('brilho', { threshold: 0.45, intensity: 1, radius: 24 })],
    filter: look('pastel', 0.7),
    camera: cam({ zoom: [[0, 1.3, 'linear'], [6, 1.45]] }),
  }),
  pack('close-nervoso', t('Close nervoso'), 'Seguir rosto', {
    duration: 6,
    timing: 'stretch',
    anchor: 'cursor',
    description: t('A câmera não para quieta no rosto: pequenos trancos de zoom e uma tremida, como quem está ansioso.'),
    face: { zoom: 1, smoothness: 0.3 },
    effects: [fx('tremor', { intensity: 0.12, speed: 12, rotation: 0.3 })],
    camera: cam({
      zoom: [
        [0, 1.4, 'hold'], [0.7, 1.48, 'hold'], [1.1, 1.42, 'hold'], [1.9, 1.52, 'hold'], [2.4, 1.45, 'hold'],
        [3.3, 1.55, 'hold'], [3.8, 1.47, 'hold'], [4.6, 1.56, 'hold'], [5.2, 1.5, 'hold'],
      ],
    }),
  }),
  pack('retrato-classico', t('Retrato clássico'), 'Seguir rosto', {
    description: t('Close no rosto em preto e branco de filme, com grão e cantos escuros. Para depoimentos marcantes.'),
    face: { zoom: 'auto', smoothness: 0.7 },
    effects: [fx('granulado', { amount: 0.2 }), fx('vinheta', { intensity: 0.55 })],
    filter: look('ilford'),
    camera: cam({}),
  }),

  // ------------------------------------------------------------ Câmera lenta e velocidade
  pack('rastro-em-camera-lenta', t('Rastro em câmera lenta'), 'Câmera lenta e velocidade', {
    ...slow([0.4], 2),
    description: t('Câmera lenta em que o movimento deixa rastros de luz. Fica lindo com dança, fogos de artifício e luzes da cidade.'),
    effects: [fx('eco-temporal', { modo: 0, copias: 6, espaco: 0.06, brilho: 0.7 }), fx('brilho', { threshold: 0.5, intensity: 0.8, radius: 18 })],
  }),
  pack('manobra-em-sequencia', t('Manobra em sequência'), 'Câmera lenta e velocidade', {
    ...slow([0.5], 2),
    description: t('Câmera lenta com cópias da pessoa ao longo do movimento, como foto sequencial de skate, salto ou dança.'),
    effects: [fx('eco-temporal', { modo: 1, copias: 5, espaco: 0.12 })],
  }),
  pack('stop-motion', t('Stop motion'), 'Câmera lenta e velocidade', {
    duration: 4,
    anchor: 'cursor',
    description: t('O vídeo passa a 8 quadros por segundo, com a luz variando de leve, como animação feita quadro a quadro.'),
    effects: [
      fx('quadros-travando', { passo: 0.125, irregular: 0, tranco: 0.15 }),
      fx('oscilacao-de-brilho', { forca: 0.15, quedas: 0, faixa: 0 }),
      fx('granulado', { amount: 0.15 }),
    ],
  }),

  // ------------------------------------------------------------ Comédia e memes
  pack('multiplicou', t('Multiplicou'), 'Comédia e memes', {
    duration: 4,
    anchor: 'cursor',
    description: t('Aparecem cópias da pessoa ao lado, cada uma um pouco atrasada, repetindo tudo o que ela faz.'),
    effects: [fx('clones', { copias: 3, atraso: 0.18, distancia: 0.2 })],
  }),
  pack('virou-po', t('Virou pó'), 'Comédia e memes', {
    duration: 3.5,
    timing: 'fixed',
    anchor: 'cursor',
    description: t('A pessoa se desfaz em poeira e voa com o vento. Para quem sumiu de vergonha (ou levou um estalo de dedos).'),
    effects: [fx('desintegrar', { inicio: 0.5, duracaoPo: 2.5 }), fx('vinheta', { intensity: 0.4 })],
  }),
  pack('cerebro-derretendo', t('Cérebro derretendo'), 'Comédia e memes', {
    ...moment(2.5),
    description: t('A imagem escorre e torce devagar enquanto as cores estouram: aquela informação que o cérebro não conseguiu processar.'),
    effects: [
      fx('derreter', {}, { amount: [[0, 0], [2.5, 0.7]] }),
      fx('redemoinho', { speed: 0.5 }, { strength: [[0, 0], [2.5, 3]] }),
      fx('ajuste-cor', { saturation: 1.6, contrast: 1.2 }),
    ],
  }),

  // ------------------------------------------------------------ Impacto e ritmo
  pack('quadro-de-impacto', t('Quadro de impacto'), 'Impacto e ritmo', {
    ...moment(0.6),
    description: t('Dois quadros em negativo, contraste estourado e um tranco: o "impact frame" dos animes, para socos e golpes.'),
    effects: [
      fx('ajuste-cor', {}, { contrast: [[0, 1.8, 'hold'], [0.2, 1]], saturation: [[0, 0, 'hold'], [0.2, 1]] }),
      fx('tremor', { speed: 24, rotation: 0.6 }, { intensity: [[0, 1, 'ease-out'], [0.6, 0]] }),
    ],
    filter: look('negativo', 1, { intensity: [[0, 1, 'hold'], [0.05, 0, 'hold'], [0.1, 1, 'hold'], [0.15, 0, 'hold']] }),
    camera: cam({ zoom: [[0, 1.2, 'ease-out'], [0.6, 1.0]] }),
  }),
  pack('batimento', t('Batimento cardíaco'), 'Impacto e ritmo', {
    ...moment(1.4),
    description: t('Duas batidas de coração seguidas: a imagem pulsa, as bordas avermelham e voltam. Para tensão e sustos.'),
    effects: [
      fx('vinheta', { tint: '#5a0000', size: 0.35 }, { intensity: [[0, 0.3], [0.08, 0.9], [0.22, 0.5], [0.3, 0.85], [0.9, 0.3]] }),
      fx('desfoque-radial', {}, { strength: [[0, 0], [0.08, 0.25], [0.22, 0], [0.3, 0.2], [0.6, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.08, 1.1], [0.22, 1.02, 'ease-out'], [0.3, 1.08], [0.7, 1.0]] }),
  }),

  // ------------------------------------------------------------ Passagens no corte
  pack('passagem-datamosh', t('Datamosh'), 'Passagens no corte', {
    ...moment(1.2, 'cut'),
    fadeOut: 0.3,
    description: t('No corte, os pixels do primeiro clipe não se renovam e escorrem junto com o movimento do segundo. Funciona tocando.'),
    effects: [fx('datamosh', { forca: 0.95, amplificar: 2, blocos: 0.6, cores: 0.3 })],
  }),
  pack('troca-de-canal', t('Troca de canal'), 'Passagens no corte', {
    ...moment(0.6, 'cut'),
    description: t('Como mudar de canal numa TV antiga: um piscar de chiado e a imagem nova entra rolando.'),
    effects: [
      fx('rolagem-vertical', { velocidade: 0, barra: 0.5 }, { deslocamento: [[0, 0, 'hold'], [0.3, 0.6, 'ease-out'], [0.6, 1]] }),
      fx('entrelacado', { forca: 0.6 }),
      fx('estatica-tv', {}, { amount: [[0, 0], [0.25, 1, 'hold'], [0.35, 1], [0.6, 0]] }),
    ],
  }),
  pack('passagem-redemoinho', t('Redemoinho'), 'Passagens no corte', {
    ...moment(0.9, 'cut'),
    description: t('A imagem torce em espiral até o corte e destorce já no próximo clipe.'),
    effects: [
      fx('redemoinho', { radius: 0.8 }, { strength: [[0, 0, 'ease-in'], [0.45, 9, 'ease-out'], [0.9, 0]] }),
      fx('desfoque-radial', {}, { strength: [[0, 0], [0.45, 0.4], [0.9, 0]] }),
    ],
  }),

  // ------------------------------------------------------------ Aberturas e finais
  pack('tv-ligando', t('TV ligando'), 'Aberturas e finais', {
    duration: 1.5,
    anchor: 'clip-start',
    description: t('O vídeo começa como uma TV de tubo ligando: um ponto de luz vira linha, a linha abre a imagem e o chiado some.'),
    effects: [
      fx('crt', {}, { curvature: [[0, 0.5], [1.5, 0]], lines: [[0, 0.6], [1.5, 0]] }),
      fx('estatica-tv', {}, { amount: [[0, 0.6], [1.2, 0]] }),
      fx('tv-desligando', { modo: 1, duracaoTv: 0.6 }),
    ],
  }),
  pack('tv-desligando', t('TV desligando'), 'Aberturas e finais', {
    duration: 1.2,
    anchor: 'clip-end',
    description: t('O fim do vídeo como uma TV de tubo desligando: a imagem se espreme numa linha branca e some num ponto.'),
    effects: [fx('crt', {}, { curvature: [[0, 0], [0.6, 0.5]], lines: [[0, 0], [0.6, 0.6]] }), fx('tv-desligando', { modo: 0, duracaoTv: 0.7 })],
  }),
  pack('abertura-caleidoscopio', t('Abertura caleidoscópio'), 'Aberturas e finais', {
    duration: 3,
    anchor: 'clip-start',
    fadeOut: 1.5,
    description: t('O vídeo começa espelhado em fatias que giram, como num caleidoscópio, e vai se desfazendo até a imagem normal.'),
    effects: [fx('caleidoscopio', { segments: 8, speed: 0.6, zoom: 1.2 }), fx('brilho', { threshold: 0.5, intensity: 0.8, radius: 20 })],
  }),

  // ------------------------------------------------------------ Vlog e lifestyle
  pack('saindo-da-foto', t('Saindo da foto'), 'Vlog e lifestyle', {
    duration: 4,
    anchor: 'cursor',
    description: t('O vídeo vira uma foto inclinada com borda branca e a pessoa salta para fora dela, em 3D.'),
    effects: [fx('sair-da-moldura')],
  }),
  pack('mundinho', t('Mundinho'), 'Vlog e lifestyle', {
    description: t('A paisagem se enrola num planetinha que gira devagar. Fica ótimo com céu, praia e cidade filmados de longe.'),
    effects: [fx('pequeno-planeta', { zoom: 1, spin: 0.08 })],
    filter: look('vivido', 0.5),
  }),
  pack('manha-preguicosa', t('Manhã preguiçosa'), 'Vlog e lifestyle', {
    description: t('Sol entrando pela janela, poeira brilhando no ar e a câmera quase parada. Para café da manhã, rotina e domingo.'),
    effects: [
      fx('brilho', { threshold: 0.55, intensity: 0.6, radius: 20 }),
      fx('particulas-de-luz', { amount: 0.4, size: 0.8, speed: 0.2, hue: 0.1 }),
    ],
    filter: look('luz-de-janela', 0.9),
    camera: cam({ zoom: [[0, 1.04, 'linear'], [6, 1.1]], x: [[0, 0.49, 'linear'], [6, 0.51]] }),
  }),
  pack('modo-retrato', t('Modo retrato'), 'Vlog e lifestyle', {
    description: t('Quem está perto fica nítido e o fundo desfoca, como o modo retrato do celular. A IA estima a profundidade.'),
    effects: [fx('foco-que-muda', { de: 1, para: 1, inicio: 0, duracaoFoco: 0.1, forca: 0.55, nitido: 0.2 }), fx('vinheta', { intensity: 0.25 })],
    filter: look('pele-suave', 0.5),
  }),

  // ------------------------------------------------------------ Retrô e nostalgia
  pack('video-de-casamento', t('Vídeo de casamento anos 90'), 'Retrô e nostalgia', {
    fadeIn: 0.5,
    fadeOut: 0.5,
    description: t('Fita de casamento de filmadora: brilho difuso exagerado, bordas claras, cor de VHS e um leve fantasma na imagem.'),
    effects: [
      fx('cor-borrada-vhs', { vazamento: 0.4, atraso: 0.3, maciez: 0.5, ruidoCor: 0.2 }),
      fx('fantasma-de-imagem', { distancia: 0.015, forca: 0.3, contorno: 0.2, oscilacao: 0 }),
      fx('brilho', { threshold: 0.5, intensity: 1.1, radius: 26 }),
      fx('vinheta', { intensity: 0.6, tint: '#fff3e6', size: 0.4 }),
    ],
    filter: look('rosado', 0.5),
  }),
  pack('oculos-3d', t('Óculos 3D'), 'Retrô e nostalgia', {
    description: t('Vermelho e ciano separados, como os filmes 3D dos anos 50 vistos com óculos de papel.'),
    effects: [fx('anaglifo', { amount: 0.012 }), fx('granulado', { amount: 0.15 }), fx('vinheta', { intensity: 0.3 })],
  }),
  pack('reportagem-antiga', t('Reportagem dos anos 80'), 'Documentário e notícia', {
    description: t('Material de telejornal antigo: cor de fita de emissora, linhas entrelaçadas e um contorno marcado nas bordas.'),
    effects: [
      fx('cor-borrada-vhs', { vazamento: 0.5, atraso: 0.35, maciez: 0.45, ruidoCor: 0.25 }),
      fx('fantasma-de-imagem', { distancia: 0.012, forca: 0.25, contorno: 0.45, oscilacao: 0 }),
      fx('entrelacado', { forca: 0.6 }),
      fx('troca-de-cabeca', { altura: 0.03, deslocamento: 0.4, ruido: 0.3 }),
    ],
    filter: look('desvanecido', 0.5),
  }),

  // ------------------------------------------------------------ Sonho e romance
  pack('aquarela', t('Pintura em aquarela'), 'Sonho e romance', {
    fadeIn: 0.8,
    fadeOut: 0.8,
    description: t('O vídeo vira uma pintura em aquarela, com tinta escorrendo e o papel aparecendo. Para lembranças e declarações.'),
    effects: [fx('aquarela', { bleed: 1 }), fx('brilho', { threshold: 0.55, intensity: 0.5, radius: 18 })],
    filter: look('pastel', 0.5),
  }),
  pack('sonho-submerso', t('Sonho submerso'), 'Sonho e romance', {
    timing: 'stretch',
    description: t('Tudo azul e ondulando, com raios de luz vindos de cima e partículas flutuando, como um sonho debaixo d’água.'),
    effects: [
      fx('debaixo-dagua', { strength: 1 }),
      fx('raios-de-luz', { amount: 0.8, source: [0.5, 0.95] }),
      fx('particulas-de-luz', { amount: 0.5, size: 0.7, speed: 0.2, hue: 0.55 }),
    ],
    camera: cam({ y: [[0, 0.48], [3, 0.52], [6, 0.48]], rotation: [[0, -1.5], [3, 1.5], [6, -1.5]] }, { zoom: 1.1 }),
  }),

  // ------------------------------------------------------------ Suspense e terror
  pack('presenca', t('Presença'), 'Suspense e terror', {
    description: t('A pessoa deixa cópias pálidas para trás quando se mexe, como se alguma coisa a acompanhasse.'),
    effects: [
      fx('rastro-pessoa', { quantidade: 6, espaco: 0.07, cor: '#9fb4c8', tingir: 0.6, opacidade: 0.55 }),
      fx('granulado', { amount: 0.2 }),
      fx('vinheta', { intensity: 0.7 }),
    ],
    filter: look('sombrio', 0.9),
  }),
  pack('o-outro-lado', t('O outro lado'), 'Suspense e terror', {
    description: t('Um mundo paralelo escuro e gelado, com esporos flutuando no ar e clarões vermelhos ao longe.'),
    effects: [
      fx('ajuste-cor', { brightness: -0.06, saturation: 0.6, contrast: 1.15 }),
      fx('particulas-de-luz', { amount: 0.9, size: 0.7, speed: 0.15, hue: 0.58 }),
      fx('flash', { tint: '#ff2a2a', glow: 0.8 }, {
        amount: [[0, 0], [1.9, 0, 'hold'], [1.95, 0.35], [2.4, 0, 'hold'], [4.5, 0, 'hold'], [4.55, 0.45], [4.7, 0.1], [4.8, 0.3], [5.3, 0]],
      }),
      fx('vinheta', { intensity: 0.7 }),
    ],
    filter: look('frio', 0.9),
  }),

  // ------------------------------------------------------------ Ação e games
  pack('visao-termica', t('Visão térmica'), 'Ação e games', {
    description: t('Imagem de câmera térmica, do azul frio ao branco quente. Para perseguições, caçadas e missões noturnas.'),
    effects: [fx('camera-termica', { contrast: 1.4 }), fx('granulado', { amount: 0.15 }), fx('vinheta', { intensity: 0.35 })],
  }),
  pack('mensagem-holografica', t('Mensagem holográfica'), 'Ação e games', {
    description: t('A cena vira uma projeção azul tremida, com linhas e falhas, como uma mensagem de nave espacial.'),
    effects: [
      fx('holograma', { tint: '#3fd4ff', opacity: 0.9 }),
      fx('brilho', { threshold: 0.4, intensity: 1.2, radius: 20 }),
      fx('glitch-digital', { amount: 0.1, rate: 3 }),
    ],
  }),
  pack('mundo-parado', t('Mundo parado'), 'Ação e games', {
    duration: 4,
    timing: 'fixed',
    anchor: 'cursor',
    description: t('O mundo congela e só a pessoa continua se mexendo, com o cenário parado e sem cor. Para poderes e cenas de super-herói.'),
    effects: [fx('congelar-pessoa', { momento: 0.6, duracaoGelo: 0, modo: 1, contorno: 0.3, dessaturar: 0.5 })],
  }),

  // ------------------------------------------------------------ Documentário e notícia
  pack('sala-de-monitores', t('Sala de monitores'), 'Documentário e notícia', {
    description: t('O vídeo repetido numa parede de monitores, como na sala de controle de uma emissora ou da segurança.'),
    effects: [fx('multiplas-telas', { grid: 3, gap: 6 }), fx('entrelacado', { forca: 0.5 }), fx('crt', { curvature: 0.2, lines: 0.4 })],
  }),

  // ------------------------------------------------------------ Clima e estações
  pack('cerracao', t('Cerração'), 'Clima e estações', {
    description: t('Neblina densa só no fundo da cena: quem está perto fica nítido e o resto some no branco. A IA estima a profundidade.'),
    effects: [fx('neblina-fundo', { neblina: 0.75, cor: '#d5dde6', alcance: 0.55, raios: 0.3, movimento: 0.5 })],
    filter: look('nevoa', 0.5),
  }),
  pack('primavera', t('Primavera'), 'Clima e estações', {
    description: t('Cores frescas, luz suave e partículas rosadas flutuando como pólen e pétalas.'),
    effects: [
      fx('particulas-de-luz', { amount: 0.8, size: 1.1, speed: 0.3, hue: 0.92 }),
      fx('brilho', { threshold: 0.55, intensity: 0.5, radius: 18 }),
    ],
    filter: look('primavera'),
  }),
  pack('aurora-boreal', t('Aurora boreal'), 'Clima e estações', {
    description: t('O céu vira uma aurora boreal se mexendo e a cena ganha a luz verde e fria dela. A IA encontra o céu pela profundidade.'),
    effects: [fx('trocar-ceu', { ceu: 2, limite: 0.35, luz: 0.5, velocidade: 0.3 })],
    filter: look('frio', 0.4),
  }),

  // ------------------------------------------------------------ Batidas da música
  pack('fita-nas-batidas', t('Fita nas batidas'), 'Batidas da música', {
    ...onBeats({ 'effects.0.intensidade': pulse(0, [[0, 1], [0.25, 0]]), 'effects.1.amount': pulse(0.05, [[0, 0.5], [0.15, 0.05]]) }),
    description: t('Em cada batida a fita falha: uma faixa de tracking atravessa a tela e o chiado sobe.'),
    effects: [fx('erro-de-tracking', { intensidade: 0, largura: 0.25, velocidade: 2 }), fx('estatica-tv', { amount: 0.05 })],
    filter: look('cor-de-vhs', 0.6),
  }),
  pack('contorno-nas-batidas', t('Contorno nas batidas'), 'Batidas da música', {
    ...onBeats({ 'effects.0.brilho': pulse(0.2, [[0, 1.5], [0.3, 0.2]]) }),
    description: t('Uma linha neon em volta da pessoa acende forte em cada batida e vai mudando de cor sozinha.'),
    effects: [fx('contorno-neon', { brilho: 0.2, pulso: 0, arcoiris: 1 })],
  }),
];

type Extras = Pick<PackTemplate, 'muteSlow'>;

/** Câmera lenta muda de alguns pacotes acima. */
const EXTRAS: Record<string, Extras> = {
  'queda-epica': { muteSlow: true },
  'derrota-dramatica': { muteSlow: true },
  'esse-sou-eu': { muteSlow: true },
  'camera-lenta-desnecessaria': { muteSlow: true },
};

export const PACKS: PackTemplate[] = [...BASE_PACKS, ...MORE_PACKS].map((template) => {
  const extra = EXTRAS[template.id.replace(/^packs\//, '')];
  if (!extra) return template;
  return { ...template, ...extra };
});
