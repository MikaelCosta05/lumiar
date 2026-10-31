// Prepara o áudio da transcrição: volume, onde há voz, trechos que o Whisper ouve de uma vez e o tempo das palavras.

/** O Whisper trabalha com áudio mono a 16 kHz. */
export const RATE = 16000;
/** O Whisper ouve no máximo 30 s de cada vez. */
const WINDOW = 30 * RATE;
/** Quadros de 20 ms para achar onde há voz (precisão do tempo das palavras). */
const FRAME = RATE / 50;
/** Nível (RMS) a que a fala é levada: o mesmo para um microfone de lapela longe e para um alto demais. */
const TARGET = 0.1;
/** Pausa de até 2 s fica dentro do mesmo trecho (o Whisper entende melhor com contexto); mais que isso é pulada. */
const MAX_GAP = 2 * RATE;
/** Folga em volta da voz: o começo e o fim das palavras (consoantes, respiração) são mais baixos que o meio. */
const PAD = Math.round(0.15 * RATE);

export interface Word {
  text: string;
  start: number;
  end: number;
}

/** Trecho [início, fim) em amostras. */
export type Span = [number, number];

const rms = (audio: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += audio[i] * audio[i];
  return Math.sqrt(sum / Math.max(1, to - from));
};

function frameLevels(audio: Float32Array) {
  const levels = new Float32Array(Math.ceil(audio.length / FRAME));
  for (let f = 0; f < levels.length; f++) levels[f] = rms(audio, f * FRAME, Math.min(audio.length, (f + 1) * FRAME));
  return levels;
}

function percentile(values: Float32Array, p: number) {
  if (!values.length) return 0;
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * Tira o ronco abaixo de ~70 Hz (vento, mesa, ar-condicionado) e leva a fala a um nível fixo. Sem isso, uma voz
 * gravada baixa (lapela longe, ganho baixo) passava por silêncio e o vídeo inteiro ficava sem legenda.
 */
export function normalizeSpeech(audio: Float32Array): Float32Array {
  const out = new Float32Array(audio.length);
  const a = 1 / (1 + (2 * Math.PI * 70) / RATE);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < audio.length; i++) {
    prevOut = a * (prevOut + audio[i] - prevIn);
    prevIn = audio[i];
    out[i] = prevOut;
  }
  // O nível da fala: os 5% de quadros mais altos (a voz), sem contar o silêncio digital.
  const levels = frameLevels(out).filter((l) => l > 1e-5);
  const loud = percentile(levels, 0.95);
  if (loud <= 0) return out;
  const gain = Math.min(40, Math.max(0.5, TARGET / loud));
  for (let i = 0; i < out.length; i++) {
    const x = out[i] * gain;
    // Limitador suave: os picos que passariam de 1 dobram em vez de cortar.
    out[i] = Math.abs(x) < 0.9 ? x : Math.sign(x) * (0.9 + 0.1 * Math.tanh((Math.abs(x) - 0.9) / 0.1));
  }
  return out;
}

function voiceBand(audio: Float32Array) {
  const out = new Float32Array(audio.length);
  const high = 1 / (1 + (2 * Math.PI * 300) / RATE);
  const low = 1 - Math.exp((-2 * Math.PI * 3400) / RATE);
  let prevIn = 0;
  let hp = 0;
  let lp = 0;
  for (let i = 0; i < audio.length; i++) {
    hp = high * (hp + audio[i] - prevIn);
    prevIn = audio[i];
    lp += low * (hp - lp);
    out[i] = lp;
  }
  return out;
}

/** O 10º percentil dos níveis num raio de `radius` quadros em volta de cada um (o ruído de fundo ali). */
function localFloor(levels: Float32Array, radius: number) {
  const floors = new Float32Array(levels.length);
  // A cada segundo, e o mesmo valor para os quadros desse segundo: basta e fica rápido num vídeo de 1 h.
  const step = 50;
  for (let at = 0; at < levels.length; at += step) {
    const floor = percentile(levels.subarray(Math.max(0, at - radius), Math.min(levels.length, at + step + radius)), 0.1);
    floors.fill(floor, at, Math.min(levels.length, at + step));
  }
  return floors;
}

