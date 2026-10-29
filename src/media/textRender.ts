import { captionAt, captionWords, speakerOf, type Caption, type CaptionStyle, type Speaker } from '../project/captions';
import { layoutProject, resolveFrame, type Project } from '../project/model';
import { evaluateCamera, IDENTITY, sourceToScreen } from '../project/camera';
import { cursorAt, recentClicks } from '../project/cursorFx';
import { drawTyping } from './typingRender';
import { t } from '../i18n';
import { drawMap } from './mapRender';
import { drawWave } from './spectrum';
import { textPosition, type TextAnimation, type TextClip } from '../project/text';

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
export function drawTexts(canvas: HTMLCanvasElement | OffscreenCanvas, project: Project, t: number, layer: 'front' | 'behind' = 'front'): boolean {
  // Os textos "atrás da pessoa" vão numa imagem separada (desenhada antes, com a pessoa por cima).
  const behind = layer === 'behind';
  const active = project.textTracks.flatMap((track) =>
    track.clips.filter((c) => !!c.behind === behind && t >= c.start && t < c.start + c.duration && (c.text.trim() !== '' || !!c.shape)),
  );
  const caption = behind ? null : captionAt(project.captions, t);
  const cursor = !behind && project.clips.some((c) => c.cursorFx) ? cursorSpots(project, t) : [];
  if (active.length === 0 && !caption && cursor.length === 0) return false;
  if (canvas.width !== project.width || canvas.height !== project.height) {
    canvas.width = project.width;
    canvas.height = project.height;
  }
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) return false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const spot of cursor) drawCursorSpot(ctx, spot, canvas.width, canvas.height);
  for (const clip of active)
    drawTextClip(ctx, clip.follow ? { ...clip, ...textPosition(clip, t) } : clip, t - clip.start, canvas.width, canvas.height, { project, time: t });
  if (caption && project.captions) drawCaption(ctx, project.captions.style, caption, t, canvas.width, canvas.height, speakerOf(project.captions, caption));
  return true;
}

interface CursorSpot {
  x: number;
  y: number;
  /** Tamanho na tela (cresce junto com o zoom da câmera) */
  zoom: number;
  clicks: number[];
  halo: boolean;
  color: string;
}

/** Onde o cursor das gravações de tela aparece agora (já passando pelo zoom da câmera). */
function cursorSpots(project: Project, t: number): CursorSpot[] {
  const frame = resolveFrame(project, layoutProject(project), t);
  const spots: CursorSpot[] = [];
  for (const active of [frame.a, frame.b]) {
    const clip = active?.layout.clip;
    const media = active?.layout.media;
    if (!active || !clip?.cursorFx || !media?.cursor) continue;
    const pos = cursorAt(media.cursor, active.sourceTime);
    if (!pos) continue;
    const view = clip.camera ? { ...evaluateCamera(clip.camera, active.clipTime, active.sourceTime), fill: clip.camera.fill } : { ...IDENTITY, fill: false };
    const screen = sourceToScreen(pos, view, project, media);
    spots.push({
      ...screen,
      zoom: view.zoom,
      clicks: clip.cursorFx.clicks ? recentClicks(media.cursor, active.sourceTime).map((c) => c.age) : [],
      halo: clip.cursorFx.halo,
      color: clip.cursorFx.color,
    });
  }
  return spots;
}

