import { t } from '../i18n';
import { uid, type Project } from './model';

export type TextAnimation =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'zoom'
  | 'pop'
  | 'typewriter'
  | 'letters'
  | 'blur'
  | 'glitch'
  | 'spin'
  | 'flicker'
  | 'wipe'
  | 'drop'
  | 'stretch';

/** Animação contínua enquanto o texto está na tela. */
export type TextLoop =
  | 'none'
  | 'wave'
  | 'pulse'
  | 'shake'
  | 'float'
  | 'rainbow'
  | 'flicker'
  | 'swing'
  | 'glow'
  | 'bounce'
  | 'spin'
  | 'nudge'
  | 'heartbeat';

export interface TextStyle {
  font: string;
  weight: number;
  italic: boolean;
  /** Tamanho da letra como fração da altura do vídeo (0.08 = 8%). */
  size: number;
  color: string;
  /** Segunda cor para preencher em degradê (de cima para baixo), ou null. */
  gradient: string | null;
  align: 'left' | 'center' | 'right';
  uppercase: boolean;
  /** Espaço entre letras, como fração do tamanho da letra. */
  letterSpacing: number;
  lineHeight: number;
  outlineColor: string;
  /** Espessura do contorno, como fração do tamanho da letra (0 = sem contorno). */
  outlineWidth: number;
  /** Sombra projetada, 0 a 1. */
  shadow: number;
  /** Brilho em volta das letras (neon), 0 a 1. */
  glow: number;
  glowColor: string;
  box: boolean;
  boxColor: string;
  boxOpacity: number;
}

export interface TextClip {
  id: string;
  /** Posição na timeline e duração (segundos) */
  start: number;
  duration: number;
  text: string;
  /** Centro do texto na tela (0 a 1) */
  x: number;
  y: number;
  /** Graus */
  rotation: number;
  style: TextStyle;
  animIn: TextAnimation;
  animOut: TextAnimation;
  animDuration: number;
  loop: TextLoop;
  /**
   * Seguir um ponto do vídeo: o texto anda junto com ele. `points` em tempo da timeline e posição na tela;
   * `anchor` é onde o ponto estava quando foi escolhido (o texto mantém a distância até ele).
   */
  follow?: { points: { t: number; x: number; y: number }[]; anchor: { x: number; y: number } };
  /** Elemento animado desenhado no lugar do texto (barra de progresso, botão de inscrever…) */
  shape?: ElementShape;
  /** Grupo de itens que andam juntos */
  group?: string;
  /** Digitação animada (código, terminal ou texto letra por letra, com cursor) */
  typing?: Typing;
  /** Rota no mapa (elemento "map") */
  route?: MapRoute;
  /** Ondas de som (elemento "audiowave") */
  wave?: WaveStyle;
  /** Atrás da pessoa: o texto fica entre ela e o fundo (some onde ela passa na frente) */
  behind?: boolean;
}

/** Algum texto atrás da pessoa aparece no instante t? */
export function hasBehindText(project: { textTracks: TextTrack[] }, t: number): boolean {
  return project.textTracks.some((track) => track.clips.some((c) => c.behind && t >= c.start && t < c.start + c.duration));
}

export type ElementShape = 'progress' | 'subscribe' | 'countdown' | 'arrow' | 'circle' | 'balloon' | 'map' | 'audiowave';

/** Texto que vai sendo digitado. */
export interface Typing {
  /** Letras por segundo */
  speed: number;
  /** Moldura: janela de editor de código, terminal ou nenhuma */
  frame: 'code' | 'terminal' | 'none';
  /** Pintar o código como num editor (palavras-chave, textos, números, comentários) */
  highlight: boolean;
}

/** Rota animada entre cidades. */
export interface MapRoute {
  /** Ids das cidades (lista de maps.ts), na ordem da viagem */
  stops: string[];
  vehicle: 'plane' | 'car' | 'ship' | 'none';
  theme: 'dark' | 'light' | 'paper';
  /** Fração do clipe gasta parada no começo e no fim (o resto é a viagem) */
  pause: number;
}

/** Barras, círculo ou linha que pulam com o som do projeto. */
export interface WaveStyle {
  kind: 'bars' | 'mirror' | 'circle' | 'line';
  bands: number;
  /** Cor das pontas (gradiente com a cor do texto) */
  color2: string;
}

