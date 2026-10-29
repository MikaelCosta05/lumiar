import { t, tc } from '../i18n';
import { getCaptions } from './captions';
import type { Project } from './model';

/** "01:05" ou "1:02:05" (o formato que o YouTube reconhece na descrição). */
export function chapterTime(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}

/**
 * Capítulos para a descrição do YouTube.
 * Com marcadores, cada marcador vira um capítulo (o nome dele é o título). Sem marcadores, a fala é dividida
 * nas pausas mais longas, a cada ~1,5 min, e o título são as primeiras palavras do trecho.
 * O YouTube exige: o primeiro em 00:00, pelo menos 3 e cada um com 10 s ou mais.
 */
export function makeChapters(project: Project, duration: number): { time: number; title: string }[] {
  const markers = [...project.markers].sort((a, b) => a.time - b.time);
  let chapters: { time: number; title: string }[];
  if (markers.length >= 2) {
    chapters = markers.map((m) => ({ time: m.time, title: m.label }));
  } else {
    const words = getCaptions(project).captions.flatMap((c) => c.words ?? [{ text: c.text, start: c.start, end: c.end }]);
    if (words.length === 0) return [];
    const target = Math.max(45, Math.min(180, duration / 6));
    chapters = [];
    let segmentStart = 0;
    let first = 0;
    for (let i = 1; i < words.length; i++) {
      const gap = words[i].start - words[i - 1].end;
      const long = words[i].start - segmentStart;
      // Corta numa pausa (ou num fim de frase) depois de passar do tamanho alvo.
      if (long >= target && (gap > 0.6 || /[.!?…]$/.test(words[i - 1].text))) {
        chapters.push({ time: segmentStart, title: title(words.slice(first, first + 7).map((w) => w.text)) });
        segmentStart = words[i].start;
        first = i;
      }
    }
    chapters.push({ time: segmentStart, title: title(words.slice(first, first + 7).map((w) => w.text)) });
  }
  // O primeiro precisa estar em 00:00; capítulos curtos demais são juntados ao anterior.
  if (chapters.length && chapters[0].time > 0.5) chapters.unshift({ time: 0, title: tc('capítulo', 'Início') });
  if (chapters.length) chapters[0].time = 0;
  return chapters.filter((c, i) => i === 0 || c.time - chapters[i - 1].time >= 10);
}

function title(words: string[]): string {
  const text = words.join(' ').replace(/[.,;:!?…]+$/, '').trim();
  return text ? text[0].toUpperCase() + text.slice(1) + (words.length >= 7 ? '…' : '') : t('Trecho');
}

export function chaptersText(chapters: { time: number; title: string }[]): string {
  return chapters.map((c) => `${chapterTime(c.time)} ${c.title}`).join('\n');
}

/**
 * Destaques para Shorts: trechos de `length` segundos onde a fala é mais animada (volume alto e variado,
 * com picos de empolgação). `envelope` = volume do projeto inteiro, `rate` valores por segundo.
 * Começo e fim encostam em pausas da fala, para não cortar no meio de uma frase.
 */
export function findHighlights(envelope: Float32Array, rate: number, count: number, length: number, project: Project): { start: number; end: number; score: number }[] {
  const total = envelope.length / rate;
  if (total < length * 1.2) return total > 5 ? [{ start: 0, end: total, score: 1 }] : [];
  const sorted = [...envelope].sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.8)] || 1e-4;
  // Pontuação por segundo: volume (normalizado) + picos acima do normal.
  const perSecond = Array.from({ length: Math.floor(total) }, (_, s) => {
    let sum = 0;
    let peaks = 0;
    for (let i = s * rate; i < (s + 1) * rate && i < envelope.length; i++) {
      sum += envelope[i];
      if (envelope[i] > loud * 1.3) peaks++;
    }
    return sum / rate / loud + (peaks / rate) * 2;
  });
  const win = Math.round(length);
  const scores = perSecond.map((_, s) => (s + win <= perSecond.length ? perSecond.slice(s, s + win).reduce((a, b) => a + b, 0) / win : -1));
  const chosen: { start: number; end: number; score: number }[] = [];
  const order = scores.map((v, s) => ({ s, v })).filter((x) => x.v >= 0).sort((a, b) => b.v - a.v);
  for (const { s, v } of order) {
    if (chosen.length >= count) break;
    if (chosen.some((c) => s < c.end && s + win > c.start)) continue;
    chosen.push({ start: s, end: s + win, score: v });
  }
  // Ajusta as bordas para pausas da fala, se houver transcrição.
  const words = getCaptions(project).captions.flatMap((c) => c.words ?? []);
  const snap = (t: number, edge: 'start' | 'end') => {
    if (!words.length) return t;
    const gaps = words.slice(1).map((w, i) => (edge === 'start' ? w.start - 0.1 : words[i].end + 0.15)).filter((g) => Math.abs(g - t) < 4);
    return gaps.length ? gaps.reduce((best, g) => (Math.abs(g - t) < Math.abs(best - t) ? g : best)) : t;
  };
  return chosen
    .map((c) => ({ ...c, start: Math.max(0, snap(c.start, 'start')), end: Math.min(total, snap(c.end, 'end')) }))
    .sort((a, b) => a.start - b.start);
}
