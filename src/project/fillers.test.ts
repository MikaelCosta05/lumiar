import { describe, expect, it } from 'vitest';
import type { CaptionWord } from './captions';
import { findFillers, isHesitation } from './fillers';

/** Palavras faladas em sequência: 0,3 s cada, com 0,1 s de pausa entre elas. */
function speak(text: string, pause = 0.1): CaptionWord[] {
  let t = 0;
  return text.split(' ').map((w) => {
    const word = { text: w, start: t, end: t + 0.3 };
    t += 0.3 + pause;
    return word;
  });
}

describe('isHesitation', () => {
  it('reconhece hesitações comuns', () => {
    for (const w of ['hum', 'Hmm', 'ahn', 'éé', 'éh', 'ããh', 'uhh', 'erm', 'é…', 'é...', 'Ah,']) expect(isHesitation(w), w).toBe(true);
  });

  it('"é" sozinho é verbo, não hesitação; palavras normais também não', () => {
    for (const w of ['é', 'É.', 'humano', 'ah-ha', 'eu', 'então']) expect(isHesitation(w), w).toBe(false);
  });
});

describe('findFillers', () => {
  it('lista vazia não tem vícios', () => {
    expect(findFillers([])).toEqual([]);
  });

  it('palavra repetida colada: sai a primeira', () => {
    expect(findFillers(speak('eu eu fui'))).toEqual([{ kind: 'repeat', from: 0, to: 0, label: 'eu eu' }]);
  });

  it('repetição com pausa longa no meio não conta', () => {
    const words = speak('eu eu fui');
    words[1] = { ...words[1], start: words[0].end + 1, end: words[0].end + 1.3 };
    expect(findFillers(words)).toEqual([]);
  });

  it('números e "muito muito" de ênfase ficam', () => {
    expect(findFillers(speak('foram 2 2 gols'))).toEqual([]);
    expect(findFillers(speak('foi muito muito bom'))).toEqual([]);
  });

  it('frase recomeçada: sai a primeira tentativa inteira', () => {
    expect(findFillers(speak('eu fui eu fui no mercado'))).toEqual([{ kind: 'restart', from: 0, to: 1, label: 'eu fui' }]);
  });

  it('o recomeço mais longo (até 4 palavras) tem preferência', () => {
    const found = findFillers(speak('ontem eu fui ao ontem eu fui ao mercado'));
    expect(found).toEqual([{ kind: 'restart', from: 0, to: 3, label: 'ontem eu fui ao' }]);
  });

  it('pontuação não atrapalha a comparação do recomeço', () => {
    expect(findFillers(speak('eu fui, eu fui no mercado'))[0]).toMatchObject({ kind: 'restart', from: 0, to: 1 });
  });

  it('muleta só conta quando está solta (com vírgula, reticências ou interrogação)', () => {
    expect(findFillers(speak('tipo, eu fui lá'))).toEqual([{ kind: 'filler', from: 0, to: 0, label: 'tipo,' }]);
    expect(findFillers(speak('esse tipo de coisa'))).toEqual([]);
    expect(findFillers(speak('foi legal né?'))).toEqual([{ kind: 'filler', from: 2, to: 2, label: 'né?' }]);
  });

  it('muleta de duas palavras no começo da frase sai junta', () => {
    expect(findFillers(speak('tipo assim eu fui'))).toEqual([{ kind: 'filler', from: 0, to: 1, label: 'tipo assim' }]);
    // No meio da frase, sem pontuação, fica.
    expect(findFillers(speak('era bem tipo assim mesmo'))).toEqual([]);
  });

  it('hesitação no meio da fala é marcada', () => {
    expect(findFillers(speak('eu hum fui no mercado'))).toEqual([{ kind: 'filler', from: 1, to: 1, label: 'hum' }]);
  });

  it('um trecho nunca é marcado duas vezes e a lista sai em ordem', () => {
    const found = findFillers(speak('hum eu eu fui tipo, lá'));
    expect(found.map((f) => [f.kind, f.from, f.to])).toEqual([
      ['filler', 0, 0],
      ['repeat', 1, 1],
      ['filler', 4, 4],
    ]);
    const used = found.flatMap((f) => Array.from({ length: f.to - f.from + 1 }, (_, k) => f.from + k));
    expect(new Set(used).size).toBe(used.length);
  });
});