/** Onde o texto aparece no instante t (andando junto com o ponto que segue, se houver). */
export function textPosition(clip: TextClip, t: number): { x: number; y: number } {
  const points = clip.follow?.points;
  if (!points?.length) return { x: clip.x, y: clip.y };
  let p = points[0];
  if (t >= points[points.length - 1].t) p = points[points.length - 1];
  else if (t > points[0].t) {
    const i = points.findIndex((q) => q.t > t);
    const a = points[i - 1];
    const b = points[i];
    const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
    p = { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }
  return { x: clip.x + p.x - clip.follow!.anchor.x, y: clip.y + p.y - clip.follow!.anchor.y };
}

export interface TextTrack {
  id: string;
  name: string;
  clips: TextClip[];
}

export const FONTS: { family: string; label: string; weights: number[] }[] = [
  { family: 'Inter Variable', label: 'Inter', weights: [400, 700, 900] },
  { family: 'Montserrat Variable', label: 'Montserrat', weights: [400, 700, 900] },
  { family: 'Bebas Neue', label: 'Bebas Neue', weights: [400] },
  { family: 'Playfair Display', label: t('Playfair (serifa)'), weights: [400, 700] },
  { family: 'Space Mono', label: t('Space Mono (máquina)'), weights: [400, 700] },
  { family: 'Permanent Marker', label: t('Permanent Marker (pincel)'), weights: [400] },
  { family: 'Pacifico', label: t('Pacifico (letreiro)'), weights: [400] },
  { family: 'Great Vibes', label: t('Great Vibes (assinatura)'), weights: [400] },
  { family: 'Monoton', label: 'Monoton (neon)', weights: [400] },
  { family: 'Press Start 2P', label: 'Press Start (8-bit)', weights: [400] },
];

export const ANIMATIONS: { id: TextAnimation; label: string }[] = [
  { id: 'none', label: t('Nenhuma') },
  { id: 'fade', label: t('Aparecer') },
  { id: 'slide-up', label: t('Subir') },
  { id: 'slide-down', label: t('Descer') },
  { id: 'slide-left', label: t('Deslizar') },
  { id: 'zoom', label: 'Zoom' },
  { id: 'pop', label: t('Pular (elástico)') },
  { id: 'typewriter', label: t('Máquina de escrever') },
  { id: 'letters', label: t('Letra por letra') },
  { id: 'blur', label: t('Desfocar') },
  { id: 'glitch', label: 'Glitch' },
  { id: 'spin', label: t('Girar') },
  { id: 'flicker', label: t('Piscar (neon)') },
  { id: 'wipe', label: t('Revelar (da esquerda)') },
  { id: 'drop', label: t('Cair com quique') },
  { id: 'stretch', label: t('Esticar') },
];

export const LOOPS: { id: TextLoop; label: string }[] = [
  { id: 'none', label: t('Nenhuma') },
  { id: 'wave', label: t('Onda') },
  { id: 'pulse', label: t('Pulsar') },
  { id: 'shake', label: t('Tremer') },
  { id: 'float', label: t('Flutuar') },
  { id: 'rainbow', label: t('Arco-íris') },
  { id: 'flicker', label: t('Neon falhando') },
  { id: 'swing', label: t('Balançar') },
  { id: 'glow', label: t('Brilho pulsando') },
  { id: 'bounce', label: t('Quicar') },
  { id: 'spin', label: t('Girar sem parar') },
  { id: 'nudge', label: t('Apontar (vai e volta)') },
  { id: 'heartbeat', label: t('Batida de coração') },
];

const BASE_STYLE: TextStyle = {
  font: 'Montserrat Variable',
  weight: 800,
  italic: false,
  size: 0.09,
  color: '#ffffff',
  gradient: null,
  align: 'center',
  uppercase: false,
  letterSpacing: 0,
  lineHeight: 1.15,
  outlineColor: '#000000',
  outlineWidth: 0,
  shadow: 0.5,
  glow: 0,
  glowColor: '#ff3ec8',
  box: false,
  boxColor: '#000000',
  boxOpacity: 0.6,
};

export interface TextPreset {
  id: string;
  name: string;
  sample: string;
  style: Partial<TextStyle>;
  x?: number;
  y?: number;
  rotation?: number;
  animIn: TextAnimation;
  animOut: TextAnimation;
  loop?: TextLoop;
  animDuration?: number;
  shape?: ElementShape;
  typing?: Typing;
  route?: MapRoute;
  wave?: WaveStyle;
}

/** Estilos prontos da aba "Textos". */
export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'titulo',
    name: t('Título simples'),
    sample: t('Seu título aqui'),
    style: {},
    animIn: 'fade',
    animOut: 'fade',
  },
  {
    id: 'cinema',
    name: t('Cinema'),
    sample: t('UMA HISTÓRIA'),
    style: { font: 'Playfair Display', weight: 400, size: 0.08, uppercase: true, letterSpacing: 0.35, shadow: 0.3 },
    animIn: 'blur',
    animOut: 'fade',
    animDuration: 1.2,
  },
  {
    id: 'impacto',
    name: t('Impacto'),
    sample: t('INCRÍVEL!'),
    style: { font: 'Bebas Neue', weight: 400, size: 0.2, color: '#ffe14d', outlineWidth: 0.06, outlineColor: '#111111', shadow: 0.8 },
    rotation: -4,
    animIn: 'pop',
    animOut: 'zoom',
    loop: 'pulse',
  },
  {
    id: 'neon',
    name: 'Neon',
    sample: 'Neon',
    style: { font: 'Pacifico', weight: 400, size: 0.16, color: '#ffe6fb', glow: 1, glowColor: '#ff2bd6', shadow: 0 },
    animIn: 'flicker',
    animOut: 'flicker',
    loop: 'flicker',
  },
  {
    id: 'neon-letreiro',
    name: t('Letreiro retrô'),
    sample: 'OPEN',
    style: { font: 'Monoton', weight: 400, size: 0.16, color: '#9ff8ff', glow: 1, glowColor: '#00c8ff', shadow: 0, letterSpacing: 0.08 },
    animIn: 'flicker',
    animOut: 'fade',
  },
  {
    id: 'legenda',
    name: t('Legenda'),
    sample: t('Uma legenda de exemplo'),
    style: { font: 'Inter Variable', weight: 600, size: 0.05, box: true, boxOpacity: 0.65, shadow: 0 },
    y: 0.86,
    animIn: 'fade',
    animOut: 'fade',
    animDuration: 0.25,
  },
  {
    id: 'faixa',
    name: t('Faixa de nome'),
    sample: t('Maria Silva\nFotógrafa'),
    style: { font: 'Montserrat Variable', weight: 700, size: 0.055, align: 'left', box: true, boxColor: '#6f3cff', boxOpacity: 0.92, shadow: 0 },
    x: 0.24,
    y: 0.78,
    animIn: 'slide-left',
    animOut: 'slide-left',
  },
  {
    id: 'codigo',
    name: t('Código digitando'),
    // O código de exemplo inteiro é uma chave só: assim os nomes das variáveis também são traduzidos.
    sample: t('// soma os pedidos do mês\nconst total = pedidos\n  .filter((p) => p.pago)\n  .reduce((s, p) => s + p.valor, 0);\n\nconsole.log("Total:", total);'),
    style: { font: 'Space Mono', weight: 400, size: 0.04, color: '#e6e6e6', shadow: 0, align: 'left', lineHeight: 1.45 },
    animIn: 'none',
    animOut: 'fade',
    animDuration: 0.4,
    typing: { speed: 22, frame: 'code', highlight: true },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    sample: ['npm install lumiar', 'npm run dev'].join('\n'),
    style: { font: 'Space Mono', weight: 400, size: 0.045, color: '#4ade80', shadow: 0, align: 'left', lineHeight: 1.5 },
    animIn: 'none',
    animOut: 'fade',
    animDuration: 0.4,
    typing: { speed: 14, frame: 'terminal', highlight: false },
  },
  {
    id: 'digitando',
    name: t('Digitando (com cursor)'),
    sample: t('Tudo começou com uma ideia…'),
    style: { font: 'Space Mono', weight: 700, size: 0.06, color: '#ffffff', shadow: 0.5, align: 'left' },
    animIn: 'none',
    animOut: 'fade',
    animDuration: 0.4,
    typing: { speed: 16, frame: 'none', highlight: false },
  },
  {
    id: 'maquina',
    name: t('Máquina de escrever'),
    sample: t('Era uma vez...'),
    style: { font: 'Space Mono', weight: 700, size: 0.065, color: '#f2f2f2', shadow: 0.4 },
    animIn: 'typewriter',
    animOut: 'fade',
    animDuration: 1.6,
  },
  {
    id: 'glitch',
    name: 'Glitch',
    sample: 'GLITCH',
    style: { font: 'Montserrat Variable', weight: 900, size: 0.15, uppercase: true, letterSpacing: 0.05, shadow: 0 },
    animIn: 'glitch',
    animOut: 'glitch',
    loop: 'shake',
  },
  {
    id: 'pixel',
    name: '8-bit',
    sample: 'GAME OVER',
    style: { font: 'Press Start 2P', weight: 400, size: 0.07, color: '#ffffff', outlineWidth: 0.12, outlineColor: '#e8255a', shadow: 0 },
    animIn: 'letters',
    animOut: 'flicker',
  },
  {
    id: 'vlog',
    name: 'Vlog',
    sample: t('Bora lá!'),
    style: { font: 'Permanent Marker', weight: 400, size: 0.13, color: '#ffffff', outlineWidth: 0.05, outlineColor: '#ff4d6d', shadow: 0.6 },
    rotation: -6,
    animIn: 'pop',
    animOut: 'spin',
    loop: 'float',
  },
  {
    id: 'assinatura',
    name: t('Assinatura'),
    sample: t('com amor'),
    style: { font: 'Great Vibes', weight: 400, size: 0.15, color: '#fff6e0', shadow: 0.4 },
    animIn: 'letters',
    animOut: 'fade',
    animDuration: 1.4,
  },
  {
    id: 'degrade',
    name: t('Degradê'),
    sample: t('VERÃO'),
    style: { font: 'Bebas Neue', weight: 400, size: 0.22, color: '#ffd23f', gradient: '#ff3e8a', letterSpacing: 0.06, shadow: 0.5 },
    animIn: 'slide-up',
    animOut: 'slide-down',
  },
  {
    id: 'onda',
    name: t('Onda'),
    sample: t('boas vibes'),
    style: { font: 'Pacifico', weight: 400, size: 0.13, color: '#7cf7ff', outlineWidth: 0.04, outlineColor: '#1b1464', shadow: 0.4 },
    animIn: 'letters',
    animOut: 'fade',
    loop: 'wave',
  },
  {
    id: 'arco-iris',
    name: t('Arco-íris'),
    sample: t('FESTA'),
    style: { font: 'Bebas Neue', weight: 400, size: 0.2, outlineWidth: 0.04, outlineColor: '#ffffff', shadow: 0.5 },
    animIn: 'zoom',
    animOut: 'zoom',
    loop: 'rainbow',
  },
  {
    id: 'vazado',
    name: t('Contorno vazado'),
    sample: t('AVENTURA'),
    style: { font: 'Bebas Neue', weight: 400, size: 0.2, color: '#00000000', outlineWidth: 0.025, outlineColor: '#ffffff', shadow: 0, letterSpacing: 0.08 },
    animIn: 'wipe',
    animOut: 'fade',
    animDuration: 1,
  },
  {
    id: 'filme',
    name: t('Título de filme'),
    sample: t('O ÚLTIMO VERÃO'),
    style: { font: 'Playfair Display', weight: 700, size: 0.085, uppercase: true, letterSpacing: 0.22, color: '#fff1c1', gradient: '#d4a443', shadow: 0.7 },
    animIn: 'blur',
    animOut: 'blur',
    animDuration: 1.5,
  },
  {
    id: 'urgente',
    name: t('Urgente'),
    sample: t('AO VIVO'),
    style: { font: 'Montserrat Variable', weight: 900, size: 0.06, uppercase: true, box: true, boxColor: '#e11d2e', boxOpacity: 1, shadow: 0, align: 'left' },
    x: 0.16,
    y: 0.12,
    animIn: 'slide-left',
    animOut: 'slide-left',
    loop: 'flicker',
  },
  {
    id: 'citacao',
    name: t('Citação'),
    sample: t('“A vida é feita\nde pequenos momentos”'),
    style: { font: 'Playfair Display', weight: 400, italic: true, size: 0.065, color: '#fffaf0', shadow: 0.6, lineHeight: 1.3 },
    animIn: 'letters',
    animOut: 'fade',
    animDuration: 1.6,
  },
  {
    id: 'numero',
    name: t('Número gigante'),
    sample: '3',
    style: { font: 'Bebas Neue', weight: 400, size: 0.5, color: '#ffffff', outlineWidth: 0.02, outlineColor: '#000000', shadow: 0.8 },
    animIn: 'pop',
    animOut: 'zoom',
    animDuration: 0.4,
    loop: 'pulse',
  },
  {
    id: 'gamer',
    name: 'Gamer',
    sample: 'LEVEL UP!',
    style: { font: 'Press Start 2P', weight: 400, size: 0.075, color: '#fde047', outlineWidth: 0.14, outlineColor: '#6d28d9', shadow: 0.5 },
    animIn: 'drop',
    animOut: 'glitch',
    loop: 'swing',
  },
  {
    id: 'quadrinhos',
    name: t('Quadrinhos'),
    sample: 'POW!',
    style: { font: 'Permanent Marker', weight: 400, size: 0.16, color: '#111111', box: true, boxColor: '#facc15', boxOpacity: 1, shadow: 0.6 },
    rotation: -8,
    animIn: 'pop',
    animOut: 'spin',
  },
  {
    id: 'minimalista',
    name: t('Minimalista'),
    sample: t('menos é mais'),
    style: { font: 'Inter Variable', weight: 400, size: 0.045, uppercase: true, letterSpacing: 0.45, shadow: 0.2 },
    animIn: 'blur',
    animOut: 'fade',
    animDuration: 1.2,
  },
  {
    id: 'por-do-sol',
    name: t('Pôr do sol'),
    sample: t('Fim de tarde'),
    style: { font: 'Pacifico', weight: 400, size: 0.14, color: '#ffd166', gradient: '#ef476f', shadow: 0.6 },
    animIn: 'wipe',
    animOut: 'fade',
    animDuration: 1,
    loop: 'float',
  },
  {
    id: 'gelo',
    name: t('Gelo'),
    sample: t('CONGELADO'),
    style: { font: 'Montserrat Variable', weight: 900, size: 0.12, color: '#ffffff', gradient: '#7dd3fc', glow: 0.6, glowColor: '#38bdf8', shadow: 0, letterSpacing: 0.05 },
    animIn: 'stretch',
    animOut: 'blur',
    loop: 'glow',
  },
  {
    id: 'fogo',
    name: t('Fogo'),
    sample: t('EM CHAMAS'),
    style: { font: 'Bebas Neue', weight: 400, size: 0.19, color: '#fde047', gradient: '#dc2626', glow: 0.7, glowColor: '#f97316', shadow: 0 },
    animIn: 'zoom',
    animOut: 'flicker',
    loop: 'shake',
  },
  {
    id: 'anos-80',
    name: t('Anos 80'),
    sample: 'RETRO',
    style: { font: 'Monoton', weight: 400, size: 0.17, color: '#f472b6', gradient: '#22d3ee', glow: 0.5, glowColor: '#c026d3', shadow: 0 },
    animIn: 'wipe',
    animOut: 'flicker',
    loop: 'glow',
  },
  {
    id: 'etiqueta',
    name: t('Etiqueta'),
    sample: t('NOVO'),
    style: { font: 'Montserrat Variable', weight: 800, size: 0.075, color: '#111111', box: true, boxColor: '#ffffff', boxOpacity: 1, shadow: 0.5, letterSpacing: 0.1 },
    rotation: -4,
    x: 0.78,
    y: 0.2,
    animIn: 'drop',
    animOut: 'zoom',
    loop: 'swing',
  },
  {
    id: 'rabisco',
    name: t('Rabisco'),
    sample: t('feito à mão'),
    style: { font: 'Permanent Marker', weight: 400, size: 0.11, color: '#ffffff', shadow: 0.4 },
    animIn: 'wipe',
    animOut: 'wipe',
    animDuration: 1.2,
  },
  {
    id: 'sussurro',
    name: t('Sussurro'),
    sample: t('e assim tudo começou'),
    style: { font: 'Great Vibes', weight: 400, size: 0.1, color: '#ffe4f1', glow: 0.25, glowColor: '#f9a8d4', shadow: 0.3 },
    animIn: 'letters',
    animOut: 'fade',
    animDuration: 1.8,
    loop: 'float',
  },
  {
    id: 'alerta',
    name: t('Alerta'),
    sample: t('ATENÇÃO'),
    style: { font: 'Montserrat Variable', weight: 900, size: 0.075, color: '#111111', box: true, boxColor: '#facc15', boxOpacity: 1, shadow: 0.4, letterSpacing: 0.12 },
    animIn: 'stretch',
    animOut: 'zoom',
    loop: 'pulse',
  },
];

