import type { CaptionWord } from './captions';

/**
 * Montar pelo roteiro: quem grava falando costuma repetir cada frase até sair certo. O Lumiar
 * compara a transcrição com o roteiro, acha as tentativas ("takes") de cada frase e fica com a
 * melhor — normalmente a última que saiu completa. O resto (erros, repetições, conversa) sai.
 */

export interface Take {
  /** Primeira e última palavra da transcrição */
  from: number;
  to: number;
  start: number;
  end: number;
  /** 0 a 1: quanto o take bate com a frase do roteiro */
  score: number;
}

export interface SentencePlan {
  sentence: string;
  takes: Take[];
  /** Take escolhido (índice em takes) ou -1 se a frase não foi encontrada */
  chosen: number;
}

const norm = (w: string) =>
  w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export function splitScript(script: string): string[] {
  return script
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(' ').filter((w) => norm(w)).length >= 2);
}

/** Tamanho da maior subsequência comum entre duas listas de palavras. */
function lcs(a: string[], b: string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[b.length];
}

/** Todas as tentativas de uma frase na transcrição (sem sobreposição entre si). */
function findTakes(target: string[], words: string[], times: CaptionWord[]): Take[] {
  const n = target.length;
  const candidates: Take[] = [];
  for (let i = 0; i < words.length; i++) {
    // Só começa onde a palavra bate com alguma das 3 primeiras da frase (tentativas começam do início).
    if (!target.slice(0, 3).includes(words[i])) continue;
    let best: Take | null = null;
    for (let len = Math.max(2, Math.floor(n * 0.6)); len <= Math.ceil(n * 1.4) && i + len <= words.length; len++) {
      const window = words.slice(i, i + len);
      const common = lcs(target, window);
      // Precisa cobrir a frase e não ter muita coisa a mais.
      const score = (2 * common) / (n + len);
      if (!best || score > best.score) best = { from: i, to: i + len - 1, start: times[i].start, end: times[i + len - 1].end, score };
    }
    if (best && best.score >= 0.6) candidates.push(best);
  }
  // Fica com a melhor de cada grupo de tentativas que se sobrepõem.
  candidates.sort((a, b) => b.score - a.score);
  const takes: Take[] = [];
  for (const c of candidates) if (!takes.some((t) => c.from <= t.to && c.to >= t.from)) takes.push(c);
  return takes.sort((a, b) => a.from - b.from);
}

/**
 * Plano: para cada frase, as tentativas em ordem e a escolhida. As frases seguem a ordem do roteiro
 * (a escolhida de uma frase vem depois da escolhida da anterior). Entre as boas (até 0,08 abaixo da
 * melhor), vence a última — quem repete é porque a anterior não saiu boa.
 */
export function planFromScript(script: string, transcript: CaptionWord[]): SentencePlan[] {
  const words = transcript.map((w) => norm(w.text));
  const plans: SentencePlan[] = splitScript(script).map((sentence) => ({
    sentence,
    takes: findTakes(sentence.split(/\s+/).map(norm).filter(Boolean), words, transcript),
    chosen: -1,
  }));
  let after = -1;
  plans.forEach((plan, k) => {
    // Só contam as tentativas antes de a próxima frase do roteiro começar a ser dita.
    const next = plans[k + 1]?.takes.find((t) => t.from > after);
    const allowed = plan.takes.map((t, i) => ({ t, i })).filter(({ t }) => t.from > after && (!next || t.from < next.from));
    if (!allowed.length) return;
    const top = Math.max(...allowed.map(({ t }) => t.score));
    const good = allowed.filter(({ t }) => t.score >= top - 0.08);
    plan.chosen = good[good.length - 1].i;
    after = plan.takes[plan.chosen].to;
  });
  // Uma frase pode ter "roubado" a tentativa de uma seguinte: refaz a ordem garantindo que as escolhas avancem.
  let last = -1;
  for (const p of plans) {
    if (p.chosen < 0) continue;
    if (p.takes[p.chosen].from <= last) {
      const next = p.takes.findIndex((t) => t.from > last);
      p.chosen = next;
    }
    if (p.chosen >= 0) last = p.takes[p.chosen].to;
  }
  return plans;
}

/** Trechos da timeline que ficam (os takes escolhidos, com uma folguinha que não invade as vizinhas). */
export function keptRanges(plans: SentencePlan[], transcript: CaptionWord[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const p of plans) {
    if (p.chosen < 0) continue;
    const take = p.takes[p.chosen];
    const before = transcript[take.from - 1];
    const after = transcript[take.to + 1];
    ranges.push([Math.max(before ? before.end : 0, take.start - 0.15), Math.min(after ? after.start : Infinity, take.end + 0.2)]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

/** O complemento: o que sai (entre 0 e `end`). */
export function removedRanges(kept: [number, number][], end: number): [number, number][] {
  const out: [number, number][] = [];
  let cursor = 0;
  for (const [a, b] of kept) {
    if (a - cursor > 0.05) out.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (end - cursor > 0.05) out.push([cursor, end]);
  return out;
}