/**
 * Onde há voz, pelo volume em relação ao ruído de fundo da própria gravação (no áudio original: abaixo de -60 dB
 * nunca é voz, e a normalização faria um chiado parecer fala).
 * Na dúvida conta como voz: música ou ruído alto o tempo todo viram um trecho só, e nada é jogado fora.
 */
export function speechSpans(audio: Float32Array): Span[] {
  // Só a faixa da voz (300 a 3400 Hz): o grave da música e o chiado ficam de fora da conta.
  const levels = frameLevels(voiceBand(audio));
  const loud = percentile(levels, 0.95);
  // O fundo é o dos 5 s em volta (a música e o ruído mudam ao longo do vídeo).
  const floors = localFloor(levels, 5 * 50);
  const spans: Span[] = [];
  for (let f = 0; f < levels.length; f++) {
    // 8 dB acima do fundo, mas nunca mais de 14 dB abaixo da fala nem menos de 40 dB abaixo dela.
    const threshold = Math.max(0.001, Math.min(loud * 0.2, Math.max(floors[f] * 2.5, loud * 0.01)));
    if (levels[f] < threshold) continue;
    const from = f * FRAME;
    const to = Math.min(audio.length, (f + 1) * FRAME);
    const last = spans.at(-1);
    // Pausas de até 0,6 s (entre palavras, respiração) não separam a fala.
    if (last && from - last[1] <= 0.6 * RATE) last[1] = to;
    else spans.push([from, to]);
  }
  // Estalo isolado (menos de 0,1 s de som) não é fala.
  return spans.filter(([a, b]) => b - a >= 0.1 * RATE);
}

/** Silêncio (em amostras) que fica no lugar de uma pausa longa encolhida. */
const JOIN = RATE / 2;

/**
 * Junta a fala em trechos de até 30 s para o Whisper, cada um feito de pedaços do áudio. As pausas longas (mais de
 * 2 s) são encolhidas para 0,5 s: o Whisper não ouve silêncio, onde inventa frases ("Legendas pela comunidade…",
 * "Obrigado por assistir"), mas as frases continuam juntas e ele entende cada uma pelo contexto das outras.
 * Os cortes entre trechos caem nas pausas; fala sem pausa por mais de 30 s é cortada no ponto mais quieto entre
 * os 20 e os 29,5 s.
 */
export function speechWindows(audio: Float32Array, spans: Span[] = speechSpans(audio)): Span[][] {
  // Pedaços: a fala com as pausas curtas dentro (até 2 s), sem as longas, e uma folga em volta.
  const pieces: Span[] = [];
  for (const [a, b] of spans) {
    const last = pieces.at(-1);
    if (last && a - last[1] <= MAX_GAP) last[1] = b;
    else pieces.push([a, b]);
  }
  pieces.forEach((piece, i) => {
    piece[0] = Math.max(i ? pieces[i - 1][1] : 0, piece[0] - PAD);
    piece[1] = Math.min(audio.length, piece[1] + PAD);
  });
  const windows: Span[][] = [];
  let current: Span[] = [];
  let length = 0;
  const close = () => {
    if (current.length) windows.push(current);
    current = [];
    length = 0;
  };
  for (let [a, b] of pieces) {
    while (b - a > WINDOW) {
      close();
      const cut = quietestCut(audio, a);
      windows.push([[a, cut]]);
      a = cut;
    }
    const join = current.length ? JOIN : 0;
    if (length + join + (b - a) > WINDOW) close();
    length += (current.length ? JOIN : 0) + (b - a);
    current.push([a, b]);
  }
  close();
  return windows;
}

function quietestCut(audio: Float32Array, start: number) {
  let cut = start + WINDOW;
  let quietest = Infinity;
  const block = RATE / 10;
  for (let at = start + 20 * RATE; at + block <= start + WINDOW - RATE / 2; at += block) {
    const level = rms(audio, at, at + block);
    if (level < quietest) {
      quietest = level;
      cut = at + block / 2;
    }
  }
  return cut;
}

/**
 * Acerta as palavras pela voz: a que cai inteira onde não há voz foi inventada e sai; o começo e o fim de cada
 * palavra ficam dentro da fala. O tempo do Whisper erra uns 0,2 a 0,5 s e costuma esticar a última palavra de uma
 * frase pela pausa adentro: a legenda entrava antes da voz e ficava na tela depois dela.
 */