/** Sticker: um emoji grande e animado (é um texto, então dá para mover, girar e mudar o tamanho igual). */
export interface StickerPreset extends TextPreset {
  category: StickerCategory;
  /** Ícone do cartão (elementos animados não são um emoji só) */
  icon?: string;
}

export type StickerCategory = 'Elementos animados' | 'Reações' | 'Apontar e destacar' | 'Efeitos' | 'Símbolos';
export const STICKER_CATEGORIES: StickerCategory[] = ['Elementos animados', 'Reações', 'Apontar e destacar', 'Efeitos', 'Símbolos'];

const STICKER_STYLE: Partial<TextStyle> = { font: 'Inter Variable', weight: 400, size: 0.17, shadow: 0.35, outlineWidth: 0 };

function sticker(
  id: string,
  emoji: string,
  name: string,
  category: StickerCategory,
  loop: TextLoop,
  extra: Partial<Omit<StickerPreset, 'id' | 'sample' | 'name' | 'category' | 'loop'>> = {},
): StickerPreset {
  return {
    id: `sticker/${id}`,
    name,
    sample: emoji,
    category,
    loop,
    animIn: 'pop',
    animOut: 'zoom',
    animDuration: 0.35,
    ...extra,
    style: { ...STICKER_STYLE, ...extra.style },
  };
}

