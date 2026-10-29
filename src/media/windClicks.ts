/**
 * Tirar o vento e os estalos de boca (cliques de saliva, lábios, língua). Funciona no próprio áudio,
 * sem IA e sem internet; o original nunca é alterado (quem chama grava um WAV novo).
 *
 * Vento: o som é dividido em graves (< 250 Hz) e o resto, sem mexer na fase. A voz tem nos graves
 * mais ou menos a mesma energia que nos médios; vento tem muito mais. Em cada instante os graves
 * ficam limitados ao que uma voz teria (as rajadas são abaixadas) e um passa-altas sobe sozinho
 * enquanto venta e volta a descer quando para.
 *
 * Estalos: são picos curtíssimos (menos de 3 ms) e agudos, bem acima do agudo em volta. Cada um é
 * apagado e o buraco é preenchido "prevendo" o som pelos dois lados (modelo autorregressivo, o
 * mesmo usado para restaurar discos), com uma passagem suave entre as duas previsões.
 */

// ---------------------------------------------------------------- Vento

/** Passa-baixas de 2 polos nos dois sentidos (sem atraso de fase): graves + resto = original exato. */
function zeroPhaseLowpass(data: Float32Array, sampleRate: number, freq: number): Float32Array {
  // São 8 polos em série: o corte de cada um fica mais alto para o conjunto cair 3 dB em `freq`.
  const k = 1 - Math.exp((-2 * Math.PI * freq) / Math.sqrt(2 ** (1 / 8) - 1) / sampleRate);
  const out = Float32Array.from(data);
  for (let pass = 0; pass < 2; pass++) {
    let a = 0;
    let b = 0;
    for (let i = 0; i < out.length; i++) {
      a += (out[i] - a) * k;
      b += (a - b) * k;
      out[i] = b;
    }
    a = 0;
    b = 0;
    for (let i = out.length - 1; i >= 0; i--) {
      a += (out[i] - a) * k;
      b += (a - b) * k;
      out[i] = b;
    }
  }
  return out;
}

/** Passa-altas de 2ª ordem (TPT) com o corte mudando ao longo do tempo. */
class Highpass {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private readonly k = Math.SQRT2;
  set(freq: number, sampleRate: number): void {
    const g = Math.tan((Math.PI * freq) / sampleRate);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  run(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return x - this.k * v1 - v2;
  }
}

/**
 * Tira o vento do canal (no lugar). strength: 0 a 1.
 * Devolve quanto do tempo estava ventando (0 a 1), para a mensagem na tela.
 */
export function removeWind(data: Float32Array, sampleRate: number, strength = 1): number {
  const n = data.length;
  if (n < 16) return 0;
  const low = zeroPhaseLowpass(data, sampleRate, 250);
  // Energia dos graves e do resto a cada 10 ms.
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const frames = Math.ceil(n / hop);
  const lowE = new Float64Array(frames);
  const restE = new Float64Array(frames);
  for (let i = 0; i < n; i++) {
    const f = Math.floor(i / hop);
    const r = data[i] - low[i];
    lowE[f] += low[i] * low[i];
    restE[f] += r * r;
  }
  // Quanto de grave uma voz teria aqui: até 4x a energia dos médios (+6 dB), com um piso bem baixo.
  const allow = 4 / Math.max(0.15, strength);
  const floor = 1e-7 * hop;
  const gain = new Float32Array(frames);
  const windy = new Float32Array(frames);
  let windFrames = 0;
  for (let f = 0; f < frames; f++) {
    const limit = restE[f] * allow + floor;
    const g = lowE[f] > limit ? Math.sqrt(limit / lowE[f]) : 1;
    gain[f] = g ** Math.min(1, strength * 1.2);
    // Ventando: o grave passa de 4x o permitido (12 dB).
    windy[f] = Math.min(1, Math.max(0, Math.log10(lowE[f] / limit) / 1.2));
    if (lowE[f] > limit * 4) windFrames++;
  }
  // Ganho: desce rápido (a rajada não passa) e sobe devagar (sem "bombear").
  for (let f = 1; f < frames; f++) gain[f] = Math.min(gain[f], gain[f - 1] + 0.08);
  for (let f = frames - 2; f >= 0; f--) gain[f] = Math.min(gain[f], gain[f + 1] + 0.25);
  // O passa-altas acompanha o vento, mas devagar (~300 ms).
  const cutoff = new Float32Array(frames);
  let w = 0;
  for (let f = 0; f < frames; f++) {
    w += (windy[f] - w) * (windy[f] > w ? 0.1 : 0.03);
    // Até ~180 Hz: mais que isso já come o grave da voz masculina (100 a 150 Hz).
    cutoff[f] = 80 + 100 * strength * w;
  }
  const hp = new Highpass();
  for (let i = 0; i < n; i++) {
    const pos = i / hop - 0.5;
    const f0 = Math.max(0, Math.min(frames - 1, Math.floor(pos)));
    const f1 = Math.min(frames - 1, f0 + 1);
    const frac = Math.max(0, Math.min(1, pos - f0));
    if (i % 32 === 0) {
      const c = cutoff[f0] + (cutoff[f1] - cutoff[f0]) * frac;
      hp.set(c, sampleRate);
    }
    const g = gain[f0] + (gain[f1] - gain[f0]) * frac;
    const x = data[i] - low[i] + low[i] * g;
    data[i] = hp.run(x);
  }
  return windFrames / frames;
}

// ---------------------------------------------------------------- Estalos

/** Coeficientes de predição linear (Levinson-Durbin): x[n] ≈ -Σ a[k]·x[n-k]. */
function lpc(segment: Float32Array, order: number): Float64Array {
  const n = segment.length;
  const r = new Float64Array(order + 1);
  for (let lag = 0; lag <= order; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) {
      const wi = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      const wj = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - lag)) / (n - 1));
      s += segment[i] * wi * segment[i - lag] * wj;
    }
    r[lag] = s;
  }
  // Um pouco de "ruído branco" deixa o filtro estável.
  r[0] = r[0] * 1.0001 + 1e-12;
  const a = new Float64Array(order + 1);
  a[0] = 1;
  let err = r[0];
  for (let i = 1; i <= order; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / err;
    const prev = a.slice();
    for (let j = 1; j < i; j++) a[j] = prev[j] + k * prev[i - j];
    a[i] = k;
    err *= 1 - k * k;
    if (err <= 0) break;
  }
  return a;
}

