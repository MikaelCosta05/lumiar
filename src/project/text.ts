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
  { family: 'Playfair Display', label: 'Playfair (serifa)', weights: [400, 700] },
  { family: 'Space Mono', label: 'Space Mono (máquina)', weights: [400, 700] },
  { family: 'Permanent Marker', label: 'Permanent Marker (pincel)', weights: [400] },
  { family: 'Pacifico', label: 'Pacifico (letreiro)', weights: [400] },
  { family: 'Great Vibes', label: 'Great Vibes (assinatura)', weights: [400] },
  { family: 'Monoton', label: 'Monoton (neon)', weights: [400] },
  { family: 'Press Start 2P', label: 'Press Start (8-bit)', weights: [400] },
];

export const ANIMATIONS: { id: TextAnimation; label: string }[] = [
  { id: 'none', label: 'Nenhuma' },
  { id: 'fade', label: 'Aparecer' },
  { id: 'slide-up', label: 'Subir' },
  { id: 'slide-down', label: 'Descer' },
  { id: 'slide-left', label: 'Deslizar' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'pop', label: 'Pular (elástico)' },
  { id: 'typewriter', label: 'Máquina de escrever' },
  { id: 'letters', label: 'Letra por letra' },
  { id: 'blur', label: 'Desfocar' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'spin', label: 'Girar' },
  { id: 'flicker', label: 'Piscar (neon)' },
  { id: 'wipe', label: 'Revelar (da esquerda)' },
  { id: 'drop', label: 'Cair com quique' },
  { id: 'stretch', label: 'Esticar' },
];

export const LOOPS: { id: TextLoop; label: string }[] = [
  { id: 'none', label: 'Nenhuma' },
  { id: 'wave', label: 'Onda' },
  { id: 'pulse', label: 'Pulsar' },
  { id: 'shake', label: 'Tremer' },
  { id: 'float', label: 'Flutuar' },
  { id: 'rainbow', label: 'Arco-íris' },
  { id: 'flicker', label: 'Neon falhando' },
  { id: 'swing', label: 'Balançar' },
  { id: 'glow', label: 'Brilho pulsando' },
  { id: 'bounce', label: 'Quicar' },
  { id: 'spin', label: 'Girar sem parar' },
  { id: 'nudge', label: 'Apontar (vai e volta)' },
  { id: 'heartbeat', label: 'Batida de coração' },
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
}

