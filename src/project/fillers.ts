import type { CaptionWord } from './captions';

/**
 * Vícios de fala achados na transcrição. Cada um aponta um trecho de palavras (índices da lista
 * ordenada por tempo) que dá para tirar sem mudar o sentido.
 * - filler: hesitação ("é…", "hum", "ahn") ou muleta ("tipo,", "né?", "então…");
 * - repeat: palavra repetida colada ("eu eu fui");
 * - restart: frase recomeçada ("eu fui, eu fui no mercado") — sai a primeira tentativa.
 */
export interface Filler {
  kind: 'filler' | 'repeat' | 'restart';
  /** Primeira e última palavra do trecho a tirar */
  from: number;
  to: number;
  /** Como aparece na lista ("é…", "eu eu") */
  label: string;
}

const clean = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[.,!?…"“”;:()]/g, '')
    .trim();

/**
 * Hesitações: sempre podem sair. "É" sozinho é verbo ("pois é"): só conta esticado ("éé", "é…").
 */
const HESITATION = /^(h?u+m+|h+m+|a+h+n*|ã{2,}h*|e+h+|é{2,}h*|éh+|ê{2,}h*|u+h+|ahm|hum+|e+r+m+|u+m+)$/;
const DRAWN_OUT = /^(é|e|ã|a|ê|o)\s*(…|\.\.\.)$/;

/**
 * Muletas: só contam quando aparecem "soltas" — com vírgula, reticências ou interrogação junto,
 * ou repetidas. "Tipo assim, …" sim; "esse tipo de coisa" não.
 */
const CRUTCHES = new Set(['tipo', 'né', 'então', 'assim', 'sabe', 'entendeu', 'tá', 'beleza', 'enfim', 'basicamente', 'literalmente', 'ok', 'okay', 'like', 'so', 'basically', 'actually']);
/** Muletas de duas palavras ("quer dizer", "tipo assim"). */
const CRUTCH_PAIRS = new Set(['tipo assim', 'quer dizer', 'sabe como', 'é tipo', 'você sabe', 'you know', 'i mean']);

const loose = (raw: string) => /[,…?]|\.\.\./.test(raw);

export function isHesitation(raw: string): boolean {
  return HESITATION.test(clean(raw)) || DRAWN_OUT.test(raw.toLowerCase().trim());
}

/** Acha todos os vícios. `words` já em ordem de tempo. */
export function findFillers(words: CaptionWord[]): Filler[] {
  const found: Filler[] = [];
  const taken = new Set<number>();
  const add = (f: Filler) => {
    for (let i = f.from; i <= f.to; i++) if (taken.has(i)) return;
    for (let i = f.from; i <= f.to; i++) taken.add(i);
    found.push(f);
  };
  const w = words.map((x) => clean(x.text));
  // Começo de frase: primeira palavra, ou depois de ponto/pausa longa.
  const startsSentence = (i: number) => i === 0 || /[.!?]$/.test(words[i - 1].text.trim()) || words[i].start - words[i - 1].end > 0.6;

  // 1) Frases recomeçadas: as mesmas 2 a 4 palavras ditas duas vezes seguidas.
  for (let i = 0; i < w.length; i++) {
    for (let n = 4; n >= 2; n--) {
      if (i + 2 * n > w.length) continue;
      let same = true;
      for (let k = 0; k < n; k++) if (!w[i + k] || w[i + k] !== w[i + n + k]) same = false;
      if (same) {
        add({ kind: 'restart', from: i, to: i + n - 1, label: words.slice(i, i + n).map((x) => x.text).join(' ') });
        break;
      }
    }
  }

  // 2) Palavra repetida colada ("eu eu", "que que"). Números e "muito muito" de ênfase passam.
  for (let i = 1; i < w.length; i++) {
    if (!w[i] || w[i] !== w[i - 1] || /^\d+$/.test(w[i]) || w[i] === 'muito' || w[i] === 'very') continue;
    if (words[i].start - words[i - 1].end > 0.7) continue;
    add({ kind: 'repeat', from: i - 1, to: i - 1, label: `${words[i - 1].text} ${words[i].text}` });
  }

  // 3) Hesitações e muletas.
  for (let i = 0; i < w.length; i++) {
    const pair = i + 1 < w.length ? `${w[i]} ${w[i + 1]}` : '';
    if (pair && CRUTCH_PAIRS.has(pair) && (loose(words[i + 1].text) || startsSentence(i))) {
      add({ kind: 'filler', from: i, to: i + 1, label: `${words[i].text} ${words[i + 1].text}` });
      continue;
    }
    if (isHesitation(words[i].text)) {
      add({ kind: 'filler', from: i, to: i, label: words[i].text });
      continue;
    }
    if (!CRUTCHES.has(w[i])) continue;
    // "Então" e "assim" abrindo frase com vírgula/reticências, ou qualquer muleta solta no meio.
    const alone = loose(words[i].text) || (w[i] === 'né' && /\?$/.test(words[i].text));
    const repeated = w[i] === w[i - 1] || w[i] === w[i + 1];
    if (alone || repeated) add({ kind: 'filler', from: i, to: i, label: words[i].text });
  }
  return found.sort((a, b) => a.from - b.from);
}

export const FILLER_KINDS: Record<Filler['kind'], string> = {
  filler: 'Hesitação ou muleta',
  repeat: 'Palavra repetida',
  restart: 'Frase recomeçada',
};