export function fitWords(words: Word[], spans: Span[]): Word[] {
  const seconds = spans.map(([a, b]) => [a / RATE, b / RATE] as const);
  // A palavra pertence à fala com que mais se sobrepõe, contando uma folga de 0,3 s (o erro de tempo do Whisper).
  const spanOf = (w: Word) => {
    let best = -1;
    let overlap = -Infinity;
    seconds.forEach(([a, b], i) => {
      const o = Math.min(b + 0.3, w.end) - Math.max(a - 0.3, w.start);
      if (o > 0 && o > overlap) (overlap = o), (best = i);
    });
    return best;
  };
  const kept = words.map((w) => ({ word: { ...w }, span: spanOf(w) })).filter((k) => k.span >= 0);
  kept.forEach((k, i) => {
    const [a, b] = seconds[k.span];
    const w = k.word;
    const first = i === 0 || kept[i - 1].span !== k.span;
    const last = i === kept.length - 1 || kept[i + 1].span !== k.span;
    // Primeira palavra da frase começa quando a voz começa; a última acaba quando a voz acaba.
    const shortest = Math.min(0.08, b - a);
    w.start = Math.min(Math.max(w.start, a), b - shortest);
    w.end = Math.min(Math.max(w.end, a + shortest), b);
    if (first && w.start - a < 0.6) w.start = a;
    if (last && b - w.end < 0.6) w.end = b;
    if (w.end - w.start < shortest) w.end = Math.min(b, w.start + shortest);
  });
  const out = kept.map((k) => k.word);
  // Sem sobreposição: cada palavra termina antes de a próxima começar.
  for (let i = 1; i < out.length; i++) if (out[i].start < out[i - 1].end) out[i - 1].end = Math.max(out[i - 1].start, out[i].start);
  return out;
}

/** O que o Whisper devolve de um trecho: o texto e o tempo de cada palavra (em s, a partir do começo do trecho). */
export type Recognize = (part: Float32Array) => Promise<{ text: string; timestamp: [number, number | null] }[]>;

/** Transcreve o áudio todo, trecho por trecho, e devolve as palavras com o tempo no áudio inteiro. */
export async function transcribeSpeech(audio: Float32Array, recognize: Recognize, onProgress?: (fraction: number) => void): Promise<Word[]> {
  const speech = normalizeSpeech(audio);
  const spans = speechSpans(audio);
  const listen = async (windows: Span[][], progress: (pieces: Span[]) => number) => {
    const words: Word[] = [];
    for (const pieces of windows) {
      onProgress?.(progress(pieces));
      const { part, toOriginal } = joinPieces(speech, pieces);
      for (const c of await recognize(part)) {
        const text = c.text.trim();
        if (!text || !Number.isFinite(c.timestamp[0])) continue;
        const start = c.timestamp[0];
        const end = c.timestamp[1] ?? start + 0.3;
        words.push({ text, start: toOriginal(start, 'start'), end: toOriginal(end, 'end') });
      }
    }
    return words;
  };
  // A primeira passada vai até 95% da barra; a segunda é curta.
  const words = await listen(speechWindows(speech, spans), (pieces) => (0.95 * pieces[0][0]) / speech.length);
  // O Whisper às vezes pula uma frase inteira (no começo de um trecho de 30 s, com ruído) e estica a palavra
  // seguinte por cima dela. A voz que as palavras quase não cobrem é ouvida de novo, com só uns 10 s em volta.
  // Se ainda faltar, uma última tentativa com 5 s: ele também pode pular o começo de um trecho refeito.
  let result = words;
  for (const reach of [10, 5]) {
    for (const missed of missedSpeech(result, spans, reach)) {
      // No meio de uma fala contínua, as bordas vão para o ponto mais quieto em volta (sem partir uma palavra).
      const [from, to] = missed.map((at) => quietPoint(audio, at, spans));
      const range = (w: Word) => (w.start + w.end) / 2 >= from / RATE - 0.3 && (w.start + w.end) / 2 <= to / RATE + 0.3;
      // Começa ~3 s antes: se o Whisper pular o começo de novo, perde só esse contexto (que é descartado).
      const lead = quietPoint(audio, Math.max(0, from - 3 * RATE), spans);
      const inside = spans.map(([a, b]): Span => [Math.max(a, lead), Math.min(b, to)]).filter(([a, b]) => b > a);
      const again = (await listen(speechWindows(speech, inside), () => 0.95)).filter(range);
      const before = result.filter(range);
      if (again.length >= before.length) result = [...result.filter((w) => !range(w)), ...again].sort((x, y) => x.start - y.start);
    }
  }
  return fitWords(result, spans);
}