/** Estilos prontos da aba "Textos". */
export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'titulo',
    name: 'Título simples',
    sample: 'Seu título aqui',
    style: {},
    animIn: 'fade',
    animOut: 'fade',
  },
  {
    id: 'cinema',
    name: 'Cinema',
    sample: 'UMA HISTÓRIA',
    style: { font: 'Playfair Display', weight: 400, size: 0.08, uppercase: true, letterSpacing: 0.35, shadow: 0.3 },
    animIn: 'blur',
    animOut: 'fade',
    animDuration: 1.2,
  },
  {
    id: 'impacto',
    name: 'Impacto',
    sample: 'INCRÍVEL!',
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
    name: 'Letreiro retrô',
    sample: 'OPEN',
    style: { font: 'Monoton', weight: 400, size: 0.16, color: '#9ff8ff', glow: 1, glowColor: '#00c8ff', shadow: 0, letterSpacing: 0.08 },
    animIn: 'flicker',
    animOut: 'fade',
  },
  {
    id: 'legenda',
    name: 'Legenda',
    sample: 'Uma legenda de exemplo',
    style: { font: 'Inter Variable', weight: 600, size: 0.05, box: true, boxOpacity: 0.65, shadow: 0 },
    y: 0.86,
    animIn: 'fade',
    animOut: 'fade',
    animDuration: 0.25,
  },
  {
    id: 'faixa',
    name: 'Faixa de nome',
    sample: 'Maria Silva\nFotógrafa',
    style: { font: 'Montserrat Variable', weight: 700, size: 0.055, align: 'left', box: true, boxColor: '#6f3cff', boxOpacity: 0.92, shadow: 0 },
    x: 0.24,
    y: 0.78,
    animIn: 'slide-left',
    animOut: 'slide-left',
  },
  {
    id: 'maquina',
    name: 'Máquina de escrever',
    sample: 'Era uma vez...',
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
    sample: 'Bora lá!',
    style: { font: 'Permanent Marker', weight: 400, size: 0.13, color: '#ffffff', outlineWidth: 0.05, outlineColor: '#ff4d6d', shadow: 0.6 },
    rotation: -6,
    animIn: 'pop',
    animOut: 'spin',
    loop: 'float',
  },
  {
    id: 'assinatura',
    name: 'Assinatura',
    sample: 'com amor',
    style: { font: 'Great Vibes', weight: 400, size: 0.15, color: '#fff6e0', shadow: 0.4 },
    animIn: 'letters',
    animOut: 'fade',
    animDuration: 1.4,
  },
  {
    id: 'degrade',
    name: 'Degradê',
    sample: 'VERÃO',
    style: { font: 'Bebas Neue', weight: 400, size: 0.22, color: '#ffd23f', gradient: '#ff3e8a', letterSpacing: 0.06, shadow: 0.5 },
    animIn: 'slide-up',
    animOut: 'slide-down',
  },
  {
    id: 'onda',
    name: 'Onda',
    sample: 'boas vibes',
    style: { font: 'Pacifico', weight: 400, size: 0.13, color: '#7cf7ff', outlineWidth: 0.04, outlineColor: '#1b1464', shadow: 0.4 },
    animIn: 'letters',
    animOut: 'fade',
    loop: 'wave',
  },
  {
    id: 'arco-iris',
    name: 'Arco-íris',
    sample: 'FESTA',
    style: { font: 'Bebas Neue', weight: 400, size: 0.2, outlineWidth: 0.04, outlineColor: '#ffffff', shadow: 0.5 },
    animIn: 'zoom',
    animOut: 'zoom',
    loop: 'rainbow',
  },
  {
    id: 'vazado',
    name: 'Contorno vazado',
    sample: 'AVENTURA',
    style: { font: 'Bebas Neue', weight: 400, size: 0.2, color: '#00000000', outlineWidth: 0.025, outlineColor: '#ffffff', shadow: 0, letterSpacing: 0.08 },
    animIn: 'wipe',
    animOut: 'fade',
    animDuration: 1,
  },
  {
    id: 'filme',
    name: 'Título de filme',
    sample: 'O ÚLTIMO VERÃO',
    style: { font: 'Playfair Display', weight: 700, size: 0.085, uppercase: true, letterSpacing: 0.22, color: '#fff1c1', gradient: '#d4a443', shadow: 0.7 },
    animIn: 'blur',
    animOut: 'blur',
    animDuration: 1.5,
  },
  {
    id: 'urgente',
    name: 'Urgente',
    sample: 'AO VIVO',
    style: { font: 'Montserrat Variable', weight: 900, size: 0.06, uppercase: true, box: true, boxColor: '#e11d2e', boxOpacity: 1, shadow: 0, align: 'left' },
    x: 0.16,
    y: 0.12,
    animIn: 'slide-left',
    animOut: 'slide-left',
    loop: 'flicker',
  },
  {
    id: 'citacao',
    name: 'Citação',
    sample: '“A vida é feita\nde pequenos momentos”',
    style: { font: 'Playfair Display', weight: 400, italic: true, size: 0.065, color: '#fffaf0', shadow: 0.6, lineHeight: 1.3 },
    animIn: 'letters',
    animOut: 'fade',
    animDuration: 1.6,
  },
  {
    id: 'numero',
    name: 'Número gigante',
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
    name: 'Quadrinhos',
    sample: 'POW!',
    style: { font: 'Permanent Marker', weight: 400, size: 0.16, color: '#111111', box: true, boxColor: '#facc15', boxOpacity: 1, shadow: 0.6 },
    rotation: -8,
    animIn: 'pop',
    animOut: 'spin',
  },
  {
    id: 'minimalista',
    name: 'Minimalista',
    sample: 'menos é mais',
    style: { font: 'Inter Variable', weight: 400, size: 0.045, uppercase: true, letterSpacing: 0.45, shadow: 0.2 },
    animIn: 'blur',
    animOut: 'fade',
    animDuration: 1.2,
  },
  {
    id: 'por-do-sol',
    name: 'Pôr do sol',
    sample: 'Fim de tarde',
    style: { font: 'Pacifico', weight: 400, size: 0.14, color: '#ffd166', gradient: '#ef476f', shadow: 0.6 },
    animIn: 'wipe',
    animOut: 'fade',
    animDuration: 1,
    loop: 'float',
  },
  {
    id: 'gelo',
    name: 'Gelo',
    sample: 'CONGELADO',
    style: { font: 'Montserrat Variable', weight: 900, size: 0.12, color: '#ffffff', gradient: '#7dd3fc', glow: 0.6, glowColor: '#38bdf8', shadow: 0, letterSpacing: 0.05 },
    animIn: 'stretch',
    animOut: 'blur',
    loop: 'glow',
  },
  {
    id: 'fogo',
    name: 'Fogo',
    sample: 'EM CHAMAS',
    style: { font: 'Bebas Neue', weight: 400, size: 0.19, color: '#fde047', gradient: '#dc2626', glow: 0.7, glowColor: '#f97316', shadow: 0 },
    animIn: 'zoom',
    animOut: 'flicker',
    loop: 'shake',
  },
  {
    id: 'anos-80',
    name: 'Anos 80',
    sample: 'RETRO',
    style: { font: 'Monoton', weight: 400, size: 0.17, color: '#f472b6', gradient: '#22d3ee', glow: 0.5, glowColor: '#c026d3', shadow: 0 },
    animIn: 'wipe',
    animOut: 'flicker',
    loop: 'glow',
  },
  {
    id: 'etiqueta',
    name: 'Etiqueta',
    sample: 'NOVO',
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
    name: 'Rabisco',
    sample: 'feito à mão',
    style: { font: 'Permanent Marker', weight: 400, size: 0.11, color: '#ffffff', shadow: 0.4 },
    animIn: 'wipe',
    animOut: 'wipe',
    animDuration: 1.2,
  },
  {
    id: 'sussurro',
    name: 'Sussurro',
    sample: 'e assim tudo começou',
    style: { font: 'Great Vibes', weight: 400, size: 0.1, color: '#ffe4f1', glow: 0.25, glowColor: '#f9a8d4', shadow: 0.3 },
    animIn: 'letters',
    animOut: 'fade',
    animDuration: 1.8,
    loop: 'float',
  },
  {
    id: 'alerta',
    name: 'Alerta',
    sample: 'ATENÇÃO',
    style: { font: 'Montserrat Variable', weight: 900, size: 0.075, color: '#111111', box: true, boxColor: '#facc15', boxOpacity: 1, shadow: 0.4, letterSpacing: 0.12 },
    animIn: 'stretch',
    animOut: 'zoom',
    loop: 'pulse',
  },
];

