import { t } from '../i18n';
import { uid, type Project } from './model';

/** Uma palavra com o instante em que é falada (vem do reconhecimento de fala). */
export interface CaptionWord {
  text: string;
  start: number;
  end: number;
  /** Quem fala (índice em CaptionTrack.speakers), quando as vozes foram separadas */
  speaker?: number;
}

export interface Caption {
  id: string;
  /** Tempo na timeline (segundos) */
  start: number;
  end: number;
  text: string;
  /** Só existe nas legendas automáticas: permite destacar a palavra falada. */
  words?: CaptionWord[];
  /** Quem fala (índice em CaptionTrack.speakers) */
  speaker?: number;
}

/** Uma pessoa que fala no vídeo: nome e cor das legendas dela. */
export interface Speaker {
  name: string;
  color: string;
}

export const SPEAKER_COLORS = ['#ffffff', '#ffe14d', '#5eead4', '#f9a8d4', '#a5b4fc', '#fdba74'];

/**
 * Como a legenda aparece:
 * - line: a frase inteira;
 * - highlight: a frase inteira com a palavra falada em destaque;
 * - word: só a palavra falada, grande (uma de cada vez);
 * - karaoke: as palavras já faladas mudam de cor.
 */
export type CaptionMode = 'line' | 'highlight' | 'word' | 'karaoke';

export interface CaptionStyle {
  preset: string;
  font: string;
  weight: number;
  italic: boolean;
  /** Fração da altura do vídeo */
  size: number;
  color: string;
  highlight: string;
  /** Caixa colorida atrás da palavra em destaque, em vez de só mudar a cor. */
  highlightBox: boolean;
  outlineColor: string;
  outlineWidth: number;
  shadow: number;
  box: boolean;
  boxColor: string;
  boxOpacity: number;
  uppercase: boolean;
  /** Altura do centro da legenda (0 = topo, 1 = base) */
  y: number;
  mode: CaptionMode;
  /** Mostrar o nome de quem fala acima da legenda */
  speakerNames?: boolean;
}

export interface CaptionTrack {
  enabled: boolean;
  /** Máximo de palavras por legenda ao dividir a transcrição */
  maxWords: number;
  style: CaptionStyle;
  captions: Caption[];
  /** Pessoas reconhecidas pela voz (cada legenda aponta para uma) */
  speakers?: Speaker[];
}

const BASE: CaptionStyle = {
  preset: 'classica',
  font: 'Inter Variable',
  weight: 700,
  italic: false,
  size: 0.055,
  color: '#ffffff',
  highlight: '#ffe14d',
  highlightBox: false,
  outlineColor: '#000000',
  outlineWidth: 0.09,
  shadow: 0.5,
  box: false,
  boxColor: '#000000',
  boxOpacity: 0.7,
  uppercase: false,
  y: 0.85,
  mode: 'line',
};

export const CAPTION_PRESETS: { id: string; name: string; style: Partial<CaptionStyle> }[] = [
  { id: 'classica', name: t('Clássica'), style: {} },
  { id: 'caixa', name: t('Caixa preta'), style: { outlineWidth: 0, box: true, shadow: 0, weight: 600 } },
  { id: 'amarela', name: t('Amarela'), style: { font: 'Montserrat Variable', weight: 800, color: '#ffe14d', outlineWidth: 0.1 } },
  {
    id: 'destaque',
    name: t('Destaque (TikTok)'),
    style: { font: 'Montserrat Variable', weight: 900, uppercase: true, size: 0.07, outlineWidth: 0.12, mode: 'highlight', y: 0.72 },
  },
  {
    id: 'caixa-palavra',
    name: t('Palavra na caixa'),
    style: {
      font: 'Montserrat Variable',
      weight: 900,
      uppercase: true,
      size: 0.065,
      outlineWidth: 0.1,
      mode: 'highlight',
      highlight: '#22c55e',
      highlightBox: true,
      y: 0.72,
    },
  },
  {
    id: 'palavra',
    name: t('Palavra por palavra'),
    style: { font: 'Bebas Neue', weight: 400, size: 0.14, outlineWidth: 0.06, mode: 'word', y: 0.62, shadow: 0.8 },
  },
  {
    id: 'karaoke',
    name: t('Karaokê'),
    style: { font: 'Montserrat Variable', weight: 800, size: 0.06, highlight: '#22d3ee', outlineWidth: 0.1, mode: 'karaoke' },
  },
  { id: 'cinema', name: 'Cinema', style: { font: 'Playfair Display', weight: 400, italic: true, size: 0.05, outlineWidth: 0, shadow: 0.9, y: 0.88 } },
  {
    id: 'neon',
    name: 'Neon',
    style: { font: 'Montserrat Variable', weight: 800, color: '#ffe6fb', highlight: '#ff4fd8', outlineWidth: 0.05, outlineColor: '#7e22ce', mode: 'highlight' },
  },
  {
    id: 'maquina',
    name: t('Máquina'),
    style: { font: 'Space Mono', weight: 700, size: 0.05, outlineWidth: 0, box: true, boxColor: '#111111', boxOpacity: 0.85, shadow: 0, mode: 'karaoke', highlight: '#a3e635' },
  },
];