/** O quadro de 20 ms mais quieto a até 0,4 s de `at`, se `at` cair dentro da fala; senão, o próprio `at`. */
function quietPoint(audio: Float32Array, at: number, spans: Span[]) {
  if (!spans.some(([a, b]) => at > a && at < b)) return at;
  let best = at;
  let quietest = Infinity;
  const radius = 0.4 * RATE;
  for (let f = Math.max(0, at - radius); f + FRAME <= Math.min(audio.length, at + radius); f += FRAME) {
    const level = rms(audio, f, f + FRAME);
    if (level < quietest) (quietest = level), (best = f + FRAME / 2);
  }
  return best;
}

/**
 * Trechos [início, fim) a ouvir de novo: começam numa fala de pelo menos 0,4 s que as palavras cobrem menos de 40%
 * e seguem pelas falas seguintes até `reach` s (contexto bastante para o Whisper, curto para ele não pular de novo).
 * Fala contínua longa é medida em pedaços de até 5 s: o Whisper às vezes para no meio de um trecho de 30 s.
 */
export function missedSpeech(words: Word[], speech: Span[], reach = 10): Span[] {
  const spans = speech.flatMap(([a, b]): Span[] => {
    const n = Math.ceil((b - a) / (5 * RATE));
    return Array.from({ length: n }, (_, k): Span => [Math.round(a + ((b - a) * k) / n), Math.round(a + ((b - a) * (k + 1)) / n)]);
  });
  const coverage = ([a, b]: Span) => {
    let sum = 0;
    for (const w of words) {
      const mid = ((w.start + w.end) / 2) * RATE;
      if (mid >= a && mid <= b) sum += Math.min(b, w.end * RATE) - Math.max(a, w.start * RATE);
    }
    return sum / (b - a);
  };
  const ranges: Span[] = [];
  spans.forEach((span, i) => {
    if (span[1] - span[0] < 0.4 * RATE || coverage(span) >= 0.4) return;
    if (ranges.length && span[0] < ranges.at(-1)![1]) return;
    let j = i;
    while (j + 1 < spans.length && spans[j + 1][1] - span[0] <= reach * RATE && spans[j + 1][0] - spans[j][1] <= MAX_GAP) j++;
    ranges.push([span[0], spans[j][1]]);
  });
  return ranges;
}

/**
 * Cola os pedaços com 0,5 s de silêncio entre eles e devolve como levar um tempo do áudio colado (em s) de volta
 * ao áudio original. Um tempo que cai no silêncio colado vai para a borda da fala mais próxima do lado certo:
 * o começo de uma palavra para o pedaço seguinte, o fim para o anterior.
 */
export function joinPieces(audio: Float32Array, pieces: Span[]) {
  const total = pieces.reduce((sum, [a, b]) => sum + (b - a), 0) + JOIN * (pieces.length - 1);
  const part = new Float32Array(total);
  const starts: number[] = [];
  let at = 0;
  pieces.forEach(([a, b], i) => {
    if (i) at += JOIN;
    starts.push(at);
    part.set(audio.subarray(a, b), at);
    at += b - a;
  });
  const toOriginal = (time: number, edge: 'start' | 'end') => {
    const sample = time * RATE;
    for (let i = 0; i < pieces.length; i++) {
      const [a, b] = pieces[i];
      const from = starts[i];
      const to = from + (b - a);
      if (sample <= to || i === pieces.length - 1) {
        if (sample >= from) return (a + Math.min(sample - from, b - a)) / RATE;
        // No silêncio antes deste pedaço.
        return (edge === 'start' || i === 0 ? a : pieces[i - 1][1]) / RATE;
      }
    }
    return pieces[0][0] / RATE;
  };
  return { part, toOriginal };
}
