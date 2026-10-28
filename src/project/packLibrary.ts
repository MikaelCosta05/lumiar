import { hexToRgb } from '../engine/color';
import type { Easing, Keyframe, KeyframeMap } from '../engine/keyframes';
import type { ParamValue, ParamValues } from '../engine/types';
import type { CameraTransform } from './camera';
import type { BeatPattern, PackAnchor, PackTemplate, PackTiming, PulsePoint } from './packs';

/**
 * Pacotes prontos. Cada um é uma receita: filtro + efeitos + movimento de câmera (+ texto),
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
  text?: PackTemplate['text'];
  speed?: number[];
  beat?: BeatPattern;
  face?: PackTemplate['face'];
  sounds?: PackTemplate['sounds'];
  stickers?: PackTemplate['stickers'];
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
    text: recipe.text,
    speed: recipe.speed,
    beat: recipe.beat,
    face: recipe.face,
    sounds: recipe.sounds,
    stickers: recipe.stickers,
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

/** Mesmo ponto de speedTime, em segundos reais do bloco final (para o texto entrar na hora certa). */
function speedSeconds(speeds: number[], d: number, fraction: number): number {
  const part = 1 / speeds.length;
  return speeds.reduce((at, sp, k) => at + Math.max(0, Math.min(part, fraction - k * part)) / sp, 0) * d;
}

/** Trecho que começa no cursor e muda de velocidade (d = segundos do vídeo original). */
const slow = (speeds: number[], d: number) => ({ duration: d, timing: 'stretch' as const, anchor: 'cursor' as const, speed: speeds });

/** Momentos curtos (batidas, passagens): animação inteira estica junto com o bloco. */
const moment = (duration: number, anchor: PackAnchor = 'cursor') => ({ duration, timing: 'stretch' as const, anchor });