export function captionStyle(presetId: string, keep?: Partial<CaptionStyle>): CaptionStyle {
  const preset = CAPTION_PRESETS.find((p) => p.id === presetId) ?? CAPTION_PRESETS[0];
  return { ...BASE, ...preset.style, ...keep, preset: preset.id };
}

export function createCaptionTrack(): CaptionTrack {
  return { enabled: true, maxWords: 6, style: captionStyle('classica'), captions: [] };
}

export function getCaptions(project: Project): CaptionTrack {
  return project.captions ?? createCaptionTrack();
}

export function updateCaptions(project: Project, update: (track: CaptionTrack) => CaptionTrack): Project {
  return { ...project, captions: update(getCaptions(project)) };
}

/** Legenda visível no instante t (a mais recente, se houver sobreposição). */
export function captionAt(track: CaptionTrack | undefined, t: number): Caption | null {
  if (!track || !track.enabled) return null;
  let found: Caption | null = null;
  for (const c of track.captions) if (t >= c.start && t < c.end) found = c;
  return found;
}

/**
 * Junta as palavras da transcrição em legendas curtas: no máximo `maxWords` palavras,
 * no máximo ~3 s, e quebrando em pausas e no fim das frases.
 */
export function groupWords(words: CaptionWord[], maxWords: number): Caption[] {
  const captions: Caption[] = [];
  let current: CaptionWord[] = [];
  const flush = () => {
    if (current.length === 0) return;
    captions.push({
      id: uid(),
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(' '),
      words: current,
      ...(current[0].speaker !== undefined && { speaker: current[0].speaker }),
    });
    current = [];
  };
  for (const word of words) {
    const prev = current[current.length - 1];
    const pause = prev ? word.start - prev.end : 0;
    // Troca de pessoa sempre começa outra legenda.
    if (pause > 0.7 || (prev && prev.speaker !== word.speaker)) flush();
    else if (current.length >= maxWords || (current.length && word.end - current[0].start > 3.2)) {
      // Cortou no tamanho: a legenda não termina pendurada num "de", "que", "o"…; ele passa para a próxima.
      const dangling = current.length >= 2 && isLinkWord(prev.text) ? current.pop()! : null;
      flush();
      if (dangling) current.push(dangling);
    }
    current.push(word);
    if (/[.!?…]$/.test(word.text)) flush();
  }
  flush();
  for (let i = 0; i < captions.length; i++) {
    const next = captions[i + 1];
    // Sem buracos piscando: cada legenda fica até a próxima, se a pausa for curta.
    if (next && next.start - captions[i].end < 0.4) captions[i].end = next.start;
    // Tempo para ler: uma legenda curta ou cheia demais fica um pouco mais, pela pausa depois da fala.
    const wanted = captions[i].start + Math.max(MIN_READ, captions[i].text.length / COMFORT_SPEED);
    const room = next ? next.start - GAP : Infinity;
    if (captions[i].end < wanted) captions[i].end = Math.max(captions[i].end, Math.min(wanted, room, captions[i].end + 1));
  }
  return captions;
}

/** Palavras que ligam à seguinte (artigo, preposição, conjunção), em português, inglês e espanhol. */
const LINKS = new Set(
  (
    'a o as os um uma uns umas de da do das dos em no na nos nas e ou que pra para por com se mas nem ao à aos às pelo pela num numa ' +
    'the an of to and or in on at for with but if el la los las un una y en con del al por para pero sin'
  ).split(' '),
);
const isLinkWord = (text: string) => LINKS.has(text.toLowerCase().replace(/[^\p{L}]/gu, ''));

/** Velocidade de leitura (caracteres por segundo, contando espaços) que todo mundo acompanha sem esforço. */
const COMFORT_SPEED = 15;
/** Acima disso a legenda some antes de dar para ler (o limite usado em legendagem profissional fica entre 17 e 20). */
export const READING_LIMIT = 20;
/** Uma legenda fica pelo menos isso na tela (s), mesmo de uma palavra só. */
const MIN_READ = 0.8;
/** Espaço mínimo entre uma legenda e a seguinte (s): duas legendas coladas parecem uma só trocando de texto. */
const GAP = 0.05;

