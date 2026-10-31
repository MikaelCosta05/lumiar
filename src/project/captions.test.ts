import { describe, expect, it } from 'vitest';
import {
  assignSpeakers,
  captionAt,
  captionStyle,
  captionWords,
  createCaptionTrack,
  giveAllReadingTime,
  giveReadingTime,
  groupWords,
  moveCaption,
  parseSubtitles,
  READING_LIMIT,
  readingSpeed,
  regroup,
  resizeCaption,
  retext,
  speakerOf,
  toSrt,
  toVtt,
  type Caption,
  type CaptionWord,
} from './captions';

const cap = (start: number, end: number, text: string, extra: Partial<Caption> = {}): Caption => ({ id: `${start}`, start, end, text, ...extra });

describe('exportar .srt / .vtt', () => {
  it('toSrt numera os blocos e usa vírgula nos milissegundos', () => {
    expect(toSrt([cap(1.5, 3, 'Olá'), cap(3723.456, 3725, 'Tchau')])).toBe(
      '1\n00:00:01,500 --> 00:00:03,000\nOlá\n\n2\n01:02:03,456 --> 01:02:05,000\nTchau\n',
    );
  });

  it('toVtt começa com WEBVTT e usa ponto nos milissegundos', () => {
    expect(toVtt([cap(0, 1.25, 'Oi')])).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:01.250\nOi\n');
  });

  it('tempo negativo vira zero', () => {
    expect(toSrt([cap(-2, 1, 'x')])).toContain('00:00:00,000 --> 00:00:01,000');
  });

  it('lista vazia gera arquivo vazio (srt) ou só o cabeçalho (vtt)', () => {
    expect(toSrt([])).toBe('');
    expect(parseSubtitles(toVtt([]))).toEqual([]);
  });
});

describe('importar .srt / .vtt', () => {
  const original = [cap(0.04, 2.5, 'Primeira legenda'), cap(2.5, 4.999, 'Segunda'), cap(61.1, 3600.25, 'Terceira, bem longa')];

  it('ida e volta pelo .srt mantém tempos e textos', () => {
    const back = parseSubtitles(toSrt(original));
    expect(back.map(({ start, end, text }) => ({ start, end, text }))).toEqual(original.map(({ start, end, text }) => ({ start, end, text })));
  });

  it('ida e volta pelo .vtt mantém tempos e textos', () => {
    const back = parseSubtitles(toVtt(original));
    expect(back.map((c) => [c.start, c.end, c.text])).toEqual(original.map((c) => [c.start, c.end, c.text]));
  });

  it('aceita quebras de linha do Windows, várias linhas de texto e tira as tags', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\n<i>Linha um</i>\r\nlinha <b>dois</b>\r\n\r\n';
    expect(parseSubtitles(srt).map((c) => c.text)).toEqual(['Linha um linha dois']);
  });

  it('VTT com tempo curto (mm:ss.mmm), identificador, configurações e NOTE', () => {
    const vtt = 'WEBVTT\n\nNOTE um comentário\n\nabertura\n00:01.500 --> 00:03.000 align:start position:10%\nOi\n';
    const [c] = parseSubtitles(vtt);
    expect([c.start, c.end, c.text]).toEqual([1.5, 3, 'Oi']);
  });

  it('milissegundos com menos de 3 dígitos', () => {
    expect(parseSubtitles('1\n00:00:01,5 --> 00:00:02,25\nx\n')[0]).toMatchObject({ start: 1.5, end: 2.25 });
  });

  it('ignora blocos sem tempo ou sem texto e ordena pelo início', () => {
    const srt = '1\n00:00:05,000 --> 00:00:06,000\nDepois\n\n2\n00:00:01,000 --> 00:00:02,000\n\n\n3\nsem tempo\n\n4\n00:00:00,000 --> 00:00:01,000\nAntes\n';
    expect(parseSubtitles(srt).map((c) => c.text)).toEqual(['Antes', 'Depois']);
  });
});

/** Palavras em sequência (0,3 s cada, 0,1 s de pausa). */
function speak(text: string, from = 0): CaptionWord[] {
  let t = from;
  return text.split(' ').map((w) => {
    const word = { text: w, start: t, end: t + 0.3 };
    t += 0.4;
    return word;
  });
}