function drawCursorSpot(ctx: Ctx, spot: CursorSpot, W: number, H: number): void {
  const x = spot.x * W;
  const y = spot.y * H;
  const r = Math.min(W, H) * 0.028 * Math.sqrt(spot.zoom);
  ctx.save();
  if (spot.halo) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `${spot.color}66`);
    g.addColorStop(0.7, `${spot.color}40`);
    g.addColorStop(1, `${spot.color}00`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cada clique abre uma onda que some em 0,6 s.
  for (const age of spot.clicks) {
    const p = age / 0.6;
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = spot.color;
    ctx.lineWidth = r * 0.18 * (1 - p) + 1;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.5 + 1.6 * (1 - Math.pow(1 - p, 3))), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Desenha uma legenda no instante t, conforme o estilo (frase, destaque, palavra a palavra, karaokê). */
export function drawCaption(ctx: Ctx, base: CaptionStyle, caption: Caption, t: number, W: number, H: number, speaker: Speaker | null = null): void {
  // Cada pessoa com a sua cor (o destaque continua o do estilo).
  const style = speaker ? { ...base, color: speaker.color } : base;
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

  // Nome de quem fala, numa etiqueta da cor da pessoa, acima da legenda.
  if (speaker && style.speakerNames && speaker.name.trim()) {
    ctx.save();
    const tagPx = fontPx * 0.5;
    ctx.font = `800 ${tagPx}px "Montserrat Variable", sans-serif`;
    const label = speaker.name.trim().toUpperCase();
    const tw = ctx.measureText(label).width;
    const th = tagPx * 1.5;
    const ty = top - pad - th - tagPx * 0.3;
    ctx.fillStyle = speaker.color;
    ctx.beginPath();
    ctx.roundRect(W / 2 - tw / 2 - tagPx * 0.6, ty, tw + tagPx * 1.2, th, th / 2);
    ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, ty + th / 2 + tagPx * 0.04);
    ctx.restore();
  }

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

/** O projeto e o instante (para elementos que reagem ao som). */
export interface DrawEnv {
  project: Project;
  time: number;
}

export function drawTextClip(ctx: Ctx, clip: TextClip, local: number, W: number, H: number, env: DrawEnv | null = null): void {
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
    case 'bounce': {
      // Quica: sobe e desce, achatando um pouco ao tocar o "chão".
      const phase = (local * 1.8) % 1;
      const height = 4 * phase * (1 - phase);
      s.dy -= height * 0.05 * H;
      s.scaleX *= 1 + (1 - height) * 0.08;
      s.scale *= 1 - (1 - height) * 0.04;
      break;
    }
    case 'spin':
      s.rotate += local * Math.PI * 0.9;
      break;
    case 'nudge':
      // Vai e volta na direção para onde aponta (ponteiro, seta).
      s.dx += Math.abs(Math.sin(local * 4.5)) * 0.025 * W * (clip.x > 0.5 ? -1 : 1);
      break;
    case 'heartbeat': {
      // "Tum-tum": duas batidas e uma pausa.
      const phase = (local * 1.2) % 1;
      const pulse = (from: number) => Math.max(0, Math.sin(Math.min(1, Math.max(0, phase - from) / 0.15) * Math.PI));
      s.scale *= 1 + (pulse(0) + 0.6 * pulse(0.2)) * 0.12;
      break;
    }
  }
  if (s.alpha <= 0.001 || s.scale <= 0.001) return;

  const text = st.uppercase ? clip.text.toUpperCase() : clip.text;
  const lines = text.split('\n');
  ctx.save();
  ctx.translate(clip.x * W + s.dx, clip.y * H + s.dy);
  ctx.rotate((clip.rotation * Math.PI) / 180 + s.rotate);
  ctx.scale(s.scale * s.scaleX, s.scale);
  ctx.globalAlpha = s.alpha;
  if (clip.shape) {
    drawElement(ctx, clip, local, fontPx, W, H, env);
    ctx.restore();
    return;
  }
  if (clip.typing) {
    drawTyping(ctx, clip, local, fontPx);
    ctx.restore();
    return;
  }
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

/** Elementos animados (desenhados já no lugar e na escala do texto). */
function drawElement(ctx: Ctx, clip: TextClip, local: number, size: number, W: number, H: number, env: DrawEnv | null): void {
  const st = clip.style;
  const ease = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (clip.shape) {
    case 'map':
      drawMap(ctx, clip, local, size, W, H);
      break;
    case 'audiowave':
      drawWave(ctx, clip, size, W, env?.project ?? null, env?.time ?? local);
      break;
    case 'progress': {
      // Barra de ponta a ponta que enche ao longo do clipe.
      const w = W * 0.96;
      const h = size * 0.35;
      ctx.save();
      ctx.globalAlpha *= st.boxOpacity;
      ctx.fillStyle = st.boxColor;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = st.color;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, Math.max(h, w * Math.min(1, local / Math.max(0.01, clip.duration))), h, h / 2);
      ctx.fill();
      break;
    }
    case 'subscribe': {
      const clicked = local > Math.min(1.6, clip.duration * 0.45);
      const w = size * 6.2;
      const h = size * 1.5;
      const press = clicked && local < Math.min(1.6, clip.duration * 0.45) + 0.12 ? 0.92 : 1;
      ctx.save();
      ctx.scale(press, press);
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = size * 0.4;
      ctx.fillStyle = clicked ? '#606060' : '#ff0000';
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.18);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${size * 0.62}px "Montserrat Variable", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(clicked ? t('INSCRITO ✓') : t('INSCREVA-SE'), 0, size * 0.03);
      ctx.restore();
      // O sininho balança depois do clique.
      const bell = clicked ? Math.sin((local - 1.6) * 18) * Math.exp(-(local - 1.6) * 2) * 0.5 : 0;
      ctx.save();
      ctx.translate(w / 2 + size * 1.1, 0);
      ctx.rotate(bell);
      ctx.font = `${size * 1.3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔔', 0, 0);
      ctx.restore();
      // A mãozinha chega e clica.
      const arrive = ease((local - 0.3) / 1);
      if (local < Math.min(1.6, clip.duration * 0.45) + 0.6) {
        ctx.font = `${size * 1.4}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('👆', w * 0.25 + (1 - arrive) * w * 0.6, h * 0.1 + (1 - arrive) * h * 2);
      }
      break;
    }
    case 'countdown': {
      const left = Math.max(0, clip.duration - local);
      const n = Math.max(1, Math.ceil(left));
      const frac = left - Math.floor(left) || 1;
      const r = size * 0.75;
      ctx.lineWidth = size * 0.08;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = st.color;
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.stroke();
      const pop = 1 + Math.max(0, frac - 0.85) * 2;
      ctx.scale(pop, pop);
      ctx.fillStyle = st.color;
      ctx.font = `900 ${size * 0.9}px "Montserrat Variable", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), 0, size * 0.04);
      break;
    }
    case 'arrow': {
      // A seta se desenha da cauda para a ponta.
      const p = ease(local / 0.6);
      const len = size * 5;
      ctx.strokeStyle = st.color;
      ctx.lineWidth = size * 0.22;
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = size * 0.2;
      const x0 = -len / 2;
      const x1 = x0 + len * p;
      ctx.beginPath();
      ctx.moveTo(x0, size * 0.4);
      ctx.quadraticCurveTo(x0 + len * 0.4 * p, -size * 0.3 * p, x1, 0);
      ctx.stroke();
      if (p > 0.85) {
        const head = size * 0.9 * ((p - 0.85) / 0.15);
        ctx.beginPath();
        ctx.moveTo(x1 - head, -head * 0.75);
        ctx.lineTo(x1, 0);
        ctx.lineTo(x1 - head, head * 0.75);
        ctx.stroke();
      }
      break;
    }
    case 'circle': {
      // Círculo feito à mão: um pouco torto e passando do ponto de partida.
      const p = ease(local / 0.7);
      const rx = size * 3.2;
      const ry = size * 2.1;
      ctx.strokeStyle = st.color;
      ctx.lineWidth = size * 0.16;
      ctx.beginPath();
      const steps = Math.max(2, Math.floor(80 * p));
      for (let i = 0; i <= steps; i++) {
        const a = -2.2 + (i / 80) * Math.PI * 2.25;
        const wobble = 1 + 0.05 * Math.sin(a * 3) + (i / 80) * 0.06;
        const x = Math.cos(a) * rx * wobble;
        const y = Math.sin(a) * ry * wobble;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case 'balloon': {
      const lines = clip.text.split('\n');
      ctx.font = `${st.weight} ${size}px "${st.font}", sans-serif`;
      const w = Math.max(size * 3, ...lines.map((l) => ctx.measureText(l).width)) + size * 1.4;
      const h = lines.length * size * 1.25 + size * 1;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = size * 0.4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, size * 0.6);
      ctx.moveTo(-w * 0.2, h / 2 - 1);
      ctx.lineTo(-w * 0.32, h / 2 + size * 1.1);
      ctx.lineTo(-w * 0.02, h / 2 - 1);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = st.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((line, i) => ctx.fillText(line, 0, -h / 2 + size * 0.5 + size * 1.25 * (i + 0.5)));
      break;
    }
  }
}