/** Caracteres por segundo que a legenda pede para ser lida. */
export function readingSpeed(caption: Caption): number {
  return caption.text.trim().length / Math.max(0.05, caption.end - caption.start);
}

/**
 * Dá mais tempo de tela a uma legenda rápida demais: estica o fim pela pausa seguinte e, se não bastar, adianta o
 * começo pela pausa anterior (até 0,3 s antes da fala, que ainda parece no tempo). As palavras continuam no tempo
 * real. Devolve a mesma trilha se não houver espaço.
 */
export function giveReadingTime(track: CaptionTrack, id: string): CaptionTrack {
  const captions = [...track.captions].sort((a, b) => a.start - b.start);
  const i = captions.findIndex((c) => c.id === id);
  if (i < 0) return track;
  const c = { ...captions[i] };
  const needed = c.text.trim().length / COMFORT_SPEED;
  const next = captions[i + 1];
  const prev = captions[i - 1];
  c.end = Math.max(c.end, Math.min(c.start + needed, next ? next.start - GAP : Infinity, c.end + 2));
  if (c.end - c.start < needed) c.start = Math.min(c.start, Math.max(c.end - needed, prev ? prev.end + GAP : 0, c.start - 0.3, 0));
  if (c.start === captions[i].start && c.end === captions[i].end) return track;
  captions[i] = c;
  return { ...track, captions };
}

/** Todas as legendas rápidas demais ganham o tempo que couber. */
export function giveAllReadingTime(track: CaptionTrack): CaptionTrack {
  return track.captions.filter((c) => readingSpeed(c) > READING_LIMIT).reduce((t, c) => giveReadingTime(t, c.id), track);
}

/**
 * Troca o texto mantendo o tempo das palavras que não mudaram (corrigir "píliba" para "pele" não perde o destaque
 * da palavra falada). As palavras novas ficam no tempo das trocadas ou dividem o espaço entre as vizinhas.
 */