describe('groupWords', () => {
  it('quebra no máximo de palavras', () => {
    const groups = groupWords(speak('um dois três quatro cinco'), 2);
    expect(groups.map((c) => c.text)).toEqual(['um dois', 'três quatro', 'cinco']);
  });

  it('quebra no fim da frase e em pausas longas', () => {
    const words = [...speak('Oi gente. Tudo'), ...speak('bem', 5)];
    expect(groupWords(words, 10).map((c) => c.text)).toEqual(['Oi gente.', 'Tudo', 'bem']);
  });

  it('nenhuma legenda passa de ~3 s', () => {
    const groups = groupWords(speak('a b c d e f g h i j k l m n'), 100);
    for (const g of groups) expect(g.words![g.words!.length - 1].end - g.start).toBeLessThanOrEqual(3.2);
    expect(groups.flatMap((g) => g.words!)).toHaveLength(14);
  });

  it('troca de pessoa sempre começa outra legenda', () => {
    const words = speak('eu falo você fala').map((w, i) => ({ ...w, speaker: i < 2 ? 0 : 1 }));
    const groups = groupWords(words, 10);
    expect(groups.map((c) => [c.text, c.speaker])).toEqual([
      ['eu falo', 0],
      ['você fala', 1],
    ]);
  });

  it('pausa curta entre legendas é preenchida (sem piscar); pausa longa não', () => {
    const words = [...speak('um dois'), ...speak('três', 0.9), ...speak('quatro', 5)];
    const groups = groupWords(words, 2);
    expect(groups[0].end).toBe(groups[1].start);
    // "três" fala 0,3 s, mas fica o mínimo para ler (0,8 s), sem chegar na próxima.
    expect(groups[1].end).toBeCloseTo(1.7);
    expect(groups[2].start).toBe(5);
  });

  it('não termina a legenda pendurada num "de", "que", "o"…', () => {
    const groups = groupWords(speak('eu gosto muito de cinema antigo'), 4);
    expect(groups.map((c) => c.text)).toEqual(['eu gosto muito', 'de cinema antigo']);
    // Pausa ou fim de frase continuam cortando onde estão.
    expect(groupWords(speak('vou de.'), 2).map((c) => c.text)).toEqual(['vou de.']);
  });

  it('a legenda gerada fica o tempo de ler, sem invadir a próxima', () => {
    const words = [...speak('Paralelepípedo.'), ...speak('Sim', 0.6)];
    const groups = groupWords(words, 6);
    expect(groups[0].end).toBeLessThanOrEqual(groups[1].start);
    const alone = groupWords(speak('Paralelepípedo.'), 6)[0];
    expect(readingSpeed(alone)).toBeLessThanOrEqual(READING_LIMIT);
  });

  it('sem palavras, sem legendas', () => {
    expect(groupWords([], 6)).toEqual([]);
  });
});

describe('captionWords, captionAt e regroup', () => {
  it('legenda manual: divide o tempo igualmente entre as palavras', () => {
    const words = captionWords(cap(2, 5, 'a  b c'));
    expect(words.map((w) => [w.text, w.start, w.end])).toEqual([
      ['a', 2, 3],
      ['b', 3, 4],
      ['c', 4, 5],
    ]);
  });

  it('captionAt devolve a mais recente quando há sobreposição e nada se desligada', () => {
    const track = { ...createCaptionTrack(), captions: [cap(0, 5, 'a'), cap(2, 3, 'b')] };
    expect(captionAt(track, 2.5)?.text).toBe('b');
    expect(captionAt(track, 4)?.text).toBe('a');
    expect(captionAt(track, 5)).toBeNull();
    expect(captionAt({ ...track, enabled: false }, 1)).toBeNull();
    expect(captionAt(undefined, 1)).toBeNull();
  });

  it('regroup refaz as automáticas e mantém as manuais', () => {
    const words = speak('um dois três quatro');
    const track = { ...createCaptionTrack(), captions: [...groupWords(words, 4), cap(10, 11, 'manual')] };
    const next = regroup(track, 2);
    expect(next.maxWords).toBe(2);
    expect(next.captions.map((c) => c.text)).toEqual(['um dois', 'três quatro', 'manual']);
  });
});

describe('arrastar legendas na timeline', () => {
  const words: CaptionWord[] = [
    { text: 'um', start: 1, end: 1.5 },
    { text: 'dois', start: 1.5, end: 2 },
  ];
  const track = () => ({ ...createCaptionTrack(), captions: [cap(1, 2, 'um dois', { words }), cap(3, 4, 'manual')] });

  it('moveCaption leva as palavras junto, não passa do zero e reordena a lista', () => {
    const moved = moveCaption(track(), '1', 5);
    expect(moved.captions.map((c) => c.text)).toEqual(['manual', 'um dois']);
    expect(moved.captions[1]).toMatchObject({ start: 5, end: 6 });
    expect(moved.captions[1].words?.map((w) => [w.start, w.end])).toEqual([[5, 5.5], [5.5, 6]]);
    expect(moveCaption(track(), '3', -2).captions[0]).toMatchObject({ start: 0, end: 1 });
  });

  it('resizeCaption estica as palavras na mesma proporção e não deixa a legenda sumir', () => {
    const longer = resizeCaption(track(), '1', 'out', 3);
    expect(longer.captions[0]).toMatchObject({ start: 1, end: 3 });
    expect(longer.captions[0].words?.map((w) => [w.start, w.end])).toEqual([[1, 2], [2, 3]]);
    expect(resizeCaption(track(), '1', 'in', 1.9).captions[0].start).toBeCloseTo(1.8);
    expect(resizeCaption(track(), '3', 'out', 0).captions[1]).toMatchObject({ start: 3, end: 3.2 });
    expect(resizeCaption(track(), '3', 'in', 2).captions[1]).toMatchObject({ start: 2, end: 4, text: 'manual' });
  });
});