/** Continua o som de `context` por `count` amostras, pela predição linear. */
function extrapolate(context: Float32Array, count: number, order: number): Float32Array {
  const a = lpc(context, order);
  const hist = new Float64Array(order);
  for (let k = 0; k < order; k++) hist[k] = context[context.length - 1 - k] ?? 0;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let y = 0;
    for (let k = 1; k <= order; k++) y -= a[k] * hist[k - 1];
    out[i] = y;
    for (let k = order - 1; k > 0; k--) hist[k] = hist[k - 1];
    hist[0] = y;
  }
  return out;
}

/**
 * Tira os estalos de boca do canal (no lugar). strength: 0 a 1 (mais forte = pega estalos menores).
 * Devolve os trechos consertados [início, fim) em amostras.
 */
export function removeClicks(data: Float32Array, sampleRate: number, strength = 1): [number, number][] {
  const n = data.length;
  const scale = sampleRate / 48000;
  // Só o agudo (acima de ~3 kHz): onde o estalo aparece e a voz tem pouca energia.
  const hp = new Float32Array(n);
  {
    const low = zeroPhaseLowpass(data, sampleRate, 3000);
    for (let i = 0; i < n; i++) hp[i] = Math.abs(data[i] - low[i]);
  }
  // Nível "normal" do agudo em volta: mediana em blocos de 5 ms, olhando ±15 ms.
  const block = Math.max(8, Math.round(240 * scale));
  const blocks = Math.ceil(n / block);
  const med = new Float32Array(blocks);
  for (let b = 0; b < blocks; b++) {
    const part = Array.from(hp.subarray(b * block, Math.min(n, (b + 1) * block))).sort((x, y) => x - y);
    med[b] = part[Math.floor(part.length / 2)] ?? 0;
  }
  const background = new Float32Array(blocks);
  for (let b = 0; b < blocks; b++) {
    const around: number[] = [];
    for (let j = Math.max(0, b - 3); j <= Math.min(blocks - 1, b + 3); j++) around.push(med[j]);
    around.sort((x, y) => x - y);
    background[b] = around[Math.floor(around.length / 2)];
  }
  // Piso absoluto: nada abaixo de -40 dB do agudo mais forte conta como estalo.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, hp[i]);
  const absolute = Math.max(1e-3, peak * 0.01);
  const clamp01 = Math.max(0, Math.min(1, strength));
  const threshold = 14 - 7 * clamp01;
  // O estalo tem que ser bem maior que qualquer outro pico em volta (±13 ms). Isso separa o estalo
  // (isolado) dos pulsos da própria voz, que se repetem a cada período (2,5 a 12 ms) do mesmo tamanho.
  const isolation = 3 - 1.2 * clamp01;
  const ms = sampleRate / 1000;
  const maxLen = Math.round(3 * ms);
  const pad = Math.max(2, Math.round(0.25 * ms));
  const regions: [number, number][] = [];
  const maxIn = (from: number, to: number) => {
    let m = 0;
    for (let k = Math.max(0, from); k < Math.min(n, to); k++) m = Math.max(m, hp[k]);
    return m;
  };
  let i = 0;
  while (i < n) {
    const bg = background[Math.floor(i / block)] + 1e-9;
    if (hp[i] < absolute || hp[i] < bg * threshold) {
      i++;
      continue;
    }
    // O pico e as pontas dele: onde o agudo cai abaixo de ~-22 dB do pico (tolerando os zeros da onda).
    const top = maxIn(i, i + Math.round(ms));
    const edge = Math.max(absolute * 0.5, bg * 3, top * 0.08);
    let a = i;
    let b = i;
    let quiet = 0;
    while (b < n && b - a < maxLen * 2) {
      if (hp[b] > edge) quiet = 0;
      else if (++quiet > pad) break;
      b++;
    }
    b = Math.max(i, b - quiet);
    quiet = 0;
    while (a > 0 && i - a < maxLen) {
      if (hp[a - 1] > edge) quiet = 0;
      else if (++quiet > pad) break;
      a--;
    }
    a = Math.min(i, a + quiet);
    i = b + 1;
    // Longo demais não é estalo (é consoante, "s", batida…): fica como está.
    if (b - a > maxLen) continue;
    const around = Math.max(maxIn(a - Math.round(13 * ms), a - Math.round(ms)), maxIn(b + Math.round(ms), b + Math.round(13 * ms)));
    if (top < around * isolation) continue;
    const from = Math.max(0, a - pad);
    const to = Math.min(n, b + pad + 1);
    const last = regions[regions.length - 1];
    if (last && from <= last[1] + pad) last[1] = to;
    else regions.push([from, to]);
  }
  // Preenche cada buraco prevendo o som pelos dois lados.
  const order = Math.max(8, Math.round(20 * Math.min(1.5, scale)));
  const ctx = Math.max(order * 6, Math.round(384 * scale));
  for (const [from, to] of regions) {
    const len = to - from;
    const forward = predict(data, from, len, 1, order, ctx, sampleRate);
    const backward = predict(data, to - 1, len, -1, order, ctx, sampleRate);
    const edgeLevel = Math.max(Math.abs(data[from - 1] ?? 0), Math.abs(data[to] ?? 0));
    for (let k = 0; k < len; k++) {
      const w = 0.5 - 0.5 * Math.cos((Math.PI * (k + 1)) / (len + 1));
      const v = forward[k] * (1 - w) + backward[len - 1 - k] * w;
      // A previsão nunca passa muito do nível em volta (segurança contra filtro instável).
      const limit = edgeLevel * 4 + 0.05;
      data[from + k] = Math.max(-limit, Math.min(limit, v));
    }
  }
  return regions;
}