/** Stickers prontos da aba "Stickers". */
export const STICKERS: StickerPreset[] = [
  sticker('caveira', '💀', t('Caveira (morri)'), 'Reações', 'shake'),
  sticker('rindo', '😂', t('Chorando de rir'), 'Reações', 'bounce'),
  sticker('rolando', '🤣', t('Rolando de rir'), 'Reações', 'swing'),
  sticker('chorando', '😭', t('Chorando'), 'Reações', 'shake'),
  sticker('grito', '😱', t('Grito'), 'Reações', 'shake', { animIn: 'zoom' }),
  sticker('mente', '🤯', t('Mente explodida'), 'Reações', 'pulse'),
  sticker('olhos', '👀', t('Olhos (suspeito)'), 'Reações', 'nudge'),
  sticker('pensando', '🤔', t('Pensando'), 'Reações', 'float'),
  sticker('oculos', '😎', t('Estiloso'), 'Reações', 'swing', { animIn: 'drop' }),
  sticker('palhaco', '🤡', t('Palhaço'), 'Reações', 'bounce'),
  sticker('moai', '🗿', t('Moai (sério)'), 'Reações', 'none', { animIn: 'zoom', animOut: 'fade' }),
  sticker('congelado', '🥶', t('Congelado'), 'Reações', 'shake'),
  sticker('calor', '🥵', t('Com calor'), 'Reações', 'pulse'),
  sticker('silencio', '🤫', t('Segredo'), 'Reações', 'float'),
  sticker('sobrancelha', '🤨', t('Desconfiado'), 'Reações', 'none', { animIn: 'zoom' }),
  sticker('apaixonado', '😍', t('Apaixonado'), 'Reações', 'heartbeat'),
  sticker('palmas', '👏', t('Palmas'), 'Reações', 'bounce'),
  sticker('joinha', '👍', t('Joinha'), 'Reações', 'bounce', { animIn: 'drop' }),
  sticker('rezando', '🙏', t('Por favor'), 'Reações', 'pulse'),
  sticker('cem', '💯', t('Cem'), 'Reações', 'pulse', { rotation: -8 }),

  sticker('apontar-direita', '👉', t('Apontando (direita)'), 'Apontar e destacar', 'nudge', { x: 0.3 }),
  sticker('apontar-esquerda', '👈', t('Apontando (esquerda)'), 'Apontar e destacar', 'nudge', { x: 0.7 }),
  sticker('apontar-baixo', '👇', t('Apontando (baixo)'), 'Apontar e destacar', 'bounce', { y: 0.25 }),
  sticker('seta-direita', '➡️', t('Seta'), 'Apontar e destacar', 'nudge', { x: 0.3 }),
  sticker('seta-baixo', '⬇️', t('Seta para baixo'), 'Apontar e destacar', 'bounce', { y: 0.25 }),
  sticker('circulo', '⭕', t('Círculo vermelho'), 'Apontar e destacar', 'pulse', { style: { size: 0.3, shadow: 0 } }),
  sticker('xis', '❌', t('Errado'), 'Apontar e destacar', 'shake'),
  sticker('certo', '✅', t('Certo'), 'Apontar e destacar', 'pulse'),
  sticker('alvo', '🎯', t('Alvo'), 'Apontar e destacar', 'spin'),
  sticker('lupa', '🔍', t('Lupa'), 'Apontar e destacar', 'float'),
  sticker('interrogacao', '❓', t('Interrogação'), 'Apontar e destacar', 'swing'),
  sticker('exclamacao', '❗', t('Exclamação'), 'Apontar e destacar', 'shake'),
  sticker('sirene', '🚨', t('Sirene'), 'Apontar e destacar', 'flicker'),

  sticker('fogo', '🔥', t('Fogo'), 'Efeitos', 'pulse'),
  sticker('explosao', '💥', t('Explosão'), 'Efeitos', 'shake', { animIn: 'zoom' }),
  sticker('raio', '⚡', t('Relâmpago'), 'Efeitos', 'flicker'),
  sticker('brilho', '✨', t('Brilhos'), 'Efeitos', 'glow'),
  sticker('estrela', '⭐', t('Estrela'), 'Efeitos', 'spin'),
  sticker('estrelas', '💫', t('Tonto'), 'Efeitos', 'spin'),
  sticker('festa', '🎉', t('Festa'), 'Efeitos', 'bounce', { animIn: 'drop' }),
  sticker('coracao', '❤️', t('Coração'), 'Efeitos', 'heartbeat'),
  sticker('coracao-partido', '💔', t('Coração partido'), 'Efeitos', 'shake'),
  sticker('dinheiro', '💸', t('Dinheiro voando'), 'Efeitos', 'float'),
  sticker('suor', '💦', t('Suor'), 'Efeitos', 'bounce', { style: { size: 0.12 } }),
  sticker('zzz', '💤', t('Dormindo'), 'Efeitos', 'float'),
  sticker('balao', '💬', t('Balão de fala'), 'Efeitos', 'float'),
  sticker('perigo', '☠️', t('Perigo'), 'Efeitos', 'shake'),

  sticker('trofeu', '🏆', t('Troféu'), 'Símbolos', 'bounce', { animIn: 'drop' }),
  sticker('coroa', '👑', t('Coroa'), 'Símbolos', 'float', { y: 0.2 }),
  sticker('musica', '🎵', t('Música'), 'Símbolos', 'float'),
  sticker('microfone', '🎤', t('Microfone'), 'Símbolos', 'swing'),
  sticker('camera', '📸', t('Câmera'), 'Símbolos', 'none'),
  sticker('ideia', '💡', t('Ideia'), 'Símbolos', 'glow'),
  sticker('relogio', '⏰', t('Despertador'), 'Símbolos', 'shake'),
  sticker('foguete', '🚀', t('Foguete'), 'Símbolos', 'float', { animIn: 'slide-up', animOut: 'slide-up' }),
  sticker('pipoca', '🍿', t('Pipoca'), 'Símbolos', 'bounce'),
  sticker('cafe', '☕', t('Café'), 'Símbolos', 'float'),
  sticker('ok', '🆗', 'OK', 'Símbolos', 'pulse'),
  sticker('novo', '🆕', t('Novo'), 'Símbolos', 'pulse'),
  ...ELEMENTS(),
];