const BASE_PACKS: PackTemplate[] = [
  // ------------------------------------------------------------ Cinematográfico
  pack('abertura-de-cinema', 'Abertura de cinema', 'Cinematográfico', {
    anchor: 'clip-start',
    description: 'Sai do preto, as barras de cinema entram, cor de blockbuster e um zoom lento. Vem com título.',
    effects: [
      fx('barras-cinema', { aspect: 2.39 }, { aspect: [[0, 1.78], [1.4, 2.39], [4.6, 2.39], [6, 1.78]] }),
      fx('vinheta', { intensity: 0.45, size: 0.5 }),
      fx('granulado', { amount: 0.12, flicker: 0.1 }),
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 1], [1.2, 0]] }),
    ],
    filter: look('blockbuster', 0.85),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [6, 1.12]] }),
    text: { preset: 'filme', text: 'O COMEÇO', offset: 1.2, duration: 3.6 },
  }),
  pack('teal-orange', 'Teal & orange', 'Cinematográfico', {
    description: 'A cor clássica de filme de ação: pele quente, sombras azuladas, barras finas.',
    effects: [fx('ajuste-cor', { contrast: 1.1, saturation: 1.08 }), fx('vinheta', { intensity: 0.35 }), fx('barras-cinema', { aspect: 2.0 })],
    filter: look('cinema', 0.9),
  }),
  pack('trailer-epico', 'Trailer épico', 'Cinematográfico', {
    description: 'Contraste pesado, brilho nas luzes e a câmera avançando devagar, como em trailer.',
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
  pack('drama-noir', 'Drama noir', 'Cinematográfico', {
    description: 'Preto e branco duro, grão de filme e vinheta fechada. Para cenas tensas.',
    effects: [fx('granulado', { amount: 0.3, size: 1.6 }), fx('vinheta', { intensity: 0.75, size: 0.35 })],
    filter: look('noir'),
    camera: cam({ zoom: [[0, 1.04, 'linear'], [6, 1.14]] }),
  }),
  pack('neo-noir', 'Noite neo-noir', 'Cinematográfico', {
    description: 'Noite de cidade com néon estourado, contraste alto e barras largas.',
    effects: [fx('brilho', { threshold: 0.55, intensity: 1.1, radius: 20 }), fx('barras-cinema', { aspect: 2.39 }), fx('vinheta', { intensity: 0.5 })],
    filter: look('neo-noir'),
  }),
  pack('fabula', 'Fábula', 'Cinematográfico', {
    description: 'Cores de conto de fadas, brilho suave e partículas de luz flutuando.',
    effects: [fx('brilho', { threshold: 0.5, intensity: 0.8, radius: 22 }), fx('particulas-de-luz', { amount: 0.6, hue: 0.12 })],
    filter: look('fabula', 0.9),
    fadeIn: 0.6,
    fadeOut: 0.6,
  }),

  // ------------------------------------------------------------ Vlog e lifestyle
  pack('vlog-ensolarado', 'Vlog ensolarado', 'Vlog e lifestyle', {
    description: 'Dia de sol: tons quentes, um pouco mais de cor e luz vazando na lente.',
    effects: [fx('ajuste-cor', { brightness: 0.03, saturation: 1.12, temperature: 0.15 }), fx('luz-vazada', { amount: 0.35, speed: 0.6 })],
    filter: look('kodak-gold', 0.6),
  }),
  pack('limpo-e-claro', 'Limpo e claro', 'Vlog e lifestyle', {
    description: 'Visual de vídeo de estúdio: claro, nítido e com as sombras abertas.',
    effects: [fx('ajuste-cor', { brightness: 0.04, contrast: 1.05, saturation: 1.05 })],
    filter: look('clarear-sombras', 0.7),
  }),
  pack('viagem', 'Diário de viagem', 'Vlog e lifestyle', {
    description: 'Cores vivas, reflexo de sol na lente e um movimento de câmera tipo Ken Burns.',
    effects: [fx('lens-flare', { amount: 0.6, source: [0.8, 0.82] }), fx('vinheta', { intensity: 0.25 })],
    filter: look('tropical', 0.75),
    camera: cam({ zoom: [[0, 1.08, 'linear'], [6, 1.25]], x: [[0, 0.46, 'linear'], [6, 0.54]] }),
  }),
  pack('comida', 'Comida apetitosa', 'Vlog e lifestyle', {
    description: 'Realça as cores quentes e os detalhes: deixa a comida com cara de gostosa.',
    effects: [fx('ajuste-cor', { contrast: 1.08, saturation: 1.2, temperature: 0.2 }), fx('vinheta', { intensity: 0.3 })],
    filter: look('amplificar', 0.5),
    camera: cam({ zoom: [[0, 1.05, 'linear'], [6, 1.15]] }),
  }),
  pack('pastel', 'Pastel suave', 'Vlog e lifestyle', {
    description: 'Tons claros e desbotados com brilho leve. Combina com moda e estética.',
    effects: [fx('brilho', { threshold: 0.6, intensity: 0.5, radius: 14 })],
    filter: look('pastel'),
  }),
  pack('zoom-no-ritmo', 'Pulsando no ritmo', 'Vlog e lifestyle', {
    description: 'A imagem pulsa a cada batida (120 BPM, ajustável no efeito). Para trechos com música.',
    effects: [fx('zoom-pulsante', { amount: 0.08, bpm: 120, flash: 0.12 })],
    filter: look('vivido', 0.5),
  }),

  // ------------------------------------------------------------ Impacto e ritmo
  pack('batida', 'Batida', 'Impacto e ritmo', {
    ...moment(0.5),
    description: 'Zoom rápido, flash e separação de cor numa batida. Coloque o cursor na batida da música.',
    effects: [
      fx('rgb-split', {}, { amount: [[0, 0.02, 'ease-out'], [0.3, 0]] }),
      fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.65, 'ease-out'], [0.25, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.06, 1.16], [0.5, 1.0]] }),
  }),
  pack('soco-de-zoom', 'Soco de zoom', 'Impacto e ritmo', {
    ...moment(0.8),
    description: 'A câmera avança de uma vez com desfoque de movimento e volta. Ótimo para reações.',
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0.7, 'ease-out'], [0.35, 0]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.12, 1.4], [0.8, 1.0]] }),
  }),
  pack('tremor-de-impacto', 'Tremor de impacto', 'Impacto e ritmo', {
    ...moment(0.9),
    description: 'Tremida forte que vai acalmando, com flash e cor separada. Para quedas, socos e explosões.',
    effects: [
      fx('tremor', { speed: 18, rotation: 0.6 }, { intensity: [[0, 1, 'ease-out'], [0.9, 0]] }),
      fx('rgb-split', {}, { amount: [[0, 0.025, 'ease-out'], [0.5, 0]] }),
      fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.5, 'ease-out'], [0.2, 0]] }),
    ],
    camera: cam({}, { zoom: 1.12 }),
  }),
  pack('flash-branco', 'Flash branco', 'Impacto e ritmo', {
    ...moment(0.45),
    description: 'Um clarão rápido, como flash de foto.',
    effects: [fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 0], [0.07, 1, 'ease-out'], [0.45, 0]] })],
  }),
  pack('piscada', 'Piscada', 'Impacto e ritmo', {
    ...moment(0.6),
    description: 'A tela apaga e acende duas vezes. Dá ritmo a cortes secos e sustos.',
    effects: [
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0, 'hold'], [0.08, 1, 'hold'], [0.18, 0, 'hold'], [0.3, 1, 'hold'], [0.4, 0, 'hold']] }),
    ],
  }),
  pack('glitch-rapido', 'Glitch rápido', 'Impacto e ritmo', {
    ...moment(0.6),
    description: 'Falha digital curta, com blocos, cor separada e a imagem tremendo.',
    effects: [
      fx('glitch-digital', { blocks: 14, rate: 20 }, { amount: [[0, 0.9], [0.6, 0]] }),
      fx('rgb-split', { angle: 90 }, { amount: [[0, 0.03], [0.6, 0]] }),
      fx('tremor', { speed: 25, rotation: 0.2 }, { intensity: [[0, 0.5], [0.6, 0]] }),
    ],
  }),
  pack('estouro-de-luz', 'Estouro de luz', 'Impacto e ritmo', {
    ...moment(0.8),
    description: 'As luzes estouram com brilho e raios e voltam ao normal.',
    effects: [
      fx('brilho', { threshold: 0.35, radius: 30 }, { intensity: [[0, 0], [0.15, 2, 'ease-out'], [0.8, 0]] }),
      fx('raios-de-luz', { source: [0.5, 0.6] }, { amount: [[0, 0], [0.15, 1.6, 'ease-out'], [0.8, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.15, 1.08], [0.8, 1.0]] }),
  }),

  // ------------------------------------------------------------ Passagens no corte
  pack('passagem-whoosh', 'Whoosh', 'Passagens no corte', {
    ...moment(0.6, 'cut'),
    description: 'Zoom com desfoque de movimento que "puxa" de um clipe para o outro. Fica centrado no corte.',
    effects: [
      fx('desfoque-radial', {}, { strength: [[0, 0], [0.3, 0.9], [0.6, 0]] }),
      fx('flash', { tint: '#ffffff' }, { amount: [[0, 0], [0.3, 0.35], [0.6, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [0.3, 1.3, 'ease-out'], [0.6, 1.0]] }),
  }),
  pack('passagem-giro', 'Giro rápido', 'Passagens no corte', {
    ...moment(0.7, 'cut'),
    description: 'A câmera gira e volta no corte, com desfoque. Muito usado em vídeos de viagem.',
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0], [0.35, 0.8], [0.7, 0]] })],
    camera: cam({
      zoom: [[0, 1.0, 'ease-in'], [0.35, 1.45, 'ease-out'], [0.7, 1.0]],
      rotation: [[0, 0, 'ease-in'], [0.35, -18, 'ease-out'], [0.7, 0]],
    }),
  }),
  pack('passagem-luz', 'Corte com luz', 'Passagens no corte', {
    ...moment(0.9, 'cut'),
    description: 'Uma luz quente invade a tela e esconde o corte. Suave e bonito.',
    effects: [
      fx('luz-vazada', { speed: 1.5 }, { amount: [[0, 0], [0.45, 1], [0.9, 0]] }),
      fx('flash', { tint: '#ffd9a8', glow: 0.8 }, { amount: [[0, 0], [0.45, 0.75], [0.9, 0]] }),
    ],
  }),
  pack('passagem-glitch', 'Corte com glitch', 'Passagens no corte', {
    ...moment(0.5, 'cut'),
    description: 'Falha digital bem no corte, como se o vídeo pulasse de canal.',
    effects: [
      fx('glitch', { speed: 8, bands: 24 }, { intensity: [[0, 0], [0.25, 1], [0.5, 0]] }),
      fx('rgb-split', {}, { amount: [[0, 0], [0.25, 0.035], [0.5, 0]] }),
    ],
  }),
  pack('passagem-desfoque', 'Desfoque de passagem', 'Passagens no corte', {
    ...moment(0.8, 'cut'),
    description: 'Desfoca até sumir e volta já no próximo clipe.',
    effects: [fx('desfoque', {}, { radius: [[0, 0], [0.4, 26], [0.8, 0]] })],
  }),
  pack('passagem-preto', 'Mergulho no preto', 'Passagens no corte', {
    ...moment(1, 'cut'),
    description: 'Escurece até o preto e volta no próximo clipe. A passagem de tempo clássica.',
    effects: [fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0], [0.5, 1], [1, 0]] })],
  }),

  // ------------------------------------------------------------ Aberturas e finais
  pack('entrada-do-preto', 'Entrada do preto', 'Aberturas e finais', {
    duration: 1.5,
    anchor: 'clip-start',
    description: 'O vídeo surge do preto, aos poucos.',
    effects: [fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 1], [1.5, 0]] })],
  }),
  pack('saida-para-o-preto', 'Saída para o preto', 'Aberturas e finais', {
    duration: 1.5,
    anchor: 'clip-end',
    description: 'O vídeo escurece até o preto no fim do clipe.',
    effects: [fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0], [1.5, 1]] })],
  }),
  pack('abertura-com-luz', 'Abertura com luz', 'Aberturas e finais', {
    duration: 2,
    anchor: 'clip-start',
    description: 'Começa num clarão branco e a câmera se afasta, revelando a cena.',
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 1], [0.9, 0]] }),
      fx('brilho', { threshold: 0.4, radius: 24 }, { intensity: [[0, 1.6], [1.6, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.3, 'ease-out'], [2, 1.0]] }),
  }),
  pack('abertura-desfocada', 'Abertura desfocada', 'Aberturas e finais', {
    duration: 2.5,
    anchor: 'clip-start',
    description: 'Começa fora de foco e vai ficando nítido, com um título por cima.',
    effects: [
      fx('desfoque', {}, { radius: [[0, 22], [2, 0]] }),
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0.6], [1.5, 0]] }),
    ],
    text: { preset: 'minimalista', text: 'Seu título aqui', offset: 0.4, duration: 2.1 },
  }),
  pack('final-de-video', 'Final de vídeo', 'Aberturas e finais', {
    duration: 3,
    anchor: 'clip-end',
    description: 'A imagem desfoca e escurece, com uma mensagem de despedida por cima.',
    effects: [
      fx('desfoque', {}, { radius: [[0, 0], [1.2, 14]] }),
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0], [1.2, 0.55], [3, 0.55]] }),
    ],
    text: { preset: 'titulo', text: 'Obrigado por assistir!', offset: 0.8, duration: 2.2 },
  }),
  pack('final-com-zoom', 'Final com zoom', 'Aberturas e finais', {
    duration: 2,
    anchor: 'clip-end',
    description: 'A câmera avança devagar e tudo some num branco suave.',
    effects: [fx('flash', { tint: '#ffffff', glow: 0.7 }, { amount: [[0, 0, 'ease-in'], [2, 1]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [2, 1.35]] }),
  }),

  // ------------------------------------------------------------ Retrô e nostalgia
  pack('fita-vhs', 'Fita VHS', 'Retrô e nostalgia', {
    description: 'Fita de videocassete: cor lavada, linhas, chiado e a imagem dançando.',
    effects: [fx('vhs', { noise: 0.35, lines: 0.4 }), fx('estatica-tv', { amount: 0.12 })],
    filter: look('cor-de-vhs'),
  }),
  pack('super-8', 'Super 8', 'Retrô e nostalgia', {
    description: 'Filme caseiro dos anos 70: grão forte, luz piscando, cantos escuros e quadro tremendo.',
    effects: [
      fx('granulado', { amount: 0.5, size: 2, flicker: 0.6 }),
      fx('luz-vazada', { amount: 0.3, speed: 0.8 }),
      fx('vinheta', { intensity: 0.6, size: 0.35 }),
      fx('tremor', { intensity: 0.06, speed: 6, rotation: 0.15 }),
    ],
    filter: look('super-8'),
    camera: cam({}, { zoom: 1.04 }),
  }),
  pack('filme-antigo', 'Filme antigo', 'Retrô e nostalgia', {
    description: 'Cinema mudo: preto e branco gasto, grão e tremor do projetor.',
    effects: [
      fx('granulado', { amount: 0.6, size: 1.8, flicker: 0.8 }),
      fx('vinheta', { intensity: 0.7, size: 0.3 }),
      fx('tremor', { intensity: 0.05, speed: 10, rotation: 0.1 }),
    ],
    filter: look('ruido-de-filme'),
    camera: cam({}, { zoom: 1.04 }),
  }),
  pack('anos-80', 'Anos 80 neon', 'Retrô e nostalgia', {
    description: 'Synthwave: néon rosa e azul, brilho e linhas de TV de tubo.',
    effects: [fx('brilho', { threshold: 0.5, intensity: 1, radius: 18 }), fx('rgb-split', { amount: 0.004 }), fx('crt', { curvature: 0.2, lines: 0.35 })],
    filter: look('miami'),
  }),
  pack('memoria', 'Memória', 'Retrô e nostalgia', {
    description: 'Lembrança distante: cores desbotadas, bordas claras e um leve desfoque.',
    effects: [
      fx('desfoque', { radius: 1.5 }),
      fx('brilho', { threshold: 0.45, intensity: 0.8, radius: 20 }),
      fx('vinheta', { intensity: 0.45, tint: '#fff6e0', size: 0.4 }),
    ],
    filter: look('nostalgia'),
    fadeIn: 0.8,
    fadeOut: 0.8,
  }),
  pack('polaroid', 'Foto Polaroid', 'Retrô e nostalgia', {
    description: 'Cor de foto instantânea com cantos escuros e um flash no começo.',
    effects: [
      fx('vinheta', { intensity: 0.4 }),
      fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 0.9], [0.5, 0]] }),
    ],
    filter: look('polaroid-600'),
  }),

  // ------------------------------------------------------------ Sonho e romance
  pack('sonho', 'Sonho', 'Sonho e romance', {
    description: 'Brilho difuso, tons pastel e partículas de luz. Entra e sai suave.',
    effects: [fx('brilho', { threshold: 0.4, intensity: 1.2, radius: 24 }), fx('particulas-de-luz', { amount: 0.6, size: 1.2, hue: 0.9 })],
    filter: look('pastel', 0.8),
    fadeIn: 1,
    fadeOut: 1,
  }),
  pack('romantico', 'Romântico', 'Sonho e romance', {
    description: 'Tons rosados, pele suave e luz quente vazando.',
    effects: [fx('brilho', { threshold: 0.55, intensity: 0.7, radius: 18 }), fx('luz-vazada', { amount: 0.3, speed: 0.5 })],
    filter: look('rosado'),
    fadeIn: 0.6,
    fadeOut: 0.6,
  }),
  pack('flashback', 'Flashback', 'Sonho e romance', {
    description: 'Entra com clarão e desfoque, fica desbotado e sai do mesmo jeito. Para lembranças.',
    effects: [
      fx('desfoque', { radius: 2 }, { radius: [[0, 14], [0.8, 2], [5.2, 2], [6, 14]] }),
      fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 0.9], [0.8, 0], [5.2, 0], [6, 0.9]] }),
      fx('vinheta', { intensity: 0.5, tint: '#ffffff', size: 0.45 }),
    ],
    filter: look('mono-suave', 0.8),
  }),
  pack('golden-hour', 'Hora dourada', 'Sonho e romance', {
    description: 'Luz de fim de tarde: dourado, reflexo de sol e brilho nas altas luzes.',
    effects: [fx('lens-flare', { amount: 0.8, source: [0.78, 0.8] }), fx('brilho', { threshold: 0.6, intensity: 0.6, radius: 16 })],
    filter: look('brilho-dourado'),
  }),

  // ------------------------------------------------------------ Suspense e terror
  pack('suspense', 'Suspense', 'Suspense e terror', {
    description: 'Tudo mais escuro e frio, com a câmera chegando perto bem devagar.',
    effects: [fx('vinheta', { intensity: 0.8, size: 0.3 }), fx('granulado', { amount: 0.2 })],
    filter: look('sombrio'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [6, 1.22]] }),
  }),
  pack('terror', 'Terror', 'Suspense e terror', {
    description: 'Cor doentia, chiado, visão dobrada e tremidas. Para cenas de susto.',
    effects: [
      fx('visao-dupla', { amount: 0.25, speed: 0.8 }),
      fx('estatica-tv', { amount: 0.12 }),
      fx('tremor', { intensity: 0.08, speed: 12, rotation: 0.3 }),
      fx('vinheta', { intensity: 0.85, size: 0.28 }),
    ],
    filter: look('terror'),
    camera: cam({}, { zoom: 1.06 }),
  }),
  pack('camera-de-seguranca', 'Câmera de segurança', 'Suspense e terror', {
    description: 'Gravação de vigilância: preto e branco granulado, chiado e marcação de câmera.',
    effects: [fx('granulado', { amount: 0.45, size: 1.4 }), fx('estatica-tv', { amount: 0.18 }), fx('crt', { curvature: 0.15, lines: 0.5 })],
    filter: look('preto-e-branco', 1, {}, { contrast: 1.3 }),
    text: { preset: 'etiqueta', text: 'CAM 03 · REC', offset: 0, duration: 6 },
  }),
  pack('visao-noturna', 'Visão noturna', 'Suspense e terror', {
    description: 'Câmera de visão noturna verde, com grão e brilho.',
    effects: [fx('visao-noturna', { gain: 2.2, grain: 0.45, binocular: 0 })],
  }),

  // ------------------------------------------------------------ Ação e games
  pack('adrenalina', 'Adrenalina', 'Ação e games', {
    description: 'Contraste alto, cores fortes e a câmera avançando. Para esporte e ação.',
    effects: [fx('ajuste-cor', { contrast: 1.2, saturation: 1.2 }), fx('vinheta', { intensity: 0.45 })],
    filter: look('hdr', 0.8),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [6, 1.12]] }),
  }),
  pack('gamer', 'Gamer', 'Ação e games', {
    description: 'Visual de stream: cyberpunk, brilho nas luzes e falhas digitais leves.',
    effects: [
      fx('brilho', { threshold: 0.5, intensity: 1, radius: 16 }),
      fx('rgb-split', { amount: 0.004 }),
      fx('glitch-digital', { amount: 0.12, rate: 4 }),
    ],
    filter: look('cyberpunk'),
  }),
  pack('momento-epico', 'Momento épico', 'Ação e games', {
    description: 'Para o lance decisivo: entra com flash, fica dramático e com barras de cinema.',
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 0.8], [0.5, 0]] }),
      fx('barras-cinema', { aspect: 2.39 }, { aspect: [[0, 1.78], [0.5, 2.39]] }),
      fx('vinheta', { intensity: 0.5 }),
    ],
    filter: look('dramatico', 0.8),
    camera: cam({ zoom: [[0, 1.15, 'ease-out'], [1.2, 1.25, 'linear'], [6, 1.32]] }),
    duration: 4,
  }),
  pack('matrix', 'Matrix', 'Ação e games', {
    description: 'Tudo verde com chuva de código ao fundo. Dá para dosar na intensidade.',
    effects: [fx('matrix', { backdrop: 0.75 })],
    filter: look('matrix'),
    intensity: 0.85,
  }),

  // ------------------------------------------------------------ Documentário e notícia
  pack('documentario', 'Documentário', 'Documentário e notícia', {
    description: 'Imagem natural e caprichada, movimento lento de câmera e faixa com nome.',
    effects: [fx('vinheta', { intensity: 0.25 })],
    filter: look('aprimorar', 0.8),
    camera: cam({ zoom: [[0, 1.06, 'linear'], [6, 1.16]], x: [[0, 0.47, 'linear'], [6, 0.53]] }),
    text: { preset: 'faixa', text: 'Nome da pessoa\nO que ela faz', offset: 0.6, duration: 4.4 },
  }),
  pack('entrevista', 'Entrevista', 'Documentário e notícia', {
    description: 'Pele suave, enquadramento mais fechado (segundo ângulo) e faixa de nome.',
    effects: [fx('ajuste-cor', { temperature: 0.08, contrast: 1.04 })],
    filter: look('pele-suave', 0.7),
    camera: cam({}, { zoom: 1.2, y: 0.45 }),
    text: { preset: 'faixa', text: 'Nome do entrevistado\nCargo', offset: 0.4, duration: 4 },
  }),
  pack('plantao', 'Plantão', 'Documentário e notícia', {
    description: 'Urgente: entra com flash, imagem contrastada e a tarja de notícia.',
    effects: [fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.8], [0.35, 0]] })],
    filter: look('contraste', 0.8),
    camera: cam({ zoom: [[0, 1.12, 'ease-out'], [0.4, 1.0]] }),
    text: { preset: 'urgente', text: 'URGENTE', offset: 0.2, duration: 4 },
    duration: 5,
  }),
  pack('arquivo', 'Imagem de arquivo', 'Documentário e notícia', {
    description: 'Parece material antigo de acervo: sépia, grão e cantos gastos.',
    effects: [fx('granulado', { amount: 0.35, flicker: 0.4 }), fx('vinheta', { intensity: 0.55 })],
    filter: look('sepia'),
  }),

  // ------------------------------------------------------------ Clima e estações
  pack('dia-de-chuva', 'Dia de chuva', 'Clima e estações', {
    description: 'Céu fechado, cor fria e chuva caindo por cima de tudo.',
    effects: [fx('chuva', { amount: 0.7, slant: 0.15 }), fx('vinheta', { intensity: 0.4 })],
    filter: look('dias-de-chuva'),
  }),
  pack('inverno', 'Inverno com neve', 'Clima e estações', {
    description: 'Tons gelados e neve caindo devagar.',
    effects: [fx('neve', { amount: 0.85, speed: 0.5 })],
    filter: look('inverno'),
  }),
  pack('verao', 'Verão', 'Clima e estações', {
    description: 'Calor: cores quentes e saturadas, sol na lente e a imagem ondulando de leve.',
    effects: [fx('lens-flare', { amount: 0.9, source: [0.75, 0.82] }), fx('calor', { amount: 0.4, bottom: 0.4 })],
    filter: look('por-do-sol', 0.8),
  }),
  pack('outono', 'Outono', 'Clima e estações', {
    description: 'Laranjas e marrons acolhedores, com luz vazando suave.',
    effects: [fx('luz-vazada', { amount: 0.25, speed: 0.5 })],
    filter: look('outono'),
  }),

  // ------------------------------------------------------------ Edits virais
  pack('velocity', 'Velocity', 'Edits virais', {
    duration: 3,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [1.8, 1.8, 0.25, 0.25, 1.8],
    description: 'O edit do TikTok: acelera, freia quase parando com um flash e acelera de novo. Ponha o cursor antes do momento alto.',
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
  pack('glow-edit', 'Glow edit', 'Edits virais', {
    description: 'Brilho estourado nas luzes, cores vivas e partículas. O visual "aesthetic" das edições de fã.',
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
  pack('edit-de-carro', 'Edit de carro', 'Edits virais', {
    description: 'Noite de cidade, sensação de velocidade (desfoque de movimento e tremor) e brilho nos faróis.',
    effects: [
      fx('desfoque-radial', { strength: 0.22 }),
      fx('tremor', { intensity: 0.12, speed: 14, rotation: 0.2 }),
      fx('brilho', { threshold: 0.5, intensity: 1.2, radius: 20 }),
      fx('vinheta', { intensity: 0.55 }),
    ],
    filter: look('neo-noir', 0.9),
    camera: cam({ zoom: [[0, 1.12, 'linear'], [6, 1.22]] }),
  }),
  pack('edit-sombrio', 'Edit sombrio', 'Edits virais', {
    duration: 4,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.6],
    description: 'Mais lento, escuro e granulado, com a câmera chegando perto. Para edits "dark".',
    effects: [fx('granulado', { amount: 0.3, size: 1.5 }), fx('vinheta', { intensity: 0.8, size: 0.3 }), fx('rgb-split', { amount: 0.003 })],
    filter: look('sombrio'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4, 1.18]] }),
    fadeIn: 0.3,
    fadeOut: 0.3,
  }),
  pack('shake-edit', 'Shake de edit', 'Edits virais', {
    ...moment(1.2),
    description: 'Três tremidas fortes em sequência, com cor separada. Para o drop da música.',
    effects: [
      fx('tremor', { speed: 22, rotation: 0.7 }, { intensity: [[0, 0.9, 'ease-out'], [0.18, 0.1], [0.4, 0.9, 'ease-out'], [0.58, 0.1], [0.8, 0.9, 'ease-out'], [1.2, 0]] }),
      fx('rgb-split', {}, { amount: [[0, 0.025], [0.18, 0.004], [0.4, 0.025], [0.58, 0.004], [0.8, 0.025], [1.2, 0]] }),
    ],
    camera: cam({}, { zoom: 1.14 }),
  }),
  pack('anime-edit', 'Edit de anime', 'Edits virais', {
    duration: 4,
    timing: 'stretch',
    anchor: 'cursor',
    description: 'Entra com clarão, cores de anime, linhas de velocidade (desfoque radial) e brilho.',
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 1], [0.4, 0]] }),
      fx('desfoque-radial', {}, { strength: [[0, 0.7], [0.8, 0.15], [4, 0.15]] }),
      fx('brilho', { threshold: 0.45, intensity: 1.2, radius: 22 }),
      fx('particulas-de-luz', { amount: 0.5, hue: 0.55 }),
    ],
    filter: look('pop', 0.7),
    camera: cam({ zoom: [[0, 1.35, 'ease-out'], [0.8, 1.1, 'linear'], [4, 1.18]] }),
  }),
  pack('dolly-3d', 'Zoom 3D', 'Edits virais', {
    ...moment(1.6),
    description: 'A câmera avança enquanto a imagem entorta nas bordas, dando sensação de profundidade.',
    effects: [fx('olho-de-peixe', {}, { strength: [[0, 0], [0.8, 0.45], [1.6, 0]] })],
    camera: cam({ zoom: [[0, 1.0], [0.8, 1.45], [1.6, 1.0]] }),
  }),
  pack('pov', 'POV', 'Edits virais', {
    duration: 5,
    anchor: 'cursor',
    description: 'Legenda de "POV" no topo, cor suave e a câmera respirando. Troque o texto pelo seu.',
    effects: [fx('vinheta', { intensity: 0.3 })],
    filter: look('suave', 0.7),
    camera: cam({ zoom: [[0, 1.04], [2.5, 1.1], [5, 1.04]] }),
    text: { preset: 'legenda', text: 'POV: você descobriu os pacotes do Lumiar', offset: 0, duration: 5 },
  }),
  pack('flash-de-drop', 'Drop', 'Edits virais', {
    ...moment(1.4),
    description: 'O drop da música: tela branca, zoom de impacto, tremida e brilho que vai baixando.',
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 1, 'ease-out'], [0.35, 0]] }),
      fx('tremor', { speed: 20, rotation: 0.5 }, { intensity: [[0, 0.8, 'ease-out'], [1.0, 0]] }),
      fx('brilho', { threshold: 0.4, radius: 26 }, { intensity: [[0, 2, 'ease-out'], [1.4, 0.2]] }),
    ],
    camera: cam({ zoom: [[0, 1.4, 'ease-out'], [0.6, 1.12], [1.4, 1.05]] }),
  }),

  // ------------------------------------------------------------ Batidas da música
  pack('zoom-nas-batidas', 'Zoom nas batidas', 'Batidas da música', {
    ...onBeats({ 'camera.zoom': pulse(1, [[0, 1.12, 'ease-out'], [0.28, 1]]) }),
    description: 'Detecta as batidas da música e dá um zoom rápido em cada uma.',
  }),
  pack('flash-nas-batidas', 'Flash nas batidas', 'Batidas da música', {
    ...onBeats({ 'effects.0.amount': pulse(0, [[0, 0.6], [0.18, 0]]) }),
    description: 'Um clarão branco em cada batida.',
    effects: [fx('flash', { tint: '#ffffff', glow: 0.6, amount: 0 })],
  }),
  pack('tremida-nas-batidas', 'Tremida nas batidas', 'Batidas da música', {
    ...onBeats({ 'effects.0.intensity': pulse(0, [[0, 0.85], [0.3, 0]]) }),
    description: 'A imagem treme em cada batida e acalma até a próxima.',
    effects: [fx('tremor', { speed: 20, rotation: 0.5, intensity: 0 })],
    camera: cam({}, { zoom: 1.1 }),
  }),
  pack('zoom-alternado', 'Zoom alternado', 'Batidas da música', {
    ...onBeats({ 'camera.zoom': pulse(1.08, [[0, 1.24, 'ease-out'], [0.3, 1.08]], [[0, 1.0, 'ease-out'], [0.3, 1.08]]) }),
    description: 'Aproxima numa batida, afasta na outra. Dá muito ritmo a vídeos de dança.',
  }),
  pack('giro-nas-batidas', 'Giro nas batidas', 'Batidas da música', {
    ...onBeats({
      'camera.rotation': pulse(0, [[0, 5, 'ease-out'], [0.3, 0]], [[0, -5, 'ease-out'], [0.3, 0]]),
      'camera.zoom': pulse(1.15, [[0, 1.24, 'ease-out'], [0.3, 1.15]]),
    }),
    description: 'A câmera inclina para um lado e para o outro a cada batida.',
  }),
  pack('rgb-nas-batidas', 'Cor separada nas batidas', 'Batidas da música', {
    ...onBeats({ 'effects.0.amount': pulse(0, [[0, 0.03], [0.22, 0]]), 'camera.zoom': pulse(1, [[0, 1.06, 'ease-out'], [0.22, 1]]) }),
    description: 'O vermelho e o azul se separam em cada batida, com um zoom leve.',
    effects: [fx('rgb-split', { amount: 0 })],
  }),
  pack('brilho-nas-batidas', 'Brilho nas batidas', 'Batidas da música', {
    ...onBeats({ 'effects.0.intensity': pulse(0.2, [[0, 1.9], [0.35, 0.2]]) }),
    description: 'As luzes estouram em cada batida e voltam ao normal.',
    effects: [fx('brilho', { threshold: 0.4, radius: 26, intensity: 0.2 })],
  }),
  pack('pb-nas-batidas', 'P&B nas batidas', 'Batidas da música', {
    ...onBeats({ 'filter.intensity': pulse(0, [[0, 1, 'hold'], [0.16, 0]]) }),
    description: 'A imagem pisca em preto e branco em cada batida.',
    filter: look('alto-contraste-pb', 0),
  }),
  pack('estrobo', 'Estrobo', 'Batidas da música', {
    ...onBeats({ 'effects.0.amount': pulse(0, [[0, 1, 'hold'], [0.06, 0]]) }),
    description: 'Luz de balada: um piscão branco seco em cada batida.',
    effects: [fx('flash', { tint: '#ffffff', glow: 0.3, amount: 0 })],
  }),
  pack('batida-forte', 'Batida forte (a cada 4)', 'Batidas da música', {
    ...onBeats(
      {
        'camera.zoom': pulse(1, [[0, 1.3, 'ease-out'], [0.4, 1]]),
        'effects.0.amount': pulse(0, [[0, 0.7], [0.25, 0]]),
        'effects.1.amount': pulse(0, [[0, 0.035], [0.35, 0]]),
      },
      4,
    ),
    description: 'Um impacto grande (zoom, flash e cor separada) a cada quatro batidas, no tempo forte do compasso.',
    effects: [fx('flash', { tint: '#ffffff', glow: 0.6, amount: 0 }), fx('rgb-split', { amount: 0 })],
  }),
  pack('glitch-nas-batidas', 'Glitch nas batidas', 'Batidas da música', {
    ...onBeats({ 'effects.0.amount': pulse(0, [[0, 0.85], [0.16, 0]]) }),
    description: 'Uma falha digital curta em cada batida.',
    effects: [fx('glitch-digital', { blocks: 16, rate: 24, amount: 0 })],
  }),
  pack('desfoque-nas-batidas', 'Puxão nas batidas', 'Batidas da música', {
    ...onBeats({ 'effects.0.strength': pulse(0, [[0, 0.55], [0.26, 0]]), 'camera.zoom': pulse(1, [[0, 1.1, 'ease-out'], [0.26, 1]]) }),
    description: 'Zoom com desfoque de movimento em cada batida, como se a câmera fosse puxada.',
    effects: [fx('desfoque-radial', { strength: 0 })],
  }),
  pack('cores-nas-batidas', 'Cores alternadas', 'Batidas da música', {
    ...onBeats({
      'effects.0.amount': pulse(0, [[0, 0.45], [0.22, 0]], [[0, 0]]),
      'effects.1.amount': pulse(0, [[0, 0]], [[0, 0.45], [0.22, 0]]),
    }),
    description: 'Piscadas rosa e azul alternando a cada batida.',
    effects: [fx('flash', { tint: '#ff2f92', glow: 0.7, amount: 0 }), fx('flash', { tint: '#2fd5ff', glow: 0.7, amount: 0 })],
  }),
  pack('vinheta-nas-batidas', 'Pulso escuro', 'Batidas da música', {
    ...onBeats({ 'effects.0.intensity': pulse(0.3, [[0, 0.95], [0.3, 0.3]]), 'camera.zoom': pulse(1.02, [[0, 1.08, 'ease-out'], [0.3, 1.02]]) }),
    description: 'As bordas fecham no escuro a cada batida, como um coração batendo.',
    effects: [fx('vinheta', { intensity: 0.3, size: 0.3 })],
  }),
  pack('neon-nas-batidas', 'Neon pulsante', 'Batidas da música', {
    ...onBeats({ 'effects.0.intensity': pulse(0.5, [[0, 2], [0.35, 0.5]]), 'camera.zoom': pulse(1, [[0, 1.07, 'ease-out'], [0.3, 1]]) }),
    description: 'Cor de noite neon com o brilho pulsando no ritmo.',
    effects: [fx('brilho', { threshold: 0.45, radius: 24, intensity: 0.5 })],
    filter: look('noite-neon'),
  }),

  // ------------------------------------------------------------ Câmera em movimento
  pack('camera-na-mao', 'Câmera na mão', 'Câmera em movimento', {
    description: 'Balanço natural de câmera na mão, com um deslize lento. Tira a cara de vídeo parado.',
    effects: [fx('tremor', { intensity: 0.07, speed: 2.5, rotation: 0.35 })],
    camera: cam({ x: [[0, 0.48, 'linear'], [6, 0.52]] }, { zoom: 1.1 }),
  }),
  pack('aproximacao', 'Aproximação lenta', 'Câmera em movimento', {
    description: 'A câmera vai chegando perto devagar, como num carrinho (dolly) de cinema.',
    camera: cam({ zoom: [[0, 1.0], [6, 1.3]] }),
  }),
  pack('revelacao', 'Revelação', 'Câmera em movimento', {
    description: 'Começa fechado e vai abrindo até mostrar a cena inteira.',
    camera: cam({ zoom: [[0, 1.4], [6, 1.0]] }),
  }),
  pack('crash-zoom', 'Crash zoom', 'Câmera em movimento', {
    ...moment(0.7),
    description: 'Zoom violento e rápido que fica parado lá na frente. Clássico de filme de ação e de comédia.',
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0], [0.18, 0.85], [0.4, 0]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [0.2, 1.8, 'hold']] }),
  }),
  pack('orbita', 'Órbita', 'Câmera em movimento', {
    description: 'A câmera gira devagar em volta do assunto enquanto se aproxima.',
    camera: cam({ rotation: [[0, -3.5, 'linear'], [6, 3.5]], zoom: [[0, 1.15, 'linear'], [6, 1.28]], x: [[0, 0.47, 'linear'], [6, 0.53]] }),
  }),
  pack('angulo-holandes', 'Ângulo holandês', 'Câmera em movimento', {
    description: 'A imagem fica inclinada, dando tensão. Entra e sai inclinando suave.',
    camera: cam({ rotation: [[0, 0, 'ease-out'], [0.8, -7], [5.2, -7], [6, 0]], zoom: [[0, 1.0], [0.8, 1.2], [5.2, 1.2], [6, 1.0]] }),
  }),
  pack('descendo', 'Descendo pela cena', 'Câmera em movimento', {
    description: 'A câmera começa no alto e desce, revelando o que está embaixo.',
    camera: cam({ y: [[0, 0.3], [6, 0.65]] }, { zoom: 1.4 }),
  }),
  pack('subindo', 'Subindo pela cena', 'Câmera em movimento', {
    description: 'A câmera sobe do chão até o céu.',
    camera: cam({ y: [[0, 0.7], [6, 0.35]] }, { zoom: 1.4 }),
  }),
  pack('travelling', 'Travelling lateral', 'Câmera em movimento', {
    description: 'A câmera desliza de lado, como num trilho.',
    camera: cam({ x: [[0, 0.36, 'linear'], [6, 0.64]] }, { zoom: 1.32 }),
  }),
  pack('terremoto-camera', 'Terremoto', 'Câmera em movimento', {
    duration: 3,
    anchor: 'cursor',
    fadeIn: 0.3,
    fadeOut: 0.6,
    description: 'Chão tremendo de verdade: tremor forte e contínuo, que entra e sai aos poucos.',
    effects: [fx('tremor', { intensity: 0.6, speed: 14, rotation: 0.8 }), fx('desfoque-radial', { strength: 0.12 })],
    camera: cam({}, { zoom: 1.18 }),
  }),
  pack('pendulo', 'Pêndulo', 'Câmera em movimento', {
    description: 'A câmera balança de um lado para o outro, como se estivesse pendurada. Bom para sonhos e embriaguez.',
    timing: 'stretch',
    camera: cam({ rotation: [[0, 0], [1.5, 4], [3, -4], [4.5, 4], [6, 0]] }, { zoom: 1.16 }),
  }),
  pack('flutuando', 'Flutuando', 'Câmera em movimento', {
    description: 'A imagem flutua suave, como se a câmera estivesse na água ou no espaço.',
    timing: 'stretch',
    camera: cam(
      { x: [[0, 0.5], [1.5, 0.53], [3, 0.5], [4.5, 0.47], [6, 0.5]], y: [[0, 0.48], [1.5, 0.5], [3, 0.52], [4.5, 0.5], [6, 0.48]] },
      { zoom: 1.14 },
    ),
  }),
  pack('drone-subindo', 'Drone decolando', 'Câmera em movimento', {
    description: 'Visão de drone subindo: afasta, sobe e gira de leve.',
    camera: cam({ zoom: [[0, 1.45], [6, 1.05]], y: [[0, 0.56], [6, 0.46]], rotation: [[0, -2.5, 'linear'], [6, 2.5]] }),
  }),
  pack('push-dramatico', 'Push dramático', 'Câmera em movimento', {
    duration: 4,
    anchor: 'cursor',
    description: 'Avanço que acelera e escurece as bordas. Para a frase mais importante.',
    effects: [fx('vinheta', { size: 0.35 }, { intensity: [[0, 0.2], [4, 0.75]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [4, 1.5]] }),
  }),
  pack('giro-completo', 'Giro completo', 'Câmera em movimento', {
    ...moment(1, 'cut'),
    description: 'A imagem dá uma volta inteira no corte, com desfoque. Fica centrado na junção.',
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0], [0.5, 0.9], [1, 0]] })],
    camera: cam({ rotation: [[0, 0, 'ease-in'], [0.5, 180, 'ease-out'], [1, 360]], zoom: [[0, 1.0, 'ease-in'], [0.5, 2.1, 'ease-out'], [1, 1.0]] }),
  }),

  // ------------------------------------------------------------ Seguir rosto
  pack('close-no-rosto', 'Close no rosto', 'Seguir rosto', {
    description: 'Encontra o rosto em cada momento e mantém a pessoa enquadrada de perto. Ótimo para vídeos verticais.',
    face: { zoom: 'auto', smoothness: 0.6 },
    camera: cam({}),
  }),
  pack('chegando-no-rosto', 'Chegando no rosto', 'Seguir rosto', {
    description: 'A câmera vai se aproximando do rosto ao longo do trecho, sempre com a pessoa no centro.',
    face: { zoom: 1, smoothness: 0.6 },
    camera: cam({ zoom: [[0, 1.0], [6, 1.8]] }),
  }),
  pack('entrevista-dinamica', 'Entrevista dinâmica', 'Seguir rosto', {
    duration: 12,
    timing: 'stretch',
    description: 'Alterna entre plano aberto e fechado a cada poucos segundos, sempre no rosto, como se fossem duas câmeras.',
    face: { zoom: 1, smoothness: 0.5 },
    camera: cam({ zoom: [[0, 1.05, 'hold'], [3, 1.45, 'hold'], [6, 1.05, 'hold'], [9, 1.45, 'hold']] }),
  }),
  pack('foco-no-rosto', 'Foco no rosto', 'Seguir rosto', {
    description: 'Rosto no centro, pele suave e o resto da imagem escurecendo em volta.',
    face: { zoom: 1.3, smoothness: 0.8 },
    effects: [fx('vinheta', { intensity: 0.65, size: 0.3, softness: 0.5 })],
    filter: look('pele-suave', 0.6),
    camera: cam({}),
  }),

  // ------------------------------------------------------------ Câmera lenta e velocidade
  pack('camera-lenta', 'Câmera lenta 50%', 'Câmera lenta e velocidade', {
    duration: 3,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.5],
    description: 'Deixa os próximos 3 segundos na metade da velocidade, com os quadros criados pelo movimento (fluido).',
    camera: cam({ zoom: [[0, 1.0, 'linear'], [3, 1.06]] }),
  }),
  pack('camera-lenta-dramatica', 'Câmera lenta dramática', 'Câmera lenta e velocidade', {
    duration: 2,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.25],
    description: 'Quatro vezes mais lento, com barras de cinema entrando, cor dramática e grão.',
    effects: [
      fx('barras-cinema', { aspect: 2.39 }, { aspect: [[0, 1.78], [0.25, 2.39]] }),
      fx('vinheta', { intensity: 0.5 }),
      fx('granulado', { amount: 0.18 }),
    ],
    filter: look('dramatico', 0.75),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [2, 1.15]] }),
  }),
  pack('rampa-suave', 'Rampa de velocidade', 'Câmera lenta e velocidade', {
    duration: 4,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [1, 0.7, 0.45, 0.3, 0.3, 0.45, 0.7, 1],
    description: 'Vai freando até ficar bem lento e depois volta à velocidade normal, em degraus suaves.',
  }),
  pack('rampa-de-acao', 'Rampa de ação', 'Câmera lenta e velocidade', {
    duration: 3,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [2, 2, 0.3, 0.3, 0.3, 2],
    description: 'Rápido, quase parando no momento da ação (com flash) e rápido de novo.',
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, {
        amount: [[0, 0], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.333), 0.8, 'ease-out'], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.4), 0]],
      }),
      fx('desfoque-radial', {}, { strength: [[0, 0.35], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.333), 0], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.84), 0], [3, 0.35]] }),
    ],
    camera: cam({ zoom: [[0, 1.0], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.333), 1.2], [speedTime([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.84), 1.25], [3, 1.0]] }),
  }),
  pack('acelera-e-freia', 'Acelera e freia', 'Câmera lenta e velocidade', {
    duration: 4,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.5, 1, 2, 3, 1, 0.4],
    description: 'Começa lento, dispara e freia no fim. Bom para entradas de personagem e manobras.',
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0], [speedTime([0.5, 1, 2, 3, 1, 0.4], 4, 0.55), 0.4], [speedTime([0.5, 1, 2, 3, 1, 0.4], 4, 0.7), 0]] })],
  }),
  pack('acelerado-2x', 'Acelerado 2×', 'Câmera lenta e velocidade', {
    duration: 4,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [2],
    description: 'Os próximos 4 segundos passam no dobro da velocidade.',
  }),
  pack('timelapse', 'Timelapse', 'Câmera lenta e velocidade', {
    duration: 12,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [6],
    description: 'Seis vezes mais rápido, com cores realçadas. Para céu, trânsito e preparo de comida.',
    effects: [fx('ajuste-cor', { saturation: 1.15, contrast: 1.08 })],
    filter: look('hdr', 0.6),
  }),
  pack('bullet-time', 'Bullet time', 'Câmera lenta e velocidade', {
    duration: 1.5,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.2],
    description: 'Quase parado, com a câmera girando em volta e as cores lavadas. O efeito do Matrix.',
    effects: [fx('desfoque-radial', { strength: 0.12 }), fx('brilho', { threshold: 0.55, intensity: 0.8, radius: 18 })],
    filter: look('bleach-bypass', 0.8),
    camera: cam({ rotation: [[0, -6, 'linear'], [1.5, 6]], zoom: [[0, 1.2, 'linear'], [1.5, 1.32]] }),
  }),
  pack('lento-com-flash', 'Lento com flash', 'Câmera lenta e velocidade', {
    duration: 2,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [1, 0.35, 0.35, 0.35],
    description: 'Velocidade normal, um flash e o resto do trecho em câmera lenta.',
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, {
        amount: [[0, 0], [speedTime([1, 0.35, 0.35, 0.35], 2, 0.25), 0.9, 'ease-out'], [speedTime([1, 0.35, 0.35, 0.35], 2, 0.3), 0]],
      }),
    ],
  }),
  pack('lento-sonhador', 'Lento e sonhador', 'Câmera lenta e velocidade', {
    duration: 3,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [0.4],
    fadeIn: 0.5,
    fadeOut: 0.5,
    description: 'Câmera lenta com brilho difuso e tons pastel. Para momentos bonitos.',
    effects: [fx('brilho', { threshold: 0.4, intensity: 1.1, radius: 24 })],
    filter: look('pastel', 0.8),
  }),
  pack('avanco-rapido', 'Avanço rápido', 'Câmera lenta e velocidade', {
    duration: 8,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [4],
    description: 'Como apertar o ▶▶ do videocassete: quatro vezes mais rápido, com cara de VHS e a marcação na tela.',
    effects: [fx('vhs', { noise: 0.3, lines: 0.5, wobble: 0.6 })],
    text: { preset: 'etiqueta', text: '▶▶ 4×', offset: 0 },
  }),

  // ------------------------------------------------------------ Comédia e memes
  pack('zoom-dramatico', 'Zoom dramático', 'Comédia e memes', {
    ...moment(1.6),
    description: 'O zoom de novela no rosto de quem reagiu, com cara de drama. Procura o rosto sozinho.',
    face: { zoom: 1, smoothness: 0.25 },
    effects: [fx('vinheta', { size: 0.35 }, { intensity: [[0, 0], [0.3, 0.7]] })],
    filter: look('dramatico', 0.7),
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.3, 2.2, 'hold']] }),
  }),
  pack('olhar-pra-camera', 'Olhar pra câmera', 'Comédia e memes', {
    duration: 3,
    anchor: 'cursor',
    description: 'O zoom lento de "The Office" quando alguém encara a câmera depois de uma situação absurda.',
    face: { zoom: 1, smoothness: 0.8 },
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [3, 1.6]] }),
  }),
  pack('zoom-triplo', 'Zoom triplo', 'Comédia e memes', {
    ...moment(2),
    description: 'Tum, tum, TUM: três zooms secos cada vez mais perto do rosto.',
    face: { zoom: 1, smoothness: 0.2 },
    effects: [fx('tremor', { speed: 20, rotation: 0.4 }, { intensity: [[0, 0], [1.2, 0.5, 'ease-out'], [1.6, 0]] })],
    camera: cam({ zoom: [[0, 1.0, 'hold'], [0.4, 1.35, 'hold'], [0.8, 1.75, 'hold'], [1.2, 2.3, 'hold']] }),
  }),
  pack('vine-boom', 'Vine boom', 'Comédia e memes', {
    ...moment(1),
    description: 'Zoom seco, tremida e cor estourada: o "BOOM" dos memes, com o som junto.',
    effects: [
      fx('tremor', { speed: 24, rotation: 0.6 }, { intensity: [[0, 0.9, 'ease-out'], [0.45, 0]] }),
      fx('rgb-split', {}, { amount: [[0, 0.035], [0.35, 0]] }),
      fx('ajuste-cor', { contrast: 1.35, saturation: 1.5 }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.08, 1.38, 'hold']] }),
  }),
  pack('meme-frito', 'Meme frito', 'Comédia e memes', {
    duration: 3,
    anchor: 'cursor',
    description: 'Contraste e saturação absurdos, nitidez exagerada e chiado. O famoso "deep fried".',
    effects: [
      fx('ajuste-cor', { contrast: 1.9, saturation: 2, brightness: 0.06 }),
      fx('rgb-split', { amount: 0.006 }),
      fx('granulado', { amount: 0.35, size: 1.2 }),
      fx('tremor', { intensity: 0.05, speed: 18, rotation: 0.2 }),
    ],
    filter: look('nitidez-4k'),
    camera: cam({}, { zoom: 1.06 }),
  }),
  pack('silencio-constrangedor', 'Silêncio constrangedor', 'Comédia e memes', {
    duration: 4,
    anchor: 'cursor',
    description: 'Cores sem graça, zoom lento e a legenda que todo mundo conhece.',
    filter: look('mono-suave', 0.55),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4, 1.15]] }),
    text: { preset: 'sussurro', text: '*silêncio constrangedor*', offset: 0.3, duration: 3.5 },
  }),
  pack('e-foi-ai', 'E foi aí que…', 'Comédia e memes', {
    duration: 4,
    anchor: 'cursor',
    description: 'A imagem fica em preto e branco com a narração clássica de que tudo ia dar errado.',
    effects: [fx('vinheta', { intensity: 0.6 }), fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 0.8], [0.4, 0]] })],
    filter: look('preto-e-branco'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4, 1.12]] }),
    text: { preset: 'maquina', text: 'E foi aí que tudo deu errado…', offset: 0.4, duration: 3.6 },
  }),
  pack('reacao', 'Reação', 'Comédia e memes', {
    ...moment(1.8),
    description: 'Zoom de susto no rosto com flash e o "O QUÊ?!" na tela.',
    face: { zoom: 1, smoothness: 0.2 },
    effects: [fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.7, 'ease-out'], [0.25, 0]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.12, 1.9, 'hold']] }),
    text: { preset: 'impacto', text: 'O QUÊ?!', offset: 0.1, duration: 1.7 },
  }),
  pack('falhou', 'Falhou', 'Comédia e memes', {
    ...moment(1.6),
    description: 'Falha digital, tremida e o aviso de que deu ruim.',
    effects: [
      fx('glitch-digital', { blocks: 18, rate: 18 }, { amount: [[0, 0.9], [0.5, 0.2], [1.6, 0.1]] }),
      fx('tremor', { speed: 18, rotation: 0.3 }, { intensity: [[0, 0.6], [0.6, 0]] }),
    ],
    filter: look('desbotado', 0.8),
    text: { preset: 'alerta', text: 'FALHOU', offset: 0.15, duration: 1.45 },
  }),
  pack('momento-triste', 'Momento triste', 'Comédia e memes', {
    duration: 4,
    anchor: 'cursor',
    fadeIn: 0.4,
    description: 'Chuva, cores frias e câmera chegando perto. Para quando algo dá muito errado (ou muito certo).',
    effects: [fx('chuva', { amount: 0.6, slant: 0.1 }), fx('vinheta', { intensity: 0.5 })],
    filter: look('melancolia'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4, 1.15]] }),
  }),
  pack('surto', 'Surto', 'Comédia e memes', {
    duration: 2,
    anchor: 'cursor',
    description: 'Tela vermelha, tremida e zoom: alguém perdeu a paciência.',
    effects: [
      fx('flash', { tint: '#ff1a1a', glow: 0 }, { amount: [[0, 0.5], [0.3, 0.25], [2, 0.25]] }),
      fx('tremor', { intensity: 0.55, speed: 22, rotation: 0.6 }),
      fx('rgb-split', { amount: 0.012 }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.15, 1.3]] }),
  }),
  pack('pensando', 'Pensando…', 'Comédia e memes', {
    duration: 3,
    anchor: 'cursor',
    fadeIn: 0.4,
    fadeOut: 0.4,
    description: 'Bordas claras e enevoadas de imaginação, com o "hmm…" na tela.',
    effects: [fx('vinheta', { intensity: 0.7, tint: '#ffffff', size: 0.35 }), fx('brilho', { threshold: 0.45, intensity: 0.9, radius: 22 })],
    filter: look('pastel', 0.6),
    text: { preset: 'citacao', text: 'hmm…', offset: 0.3, duration: 2.5 },
  }),
  pack('quadrinho', 'Quadrinho', 'Comédia e memes', {
    ...moment(1.6),
    description: 'Vira página de gibi por um instante, com zoom e onomatopeia.',
    effects: [fx('meio-tom', { size: 6, colorful: 1 }), fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.8], [0.2, 0]] })],
    filter: look('pop'),
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.12, 1.25, 'hold']] }),
    text: { preset: 'quadrinhos', text: 'POW!', offset: 0.05, duration: 1.5 },
  }),
  pack('plot-twist', 'Plot twist', 'Comédia e memes', {
    ...moment(2.4),
    description: 'Efeito vertigem (a cena "estica"), clarão e o aviso de reviravolta.',
    effects: [
      fx('olho-de-peixe', {}, { strength: [[0, 0], [1.2, 0.5], [2.4, 0.3]] }),
      fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.8], [0.3, 0]] }),
    ],
    filter: look('dramatico', 0.8),
    camera: cam({ zoom: [[0, 1.6, 'ease'], [2.4, 1.05]] }),
    text: { preset: 'impacto', text: 'PLOT TWIST', offset: 0.3, duration: 2.1 },
  }),
  pack('camera-escondida', 'Câmera escondida', 'Comédia e memes', {
    description: 'Imagem de pegadinha: bordas fechadas, granulada, balançando e com a marcação no canto.',
    effects: [
      fx('vinheta', { intensity: 0.9, size: 0.22, softness: 0.6 }),
      fx('granulado', { amount: 0.35 }),
      fx('tremor', { intensity: 0.06, speed: 3, rotation: 0.2 }),
    ],
    filter: look('desbotado', 0.6),
    camera: cam({}, { zoom: 1.1 }),
    text: { preset: 'etiqueta', text: 'CÂMERA ESCONDIDA', offset: 0 },
  }),
  pack('bonk', 'Bonk', 'Comédia e memes', {
    ...moment(0.6),
    description: 'Pancada de desenho animado: a imagem chacoalha de lado e volta.',
    camera: cam({ rotation: [[0, 0], [0.05, 7], [0.13, -5], [0.22, 3], [0.32, -1.5], [0.42, 0]], zoom: [[0, 1.0], [0.05, 1.22], [0.42, 1.08], [0.6, 1.0]] }),
    effects: [fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.5], [0.12, 0]] })],
  }),
  pack('modo-acelerado', 'Modo acelerado', 'Comédia e memes', {
    duration: 6,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [3],
    description: 'Três vezes mais rápido, cores vivas e tremidinha: a pessoa correndo de um jeito engraçado.',
    effects: [fx('tremor', { intensity: 0.08, speed: 16, rotation: 0.2 })],
    filter: look('vivido', 0.6),
    camera: cam({}, { zoom: 1.06 }),
  }),

  // ---------------- Comédia em câmera lenta
  pack('queda-epica', 'Queda épica', 'Comédia e memes', {
    ...slow([1, 0.25, 0.25, 0.25], 2),
    description: 'Velocidade normal até o tombo, que vira câmera lenta de filme com o "NÃÃÃO" na tela.',
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 0], [speedTime([1, 0.25, 0.25, 0.25], 2, 0.25), 0.7, 'ease-out'], [speedTime([1, 0.25, 0.25, 0.25], 2, 0.3), 0]] }),
      fx('vinheta', { intensity: 0.55 }),
      fx('barras-cinema', { aspect: 2.39 }, { aspect: [[0, 1.78], [speedTime([1, 0.25, 0.25, 0.25], 2, 0.3), 2.39]] }),
    ],
    filter: look('dramatico', 0.7),
    camera: cam({ zoom: [[0, 1.0], [speedTime([1, 0.25, 0.25, 0.25], 2, 0.25), 1.05, 'linear'], [2, 1.3]] }),
    text: { preset: 'impacto', text: 'NÃÃÃÃO', offset: speedSeconds([1, 0.25, 0.25, 0.25], 2, 0.3) },
  }),
  pack('nao-acredito', 'Não acredito', 'Comédia e memes', {
    ...slow([0.3], 1.5),
    description: 'Câmera lenta chegando no rosto de quem não acredita no que viu, com cor lavada.',
    face: { zoom: 1, smoothness: 0.6 },
    effects: [fx('vinheta', { intensity: 0.5 })],
    filter: look('mono-suave', 0.6),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [1.5, 1.9]] }),
    text: { preset: 'sussurro', text: 'não… acredito…', offset: speedSeconds([0.3], 1.5, 0.2) },
  }),
  pack('derrota-dramatica', 'Derrota dramática', 'Comédia e memes', {
    ...slow([0.35], 2),
    fadeIn: 0.3,
    description: 'Perdeu: câmera lenta, chuva, cor triste e a narração exagerada.',
    effects: [fx('chuva', { amount: 0.7, slant: 0.12 }), fx('vinheta', { intensity: 0.65 })],
    filter: look('melancolia'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [2, 1.2]] }),
    text: { preset: 'maquina', text: 'Naquele momento, ele soube que tinha perdido.', offset: speedSeconds([0.35], 2, 0.15) },
  }),
  pack('vitoria-epica', 'Vitória épica', 'Comédia e memes', {
    ...slow([1, 0.3, 0.3], 2),
    description: 'Ganhou (nem que seja no par ou ímpar): câmera lenta dourada, raios de luz e o título de lenda.',
    effects: [
      fx('flash', { tint: '#ffe7a8', glow: 0.7 }, { amount: [[0, 0], [speedTime([1, 0.3, 0.3], 2, 0.333), 0.9, 'ease-out'], [speedTime([1, 0.3, 0.3], 2, 0.4), 0]] }),
      fx('raios-de-luz', { amount: 1.2, source: [0.5, 0.85] }),
      fx('brilho', { threshold: 0.5, intensity: 1, radius: 22 }),
      fx('lens-flare', { amount: 0.7, source: [0.75, 0.8] }),
    ],
    filter: look('ouro', 0.8),
    camera: cam({ zoom: [[0, 1.0], [speedTime([1, 0.3, 0.3], 2, 0.333), 1.1, 'linear'], [2, 1.25]] }),
    text: { preset: 'filme', text: 'LENDÁRIO', offset: speedSeconds([1, 0.3, 0.3], 2, 0.4) },
  }),
  pack('comemoracao', 'Comemoração em câmera lenta', 'Comédia e memes', {
    ...slow([0.4], 2),
    description: 'O grito de gol de qualquer coisa: câmera lenta, partículas, brilho e tremidinha.',
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 0.8], [0.3, 0]] }),
      fx('particulas-de-luz', { amount: 1.4, size: 1.4, speed: 1, hue: 0.12 }),
      fx('brilho', { threshold: 0.45, intensity: 1.1, radius: 22 }),
      fx('tremor', { intensity: 0.12, speed: 10, rotation: 0.3 }),
    ],
    filter: look('vivido', 0.7),
    camera: cam({ zoom: [[0, 1.15, 'ease-out'], [0.4, 1.08, 'linear'], [2, 1.2]] }),
    text: { preset: 'impacto', text: 'GOOOOL!', offset: 0.1 },
  }),
  pack('esse-sou-eu', 'Esse sou eu', 'Comédia e memes', {
    ...slow([1, 0.1], 1.2),
    description: 'A imagem quase congela no meio da confusão e começa o clássico "pois é, esse sou eu".',
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.3 }, { amount: [[0, 0], [speedTime([1, 0.1], 1.2, 0.5), 0.9, 'ease-out'], [speedTime([1, 0.1], 1.2, 0.55), 0]] }),
    ],
    filter: look('desbotado', 0.5),
    camera: cam({ zoom: [[0, 1.0], [speedTime([1, 0.1], 1.2, 0.5), 1.0, 'hold'], [speedTime([1, 0.1], 1.2, 0.51), 1.12, 'linear'], [1.2, 1.2]] }),
    text: {
      preset: 'legenda',
      text: 'Pois é, esse sou eu. Você deve estar se perguntando como eu vim parar aqui.',
      offset: speedSeconds([1, 0.1], 1.2, 0.5),
    },
  }),
  pack('camera-lenta-desnecessaria', 'Câmera lenta desnecessária', 'Comédia e memes', {
    ...slow([0.25], 1.5),
    description: 'Transforma um momento banal (abrir a geladeira, sentar no sofá) em cena de filme.',
    effects: [
      fx('barras-cinema', { aspect: 2.39 }, { aspect: [[0, 1.78], [0.15, 2.39]] }),
      fx('brilho', { threshold: 0.5, intensity: 0.9, radius: 20 }),
      fx('granulado', { amount: 0.15 }),
    ],
    filter: look('blockbuster', 0.8),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [1.5, 1.15]] }),
    text: { preset: 'filme', text: 'UM MOMENTO HISTÓRICO', offset: speedSeconds([0.25], 1.5, 0.15) },
  }),
  pack('quase', 'Quaaase', 'Comédia e memes', {
    ...slow([1, 0.5, 0.25, 0.2], 2),
    description: 'Vai freando aos poucos enquanto a câmera chega no rosto. Para a cesta que bateu no aro.',
    face: { zoom: 1, smoothness: 0.5 },
    camera: cam({ zoom: [[0, 1.0], [2, 1.7]] }),
    effects: [fx('vinheta', { size: 0.35 }, { intensity: [[0, 0], [2, 0.6]] })],
    text: { preset: 'impacto', text: 'QUAAASE…', offset: speedSeconds([1, 0.5, 0.25, 0.2], 2, 0.5) },
  }),
  pack('tropeco', 'Tropeço', 'Comédia e memes', {
    ...slow([1, 0.2, 0.2, 1.5], 2),
    description: 'O tropeção fica em câmera lenta e depois a vida segue acelerada, com uma pancadinha de desenho.',
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
  pack('revelacao-dramatica', 'Revelação dramática', 'Comédia e memes', {
    ...slow([0.3], 1.6),
    description: 'Câmera lenta e zoom no rosto, com efeito vertigem: a pessoa acabou de descobrir tudo.',
    face: { zoom: 1, smoothness: 0.4 },
    effects: [fx('olho-de-peixe', {}, { strength: [[0, 0], [1.6, 0.35]] }), fx('vinheta', { intensity: 0.6 })],
    filter: look('dramatico', 0.8),
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [1.6, 2.1]] }),
  }),
  pack('filme-mudo', 'Filme mudo', 'Comédia e memes', {
    duration: 6,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [1.4],
    description: 'Comédia dos anos 20: um pouco acelerado, preto e branco gasto, projetor tremendo e cartela de texto.',
    effects: [
      fx('granulado', { amount: 0.55, size: 1.8, flicker: 0.9 }),
      fx('vinheta', { intensity: 0.75, size: 0.3 }),
      fx('tremor', { intensity: 0.05, speed: 10, rotation: 0.1 }),
    ],
    filter: look('ruido-de-filme'),
    camera: cam({}, { zoom: 1.05 }),
    text: { preset: 'citacao', text: 'Enquanto isso, na cozinha…', offset: 0, duration: 1.8 },
  }),
  pack('perseguicao', 'Perseguição acelerada', 'Comédia e memes', {
    duration: 6,
    timing: 'stretch',
    anchor: 'cursor',
    speed: [2.5],
    description: 'Todo mundo correndo rápido demais, cores vivas e câmera sacudindo. Perseguição de comédia antiga.',
    effects: [fx('tremor', { intensity: 0.12, speed: 14, rotation: 0.3 }), fx('ajuste-cor', { saturation: 1.35, contrast: 1.1 })],
    camera: cam({}, { zoom: 1.08 }),
  }),

  // ---------------- Mais comédia
  pack('disfarca', 'Disfarça', 'Comédia e memes', {
    duration: 2.5,
    anchor: 'cursor',
    description: 'A câmera desvia rápido para o lado, fingindo que não viu nada.',
    camera: cam({ x: [[0, 0.5, 'ease'], [0.35, 0.78]], zoom: [[0, 1.0, 'ease-out'], [0.35, 1.5]] }),
    effects: [fx('desfoque', {}, { radius: [[0, 0], [0.18, 8], [0.35, 0]] })],
    text: { preset: 'sussurro', text: '*disfarça*', offset: 0.4 },
  }),
  pack('censurado', 'Censurado', 'Comédia e memes', {
    duration: 2,
    anchor: 'cursor',
    description: 'Pixela tudo, como se alguém tivesse feito algo que não podia aparecer.',
    effects: [fx('pixelar', { size: 34 })],
    text: { preset: 'alerta', text: 'CENSURADO', offset: 0 },
  }),
  pack('modo-detetive', 'Modo detetive', 'Comédia e memes', {
    duration: 4,
    anchor: 'cursor',
    description: 'Noir de investigação: preto e branco, sombra fechando e zoom desconfiado no rosto.',
    face: { zoom: 1, smoothness: 0.7 },
    effects: [fx('vinheta', { intensity: 0.8, size: 0.28 }), fx('granulado', { amount: 0.25 })],
    filter: look('noir'),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4, 1.5]] }),
    text: { preset: 'maquina', text: 'Hmm… muito suspeito.', offset: 0.4 },
  }),
  pack('piada-sem-graca', 'Piada sem graça', 'Comédia e memes', {
    duration: 3.5,
    anchor: 'cursor',
    description: 'A cor some, a câmera se afasta devagar e só os grilos respondem.',
    filter: look('mono-suave', 0.7),
    camera: cam({ zoom: [[0, 1.25, 'linear'], [3.5, 1.0]] }),
    text: { preset: 'sussurro', text: '*cri cri cri*', offset: 0.5 },
  }),
  pack('susto', 'Susto', 'Comédia e memes', {
    ...moment(1.2),
    description: 'Clarão, tremida forte e zoom no rosto de quem levou o susto.',
    face: { zoom: 1, smoothness: 0.2 },
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 1, 'ease-out'], [0.25, 0]] }),
      fx('tremor', { speed: 26, rotation: 0.9 }, { intensity: [[0, 1, 'ease-out'], [0.9, 0]] }),
      fx('rgb-split', {}, { amount: [[0, 0.04], [0.4, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.08, 1.7, 'hold']] }),
    text: { preset: 'impacto', text: 'AAAAH!', offset: 0.05 },
  }),
  pack('novela', 'Cena de novela', 'Comédia e memes', {
    duration: 4,
    anchor: 'cursor',
    description: 'Zoom lento no rosto, brilho cor-de-rosa e a revelação absurda que toda novela tem.',
    face: { zoom: 1, smoothness: 0.6 },
    effects: [fx('brilho', { threshold: 0.45, intensity: 1, radius: 24 }), fx('vinheta', { intensity: 0.55 })],
    filter: look('rosado'),
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [4, 1.6]] }),
    text: { preset: 'citacao', text: 'Você… é meu irmão gêmeo?!', offset: 0.8 },
  }),
  pack('carregando', 'Carregando…', 'Comédia e memes', {
    duration: 3,
    anchor: 'cursor',
    description: 'O cérebro travou: cor lavada, falhas leves e a barra de carregamento.',
    effects: [fx('glitch-digital', { amount: 0.15, rate: 3 }), fx('desfoque', { radius: 1.5 })],
    filter: look('mono-suave', 0.8),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [3, 1.1]] }),
    text: { preset: 'etiqueta', text: 'carregando… ▮▮▮▯▯▯', offset: 0.2 },
  }),
  pack('cringe', 'Cringe', 'Comédia e memes', {
    ...moment(1.6),
    description: 'Vergonha alheia: o rosto distorce, a cor fica estranha e a imagem treme.',
    face: { zoom: 1, smoothness: 0.3 },
    effects: [
      fx('olho-de-peixe', {}, { strength: [[0, 0, 'ease-out'], [0.15, 0.55]] }),
      fx('ajuste-cor', { saturation: 1.6, contrast: 1.3, temperature: 0.3 }),
      fx('tremor', { intensity: 0.2, speed: 16, rotation: 0.4 }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.15, 1.6]] }),
    text: { preset: 'impacto', text: 'CRINGE', offset: 0.2 },
  }),
  pack('mente-explodida', 'Mente explodida', 'Comédia e memes', {
    ...moment(1.8),
    description: 'A ideia genial: clarão, a imagem estufa, brilho e partículas saindo da cabeça.',
    face: { zoom: 1, smoothness: 0.3 },
    effects: [
      fx('flash', { tint: '#ffffff', glow: 0.6 }, { amount: [[0, 0.9, 'ease-out'], [0.3, 0]] }),
      fx('olho-de-peixe', {}, { strength: [[0, 0.6, 'ease-out'], [0.6, 0.1]] }),
      fx('particulas-de-luz', { amount: 1.6, size: 1.5, speed: 1.5, hue: 0.7 }),
      fx('brilho', { threshold: 0.4, radius: 26 }, { intensity: [[0, 2], [1.8, 0.4]] }),
    ],
    camera: cam({ zoom: [[0, 1.5, 'ease-out'], [1.8, 1.3]] }),
    text: { preset: 'impacto', text: 'MENTE EXPLODIDA', offset: 0.2 },
  }),
  pack('enquanto-isso', 'Enquanto isso…', 'Comédia e memes', {
    ...moment(2.4, 'cut'),
    description: 'Cartela de passagem de desenho animado no corte: a imagem desfoca e escurece com o aviso.',
    effects: [
      fx('desfoque', {}, { radius: [[0, 0], [0.6, 18], [1.8, 18], [2.4, 0]] }),
      fx('flash', { tint: '#1a1033', glow: 0 }, { amount: [[0, 0], [0.6, 0.6], [1.8, 0.6], [2.4, 0]] }),
    ],
    text: { preset: 'filme', text: 'ENQUANTO ISSO…', offset: 0.4, duration: 1.6 },
  }),
  pack('horas-depois', 'Algumas horas depois…', 'Comédia e memes', {
    ...moment(2.4, 'cut'),
    description: 'A passagem de tempo dos documentários de desenho, centrada no corte.',
    effects: [
      fx('desfoque', {}, { radius: [[0, 0], [0.6, 16], [1.8, 16], [2.4, 0]] }),
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0], [0.6, 0.55], [1.8, 0.55], [2.4, 0]] }),
    ],
    text: { preset: 'filme', text: 'ALGUMAS HORAS DEPOIS…', offset: 0.4, duration: 1.6 },
  }),
  pack('nao-e-possivel', 'Não é possível', 'Comédia e memes', {
    ...moment(2.2),
    description: 'Três zooms secos em câmera lenta no rosto, cada um com um clarão. Para o absurdo total.',
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
  pack('morri-de-rir', 'Morri de rir', 'Comédia e memes', {
    ...moment(2.4),
    description: 'Tremidinha de gargalhada, 😂 e 💀 pulando na tela e o boom no começo.',
    effects: [
      fx('tremor', { speed: 14, rotation: 0.4 }, { intensity: [[0, 0.5, 'ease-out'], [2.4, 0.15]] }),
      fx('flash', { tint: '#ffffff' }, { amount: [[0, 0.6, 'ease-out'], [0.25, 0]] }),
    ],
    filter: look('vivido', 0.6),
    camera: cam({ zoom: [[0, 1.25, 'ease-out'], [0.3, 1.12, 'linear'], [2.4, 1.18]] }),
    sounds: [{ id: 'vine-boom', offset: 0 }],
    stickers: [
      { id: 'sticker/rindo', offset: 0.1, duration: 2.2, x: 0.2, y: 0.3, rotation: -12 },
      { id: 'sticker/caveira', offset: 0.35, duration: 2, x: 0.8, y: 0.28, rotation: 10 },
      { id: 'sticker/rolando', offset: 0.6, duration: 1.7, x: 0.72, y: 0.75, size: 0.13 },
    ],
  }),
  pack('tive-uma-ideia', 'Tive uma ideia', 'Comédia e memes', {
    ...moment(2),
    description: 'Ding! A lâmpada acende em cima da cabeça, com brilho e zoom no rosto.',
    face: { zoom: 1, smoothness: 0.3 },
    effects: [
      fx('flash', { tint: '#fff6c8', glow: 0.6 }, { amount: [[0, 0.7, 'ease-out'], [0.35, 0]] }),
      fx('brilho', { threshold: 0.45, radius: 24 }, { intensity: [[0, 1.6], [2, 0.6]] }),
    ],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.25, 1.35, 'linear'], [2, 1.45]] }),
    sounds: [{ id: 'ding', offset: 0 }],
    stickers: [{ id: 'sticker/ideia', offset: 0, duration: 2, x: 0.5, y: 0.14, size: 0.15 }],
  }),
  pack('olhos-suspeitos', 'Suspeito…', 'Comédia e memes', {
    ...moment(3),
    description: 'Algo não bate: zoom lento no rosto, 👀 olhando de lado e o "dun dun duuun".',
    face: { zoom: 1, smoothness: 0.6 },
    effects: [fx('vinheta', { size: 0.4 }, { intensity: [[0, 0], [1, 0.75]] })],
    filter: look('dramatico', 0.6),
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [3, 1.6]] }),
    sounds: [{ id: 'suspense', offset: 0.2, volume: 0.8 }],
    stickers: [{ id: 'sticker/olhos', offset: 0.5, duration: 2.4, x: 0.8, y: 0.25, size: 0.14 }],
  }),
  pack('errou-feio', 'Errou feio', 'Comédia e memes', {
    ...moment(2.2),
    description: 'A campainha de erro, ❌ enorme, cor lavada e um tranco na câmera.',
    effects: [
      fx('tremor', { speed: 20, rotation: 0.5 }, { intensity: [[0, 0.7, 'ease-out'], [0.5, 0]] }),
      fx('flash', { tint: '#ff4040', glow: 0.3 }, { amount: [[0, 0.5, 'ease-out'], [0.4, 0]] }),
    ],
    filter: look('mono-suave', 0.7),
    camera: cam({ zoom: [[0, 1.2, 'ease-out'], [0.4, 1.08]] }),
    sounds: [{ id: 'erro', offset: 0 }],
    stickers: [{ id: 'sticker/xis', offset: 0.05, duration: 1.8, size: 0.3 }],
  }),
  pack('ganhou', 'Ganhou!', 'Comédia e memes', {
    ...moment(3),
    description: 'Fanfarra de vitória, troféu caindo na tela, confete de luz e cor vibrante.',
    effects: [
      fx('flash', { tint: '#ffe7a8', glow: 0.6 }, { amount: [[0, 0.8, 'ease-out'], [0.4, 0]] }),
      fx('particulas-de-luz', { amount: 1.5, size: 1.3, speed: 1.2, hue: 0.13 }),
      fx('brilho', { threshold: 0.45, intensity: 1.1, radius: 22 }),
    ],
    filter: look('vivido', 0.8),
    camera: cam({ zoom: [[0, 1.15, 'ease-out'], [0.5, 1.05, 'linear'], [3, 1.12]] }),
    sounds: [
      { id: 'vitoria', offset: 0 },
      { id: 'aplausos', offset: 0.4, volume: 0.6 },
    ],
    stickers: [
      { id: 'sticker/trofeu', offset: 0.1, duration: 2.7, x: 0.78, y: 0.32 },
      { id: 'sticker/festa', offset: 0.3, duration: 2.5, x: 0.22, y: 0.3, rotation: -10 },
    ],
  }),
  pack('olha-isso', 'Olha isso!', 'Comédia e memes', {
    ...moment(2.5),
    description: '👉 apontando, zoom para o detalhe e um "ding". Para destacar algo no vídeo.',
    effects: [fx('vinheta', { size: 0.45 }, { intensity: [[0, 0], [0.4, 0.6]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.35, 1.3, 'linear'], [2.5, 1.35]] }),
    sounds: [{ id: 'ding', offset: 0.15, volume: 0.8 }],
    stickers: [
      { id: 'sticker/apontar-direita', offset: 0.1, duration: 2.3, x: 0.3, y: 0.5 },
      { id: 'sticker/circulo', offset: 0.25, duration: 2.1, x: 0.62, y: 0.5 },
    ],
  }),
  pack('coracao-partido', 'Coração partido', 'Comédia e memes', {
    ...slow([0.5], 2.4),
    description: 'Câmera lenta, cor sumindo, 💔 na tela e o trombone triste. Drama total.',
    effects: [fx('vinheta', { intensity: 0.7 }), fx('granulado', { amount: 0.12 })],
    filter: look('melancolia', 0.9, { intensity: [[0, 0.2], [1.5, 0.9]] }),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [4.8, 1.2]] }),
    sounds: [{ id: 'trombone-triste', offset: 0.4 }],
    stickers: [{ id: 'sticker/coracao-partido', offset: 0.6, duration: 3.6, x: 0.5, y: 0.22, size: 0.14 }],
    muteSlow: true,
  }),
  pack('pulo-de-desenho', 'Pulo de desenho', 'Comédia e memes', {
    ...moment(1),
    description: 'A imagem pula como mola de desenho animado, com o "boing".',
    camera: cam({
      y: [[0, 0.5], [0.12, 0.42, 'ease-out'], [0.3, 0.53], [0.45, 0.47], [0.6, 0.515], [0.75, 0.49], [1, 0.5]],
      zoom: [[0, 1.1], [1, 1.1]],
    }),
    sounds: [{ id: 'boing', offset: 0 }],
  }),
  pack('em-chamas', 'Em chamas', 'Comédia e memes', {
    ...moment(2.5),
    description: 'Mandou muito bem: 🔥 dos lados, cor quente, brilho e impacto.',
    effects: [
      fx('flash', { tint: '#ffb347', glow: 0.5 }, { amount: [[0, 0.7, 'ease-out'], [0.35, 0]] }),
      fx('brilho', { threshold: 0.45, intensity: 1.2, radius: 22 }),
      fx('calor', { amount: 0.4 }),
    ],
    filter: look('por-do-sol', 0.7),
    camera: cam({ zoom: [[0, 1.2, 'ease-out'], [0.3, 1.08, 'linear'], [2.5, 1.14]] }),
    sounds: [{ id: 'impacto', offset: 0 }],
    stickers: [
      { id: 'sticker/fogo', offset: 0.05, duration: 2.4, x: 0.15, y: 0.72 },
      { id: 'sticker/fogo', offset: 0.15, duration: 2.3, x: 0.85, y: 0.72 },
      { id: 'sticker/cem', offset: 0.4, duration: 2, x: 0.82, y: 0.22, size: 0.13 },
    ],
  }),

  // ------------------------------------------------------------ Mais cinema
  pack('simetrico-pastel', 'Simétrico pastel', 'Cinematográfico', {
    description: 'Cores pastel, contraste suave e barras finas, no estilo dos filmes simétricos de Wes Anderson.',
    effects: [fx('barras-cinema', { aspect: 1.85 }), fx('vinheta', { intensity: 0.2 })],
    filter: look('pastel-simetrico'),
  }),
  pack('ficcao-cientifica', 'Ficção científica', 'Cinematográfico', {
    description: 'Tons gelados, brilho nas luzes, grão fino e tela larga. Para futuro, espaço e tecnologia.',
    effects: [fx('brilho', { threshold: 0.55, intensity: 0.9, radius: 20 }), fx('granulado', { amount: 0.12 }), fx('barras-cinema', { aspect: 2.39 })],
    filter: look('artico', 0.9),
    camera: cam({ zoom: [[0, 1.0, 'linear'], [6, 1.1]] }),
  }),
  pack('faroeste', 'Faroeste', 'Cinematográfico', {
    description: 'Deserto amarelado, grão de filme e tela larga. Duelo ao meio-dia.',
    effects: [fx('granulado', { amount: 0.25 }), fx('vinheta', { intensity: 0.55 }), fx('barras-cinema', { aspect: 2.39 })],
    filter: look('deserto'),
  }),
  pack('epico-dourado', 'Épico dourado', 'Cinematográfico', {
    description: 'Luz dourada com raios, brilho e a câmera subindo devagar. Para finais grandiosos.',
    effects: [fx('raios-de-luz', { amount: 0.9, source: [0.5, 0.85] }), fx('brilho', { threshold: 0.55, intensity: 0.8, radius: 20 })],
    filter: look('ouro', 0.8),
    camera: cam({ zoom: [[0, 1.1, 'linear'], [6, 1.2]], y: [[0, 0.55, 'linear'], [6, 0.45]] }),
  }),

  // ------------------------------------------------------------ Mais impacto
  pack('explosao', 'Explosão', 'Impacto e ritmo', {
    ...moment(1.2),
    description: 'Clarão alaranjado, tremida forte e brilho, como uma explosão perto da câmera.',
    effects: [
      fx('flash', { tint: '#ffb35c', glow: 0.8 }, { amount: [[0, 0.9, 'ease-out'], [0.6, 0]] }),
      fx('tremor', { speed: 20, rotation: 0.8 }, { intensity: [[0, 1, 'ease-out'], [1.2, 0]] }),
      fx('brilho', { threshold: 0.35, radius: 30 }, { intensity: [[0, 2], [1.2, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.25, 'ease-out'], [1.2, 1.08]] }),
  }),
  pack('pancada-lateral', 'Pancada lateral', 'Impacto e ritmo', {
    ...moment(0.6),
    description: 'A imagem é empurrada de lado e volta, como se levasse um golpe.',
    camera: cam({ x: [[0, 0.5, 'ease-out'], [0.06, 0.62], [0.25, 0.46], [0.6, 0.5]] }, { zoom: 1.3 }),
    effects: [fx('rgb-split', { angle: 0 }, { amount: [[0, 0.03], [0.3, 0]] })],
  }),
  pack('onda-de-impacto', 'Onda de impacto', 'Impacto e ritmo', {
    ...moment(0.9),
    description: 'A imagem estufa e volta, como uma onda de choque passando.',
    effects: [
      fx('olho-de-peixe', {}, { strength: [[0, 0.6, 'ease-out'], [0.5, 0]] }),
      fx('desfoque-radial', {}, { strength: [[0, 0.6], [0.4, 0]] }),
    ],
    camera: cam({ zoom: [[0, 1.15, 'ease-out'], [0.9, 1.0]] }),
  }),

  // ------------------------------------------------------------ Mais passagens
  pack('passagem-chicote', 'Chicote', 'Passagens no corte', {
    ...moment(0.5, 'cut'),
    description: 'A câmera "chicoteia" de lado no corte e chega no próximo clipe vindo do outro lado.',
    effects: [fx('desfoque', {}, { radius: [[0, 0], [0.25, 14], [0.5, 0]] })],
    camera: cam({
      x: [[0, 0.5, 'ease-in'], [0.249, 0.82, 'hold'], [0.25, 0.18, 'ease-out'], [0.5, 0.5]],
      zoom: [[0, 1.0, 'ease-in'], [0.2, 1.5], [0.3, 1.5, 'ease-out'], [0.5, 1.0]],
    }),
  }),
  pack('passagem-pixel', 'Pixelado', 'Passagens no corte', {
    ...moment(0.8, 'cut'),
    description: 'A imagem vira pixels grandes no corte e volta já no próximo clipe.',
    effects: [fx('pixelar', {}, { size: [[0, 1], [0.4, 60], [0.8, 1]] })],
  }),
  pack('passagem-cor', 'Flash colorido', 'Passagens no corte', {
    ...moment(0.6, 'cut'),
    description: 'Um clarão rosa e azul esconde o corte.',
    effects: [
      fx('flash', { tint: '#ff3fa4', glow: 0.7 }, { amount: [[0, 0], [0.25, 0.8], [0.35, 0]] }),
      fx('flash', { tint: '#3fd2ff', glow: 0.7 }, { amount: [[0, 0], [0.3, 0], [0.38, 0.7], [0.6, 0]] }),
    ],
  }),
  pack('passagem-tremor', 'Tranco', 'Passagens no corte', {
    ...moment(0.6, 'cut'),
    description: 'Uma tremida forte bem no corte, como um tranco de câmera.',
    effects: [fx('tremor', { speed: 24, rotation: 0.7 }, { intensity: [[0, 0], [0.3, 1], [0.6, 0]] })],
    camera: cam({ zoom: [[0, 1.0], [0.3, 1.2], [0.6, 1.0]] }),
  }),
  pack('passagem-zoom-out', 'Zoom para trás', 'Passagens no corte', {
    ...moment(0.7, 'cut'),
    description: 'O primeiro clipe se afasta e o segundo chega de perto, com desfoque.',
    effects: [fx('desfoque-radial', {}, { strength: [[0, 0], [0.35, 0.8], [0.7, 0]] })],
    camera: cam({ zoom: [[0, 1.0, 'ease-in'], [0.349, 1.0, 'hold'], [0.35, 1.6, 'ease-out'], [0.7, 1.0]] }),
  }),

  // ------------------------------------------------------------ Mais aberturas e finais
  pack('abertura-vlog', 'Abertura de vlog', 'Aberturas e finais', {
    duration: 3,
    anchor: 'clip-start',
    description: 'Clarão, a câmera se afasta com energia e o "bem-vindos" na tela.',
    effects: [fx('flash', { tint: '#ffffff', glow: 0.5 }, { amount: [[0, 1], [0.5, 0]] })],
    filter: look('vivido', 0.5),
    camera: cam({ zoom: [[0, 1.35, 'ease-out'], [1.2, 1.0]] }),
    text: { preset: 'vlog', text: 'Bem-vindos!', offset: 0.3, duration: 2.5 },
  }),
  pack('abertura-glitch', 'Abertura glitch', 'Aberturas e finais', {
    duration: 2.5,
    anchor: 'clip-start',
    description: 'O vídeo liga com falhas digitais e o título aparece tremendo.',
    effects: [
      fx('glitch-digital', { blocks: 20, rate: 20 }, { amount: [[0, 1], [1.2, 0]] }),
      fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 1, 'hold'], [0.15, 0, 'hold'], [0.3, 1, 'hold'], [0.4, 0]] }),
    ],
    text: { preset: 'glitch', text: 'SEU CANAL', offset: 0.5, duration: 2 },
  }),
  pack('fim-inscreva-se', 'Inscreva-se', 'Aberturas e finais', {
    duration: 4,
    anchor: 'clip-end',
    description: 'Imagem desfocando no fundo com o convite para se inscrever.',
    effects: [fx('desfoque', {}, { radius: [[0, 0], [1, 10]] }), fx('flash', { tint: '#000000', glow: 0 }, { amount: [[0, 0], [1, 0.4]] })],
    text: { preset: 'etiqueta', text: 'INSCREVA-SE ▶', offset: 0.8, duration: 3.2 },
  }),

  // ------------------------------------------------------------ Mais retrô
  pack('game-boy', 'Game Boy', 'Retrô e nostalgia', {
    description: 'Quatro tons de verde e pixels grandes, como na tela do videogame portátil.',
    effects: [fx('game-boy', { pixels: 144 })],
  }),
  pack('filmadora-90', 'Filmadora anos 90', 'Retrô e nostalgia', {
    description: 'Fita de filmadora de família, com a marcação de gravação e a data no canto.',
    effects: [fx('vhs', { noise: 0.25, lines: 0.3, wobble: 0.3 }), fx('granulado', { amount: 0.2 })],
    filter: look('infancia'),
    text: { preset: 'etiqueta', text: '● REC  12 JUN 1998', offset: 0 },
  }),
  pack('tv-antiga', 'TV antiga', 'Retrô e nostalgia', {
    description: 'Televisão de tubo em preto e branco, com chiado e tela curva.',
    effects: [fx('crt', { curvature: 0.6, lines: 0.7 }), fx('estatica-tv', { amount: 0.2 })],
    filter: look('preto-e-branco'),
  }),
  pack('filme-16mm', 'Filme 16mm', 'Retrô e nostalgia', {
    description: 'Película de 16mm: cores do Kodachrome, grão forte e luz vazando nas bordas.',
    effects: [fx('granulado', { amount: 0.45, size: 1.8, flicker: 0.4 }), fx('luz-vazada', { amount: 0.35 }), fx('vinheta', { intensity: 0.5 })],
    filter: look('kodachrome'),
  }),

  // ------------------------------------------------------------ Mais sonho, terror, games, notícia e clima
  pack('conto-de-fadas', 'Conto de fadas', 'Sonho e romance', {
    fadeIn: 0.8,
    fadeOut: 0.8,
    description: 'Brilho mágico, partículas douradas e a câmera flutuando.',
    effects: [fx('brilho', { threshold: 0.45, intensity: 1.1, radius: 24 }), fx('particulas-de-luz', { amount: 0.9, hue: 0.12, size: 1.3 })],
    filter: look('fabula'),
    camera: cam({ zoom: [[0, 1.05, 'linear'], [6, 1.15]], y: [[0, 0.52, 'linear'], [6, 0.48]] }),
  }),
  pack('verao-99', 'Verão de 99', 'Sonho e romance', {
    description: 'Férias de infância: cores quentes desbotadas, luz vazando e grão.',
    effects: [fx('luz-vazada', { amount: 0.4 }), fx('granulado', { amount: 0.2 })],
    filter: look('verao-99'),
  }),
  pack('found-footage', 'Filmagem encontrada', 'Suspense e terror', {
    description: 'Gravação amadora achada depois: imagem lavada, tremendo, com chiado e marcação de câmera.',
    effects: [
      fx('tremor', { intensity: 0.14, speed: 5, rotation: 0.4 }),
      fx('estatica-tv', { amount: 0.12 }),
      fx('granulado', { amount: 0.4 }),
      fx('vinheta', { intensity: 0.6 }),
    ],
    filter: look('desbotado'),
    camera: cam({}, { zoom: 1.12 }),
    text: { preset: 'etiqueta', text: 'REC ● 03:17', offset: 0 },
  }),
  pack('sinal-perdido', 'Sinal perdido', 'Suspense e terror', {
    ...moment(1.5),
    description: 'O sinal cai: chiado tomando a tela, falhas e o aviso de sem sinal.',
    effects: [
      fx('estatica-tv', {}, { amount: [[0, 0.2], [0.4, 0.9], [1.1, 0.9], [1.5, 0.2]] }),
      fx('glitch', { speed: 6 }, { intensity: [[0, 0.3], [0.5, 1], [1.5, 0.2]] }),
    ],
    text: { preset: 'alerta', text: 'SEM SINAL', offset: 0.4, duration: 0.8 },
  }),
  pack('possuido', 'Possuído', 'Suspense e terror', {
    duration: 3,
    anchor: 'cursor',
    description: 'Imagem dobrada, cor doentia, giro lento e tremida: algo está muito errado.',
    effects: [fx('visao-dupla', { amount: 0.5, speed: 2 }), fx('tremor', { intensity: 0.2, speed: 9, rotation: 0.5 }), fx('vinheta', { intensity: 0.85, size: 0.25 })],
    filter: look('terror'),
    camera: cam({ rotation: [[0, 0, 'linear'], [3, 8]], zoom: [[0, 1.12, 'linear'], [3, 1.3]] }),
  }),
  pack('levou-dano', 'Levou dano', 'Ação e games', {
    ...moment(0.8),
    description: 'Tela vermelha nas bordas, tremida e flash: o personagem levou um golpe.',
    effects: [
      fx('vinheta', { tint: '#ff0000', size: 0.3 }, { intensity: [[0, 0.95, 'ease-out'], [0.8, 0]] }),
      fx('tremor', { speed: 22, rotation: 0.6 }, { intensity: [[0, 0.8, 'ease-out'], [0.6, 0]] }),
      fx('flash', { tint: '#ff4040', glow: 0 }, { amount: [[0, 0.4], [0.2, 0]] }),
    ],
    camera: cam({}, { zoom: 1.1 }),
  }),
  pack('nivel-completo', 'Nível completo', 'Ação e games', {
    duration: 3,
    anchor: 'cursor',
    description: 'Vitória: brilho, partículas e a mensagem de fase completa em fonte de videogame.',
    effects: [fx('brilho', { threshold: 0.45, intensity: 1.2, radius: 22 }), fx('particulas-de-luz', { amount: 1.2, hue: 0.15 })],
    filter: look('vivido', 0.6),
    camera: cam({ zoom: [[0, 1.0, 'ease-out'], [0.5, 1.12, 'linear'], [3, 1.16]] }),
    text: { preset: 'pixel', text: 'NÍVEL COMPLETO!', offset: 0.2, duration: 2.8 },
  }),
  pack('pixel-art', 'Pixel art', 'Ação e games', {
    description: 'O vídeo vira um jogo antigo: pixels grandes e poucas cores.',
    effects: [fx('pixelar', { size: 6 })],
    filter: look('posterizado', 1, {}, { levels: 5 }),
  }),
  pack('ao-vivo', 'Ao vivo', 'Documentário e notícia', {
    description: 'Transmissão ao vivo: imagem contrastada e a marcação "AO VIVO" na tela.',
    effects: [fx('ajuste-cor', { contrast: 1.08, saturation: 1.05 })],
    filter: look('nitido', 0.6),
    text: { preset: 'urgente', text: 'AO VIVO', offset: 0 },
  }),
  pack('tempestade', 'Tempestade', 'Clima e estações', {
    timing: 'stretch',
    description: 'Chuva pesada, céu escuro e relâmpagos clareando a cena de tempos em tempos.',
    effects: [
      fx('chuva', { amount: 0.95, speed: 1.6, slant: 0.25 }),
      fx('flash', { tint: '#dfe8ff', glow: 0.8 }, {
        amount: [[0, 0], [1.2, 0, 'hold'], [1.25, 0.8, 'hold'], [1.32, 0, 'hold'], [1.42, 0.6], [1.7, 0, 'hold'], [4.1, 0, 'hold'], [4.15, 0.9], [4.6, 0]],
      }),
      fx('vinheta', { intensity: 0.5 }),
    ],
    filter: look('tempestade'),
  }),
  pack('neblina', 'Neblina', 'Clima e estações', {
    description: 'Névoa leve, luz difusa e um pouco menos de nitidez. Manhã fria ou mistério.',
    effects: [fx('desfoque', { radius: 1.2 }), fx('brilho', { threshold: 0.4, intensity: 0.9, radius: 26 })],
    filter: look('nevoa'),
  }),
];