describe('pessoas que falam', () => {
  it('assignSpeakers dá a pessoa para a legenda e as palavras, mantendo nomes que já existiam', () => {
    const track = {
      ...createCaptionTrack(),
      captions: [cap(0, 1, 'oi', { words: [{ text: 'oi', start: 0, end: 1 }] }), cap(1, 2, 'tchau')],
      speakers: [{ name: 'Ana', color: '#f00' }],
    };
    const next = assignSpeakers(track, [1, -1], 2);
    expect(next.speakers!.map((s) => s.name)).toEqual(['Ana', 'Pessoa 2']);
    expect(next.captions[0].speaker).toBe(1);
    expect(next.captions[0].words![0].speaker).toBe(1);
    expect(next.captions[1].speaker).toBeUndefined();
    expect(speakerOf(next, next.captions[0])?.name).toBe('Pessoa 2');
    expect(speakerOf(next, next.captions[1])).toBeNull();
  });

  it('captionStyle aplica o preset por cima da base e mantém o que foi pedido', () => {
    const style = captionStyle('karaoke', { y: 0.5 });
    expect(style.mode).toBe('karaoke');
    expect(style.y).toBe(0.5);
    expect(style.preset).toBe('karaoke');
    expect(captionStyle('nao-existe').preset).toBe('classica');
  });
});

describe('velocidade de leitura', () => {
  const track = (...captions: Caption[]) => ({ ...createCaptionTrack(), captions });

  it('readingSpeed conta os caracteres por segundo', () => {
    expect(readingSpeed(cap(0, 2, 'vinte caracteres aí!'))).toBe(10);
  });

  it('dar mais tempo estica pela pausa seguinte, sem encostar na próxima', () => {
    const fast = cap(0, 1, 'Uma legenda comprida demais para um segundo');
    const next = track(fast, cap(5, 6, 'depois'));
    const after = giveReadingTime(next, fast.id).captions[0];
    expect(after.start).toBe(0);
    expect(readingSpeed(after)).toBeLessThanOrEqual(READING_LIMIT);
    expect(after.end).toBeLessThan(5);
  });

  it('sem pausa depois, adianta o começo um pouco; sem pausa nenhuma, fica como está', () => {
    const fast = cap(2, 3, 'Uma legenda comprida demais para um segundo');
    const before = giveReadingTime(track(cap(0, 1, 'antes'), fast, cap(3, 4, 'depois')), fast.id).captions[1];
    expect(before.end).toBe(3);
    expect(before.start).toBeCloseTo(1.7);
    const stuck = track(cap(0, 2, 'antes'), fast, cap(3, 4, 'depois'));
    expect(giveReadingTime(stuck, fast.id)).toBe(stuck);
  });

  it('ajustar todas só mexe nas rápidas', () => {
    const t = track(cap(0, 1, 'Uma legenda comprida demais para um segundo'), cap(5, 8, 'calma'));
    const next = giveAllReadingTime(t);
    expect(next.captions[1]).toBe(t.captions[1]);
    expect(readingSpeed(next.captions[0])).toBeLessThanOrEqual(READING_LIMIT);
  });
});

describe('corrigir o texto de uma legenda automática', () => {
  const auto = (text: string) => {
    const words = speak(text);
    return cap(0, words.at(-1)!.end, text, { words });
  };

  it('trocar uma palavra mantém o tempo das outras', () => {
    const c = auto('a luz deixa a píliba mais bonita');
    const next = retext(c, 'a luz deixa a pele mais bonita');
    expect(next.words!.map((w) => w.text)).toEqual(['a', 'luz', 'deixa', 'a', 'pele', 'mais', 'bonita']);
    next.words!.forEach((w, i) => {
      expect(w.start).toBe(c.words![i].start);
      expect(w.end).toBe(c.words![i].end);
    });
  });

  it('palavra que vira duas divide o tempo dela; palavra inserida pega tempo das vizinhas', () => {
    const c = auto('eu lhe rei ontem');
    const merged = retext(c, 'eu errei ontem');
    expect(merged.words!.map((w) => w.text)).toEqual(['eu', 'errei', 'ontem']);
    expect(merged.words![1].start).toBeCloseTo(0.4);
    expect(merged.words![1].end).toBeCloseTo(1.1);
    expect(merged.words![2].start).toBeCloseTo(1.2);
    const inserted = retext(auto('bom dia'), 'bom dia mesmo');
    expect(inserted.words![2].end - inserted.words![2].start).toBeGreaterThan(0);
    const between = retext(auto('bom dia'), 'muito bom dia');
    for (const w of between.words!) expect(w.end).toBeGreaterThan(w.start);
  });

  it('pontuação e maiúscula não contam como troca; texto vazio tira as palavras', () => {
    const c = auto('oi gente');
    expect(retext(c, 'Oi, gente!').words!.map((w) => w.start)).toEqual(c.words!.map((w) => w.start));
    expect(retext(c, '').words).toBeUndefined();
    expect(retext(cap(0, 1, 'manual'), 'outro').words).toBeUndefined();
  });
});