/** Elementos animados: desenhados pelo Lumiar (cores e tamanho mudam no painel do texto). */
function ELEMENTS(): StickerPreset[] {
  const element = (id: string, icon: string, name: string, shape: ElementShape, extra: Partial<StickerPreset> = {}): StickerPreset => ({
    id: `element/${id}`,
    name,
    icon,
    sample: '',
    category: 'Elementos animados',
    shape,
    animIn: 'none',
    animOut: 'fade',
    animDuration: 0.3,
    ...extra,
    style: { font: 'Montserrat Variable', weight: 800, size: 0.06, color: '#ffffff', boxColor: '#000000', boxOpacity: 0.35, shadow: 0.3, ...extra.style },
  });
  return [
    element('progresso', '▬', t('Barra de progresso'), 'progress', { y: 0.97, style: { color: '#ff3b5c', size: 0.05 } }),
    element('inscreva-se', '🔔', t('Inscreva-se'), 'subscribe', { y: 0.82, animIn: 'pop', style: { size: 0.06 } }),
    element('contagem', '⏱', t('Contagem regressiva'), 'countdown', { style: { size: 0.2, color: '#ffffff' } }),
    element('seta', '➜', t('Seta que se desenha'), 'arrow', { rotation: 20, style: { color: '#ff2d2d', size: 0.07 } }),
    element('circulo', '◯', t('Círculo à mão'), 'circle', { style: { color: '#ff2d2d', size: 0.07 } }),
    element('balao', '💬', t('Balão de fala'), 'balloon', { sample: t('Olha isso!'), x: 0.65, y: 0.3, animIn: 'pop', animOut: 'zoom', style: { color: '#111111', size: 0.05, font: 'Montserrat Variable', weight: 800 } }),
    element('mapa', '🗺️', t('Rota no mapa'), 'map', {
      animIn: 'fade',
      style: { color: '#ffb547', size: 0.05 },
      route: { stops: ['sao-paulo', 'rio-de-janeiro', 'salvador'], vehicle: 'plane', theme: 'dark', pause: 0.15 },
    }),
    element('ondas', '📶', t('Ondas de som (barras)'), 'audiowave', {
      y: 0.8,
      animIn: 'fade',
      style: { color: '#7c8cff', size: 0.12 },
      wave: { kind: 'mirror', bands: 32, color2: '#ff5cc8' },
    }),
    element('ondas-circulo', '🔵', t('Ondas de som (círculo)'), 'audiowave', {
      animIn: 'fade',
      style: { color: '#5eead4', size: 0.16 },
      wave: { kind: 'circle', bands: 48, color2: '#a78bfa' },
    }),
    element('ondas-linha', '〰️', t('Ondas de som (linha)'), 'audiowave', {
      y: 0.8,
      animIn: 'fade',
      style: { color: '#ffffff', size: 0.1 },
      wave: { kind: 'line', bands: 48, color2: '#ffffff' },
    }),
  ];
}