type Extras = Pick<PackTemplate, 'sounds' | 'stickers' | 'muteSlow'>;

/** Onde cai o começo da parte lenta (para o som entrar junto). */
const slowAt = (speeds: number[], d: number, fraction: number) => speedSeconds(speeds, d, fraction);

/** Sons (e alguns stickers) dos pacotes acima. Tempos em segundos desde o começo do bloco. */
const EXTRAS: Record<string, Extras | ((t: PackTemplate) => Extras)> = {
  // Comédia
  'zoom-dramatico': { sounds: [{ id: 'suspense', offset: 0 }] },
  'zoom-triplo': {
    sounds: [
      { id: 'soco', offset: 0.4, volume: 0.7 },
      { id: 'soco', offset: 0.8, volume: 0.85 },
      { id: 'vine-boom', offset: 1.2 },
    ],
  },
  'vine-boom': { sounds: [{ id: 'vine-boom', offset: 0 }] },
  'meme-frito': {
    sounds: [{ id: 'vine-boom', offset: 0, volume: 0.9 }],
    stickers: [
      { id: 'sticker/rindo', offset: 0.2, duration: 2.6, x: 0.78, y: 0.28, rotation: 12 },
      { id: 'sticker/fogo', offset: 0.4, duration: 2.4, x: 0.2, y: 0.72 },
    ],
  },
  'silencio-constrangedor': { sounds: [{ id: 'grilos', offset: 0.3 }] },
  'e-foi-ai': { sounds: [{ id: 'disco-arranhado', offset: 0 }] },
  reacao: { sounds: [{ id: 'impacto', offset: 0 }] },
  falhou: { sounds: [{ id: 'erro', offset: 0.1 }], stickers: [{ id: 'sticker/xis', offset: 0.2, duration: 1.3, x: 0.8, y: 0.28, size: 0.12 }] },
  'momento-triste': { sounds: [{ id: 'trombone-triste', offset: 0.2 }], stickers: [{ id: 'sticker/chorando', offset: 0.6, duration: 3.2, x: 0.8, y: 0.25, size: 0.13 }] },
  surto: { sounds: [{ id: 'glitch', offset: 0 }] },
  pensando: { sounds: [{ id: 'tique-taque', offset: 0, volume: 0.6 }], stickers: [{ id: 'sticker/pensando', offset: 0.3, duration: 2.6, x: 0.78, y: 0.28, size: 0.13 }] },
  quadrinho: { sounds: [{ id: 'soco', offset: 0 }] },
  'plot-twist': { sounds: [{ id: 'suspense', offset: 0 }] },
  bonk: { sounds: [{ id: 'soco', offset: 0, volume: 0.8 }], stickers: [{ id: 'sticker/estrelas', offset: 0.05, duration: 0.55, x: 0.5, y: 0.2, size: 0.12 }] },
  'queda-epica': { sounds: [{ id: 'camera-lenta', offset: slowAt([1, 0.25, 0.25, 0.25], 2, 0.25) }], muteSlow: true },
  'nao-acredito': { sounds: [{ id: 'camera-lenta', offset: 0, volume: 0.8 }] },
  'derrota-dramatica': { sounds: [{ id: 'trombone-triste', offset: slowAt([0.35], 2, 0.15) + 0.4 }], muteSlow: true },
  'vitoria-epica': {
    sounds: [
      { id: 'vitoria', offset: slowAt([1, 0.3, 0.3], 2, 0.333) },
      { id: 'aplausos', offset: slowAt([1, 0.3, 0.3], 2, 0.333) + 0.3, volume: 0.6 },
    ],
  },
  comemoracao: { sounds: [{ id: 'aplausos', offset: 0 }], stickers: [{ id: 'sticker/festa', offset: 0.3, duration: 4, x: 0.82, y: 0.25 }] },
  'esse-sou-eu': { sounds: [{ id: 'disco-arranhado', offset: slowAt([1, 0.1], 1.2, 0.5) }], muteSlow: true },
  'camera-lenta-desnecessaria': { sounds: [{ id: 'camera-lenta', offset: 0 }], muteSlow: true },
  quase: { sounds: [{ id: 'coracao', offset: slowAt([1, 0.5, 0.25, 0.2], 2, 0.25) }] },
  tropeco: {
    sounds: [
      { id: 'escorregao', offset: slowAt([1, 0.2, 0.2, 1.5], 2, 0.25) },
      { id: 'soco', offset: slowAt([1, 0.2, 0.2, 1.5], 2, 0.75) },
    ],
  },
  'revelacao-dramatica': { sounds: [{ id: 'suspense', offset: 0 }] },
  disfarca: { stickers: [{ id: 'sticker/olhos', offset: 0.4, duration: 1.9, x: 0.8, y: 0.25, size: 0.12 }] },
  censurado: { sounds: [{ id: 'bip', offset: 0 }] },
  'modo-detetive': { stickers: [{ id: 'sticker/lupa', offset: 0.4, duration: 3.4, x: 0.78, y: 0.3 }] },
  'piada-sem-graca': { sounds: [{ id: 'ba-dum-tss', offset: 0 }, { id: 'grilos', offset: 1.2 }] },
  susto: { sounds: [{ id: 'impacto', offset: 0 }], stickers: [{ id: 'sticker/grito', offset: 0.05, duration: 1.2, x: 0.8, y: 0.28, size: 0.13 }] },
  novela: { sounds: [{ id: 'suspense', offset: 0.6 }] },
  carregando: { sounds: [{ id: 'tique-taque', offset: 0, volume: 0.5 }] },
  cringe: { sounds: [{ id: 'vine-boom', offset: 0, volume: 0.7 }], stickers: [{ id: 'sticker/caveira', offset: 0.2, duration: 1.6, x: 0.8, y: 0.28, size: 0.14 }] },
  'mente-explodida': { sounds: [{ id: 'boom-cinema', offset: 0, volume: 0.8 }], stickers: [{ id: 'sticker/mente', offset: 0.3, duration: 1.5, x: 0.78, y: 0.28, size: 0.14 }] },
  'enquanto-isso': { sounds: [{ id: 'whoosh', offset: 0.1 }] },
  'horas-depois': { sounds: [{ id: 'whoosh', offset: 0.1 }] },
  'nao-e-possivel': {
    sounds: [
      { id: 'impacto', offset: 0, volume: 0.7 },
      { id: 'impacto', offset: 1.4, volume: 0.85 },
      { id: 'impacto', offset: 2.8 },
    ],
  },
  // Impacto, passagens e edits
  'soco-de-zoom': { sounds: [{ id: 'soco', offset: 0 }] },
  'flash-branco': { sounds: [{ id: 'flash-camera', offset: 0 }] },
  'tremor-de-impacto': { sounds: [{ id: 'impacto', offset: 0 }] },
  'glitch-rapido': { sounds: [{ id: 'glitch', offset: 0 }] },
  explosao: { sounds: [{ id: 'boom-cinema', offset: 0 }] },
  'pancada-lateral': { sounds: [{ id: 'soco', offset: 0 }] },
  'onda-de-impacto': { sounds: [{ id: 'impacto', offset: 0 }] },
  'passagem-whoosh': (t) => ({ sounds: [{ id: 'whoosh', offset: Math.max(0, t.duration / 2 - 0.42) }] }),
  'passagem-giro': (t) => ({ sounds: [{ id: 'whoosh', offset: Math.max(0, t.duration / 2 - 0.42) }] }),
  'passagem-chicote': (t) => ({ sounds: [{ id: 'swish', offset: Math.max(0, t.duration / 2 - 0.16) }] }),
  'passagem-glitch': (t) => ({ sounds: [{ id: 'glitch', offset: Math.max(0, t.duration / 2 - 0.3) }] }),
  'passagem-tremor': (t) => ({ sounds: [{ id: 'impacto', offset: t.duration / 2, volume: 0.8 }] }),
  'passagem-luz': (t) => ({ sounds: [{ id: 'whoosh-reverso', offset: Math.max(0, t.duration / 2 - 1.1) }] }),
  velocity: {
    sounds: [
      { id: 'whoosh-reverso', offset: Math.max(0, slowAt([1.8, 1.8, 0.25, 0.25, 1.8], 3, 0.4) - 1.1) },
      { id: 'impacto', offset: slowAt([1.8, 1.8, 0.25, 0.25, 1.8], 3, 0.4), volume: 0.7 },
    ],
  },
  'flash-de-drop': { sounds: [{ id: 'boom-cinema', offset: 0 }] },
  'trailer-epico': { sounds: [{ id: 'boom-cinema', offset: 0, volume: 0.8 }] },
  // Câmera lenta
  'camera-lenta-dramatica': { sounds: [{ id: 'camera-lenta', offset: 0 }] },
  'bullet-time': { sounds: [{ id: 'camera-lenta', offset: 0 }] },
  'lento-com-flash': { sounds: [{ id: 'impacto', offset: slowAt([1, 0.35, 0.35, 0.35], 2, 0.25), volume: 0.8 }] },
  'rampa-de-acao': { sounds: [{ id: 'whoosh', offset: Math.max(0, slowAt([2, 2, 0.3, 0.3, 0.3, 2], 3, 0.333) - 0.42) }] },
  // Games e suspense
  'levou-dano': { sounds: [{ id: 'soco', offset: 0 }] },
  'nivel-completo': { sounds: [{ id: 'level-up', offset: 0.2 }] },
  'sinal-perdido': { sounds: [{ id: 'glitch', offset: 0.4 }] },
};

export const PACKS: PackTemplate[] = BASE_PACKS.map((template) => {
  const extra = EXTRAS[template.id.replace(/^packs\//, '')];
  if (!extra) return template;
  return { ...template, ...(typeof extra === 'function' ? extra(template) : extra) };
});
