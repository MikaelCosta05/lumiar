import { captionAt, captionWords, type Caption, type CaptionStyle } from '../project/captions';
import type { Project } from '../project/model';
import type { TextAnimation, TextClip } from '../project/text';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
/** Passa um pouco do ponto e volta (efeito elástico). */
const backOut = (p: number) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
const rnd = (n: number) => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * Desenha todos os textos visíveis no instante t num canvas transparente do
 * tamanho do vídeo. Devolve false quando não há texto (o canvas nem é usado).
 */
export function drawTexts(canvas: HTMLCanvasElement | OffscreenCanvas, project: Project, t: number): boolean {
  const active = project.textTracks.flatMap((track) =>
    track.clips.filter((c) => t >= c.start && t < c.start + c.duration && c.text.trim() !== ''),
  );
  const caption = captionAt(project.captions, t);
  if (active.length === 0 && !caption) return false;
  if (canvas.width !== project.width || canvas.height !== project.height) {
    canvas.width = project.width;
    canvas.height = project.height;
  }
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) return false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const clip of active) drawTextClip(ctx, clip, t - clip.start, canvas.width, canvas.height);
  if (caption && project.captions) drawCaption(ctx, project.captions.style, caption, t, canvas.width, canvas.height);
  return true;
}

/** Desenha uma legenda no instante t, conforme o estilo (frase, destaque, palavra a palavra, karaokê). */
export function drawCaption(ctx: Ctx, style: CaptionStyle, caption: Caption, t: number, W: number, H: number): void {
  const words = captionWords(caption).map((w) => ({ ...w, text: style.uppercase ? w.text.toUpperCase() : w.text }));
  if (words.length === 0) return;
  const fontPx = Math.max(4, style.size * H);
  let current = -1;
  words.forEach((w, i) => {
    if (t >= w.start) current = i;
  });

  ctx.save();
  ctx.font = `${style.italic ? 'italic ' : ''}${style.weight} ${fontPx}px "${style.font}", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  // Aparece rapidinho em vez de surgir seco.
  ctx.globalAlpha = clamp01((t - caption.start) / 0.08);

  const paintWord = (text: string, x: number, y: number, color: string) => {
    ctx.save();
    if (style.shadow > 0) {
      ctx.shadowColor = `rgba(0, 0, 0, ${0.7 * style.shadow})`;
      ctx.shadowBlur = fontPx * 0.2 * style.shadow;
      ctx.shadowOffsetY = fontPx * 0.06 * style.shadow;
    }
    if (style.outlineWidth > 0) {
      ctx.strokeStyle = style.outlineColor;
      ctx.lineWidth = style.outlineWidth * fontPx * 2;
      ctx.strokeText(text, x, y);
    }
    ctx.restore();
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };

  if (style.mode === 'word') {
    // Só a palavra falada, grande, com um "pulo" ao entrar.
    const word = words[Math.max(0, current)];
    const pop = Math.max(0, backOut(clamp01((t - word.start) / 0.18)));
    const width = ctx.measureText(word.text).width;
    ctx.translate(W / 2, style.y * H);
    ctx.scale(pop, pop);
    paintWord(word.text, -width / 2, 0, current >= 0 ? style.color : style.color);
    ctx.restore();
    return;
  }

  // Quebra em linhas que caibam em 86% da largura.
  // A palavra em destaque cresce: as palavras precisam de mais respiro entre si.
  const space = ctx.measureText(' ').width + (style.mode === 'highlight' ? fontPx * (style.highlightBox ? 0.3 : 0.15) : 0);
  const widths = words.map((w) => ctx.measureText(w.text).width);
  const lines: { start: number; end: number; width: number }[] = [];
  let line = { start: 0, end: 0, width: 0 };
  words.forEach((_, i) => {
    const add = (line.end > line.start ? space : 0) + widths[i];
    if (line.end > line.start && line.width + add > W * 0.86) {
      lines.push(line);
      line = { start: i, end: i, width: 0 };
    }
    line.width += (line.end > line.start ? space : 0) + widths[i];
    line.end = i + 1;
  });
  lines.push(line);

  const lineH = fontPx * 1.25;
  const blockH = lines.length * lineH;
  const top = style.y * H - blockH / 2;
  const pad = fontPx * 0.35;

  if (style.box) {
    const blockW = Math.max(...lines.map((l) => l.width));
    ctx.save();
    ctx.globalAlpha *= style.boxOpacity;
    ctx.fillStyle = style.boxColor;
    ctx.beginPath();
    ctx.roundRect(W / 2 - blockW / 2 - pad, top - pad * 0.5, blockW + pad * 2, blockH + pad, fontPx * 0.18);
    ctx.fill();
    ctx.restore();
  }

  lines.forEach((l, li) => {
    let x = W / 2 - l.width / 2;
    const y = top + lineH * (li + 0.5);
    for (let i = l.start; i < l.end; i++) {
      const isCurrent = i === current;
      let color = style.color;
      if (style.mode === 'highlight' && isCurrent && !style.highlightBox) color = style.highlight;
      if (style.mode === 'karaoke' && i <= current) color = style.highlight;
      if (style.mode === 'highlight' && isCurrent) {
        // A palavra falada cresce um pouco (e ganha uma caixa colorida, se o estilo pedir).
        ctx.save();
        const cx = x + widths[i] / 2;
        ctx.translate(cx, y);
        ctx.scale(1.1, 1.1);
        ctx.translate(-cx, -y);
        if (style.highlightBox) {
          ctx.fillStyle = style.highlight;
          ctx.beginPath();
          ctx.roundRect(x - pad * 0.45, y - fontPx * 0.62, widths[i] + pad * 0.9, fontPx * 1.24, fontPx * 0.15);
          ctx.fill();
        }
        paintWord(words[i].text, x, y, color);
        ctx.restore();
      } else {
        paintWord(words[i].text, x, y, color);
      }
      x += widths[i] + space;
    }
  });
  ctx.restore();
}

interface AnimState {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  rotate: number;
  blur: number;
  spacing: number;
  /** Fração dos caracteres visíveis (máquina de escrever). */
  typed: number;
  /** Progresso da entrada letra por letra (1 = todas visíveis). */
  letters: number;
  glitch: number;
  /** Fração revelada da esquerda para a direita (animação "revelar"). */
  reveal: number;
  /** Escala só na horizontal (animação "esticar"). */
  scaleX: number;
  /** Multiplica o brilho neon (loop "brilho pulsando"). */
  glow: number;
}

/** Cai e quica no chão. */
const bounceOut = (p: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p - 1.5 / d) * (p - 1.5 / d) + 0.75;
  if (p < 2.5 / d) return n * (p - 2.25 / d) * (p - 2.25 / d) + 0.9375;
  return n * (p - 2.625 / d) * (p - 2.625 / d) + 0.984375;
};

function applyAnimation(s: AnimState, anim: TextAnimation, p: number, entering: boolean, W: number, H: number, local: number) {
  if (p >= 1 || anim === 'none') return;
  const e = easeOut(p);
  switch (anim) {
    case 'fade':
      s.alpha *= p;
      break;
    case 'slide-up':
      s.dy += (1 - e) * 0.08 * H * (entering ? 1 : -1);
      s.alpha *= p;
      break;
    case 'slide-down':
      s.dy += (1 - e) * 0.08 * H * (entering ? -1 : 1);
      s.alpha *= p;
      break;
    case 'slide-left':
      s.dx -= (1 - e) * 0.2 * W;
      s.alpha *= p;
      break;
    case 'zoom':
      s.scale *= entering ? 0.3 + 0.7 * e : 1 + (1 - p) * 0.6;
      s.alpha *= p;
      break;
    case 'pop':
      s.scale *= Math.max(0, backOut(p));
      s.alpha *= clamp01(p * 3);
      break;
    case 'typewriter':
      s.typed = Math.min(s.typed, p);
      break;
    case 'letters':
      s.letters = Math.min(s.letters, p);
      break;
    case 'blur':
      s.blur += (1 - p) * 0.03 * H;
      s.spacing += (1 - e) * 0.3;
      s.alpha *= p;
      break;
    case 'glitch':
      s.glitch = Math.max(s.glitch, 1 - p);
      s.alpha *= rnd(Math.floor(local * 30)) > 0.35 * (1 - p) ? p * 0.5 + 0.5 : 0.1;
      s.dx += (rnd(Math.floor(local * 30) + 7) - 0.5) * 0.04 * W * (1 - p);
      break;
    case 'spin':
      s.rotate += (1 - e) * Math.PI * (entering ? -1 : 1);
      s.scale *= 0.3 + 0.7 * e;
      s.alpha *= p;
      break;
    case 'flicker':
      s.alpha *= rnd(Math.floor(local * 18)) < p ? 1 : 0.12;
      break;
    case 'wipe':
      s.reveal = Math.min(s.reveal, e);
      break;
    case 'drop':
      if (entering) {
        s.dy -= (1 - bounceOut(p)) * 0.35 * H;
      } else {
        s.dy += (1 - p) * (1 - p) * 0.5 * H;
        s.alpha *= p;
      }
      break;
    case 'stretch':
      s.scaleX *= Math.max(0, backOut(p));
      s.alpha *= clamp01(p * 2);
      break;
  }
}

export function drawTextClip(ctx: Ctx, clip: TextClip, local: number, W: number, H: number): void {
  const st = clip.style;
  const fontPx = Math.max(4, st.size * H);
  const d = Math.min(clip.animDuration, clip.duration / 2);
  const pin = d > 0 ? clamp01(local / d) : 1;
  const pout = d > 0 ? clamp01((clip.duration - local) / d) : 1;

  const s: AnimState = { alpha: 1, dx: 0, dy: 0, scale: 1, rotate: 0, blur: 0, spacing: 0, typed: 1, letters: 1, glitch: 0, reveal: 1, scaleX: 1, glow: 1 };
  applyAnimation(s, clip.animIn, pin, true, W, H, local);
  applyAnimation(s, clip.animOut, pout, false, W, H, local);

  // Animação contínua
  switch (clip.loop) {
    case 'pulse':
      s.scale *= 1 + 0.05 * Math.sin(local * 5);
      break;
    case 'shake': {
      const k = Math.floor(local * 20);
      s.dx += (rnd(k) - 0.5) * 0.008 * W;
      s.dy += (rnd(k + 3) - 0.5) * 0.008 * H;
      break;
    }
    case 'float':
      s.dy += Math.sin(local * 1.6) * 0.015 * H;
      s.rotate += (Math.sin(local * 1.1) * 2 * Math.PI) / 180;
      break;
    case 'flicker':
      if (rnd(Math.floor(local * 12)) > 0.88) s.alpha *= 0.3;
      break;
    case 'swing':
      s.rotate += (Math.sin(local * 2.2) * 6 * Math.PI) / 180;
      break;
    case 'glow':
      s.glow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(local * 4));
      break;
  }
  if (s.alpha <= 0.001 || s.scale <= 0.001) return;

  const text = st.uppercase ? clip.text.toUpperCase() : clip.text;
  const lines = text.split('\n');
  ctx.save();
  ctx.translate(clip.x * W + s.dx, clip.y * H + s.dy);
  ctx.rotate((clip.rotation * Math.PI) / 180 + s.rotate);
  ctx.scale(s.scale * s.scaleX, s.scale);
  ctx.globalAlpha = s.alpha;
  if (s.blur > 0.5) ctx.filter = `blur(${s.blur.toFixed(1)}px)`;
  ctx.font = `${st.italic ? 'italic ' : ''}${st.weight} ${fontPx}px "${st.font}", sans-serif`;
  ctx.letterSpacing = `${((st.letterSpacing + s.spacing) * fontPx).toFixed(1)}px`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';

  const lineH = fontPx * st.lineHeight;
  const widths = lines.map((l) => ctx.measureText(l).width);
  const blockW = Math.max(...widths);
  const blockH = lines.length * lineH;
  const top = -blockH / 2;

  // Revelar: só a parte da esquerda até "reveal" aparece.
  if (s.reveal < 1) {
    const pad = fontPx;
    ctx.beginPath();
    ctx.rect(-blockW / 2 - pad, top - pad, (blockW + pad * 2) * Math.max(0, s.reveal), blockH + pad * 2);
    ctx.clip();
  }
  // No "brilho pulsando", textos sem neon ganham um brilho da própria cor.
  const glow = st.glow > 0 ? st.glow * s.glow : clip.loop === 'glow' ? 0.6 * s.glow : 0;
  const glowColor = st.glow > 0 ? st.glowColor : st.color;

  if (st.box) {
    const pad = fontPx * 0.35;
    ctx.save();
    ctx.globalAlpha = s.alpha * st.boxOpacity;
    ctx.fillStyle = st.boxColor;
    ctx.beginPath();
    ctx.roundRect(-blockW / 2 - pad, top - pad * 0.6, blockW + pad * 2, blockH + pad * 1.2, fontPx * 0.15);
    ctx.fill();
    ctx.restore();
  }

  const fill = (lineTop: number): string | CanvasGradient => {
    if (!st.gradient) return st.color;
    const g = ctx.createLinearGradient(0, lineTop, 0, lineTop + lineH);
    g.addColorStop(0, st.color);
    g.addColorStop(1, st.gradient);
    return g;
  };

  /** Pinta um trecho de texto com brilho, sombra, contorno, glitch e preenchimento. */
  const paint = (str: string, x: number, y: number, color: string | CanvasGradient) => {
    if (glow > 0) {
      ctx.save();
      ctx.shadowColor = glowColor;
      ctx.fillStyle = glowColor;
      ctx.shadowBlur = fontPx * 0.6 * glow;
      ctx.fillText(str, x, y);
      ctx.shadowBlur = fontPx * 0.25 * glow;
      ctx.fillText(str, x, y);
      ctx.restore();
    }
    ctx.save();
    if (st.shadow > 0) {
      ctx.shadowColor = `rgba(0, 0, 0, ${0.65 * st.shadow})`;
      ctx.shadowBlur = fontPx * 0.18 * st.shadow;
      ctx.shadowOffsetY = fontPx * 0.06 * st.shadow;
    }
    if (st.outlineWidth > 0) {
      ctx.strokeStyle = st.outlineColor;
      ctx.lineWidth = st.outlineWidth * fontPx * 2;
      ctx.strokeText(str, x, y);
    } else if (st.shadow > 0) {
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
    }
    ctx.restore();
    if (s.glitch > 0.01) {
      const off = s.glitch * fontPx * 0.08;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255, 0, 80, 0.8)';
      ctx.fillText(str, x + off, y);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.8)';
      ctx.fillText(str, x - off, y);
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  };

  const totalChars = lines.reduce((n, l) => n + l.length, 0);
  const visibleChars = Math.floor(s.typed * totalChars + 1e-6);
  const perLetter = s.typed < 1 || s.letters < 1 || clip.loop === 'wave' || clip.loop === 'rainbow';
  let counted = 0;
  let cursor: { x: number; y: number } | null = null;

  lines.forEach((line, li) => {
    const lineW = widths[li];
    const x0 = st.align === 'left' ? -blockW / 2 : st.align === 'right' ? blockW / 2 - lineW : -lineW / 2;
    const yMid = top + lineH * (li + 0.5);
    const lineFill = fill(top + lineH * li);

    if (!perLetter) {
      paint(line, x0, yMid, lineFill);
      counted += line.length;
      return;
    }
    for (let i = 0; i < line.length; i++, counted++) {
      if (counted >= visibleChars) {
        cursor ??= { x: x0 + ctx.measureText(line.slice(0, i)).width, y: yMid };
        return;
      }
      const ch = line[i];
      if (ch === ' ') continue;
      const cx = x0 + ctx.measureText(line.slice(0, i)).width;
      let cy = yMid;
      let color: string | CanvasGradient = lineFill;
      ctx.save();
      if (s.letters < 1) {
        const lp = clamp01((s.letters - (counted / Math.max(1, totalChars)) * 0.6) / 0.4);
        ctx.globalAlpha *= lp;
        cy += (1 - easeOut(lp)) * fontPx * 0.5;
      }
      if (clip.loop === 'wave') cy += Math.sin(local * 4 - counted * 0.5) * fontPx * 0.15;
      if (clip.loop === 'rainbow') color = `hsl(${(counted * 28 + local * 140) % 360}, 95%, 60%)`;
      paint(ch, cx, cy, color);
      ctx.restore();
    }
    if (counted >= visibleChars && s.typed < 1) cursor ??= { x: x0 + lineW, y: yMid };
  });

  // Cursor piscando da máquina de escrever
  if (cursor && s.typed < 1 && Math.floor(local * 3) % 2 === 0) {
    const c: { x: number; y: number } = cursor;
    ctx.fillStyle = st.color;
    ctx.fillRect(c.x + fontPx * 0.05, c.y - fontPx * 0.45, fontPx * 0.08, fontPx * 0.9);
  }
  ctx.restore();
}