export function retext(caption: Caption, text: string): Caption {
  const parts = text.split(/\s+/).filter(Boolean);
  const old = caption.words;
  if (!old?.length || !parts.length) return { ...caption, text, words: undefined };
  const key = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  // Maior sequência comum entre as palavras antigas e as novas.
  const n = old.length;
  const m = parts.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = key(old[i].text) === key(parts[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const words: (CaptionWord | null)[] = new Array(m).fill(null);
  // Cada trecho trocado: as palavras antigas [i0, i) viram as novas [j0, j).
  const replace = (i0: number, i: number, j0: number, j: number) => {
    if (j === j0) return;
    // Palavra só inserida: pega a metade das vizinhas (com tempo zero ela nunca apareceria no modo palavra).
    const middle = (w: CaptionWord) => (w.start + w.end) / 2;
    const start = i > i0 ? old[i0].start : i0 > 0 ? middle(old[i0 - 1]) : caption.start;
    const end = i > i0 ? old[i - 1].end : i0 < n ? middle(old[i0]) : caption.end;
    const span = (end - start) / (j - j0);
    const speaker = old[Math.min(i0, n - 1)].speaker;
    for (let k = j0; k < j; k++) words[k] = { text: parts[k], start: start + (k - j0) * span, end: start + (k - j0 + 1) * span, ...(speaker !== undefined && { speaker }) };
  };
  let i = 0;
  let j = 0;
  let i0 = 0;
  let j0 = 0;
  while (i < n && j < m) {
    if (key(old[i].text) === key(parts[j])) {
      replace(i0, i, j0, j);
      words[j] = { ...old[i], text: parts[j] };
      i0 = ++i;
      j0 = ++j;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  replace(i0, n, j0, m);
  const out = words as CaptionWord[];
  // Sem sobreposição: encolhe a anterior até o começo da seguinte, ou, se ela sumiria, empurra o começo da seguinte.
  for (let k = 1; k < m; k++) {
    const [a, b] = [out[k - 1], out[k]];
    if (a.end <= b.start) continue;
    if (b.start > a.start) out[k - 1] = { ...a, end: b.start };
    else out[k] = { ...b, start: Math.min(a.end, b.end - 0.01) };
  }
  return { ...caption, text, words: out };
}

/** Palavras de uma legenda: as reais, ou divididas igualmente no tempo (legendas manuais/SRT). */
export function captionWords(caption: Caption): CaptionWord[] {
  if (caption.words?.length) return caption.words;
  const parts = caption.text.split(/\s+/).filter(Boolean);
  const span = (caption.end - caption.start) / Math.max(1, parts.length);
  return parts.map((text, i) => ({ text, start: caption.start + i * span, end: caption.start + (i + 1) * span }));
}

/** Menor duração de uma legenda ao arrastar as bordas (s). */
const MIN_CAPTION = 0.2;

/** Põe a legenda em outro lugar e em outro tamanho; o tempo de cada palavra acompanha, na mesma proporção. */
function retime(caption: Caption, start: number, end: number): Caption {
  const scale = (end - start) / Math.max(1e-6, caption.end - caption.start);
  const at = (time: number) => start + (time - caption.start) * scale;
  return { ...caption, start, end, ...(caption.words && { words: caption.words.map((w) => ({ ...w, start: at(w.start), end: at(w.end) })) }) };
}

/** Arrasta a legenda inteira para começar em `start` (a ordem da lista segue o tempo). */
export function moveCaption(track: CaptionTrack, id: string, start: number): CaptionTrack {
  const captions = track.captions.map((c) => (c.id === id ? retime(c, Math.max(0, start), Math.max(0, start) + c.end - c.start) : c));
  return { ...track, captions: captions.sort((a, b) => a.start - b.start) };
}

/** Puxa a borda do começo ('in') ou do fim ('out') da legenda até `time`. */
export function resizeCaption(track: CaptionTrack, id: string, edge: 'in' | 'out', time: number): CaptionTrack {
  const captions = track.captions.map((c) => {
    if (c.id !== id) return c;
    return edge === 'in' ? retime(c, Math.min(Math.max(0, time), c.end - MIN_CAPTION), c.end) : retime(c, c.start, Math.max(time, c.start + MIN_CAPTION));
  });
  return { ...track, captions: captions.sort((a, b) => a.start - b.start) };
}

/** Refaz a divisão (ex.: mudou o máximo de palavras), mantendo legendas manuais como estão. */
export function regroup(track: CaptionTrack, maxWords: number): CaptionTrack {
  const auto = track.captions.filter((c) => c.words?.length);
  if (auto.length === 0) return { ...track, maxWords };
  const manual = track.captions.filter((c) => !c.words?.length);
  const words = auto.flatMap((c) => c.words!);
  const captions = [...groupWords(words, maxWords), ...manual].sort((a, b) => a.start - b.start);
  return { ...track, maxWords, captions };
}

/**
 * Dá a cada legenda a pessoa que fala nela (`speakerOf` = índice por legenda) e cria as pessoas com
 * cores diferentes. Os nomes que já existiam ficam.
 */
export function assignSpeakers(track: CaptionTrack, speakerOf: number[], count: number): CaptionTrack {
  const speakers = Array.from({ length: count }, (_, i) => track.speakers?.[i] ?? { name: t('Pessoa {n}', { n: i + 1 }), color: SPEAKER_COLORS[i % SPEAKER_COLORS.length] });
  const captions = track.captions.map((c, i) => {
    const speaker = speakerOf[i];
    if (speaker === undefined || speaker < 0) return c;
    return { ...c, speaker, words: c.words?.map((w) => ({ ...w, speaker })) };
  });
  return { ...track, captions, speakers };
}

/** Cor e nome de quem fala na legenda (null quando as vozes não foram separadas). */
export function speakerOf(track: CaptionTrack, caption: Caption): Speaker | null {
  if (caption.speaker === undefined || !track.speakers?.length) return null;
  return track.speakers[caption.speaker] ?? null;
}

// ---------------------------------------------------------------- Arquivos .srt / .vtt

function stamp(seconds: number, separator: ',' | '.'): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`;
}

export function toSrt(captions: Caption[]): string {
  return captions
    .map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`)
    .join('\n');
}

export function toVtt(captions: Caption[]): string {
  return `WEBVTT\n\n${captions.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n')}`;
}

function parseStamp(text: string): number {
  const m = text.trim().match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);
  if (!m) return NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0').slice(0, 3)) / 1000;
}

/** Lê legendas .srt ou .vtt. */
export function parseSubtitles(content: string): Caption[] {
  const blocks = content.replace(/\r/g, '').split(/\n{2,}/);
  const captions: Caption[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timing = lines.findIndex((l) => l.includes('-->'));
    if (timing < 0) continue;
    const [a, b] = lines[timing].split('-->');
    const start = parseStamp(a);
    const end = parseStamp(b);
    const text = lines
      .slice(timing + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (Number.isFinite(start) && Number.isFinite(end) && text) captions.push({ id: uid(), start, end, text });
  }
  return captions.sort((x, y) => x.start - y.start);
}
