import type { TextClip } from '../project/text';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Cores de editor (tema escuro, parecido com o do VS Code). */
const COLORS = {
  comment: '#6a9955',
  string: '#ce9178',
  number: '#b5cea8',
  keyword: '#c586c0',
  call: '#dcdcaa',
  property: '#9cdcfe',
  punctuation: '#d4d4d4',
  gutter: '#5c6370',
};

const KEYWORDS = new Set(
  (
    'const let var function return if else for while do switch case break continue import from export default class extends new ' +
    'await async try catch finally throw typeof instanceof in of this super yield def print elif lambda pass with as is not and or ' +
    'None True False true false null undefined self public private protected static void int float double string bool boolean struct ' +
    'fn mut use impl match enum interface type package func go defer select SELECT FROM WHERE INSERT UPDATE DELETE JOIN ORDER BY GROUP'
  ).split(' '),
);

interface Token {
  text: string;
  color: string;
}

/** Divide uma linha de código em pedaços coloridos. */
export function tokenize(line: string, base: string): Token[] {
  const tokens: Token[] = [];
  const re = /(\/\/.*|(?:^|(?<=\s))#.*|--\s.*)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`[^`]*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const [text, comment, str, num, word, space] = m;
    let color = COLORS.punctuation;
    if (comment) color = COLORS.comment;
    else if (str) color = COLORS.string;
    else if (num) color = COLORS.number;
    else if (word) {
      const after = line.slice(m.index + text.length);
      const before = line.slice(0, m.index);
      if (KEYWORDS.has(word)) color = COLORS.keyword;
      else if (/^\s*\(/.test(after)) color = COLORS.call;
      else if (/\.\s*$/.test(before)) color = COLORS.property;
      else color = base;
    } else if (space) color = base;
    tokens.push({ text, color });
  }
  return tokens;
}

/**
 * Texto sendo digitado: janela de editor (com números de linha e cores de código), terminal (com o
 * "$" no começo de cada linha) ou só o texto. O tamanho da janela já é o do texto inteiro (não pula).
 */
export function drawTyping(ctx: Ctx, clip: TextClip, local: number, fontPx: number): void {
  const st = clip.style;
  const typing = clip.typing!;
  const lines = clip.text.split('\n');
  ctx.font = `${st.italic ? 'italic ' : ''}${st.weight} ${fontPx}px "${st.font}", monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const lineH = fontPx * st.lineHeight;
  const prompt = typing.frame === 'terminal' ? '$ ' : '';
  const promptW = prompt ? ctx.measureText(prompt).width : 0;
  const gutter = typing.frame === 'code' ? ctx.measureText(`${lines.length}  `).width : 0;
  const textW = Math.max(fontPx * 6, ...lines.map((l) => ctx.measureText(l).width));
  const framed = typing.frame !== 'none';
  const pad = framed ? fontPx * 0.9 : 0;
  const bar = framed ? fontPx * 1.5 : 0;
  const boxW = textW + promptW + gutter + pad * 2;
  const boxH = lines.length * lineH + pad * 2 + bar;
  const left = -boxW / 2;
  const top = -boxH / 2;

  if (framed) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = fontPx * 1.2;
    ctx.shadowOffsetY = fontPx * 0.3;
    ctx.fillStyle = typing.frame === 'code' ? '#1e1f29' : '#0c0c0c';
    ctx.beginPath();
    ctx.roundRect(left, top, boxW, boxH, fontPx * 0.5);
    ctx.fill();
    ctx.restore();
    // Barra de título com os três botõezinhos.
    ctx.fillStyle = typing.frame === 'code' ? '#2a2b38' : '#1c1c1c';
    ctx.beginPath();
    ctx.roundRect(left, top, boxW, bar, [fontPx * 0.5, fontPx * 0.5, 0, 0]);
    ctx.fill();
    ['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(left + fontPx * (0.9 + i * 0.75), top + bar / 2, fontPx * 0.24, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `400 ${fontPx * 0.6}px "Inter Variable", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(typing.frame === 'code' ? 'codigo.js' : 'terminal', left + boxW / 2, top + bar / 2);
    ctx.restore();
  }

  // Quantas letras já foram digitadas (cada quebra de linha conta como uma).
  const typed = Math.floor(Math.max(0, local) * typing.speed);
  const total = lines.reduce((n, l) => n + l.length + 1, 0) - 1;
  const done = typed >= total;
  let budget = typed;
  let cursor: { x: number; y: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const y = top + bar + pad + lineH * (i + 0.5);
    let x = left + pad;
    if (budget < 0) break;
    if (gutter) {
      ctx.fillStyle = COLORS.gutter;
      ctx.textAlign = 'right';
      ctx.fillText(String(i + 1), x + gutter - fontPx * 0.8, y);
      ctx.textAlign = 'left';
      x += gutter;
    }
    if (prompt && lines[i].trim()) {
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText(prompt, x, y);
    }
    x += promptW;
    const visible = lines[i].slice(0, Math.max(0, budget));
    const tokens = typing.highlight ? tokenize(visible, st.color) : [{ text: visible, color: st.color }];
    for (const t of tokens) {
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
      x += ctx.measureText(t.text).width;
    }
    if (budget <= lines[i].length) {
      cursor = { x, y };
      break;
    }
    budget -= lines[i].length + 1;
    if (budget < 0 || i === lines.length - 1) cursor = { x, y };
  }

  // Cursor: aceso enquanto digita, piscando quando termina.
  if (cursor && (!done || Math.floor(local * 2.2) % 2 === 0)) {
    ctx.fillStyle = typing.frame === 'code' ? '#aeafad' : st.color;
    if (typing.frame === 'terminal') {
      ctx.globalAlpha *= 0.85;
      ctx.fillRect(cursor.x + fontPx * 0.05, cursor.y - fontPx * 0.55, fontPx * 0.6, fontPx * 1.1);
    } else {
      ctx.fillRect(cursor.x + fontPx * 0.05, cursor.y - fontPx * 0.55, Math.max(1, fontPx * 0.09), fontPx * 1.1);
    }
  }
}

/** Duração boa para digitar tudo e ainda ficar 2 s na tela. */
export function typingDuration(text: string, speed: number): number {
  return Math.round((text.length / Math.max(1, speed) + 2) * 10) / 10;
}