/** Estilo de texto ou sticker pelo id. */
export function findTextPreset(id: string): TextPreset | undefined {
  return TEXT_PRESETS.find((p) => p.id === id) ?? STICKERS.find((p) => p.id === id);
}

export function createTextClip(preset: TextPreset, start: number, duration = 4): TextClip {
  return {
    id: uid(),
    start,
    duration,
    text: preset.sample,
    x: preset.x ?? 0.5,
    y: preset.y ?? 0.5,
    rotation: preset.rotation ?? 0,
    style: { ...BASE_STYLE, ...preset.style },
    animIn: preset.animIn,
    animOut: preset.animOut,
    animDuration: preset.animDuration ?? 0.6,
    loop: preset.loop ?? 'none',
    shape: preset.shape,
    ...(preset.typing && { typing: { ...preset.typing } }),
    ...(preset.route && { route: { ...preset.route, stops: [...preset.route.stops] } }),
    ...(preset.wave && { wave: { ...preset.wave } }),
  };
}

export function createTextTrack(number: number): TextTrack {
  return { id: uid(), name: t('Texto {n}', { n: number }), clips: [] };
}

// ---------- Operações na trilha de texto ----------

const MIN_DURATION = 0.2;

export function findTextClip(project: Project, clipId: string) {
  for (let trackIndex = 0; trackIndex < project.textTracks.length; trackIndex++) {
    const track = project.textTracks[trackIndex];
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, trackIndex, clip };
  }
  return null;
}