/** Sticker: um emoji grande e animado (é um texto, então dá para mover, girar e mudar o tamanho igual). */
export interface StickerPreset extends TextPreset {
  category: StickerCategory;
}

export type StickerCategory = 'Reações' | 'Apontar e destacar' | 'Efeitos' | 'Símbolos';
export const STICKER_CATEGORIES: StickerCategory[] = ['Reações', 'Apontar e destacar', 'Efeitos', 'Símbolos'];

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
  sticker('caveira', '💀', 'Caveira (morri)', 'Reações', 'shake'),
  sticker('rindo', '😂', 'Chorando de rir', 'Reações', 'bounce'),
  sticker('rolando', '🤣', 'Rolando de rir', 'Reações', 'swing'),
  sticker('chorando', '😭', 'Chorando', 'Reações', 'shake'),
  sticker('grito', '😱', 'Grito', 'Reações', 'shake', { animIn: 'zoom' }),
  sticker('mente', '🤯', 'Mente explodida', 'Reações', 'pulse'),
  sticker('olhos', '👀', 'Olhos (suspeito)', 'Reações', 'nudge'),
  sticker('pensando', '🤔', 'Pensando', 'Reações', 'float'),
  sticker('oculos', '😎', 'Estiloso', 'Reações', 'swing', { animIn: 'drop' }),
  sticker('palhaco', '🤡', 'Palhaço', 'Reações', 'bounce'),
  sticker('moai', '🗿', 'Moai (sério)', 'Reações', 'none', { animIn: 'zoom', animOut: 'fade' }),
  sticker('congelado', '🥶', 'Congelado', 'Reações', 'shake'),
  sticker('calor', '🥵', 'Com calor', 'Reações', 'pulse'),
  sticker('silencio', '🤫', 'Segredo', 'Reações', 'float'),
  sticker('sobrancelha', '🤨', 'Desconfiado', 'Reações', 'none', { animIn: 'zoom' }),
  sticker('apaixonado', '😍', 'Apaixonado', 'Reações', 'heartbeat'),
  sticker('palmas', '👏', 'Palmas', 'Reações', 'bounce'),
  sticker('joinha', '👍', 'Joinha', 'Reações', 'bounce', { animIn: 'drop' }),
  sticker('rezando', '🙏', 'Por favor', 'Reações', 'pulse'),
  sticker('cem', '💯', 'Cem', 'Reações', 'pulse', { rotation: -8 }),

  sticker('apontar-direita', '👉', 'Apontando (direita)', 'Apontar e destacar', 'nudge', { x: 0.3 }),
  sticker('apontar-esquerda', '👈', 'Apontando (esquerda)', 'Apontar e destacar', 'nudge', { x: 0.7 }),
  sticker('apontar-baixo', '👇', 'Apontando (baixo)', 'Apontar e destacar', 'bounce', { y: 0.25 }),
  sticker('seta-direita', '➡️', 'Seta', 'Apontar e destacar', 'nudge', { x: 0.3 }),
  sticker('seta-baixo', '⬇️', 'Seta para baixo', 'Apontar e destacar', 'bounce', { y: 0.25 }),
  sticker('circulo', '⭕', 'Círculo vermelho', 'Apontar e destacar', 'pulse', { style: { size: 0.3, shadow: 0 } }),
  sticker('xis', '❌', 'Errado', 'Apontar e destacar', 'shake'),
  sticker('certo', '✅', 'Certo', 'Apontar e destacar', 'pulse'),
  sticker('alvo', '🎯', 'Alvo', 'Apontar e destacar', 'spin'),
  sticker('lupa', '🔍', 'Lupa', 'Apontar e destacar', 'float'),
  sticker('interrogacao', '❓', 'Interrogação', 'Apontar e destacar', 'swing'),
  sticker('exclamacao', '❗', 'Exclamação', 'Apontar e destacar', 'shake'),
  sticker('sirene', '🚨', 'Sirene', 'Apontar e destacar', 'flicker'),

  sticker('fogo', '🔥', 'Fogo', 'Efeitos', 'pulse'),
  sticker('explosao', '💥', 'Explosão', 'Efeitos', 'shake', { animIn: 'zoom' }),
  sticker('raio', '⚡', 'Raio', 'Efeitos', 'flicker'),
  sticker('brilho', '✨', 'Brilhos', 'Efeitos', 'glow'),
  sticker('estrela', '⭐', 'Estrela', 'Efeitos', 'spin'),
  sticker('estrelas', '💫', 'Tonto', 'Efeitos', 'spin'),
  sticker('festa', '🎉', 'Festa', 'Efeitos', 'bounce', { animIn: 'drop' }),
  sticker('coracao', '❤️', 'Coração', 'Efeitos', 'heartbeat'),
  sticker('coracao-partido', '💔', 'Coração partido', 'Efeitos', 'shake'),
  sticker('dinheiro', '💸', 'Dinheiro voando', 'Efeitos', 'float'),
  sticker('suor', '💦', 'Suor', 'Efeitos', 'bounce', { style: { size: 0.12 } }),
  sticker('zzz', '💤', 'Dormindo', 'Efeitos', 'float'),
  sticker('balao', '💬', 'Balão de fala', 'Efeitos', 'float'),
  sticker('perigo', '☠️', 'Perigo', 'Efeitos', 'shake'),

  sticker('trofeu', '🏆', 'Troféu', 'Símbolos', 'bounce', { animIn: 'drop' }),
  sticker('coroa', '👑', 'Coroa', 'Símbolos', 'float', { y: 0.2 }),
  sticker('musica', '🎵', 'Música', 'Símbolos', 'float'),
  sticker('microfone', '🎤', 'Microfone', 'Símbolos', 'swing'),
  sticker('camera', '📸', 'Câmera', 'Símbolos', 'none'),
  sticker('ideia', '💡', 'Ideia', 'Símbolos', 'glow'),
  sticker('relogio', '⏰', 'Despertador', 'Símbolos', 'shake'),
  sticker('foguete', '🚀', 'Foguete', 'Símbolos', 'float', { animIn: 'slide-up', animOut: 'slide-up' }),
  sticker('pipoca', '🍿', 'Pipoca', 'Símbolos', 'bounce'),
  sticker('cafe', '☕', 'Café', 'Símbolos', 'float'),
  sticker('ok', '🆗', 'OK', 'Símbolos', 'pulse'),
  sticker('novo', '🆕', 'Novo', 'Símbolos', 'pulse'),
];

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
  };
}

export function createTextTrack(number: number): TextTrack {
  return { id: uid(), name: `Texto ${number}`, clips: [] };
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

export function moveTextClip(project: Project, clipId: string, trackIndex: number, start: number): Project {
  const found = findTextClip(project, clipId);
  if (!found) return project;
  const target = Math.min(Math.max(0, trackIndex), project.textTracks.length - 1);
  const moved = { ...found.clip, start: Math.max(0, start) };
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
