import { describe, expect, it } from 'vitest';
import { fitWords, joinPieces, missedSpeech, normalizeSpeech, RATE, speechSpans, speechWindows, transcribeSpeech, type Recognize } from './audioChunks';

/** Áudio de `seconds` s em silêncio (um chiado bem baixo), com "fala" (um tom na faixa da voz) nos trechos `talk`. */
function audioWith(seconds: number, talk: [number, number][], level = 0.2) {
  const audio = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < audio.length; i++) {
    const t = i / RATE;
    const hiss = 0.0005 * Math.sin(i * 2.1);
    audio[i] = talk.some(([a, b]) => t >= a && t < b) ? level * Math.sin((2 * Math.PI * 600 * i) / RATE) + hiss : hiss;
  }
  return audio;
}

const seconds = (spans: [number, number][]) => spans.map(([a, b]) => [a / RATE, b / RATE]);

describe('volume da fala', () => {
  it('voz gravada baixa (-40 dB) fica no mesmo nível de uma normal', () => {
    const peak = (a: Float32Array) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    const normal = normalizeSpeech(audioWith(4, [[1, 3]], 0.2));
    const quiet = normalizeSpeech(audioWith(4, [[1, 3]], 0.002));
    expect(peak(quiet)).toBeGreaterThan(peak(normal) * 0.5);
    expect(peak(normal)).toBeLessThanOrEqual(1);
  });

  it('pico alto demais dobra suave, sem passar de 1', () => {
    const loud = normalizeSpeech(audioWith(3, [[0.5, 2.5]], 0.99));
    expect(loud.every((x) => Math.abs(x) <= 1)).toBe(true);
  });
});

describe('onde há voz', () => {
  it('acha cada fala com precisão de 20 ms, e pausa curta não separa', () => {
    const spans = seconds(speechSpans(audioWith(10, [[1, 2.5], [2.8, 4], [6, 7]])));
    expect(spans).toHaveLength(2);
    expect(spans[0][0]).toBeCloseTo(1, 1);
    expect(spans[0][1]).toBeCloseTo(4, 1);
    expect(spans[1][0]).toBeCloseTo(6, 1);
    expect(spans[1][1]).toBeCloseTo(7, 1);
  });

  it('silêncio não tem voz; estalo de 40 ms também não', () => {
    expect(speechSpans(audioWith(10, []))).toEqual([]);
    expect(speechSpans(audioWith(10, [[3, 3.04], [6, 8]]))).toHaveLength(1);
    // Voz baixa (-40 dB) ainda é voz.
    expect(speechSpans(audioWith(10, [[6, 8]], 0.014))).toHaveLength(1);
  });
});

describe('trechos para o Whisper', () => {
  it('pausa longa é encolhida: as frases vão juntas, sem o silêncio', () => {
    const audio = normalizeSpeech(audioWith(40, [[1, 3], [15, 17], [30, 32]]));
    const windows = speechWindows(audio);
    expect(windows).toHaveLength(1);
    expect(windows[0]).toHaveLength(3);
    const { part } = joinPieces(audio, windows[0]);
    expect(part.length / RATE).toBeLessThan(8);
  });

  it('fala sem pausa por mais de 30 s é cortada, sem trecho de mais de 30 s nem buraco', () => {
    const audio = normalizeSpeech(audioWith(70, [[0, 24], [24.3, 47], [47.3, 70]]));
    const windows = speechWindows(audio);
    expect(windows.length).toBeGreaterThanOrEqual(3);
    for (const w of windows) expect(w.reduce((s, [a, b]) => s + b - a, 0)).toBeLessThanOrEqual(30 * RATE);
    const flat = windows.flat();
    for (let i = 1; i < flat.length; i++) expect(flat[i][0]).toBeGreaterThanOrEqual(flat[i - 1][1]);
    expect(flat[0][0]).toBe(0);
    expect(flat.at(-1)![1]).toBe(audio.length);
  });

  it('o tempo do áudio colado volta para o lugar certo do original', () => {
    const audio = new Float32Array(20 * RATE);
    const { part, toOriginal } = joinPieces(audio, [[1 * RATE, 3 * RATE], [10 * RATE, 12 * RATE]]);
    expect(part.length).toBe(4.5 * RATE);
    expect(toOriginal(0.5, 'start')).toBeCloseTo(1.5);
    expect(toOriginal(3, 'start')).toBeCloseTo(10.5);
    // No silêncio colado (2 a 2,5 s): começo de palavra vai para a próxima fala, fim para a anterior.
    expect(toOriginal(2.2, 'start')).toBeCloseTo(10);
    expect(toOriginal(2.2, 'end')).toBeCloseTo(3);
  });
});