/** Coloca o texto na primeira trilha livre naquele trecho (cria uma nova se precisar). */
export function placeTextClip(project: Project, clip: TextClip): Project {
  const end = clip.start + clip.duration;
  const free = project.textTracks.findIndex(
    (t) => !t.clips.some((c) => clip.start < c.start + c.duration && end > c.start),
  );
  let tracks = project.textTracks;
  let index = free;
  if (index < 0) {
    tracks = [...tracks, createTextTrack(tracks.length + 1)];
    index = tracks.length - 1;
  }
  return { ...project, textTracks: tracks.map((t, i) => (i === index ? { ...t, clips: [...t.clips, clip] } : t)) };
}

export function updateTextClip(project: Project, clipId: string, update: (clip: TextClip) => TextClip): Project {
  return {
    ...project,
    textTracks: project.textTracks.map((t) =>
      t.clips.some((c) => c.id === clipId) ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? update(c) : c)) } : t,
    ),
  };
}

export function removeTextClip(project: Project, clipId: string): Project {
  return { ...project, textTracks: project.textTracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })) };
}

/** Move o texto no tempo (o ponto que ele segue anda junto). */
export function shiftText(clip: TextClip, delta: number): TextClip {
  return {
    ...clip,
    start: clip.start + delta,
    follow: clip.follow && { ...clip.follow, points: clip.follow.points.map((p) => ({ ...p, t: p.t + delta })) },
  };
}

