import { describe, expect, it } from 'vitest';
import type { CaptionWord } from './captions';
import { keptRanges, planFromScript, removedRanges, splitScript } from './scriptAlign';

/** Cada palavra dura 0,4 s e começa a cada 0,5 s. */
function speak(text: string): CaptionWord[] {
  return text.split(' ').map((w, i) => ({ text: w, start: i * 0.5, end: i * 0.5 + 0.4 }));
}

describe('splitScript', () => {
  it('divide nas pontuações e nas quebras de linha, ignorando frases de uma palavra só', () => {
    expect(splitScript('Olá mundo. Tudo bem?   Sim!\nComo vai você')).toEqual(['Olá mundo.', 'Tudo bem?', 'Como vai você']);
  });

  it('roteiro vazio não tem frases', () => {
    expect(splitScript('')).toEqual([]);
    expect(splitScript('   \n  ')).toEqual([]);
  });
});

describe('planFromScript', () => {
  const script = 'Eu fui ao mercado. Comprei pão fresco.';
  // Primeira tentativa errada ("eu fui no"), depois a frase certa e a segunda frase.
  const transcript = speak('eu fui no eu fui ao mercado comprei pão fresco');

  it('acha as tentativas de cada frase e escolhe a que bate com o roteiro', () => {
    const plans = planFromScript(script, transcript);
    expect(plans.map((p) => p.sentence)).toEqual(['Eu fui ao mercado.', 'Comprei pão fresco.']);
    const first = plans[0];
    expect(first.takes.map((t) => [t.from, t.to])).toEqual([
      [0, 1],
      [3, 6],
    ]);
    expect(first.takes[first.chosen]).toMatchObject({ from: 3, to: 6, score: 1 });
    // Acentos e maiúsculas não importam ("Pão" = "pão").
    expect(plans[1].takes[plans[1].chosen]).toMatchObject({ from: 7, to: 9, score: 1 });
  });

  it('entre tentativas igualmente boas, fica a última', () => {
    const plans = planFromScript('Bom dia pessoal.', speak('bom dia pessoal bom dia pessoal'));
    expect(plans[0].takes).toHaveLength(2);
    expect(plans[0].takes[plans[0].chosen]).toMatchObject({ from: 3, to: 5 });
  });

  it('frase que não foi dita fica sem escolha', () => {
    const plans = planFromScript('Eu fui ao mercado. Nada a ver aqui.', speak('eu fui ao mercado'));
    expect(plans[1].takes).toEqual([]);
    expect(plans[1].chosen).toBe(-1);
  });

  it('as escolhas seguem a ordem do roteiro', () => {
    const plans = planFromScript(script, transcript);
    const chosen = plans.filter((p) => p.chosen >= 0).map((p) => p.takes[p.chosen]);
    for (let i = 1; i < chosen.length; i++) expect(chosen[i].from).toBeGreaterThan(chosen[i - 1].to);
  });
});

describe('keptRanges e removedRanges', () => {
  const script = 'Eu fui ao mercado. Comprei pão fresco.';
  const transcript = speak('eu fui no eu fui ao mercado comprei pão fresco');

  it('a folguinha em volta do take não invade as palavras vizinhas', () => {
    const kept = keptRanges(planFromScript(script, transcript), transcript);
    expect(kept).toHaveLength(2);
    // Take 1: palavras 3 a 6 (1,5 s a 3,4 s). Antes: a palavra 2 termina em 1,4; depois: a 7 começa em 3,5.
    expect(kept[0][0]).toBeCloseTo(1.4);
    expect(kept[0][1]).toBeCloseTo(3.5);
    // Take 2: palavras 7 a 9 (3,5 s a 4,9 s), sem vizinha depois: folga inteira de 0,2 s.
    expect(kept[1][0]).toBeCloseTo(3.4);
    expect(kept[1][1]).toBeCloseTo(5.1);
  });

  it('removedRanges é o complemento até o fim', () => {
    const kept = keptRanges(planFromScript(script, transcript), transcript);
    const removed = removedRanges(kept, 6);
    expect(removed).toHaveLength(2);
    expect(removed[0][0]).toBe(0);
    expect(removed[0][1]).toBeCloseTo(1.4);
    expect(removed[1][0]).toBeCloseTo(5.1);
    expect(removed[1][1]).toBe(6);
  });

  it('removedRanges ignora sobras menores que 0,05 s', () => {
    expect(
      removedRanges(
        [
          [0.03, 2],
          [2.04, 3],
        ],
        3.02,
      ),
    ).toEqual([]);
    expect(removedRanges([], 4)).toEqual([[0, 4]]);
  });
});