describe('tempo das palavras', () => {
  const spans: [number, number][] = [[1 * RATE, 3 * RATE], [6 * RATE, 8 * RATE]];

  it('palavra inventada no silêncio sai; as outras ficam dentro da voz', () => {
    const words = fitWords(
      [
        { text: 'Oi', start: 0.7, end: 1.3 },
        { text: 'gente.', start: 1.3, end: 3.6 },
        { text: 'Obrigado.', start: 4.2, end: 5.1 },
        { text: 'Tchau.', start: 6.3, end: 7.5 },
      ],
      spans,
    );
    expect(words.map((w) => w.text)).toEqual(['Oi', 'gente.', 'Tchau.']);
    expect(words[0].start).toBe(1);
    expect(words[1].end).toBe(3);
    // Primeira e última palavra da frase encostam no começo e no fim da voz.
    expect(words[2].start).toBe(6);
    expect(words[2].end).toBe(8);
  });

  it('as palavras não se sobrepõem', () => {
    const words = fitWords(
      [
        { text: 'a', start: 1, end: 2.2 },
        { text: 'b', start: 2, end: 3 },
      ],
      spans,
    );
    expect(words[0].end).toBeLessThanOrEqual(words[1].start);
  });

  it('fala que as palavras quase não cobrem é ouvida de novo', () => {
    // O Whisper pulou a frase de 1 a 3 s e esticou a palavra seguinte por cima da pausa.
    const words = [
      { text: 'Hoje', start: 1.2, end: 1.6 },
      { text: 'eu', start: 1.6, end: 6.4 },
      { text: 'vou.', start: 6.4, end: 8 },
    ];
    expect(seconds(missedSpeech(words, spans))).toEqual([[1, 3]]);
    // Com a pausa curta (até 2 s), a fala seguinte entra junto, para dar contexto.
    expect(seconds(missedSpeech(words, [[1 * RATE, 3 * RATE], [4.5 * RATE, 8 * RATE]]))).toEqual([[1, 8]]);
    expect(missedSpeech([{ text: 'Oi', start: 1, end: 3 }, { text: 'tchau', start: 6, end: 8 }], spans)).toEqual([]);
  });
});

describe('transcrição inteira', () => {
  it('pula o silêncio, junta as falas num trecho e devolve o tempo no áudio original', async () => {
    const audio = audioWith(60, [[2, 4], [40, 42]]);
    const heard: number[] = [];
    const recognize: Recognize = async (part) => {
      heard.push(part.length / RATE);
      // Uma palavra em cada fala do áudio colado: [0,15 .. 2,15] e [2,8 .. 4,8].
      return [
        { text: 'primeira', timestamp: [0.2, 2.1] },
        { text: 'segunda', timestamp: [2.9, 4.7] },
      ];
    };
    const words = await transcribeSpeech(audio, recognize);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toBeLessThan(6);
    expect(words.map((w) => w.text)).toEqual(['primeira', 'segunda']);
    expect(words[0].start).toBeCloseTo(2, 1);
    expect(words[1].start).toBeCloseTo(40, 1);
    expect(words[1].end).toBeCloseTo(42, 1);
  });
});

describe('fala contínua em que o Whisper parou no meio', () => {
  it('cada pedaço de até 5 s sem palavras é ouvido de novo', () => {
    // Uma fala só de 1 a 40 s; o Whisper só escreveu até os 12 s.
    const spans: [number, number][] = [[1 * RATE, 40 * RATE]];
    const words = Array.from({ length: 22 }, (_, i) => ({ text: 'p', start: 1 + i * 0.5, end: 1.45 + i * 0.5 }));
    const ranges = seconds(missedSpeech(words, spans));
    expect(ranges.length).toBeGreaterThanOrEqual(3);
    expect(ranges[0][0]).toBeGreaterThan(10);
    expect(ranges[0][0]).toBeLessThan(15);
    expect(ranges.at(-1)![1]).toBe(40);
    for (const [a, b] of ranges) expect(b - a).toBeLessThanOrEqual(10.5);
  });

  it('a segunda passada substitui só o trecho perdido', async () => {
    const audio = audioWith(30, [[1, 29]]);
    let call = 0;
    const recognize: Recognize = async (part) => {
      call++;
      // Primeira passada: só os 3 primeiros segundos; depois, uma palavra por pedaço ouvido de novo.
      if (call === 1) return [0.2, 1.2, 2.2].map((t) => ({ text: 'antes', timestamp: [t, t + 0.9] as [number, number] }));
      const length = part.length / RATE;
      return Array.from({ length: Math.floor(length / 0.5) }, (_, i) => ({ text: 'de-novo', timestamp: [i * 0.5, i * 0.5 + 0.45] as [number, number] }));
    };
    const words = await transcribeSpeech(audio, recognize);
    expect(call).toBeGreaterThan(1);
    expect(words.filter((w) => w.text === 'antes')).toHaveLength(3);
    expect(words.at(-1)!.end).toBeGreaterThan(25);
    for (let i = 1; i < words.length; i++) expect(words[i].start).toBeGreaterThanOrEqual(words[i - 1].start);
  });
});