export function moveTextClip(project: Project, clipId: string, trackIndex: number, start: number): Project {
  const found = findTextClip(project, clipId);
  if (!found) return project;
  const target = Math.min(Math.max(0, trackIndex), project.textTracks.length - 1);
  const moved = shiftText(found.clip, Math.max(0, start) - found.clip.start);
  return {
    ...project,
    textTracks: project.textTracks.map((t, i) => {
      const clips = t.clips.filter((c) => c.id !== clipId);
      return { ...t, clips: i === target ? [...clips, moved] : clips };
    }),
  };
}

/** Puxa uma das bordas do texto até o instante `time` da timeline. */
export function resizeTextClip(project: Project, clipId: string, edge: 'in' | 'out', time: number): Project {
  return updateTextClip(project, clipId, (c) => {
    if (edge === 'out') return { ...c, duration: Math.max(MIN_DURATION, time - c.start) };
    const end = c.start + c.duration;
    const start = Math.min(Math.max(0, time), end - MIN_DURATION);
    return { ...c, start, duration: end - start };
  });
}

export function splitTextClip(project: Project, clipId: string, t: number): { project: Project; newId: string } | null {
  const found = findTextClip(project, clipId);
  if (!found) return null;
  const { clip } = found;
  const offset = t - clip.start;
  if (offset < MIN_DURATION || offset > clip.duration - MIN_DURATION) return null;
  const first: TextClip = { ...clip, duration: offset, animOut: 'none' };
  const second: TextClip = { ...clip, id: uid(), start: t, duration: clip.duration - offset, animIn: 'none' };
  return {
    project: {
      ...project,
      textTracks: project.textTracks.map((track) =>
        track === found.track
          ? { ...track, clips: track.clips.flatMap((c) => (c.id === clipId ? [first, second] : [c])) }
          : track,
      ),
    },
    newId: second.id,
  };
}

export function addTextTrack(project: Project): Project {
  return { ...project, textTracks: [...project.textTracks, createTextTrack(project.textTracks.length + 1)] };
}

export function removeTextTrack(project: Project, trackId: string): Project {
  if (project.textTracks.length <= 1) return project;
  return { ...project, textTracks: project.textTracks.filter((t) => t.id !== trackId) };
}