/**
 * Previsão de `count` amostras a partir de `start`, andando no sentido `dir` (1 = para a frente, usando
 * o som de antes; -1 = para trás, usando o de depois). Voz é quase periódica: se o som se repete
 * (um período da voz, 2,5 a 15 ms), copia o período anterior; senão, usa a predição linear curta.
 */
function predict(data: Float32Array, start: number, count: number, dir: 1 | -1, order: number, ctx: number, sampleRate: number): Float32Array {
  const n = data.length;
  // O contexto em ordem "do passado para o buraco".
  const at = (k: number) => data[start - dir * k] ?? 0;
  const available = dir === 1 ? start : n - 1 - start;
  const context = new Float32Array(Math.min(ctx, available));
  for (let k = 0; k < context.length; k++) context[context.length - 1 - k] = at(k + 1);
  const out = new Float32Array(count);
  if (context.length <= order * 2) {
    out.fill(context[context.length - 1] ?? 0);
    return out;
  }
  // Procura o período: o atraso em que os últimos 5 ms mais se parecem com o que veio antes.
  const win = Math.round(sampleRate * 0.005);
  const minLag = Math.round(sampleRate * 0.0025);
  const maxLag = Math.min(Math.round(sampleRate * 0.015), available - win - 1);
  let bestLag = 0;
  let bestR = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let xy = 0;
    let xx = 0;
    let yy = 0;
    for (let k = 1; k <= win; k++) {
      const x = at(k);
      const y = at(k + lag);
      xy += x * y;
      xx += x * x;
      yy += y * y;
    }
    const r = xy / Math.sqrt(xx * yy + 1e-12);
    if (r > bestR) {
      bestR = r;
      bestLag = lag;
    }
  }
  if (bestR > 0.7 && bestLag >= count) {
    // Copia o período anterior (o buraco é menor que um período).
    for (let k = 0; k < count; k++) out[k] = at(bestLag - k);
    return out;
  }
  return extrapolate(context, count, order);
}
