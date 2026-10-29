/**
 * Peças de síntese amostra a amostra (sem Web Audio): osciladores, filtro, envelopes, bateria,
 * pluck (Karplus-Strong), piano elétrico (FM), eco de sala e "fita". Em TypeScript puro para gerar
 * exatamente o mesmo som no app e nos testes (o Node não tem OfflineAudioContext).
 * Usado pela música gerada (musicGen.ts).
 */

export const SR = 44100;

/** Números "aleatórios" que se repetem: a mesma semente dá sempre a mesma música. */
export function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nota MIDI → Hz. */
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Tabela de ruído branco: mais barato que sortear a cada amostra. */
const NOISE = (() => {
  const rnd = random(12345);
  return Float32Array.from({ length: 1 << 17 }, () => rnd() * 2 - 1);
})();
const NOISE_MASK = NOISE.length - 1;

/** Som estéreo: o seco (dry), o que vai para o eco (send) e o que "bombeia" com o bumbo (pump). */
export class Mix {
  readonly length: number;
  readonly dry: [Float32Array, Float32Array];
  readonly send: [Float32Array, Float32Array];
  readonly pump: [Float32Array, Float32Array];
  constructor(length: number) {
    this.length = length;
    const pair = (): [Float32Array, Float32Array] => [new Float32Array(length), new Float32Array(length)];
    this.dry = pair();
    this.send = pair();
    this.pump = pair();
  }
}

export interface Voice {
  wave: 'sine' | 'saw' | 'square' | 'tri' | 'noise';
  freq: number;
  level: number;
  /** -1 (esquerda) a 1 (direita) */
  pan?: number;
  /** Quanto vai para o eco (0 a 1) */
  send?: number;
  /** Envelope: ataque, queda, sustentação (0 a 1) e soltura (s) */
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  /** Vozes desafinadas juntas (coro, "supersaw") e o quanto desafinam (centésimos) */
  unison?: number;
  spread?: number;
  /** A altura começa em freq * from e chega em freq em `time` s (bumbo, tambor) */
  glide?: { from: number; time: number };
  /** Filtro com envelope: começa em `from` Hz e vai para `to` Hz (constante de tempo `time`) */
  filter?: { type: 'lp' | 'hp' | 'bp'; from: number; to?: number; time?: number; q?: number };
  vibrato?: { rate: number; cents: number };
  /** Vai para a mistura que bombeia com o bumbo */
  pump?: boolean;
  /** Saturação (0 = limpo) */
  drive?: number;
}

const TWO_PI = Math.PI * 2;

/** Correção polyBLEP: tira o chiado (aliasing) das quinas da onda serra e quadrada. */
function blep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** Ganhos de pan com potência constante. */
function panGains(pan: number): [number, number] {
  const p = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(p), Math.sin(p)];
}

/** Filtro de estado variável (TPT): passa-baixas, passa-altas e passa-faixa estáveis com qualquer corte. */
class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private k = 1;
  set(freq: number, q: number): void {
    const g = Math.tan((Math.PI * Math.min(freq, SR * 0.45)) / SR);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  run(x: number, type: 'lp' | 'hp' | 'bp'): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return type === 'lp' ? v2 : type === 'bp' ? v1 : x - this.k * v1 - v2;
  }
}

/**
 * Toca uma nota de `length` s a partir de `at` s (a soltura vem depois). É a peça de quase tudo:
 * baixo, cordas, metais, bumbo, chimbal…
 */
export function play(mix: Mix, v: Voice, at: number, length: number): void {
  const a = Math.max(0.001, v.a ?? 0.005);
  const d = Math.max(0.001, v.d ?? 0.2);
  const s = v.s ?? 0.7;
  const r = Math.max(0.005, v.r ?? 0.1);
  const start = Math.max(0, Math.round(at * SR));
  const holdEnd = Math.round((at + length) * SR);
  // A soltura acaba quando o envelope chega a -80 dB.
  const end = Math.min(mix.length, holdEnd + Math.ceil(r * SR * 9.2));
  if (end <= start) return;
  const unison = Math.max(1, v.unison ?? 1);
  const phases = new Float64Array(unison);
  const ratios = new Float64Array(unison);
  const seedRnd = random(Math.floor(at * 1000) + Math.floor(v.freq * 7));
  for (let u = 0; u < unison; u++) {
    const off = unison === 1 ? 0 : ((u / (unison - 1)) * 2 - 1) * (v.spread ?? 12);
    ratios[u] = 2 ** (off / 1200);
    phases[u] = seedRnd();
  }
  let noiseAt = Math.floor(seedRnd() * NOISE.length);
  // Com várias vozes, as pares vão mais para a esquerda e as ímpares mais para a direita (som largo).
  const stereo = unison > 1 && v.wave !== 'noise';
  const filter = v.filter ? new Svf() : null;
  const filterB = v.filter && stereo ? new Svf() : null;
  const fq = v.filter?.q ?? 0.707;
  const [gl, gr] = panGains(v.pan ?? 0);
  const send = v.send ?? 0;
  const out = v.pump ? mix.pump : mix.dry;
  const decayK = Math.exp(-1 / (d * SR));
  const releaseK = Math.exp(-1 / (r * SR));
  const drive = v.drive ?? 0;
  const driveNorm = drive > 0 ? 1 / Math.tanh(1 + drive * 3) : 1;
  let dec = 1;
  let env = 0;
  const norm = v.level / Math.sqrt(unison);
  let f = v.freq;
  for (let i = start; i < end; i++) {
    const t = (i - start) / SR;
    // Envelope ADSR (contas incrementais: barato).
    if (i < holdEnd) {
      if (t < a) env = t / a;
      else {
        dec *= decayK;
        env = s + (1 - s) * dec;
      }
    } else env *= releaseK;
    // Filtro e altura mudam a cada 16 amostras (0,4 ms): ninguém ouve a diferença e sai bem mais rápido.
    if ((i - start) % 16 === 0) {
      if (filter && v.filter) {
        const { from, to = from, time = 0.2 } = v.filter;
        const cutoff = to + (from - to) * Math.exp(-t / time);
        filter.set(cutoff, fq);
        filterB?.set(cutoff, fq);
      }
      f = v.freq;
      if (v.glide) f *= 1 + (v.glide.from - 1) * Math.exp(-t / v.glide.time);
      if (v.vibrato) f *= 2 ** ((v.vibrato.cents / 1200) * Math.sin(TWO_PI * v.vibrato.rate * t) * Math.min(1, t / 0.4));
    }
    let x = 0;
    let xb = 0;
    if (v.wave === 'noise') {
      x = NOISE[noiseAt++ & NOISE_MASK];
    } else {
      for (let u = 0; u < unison; u++) {
        const dt = (f * ratios[u]) / SR;
        let p = phases[u] + dt;
        if (p >= 1) p -= 1;
        phases[u] = p;
        let o: number;
        if (v.wave === 'sine') o = Math.sin(TWO_PI * p);
        else if (v.wave === 'saw') o = 2 * p - 1 - blep(p, dt);
        else if (v.wave === 'square') o = (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt);
        else o = 4 * Math.abs(p - 0.5) - 1;
        if (stereo && u % 2) xb += o;
        else x += o;
      }
    }
    if (filter && v.filter) x = filter.run(x, v.filter.type);
    if (filterB && v.filter) xb = filterB.run(xb, v.filter.type);
    if (drive > 0) {
      x = Math.tanh(x * (1 + drive * 3)) * driveNorm;
      if (stereo) xb = Math.tanh(xb * (1 + drive * 3)) * driveNorm;
    }
    const e = env * norm;
    // Mono: os dois lados iguais. Estéreo: 80% de um grupo e 20% do outro em cada lado.
    const left = (stereo ? x * 0.8 + xb * 0.2 : x) * e * gl * (stereo ? 1.25 : 1);
    const right = (stereo ? xb * 0.8 + x * 0.2 : x) * e * gr * (stereo ? 1.25 : 1);
    out[0][i] += left;
    out[1][i] += right;
    if (send) {
      mix.send[0][i] += left * send;
      mix.send[1][i] += right * send;
    }
  }
}

/** Corda dedilhada (ukulele, violão): algoritmo de Karplus-Strong. */
export function pluck(mix: Mix, freq: number, at: number, length: number, level: number, pan = 0, send = 0.2, bright = 0.5): void {
  const start = Math.max(0, Math.round(at * SR));
  const end = Math.min(mix.length, start + Math.round((length + 0.3) * SR));
  const period = Math.max(2, Math.round(SR / freq));
  const line = new Float32Array(period);
  const rnd = random(Math.round(at * 997 + freq));
  // Ruído já filtrado: ataque menos áspero.
  let lp = 0;
  for (let i = 0; i < period; i++) {
    lp += (rnd() * 2 - 1 - lp) * (0.3 + bright * 0.6);
    line[i] = lp;
  }
  const [gl, gr] = panGains(pan);
  const damp = 0.996 - (1 - bright) * 0.006;
  const stopAt = start + Math.round(length * SR);
  let idx = 0;
  let prev = 0;
  for (let i = start; i < end; i++) {
    const cur = line[idx];
    const next = (cur + prev) * 0.5 * damp;
    prev = cur;
    line[idx] = next;
    idx = (idx + 1) % period;
    // Abafa no fim da nota (a mão encosta na corda).
    const mute = i < stopAt ? 1 : Math.exp(-(i - stopAt) / (SR * 0.05));
    const y = cur * level * mute;
    mix.dry[0][i] += y * gl;
    mix.dry[1][i] += y * gr;
    if (send) {
      mix.send[0][i] += y * gl * send;
      mix.send[1][i] += y * gr * send;
    }
  }
}

/** Piano elétrico (FM): portadora + moduladora cujo brilho some com o tempo. */
export function epiano(mix: Mix, freq: number, at: number, length: number, level: number, pan = 0, send = 0.25): void {
  const start = Math.max(0, Math.round(at * SR));
  const hold = Math.round((at + length) * SR);
  const end = Math.min(mix.length, hold + Math.round(0.6 * SR));
  const [gl, gr] = panGains(pan);
  const w = (TWO_PI * freq) / SR;
  // Quedas exponenciais por multiplicação (sem Math.exp a cada amostra).
  const kIndex = Math.exp(-1 / (SR * 0.35));
  const kBody = Math.exp(-1 / (SR * 1.6));
  const kTine = Math.exp(-1 / (SR * 0.03));
  const kRelease = Math.exp(-1 / (SR * 0.12));
  const tremW = (TWO_PI * 4.5) / SR;
  let index = 2.5;
  let body = 1;
  let tineEnv = 0.08;
  let release = 1;
  for (let i = start; i < end; i++) {
    const n = i - start;
    const mod = Math.sin(w * n) * (1.3 + index);
    let env = Math.min(1, n / (SR * 0.003)) * body;
    if (i >= hold) {
      release *= kRelease;
      env *= release;
    }
    // O "tine": um brilho metálico curtinho no ataque. Um pouco do 2º harmônico dá corpo nos médios.
    const y = (Math.sin(w * n + mod) + 0.2 * Math.sin(2 * w * n) + Math.sin(w * 14 * n) * tineEnv) * env * level;
    index *= kIndex;
    body *= kBody;
    tineEnv *= kTine;
    // Trêmolo estéreo, como num Rhodes.
    const trem = 0.5 + 0.5 * Math.sin(tremW * n);
    mix.dry[0][i] += y * gl * (0.75 + 0.25 * trem);
    mix.dry[1][i] += y * gr * (1 - 0.25 * trem);
    mix.send[0][i] += y * gl * send;
    mix.send[1][i] += y * gr * send;
  }
}

// ---------------------------------------------------------------- Bateria

export function kick(mix: Mix, at: number, level: number, opts: { from?: number; to?: number; decay?: number; send?: number } = {}): void {
  const decay = opts.decay ?? 0.3;
  const to = opts.to ?? 48;
  play(mix, { wave: 'sine', freq: to, level, glide: { from: (opts.from ?? 160) / to, time: 0.035 }, a: 0.001, d: decay, s: 0, r: 0.02, drive: 0.25, send: opts.send ?? 0 }, at, decay * 3);
  // Estalo do ataque (o bumbo aparece mesmo em caixa de som pequena).
  play(mix, { wave: 'noise', freq: 1, level: level * 0.12, filter: { type: 'lp', from: 3000 }, a: 0.0005, d: 0.006, s: 0, r: 0.005 }, at, 0.01);
}

export function snare(mix: Mix, at: number, level: number, opts: { tone?: number; decay?: number; bright?: number; send?: number; pan?: number } = {}): void {
  const decay = opts.decay ?? 0.14;
  const send = opts.send ?? 0.25;
  play(mix, { wave: 'tri', freq: opts.tone ?? 190, level: level * 0.5, glide: { from: 1.4, time: 0.02 }, a: 0.001, d: 0.05, s: 0, r: 0.02, send, pan: opts.pan }, at, 0.1);
  play(mix, { wave: 'noise', freq: 1, level: level * 0.7, filter: { type: 'bp', from: 2500 + (opts.bright ?? 0.5) * 3000, q: 0.6 }, a: 0.001, d: decay, s: 0, r: 0.03, send, pan: opts.pan }, at, decay * 2);
}

export function clap(mix: Mix, at: number, level: number, pan = 0): void {
  for (const [dt, l] of [[0, 0.6], [0.011, 0.7], [0.022, 1]] as const) {
    play(mix, { wave: 'noise', freq: 1, level: level * l, filter: { type: 'bp', from: 1300, q: 1.2 }, a: 0.0005, d: dt === 0.022 ? 0.12 : 0.008, s: 0, r: 0.02, send: 0.3, pan }, at + dt, 0.02);
  }
}

export function hat(mix: Mix, at: number, level: number, open = false, pan = 0.25): void {
  play(mix, { wave: 'noise', freq: 1, level, filter: { type: 'hp', from: 7500, q: 0.8 }, a: 0.0005, d: open ? 0.18 : 0.03, s: 0, r: 0.02, pan, send: 0.08 }, at, open ? 0.3 : 0.04);
}

/** Prato de ataque: ruído agudo longo. */
export function crash(mix: Mix, at: number, level: number, pan = -0.3): void {
  play(mix, { wave: 'noise', freq: 1, level, filter: { type: 'hp', from: 5000, to: 3500, time: 1, q: 0.6 }, a: 0.001, d: 1.1, s: 0, r: 0.3, pan, send: 0.3 }, at, 2.5);
}

/** Tambor grande (taiko, tímpano). */
export function taiko(mix: Mix, at: number, level: number, freq = 70, pan = 0): void {
  play(mix, { wave: 'sine', freq, level, glide: { from: 1.8, time: 0.05 }, a: 0.002, d: 0.45, s: 0, r: 0.1, send: 0.45, pan, drive: 0.3 }, at, 1);
  play(mix, { wave: 'noise', freq: 1, level: level * 0.35, filter: { type: 'lp', from: 900, to: 200, time: 0.08 }, a: 0.001, d: 0.12, s: 0, r: 0.05, send: 0.5, pan }, at, 0.2);
}

/** Batida grave com eco longo: o "BUM" de trailer e de final. */
export function boom(mix: Mix, at: number, level: number): void {
  play(mix, { wave: 'sine', freq: 38, level, glide: { from: 3, time: 0.08 }, a: 0.002, d: 1.2, s: 0, r: 0.3, send: 0.6, drive: 0.4 }, at, 3);
  play(mix, { wave: 'noise', freq: 1, level: level * 0.5, filter: { type: 'lp', from: 2500, to: 120, time: 0.3 }, a: 0.001, d: 0.6, s: 0, r: 0.2, send: 0.8 }, at, 1.2);
}

/** Subida de ruído até `to` (antes de uma parte nova). */
export function riser(mix: Mix, from: number, to: number, level: number): void {
  const length = to - from;
  if (length <= 0.1) return;
  const startI = Math.round(from * SR);
  const endI = Math.min(mix.length, Math.round(to * SR));
  const f = new Svf();
  let n = Math.floor(from * 1000);
  for (let i = Math.max(0, startI); i < endI; i++) {
    const p = (i - startI) / (endI - startI);
    if ((i & 15) === 0) f.set(300 * 2 ** (p * 5), 2.5);
    const y = f.run(NOISE[n++ & NOISE_MASK], 'bp') * level * p * p;
    mix.dry[0][i] += y * (1 - p * 0.5);
    mix.dry[1][i] += y * (0.5 + p * 0.5);
    mix.send[0][i] += y * 0.5;
    mix.send[1][i] += y * 0.5;
  }
}

/** Chiado e estalos de vinil (lo-fi), do começo ao fim. */
export function vinyl(mix: Mix, level: number, seed: number): void {
  const rnd = random(seed);
  let lp = 0;
  for (let i = 0; i < mix.length; i++) {
    const n = NOISE[(i * 7 + 13) & NOISE_MASK];
    lp += (n - lp) * 0.08;
    const y = lp * level * 0.25;
    // Estalinhos raros.
    if (rnd() < 2.5 / SR) {
      const len = 20 + Math.floor(rnd() * 60);
      const amp = level * (0.5 + rnd());
      for (let k = 0; k < len && i + k < mix.length; k++) {
        const c = NOISE[(i + k * 31) & NOISE_MASK] * amp * (1 - k / len);
        mix.dry[0][i + k] += c;
        mix.dry[1][i + k] += c * 0.8;
      }
    }
    mix.dry[0][i] += y;
    mix.dry[1][i] += y;
  }
}

// ---------------------------------------------------------------- Efeitos da mistura

/** Eco de sala (Freeverb simplificado): 4 pentes e 2 passa-tudo por lado. */
export function reverb(input: Float32Array, out: Float32Array, size: number, damp: number, offset: number): void {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356].map((n) => Math.round((n + offset) * scale));
  const alls = [556, 441].map((n) => Math.round((n + offset) * scale));
  const cb = combs.map((n) => new Float32Array(n));
  const ci = combs.map(() => 0);
  const cs = combs.map(() => 0);
  const ab = alls.map((n) => new Float32Array(n));
  const ai = alls.map(() => 0);
  const feedback = 0.7 + size * 0.28;
  for (let i = 0; i < input.length; i++) {
    const x = input[i] * 0.06;
    let y = 0;
    for (let c = 0; c < 4; c++) {
      const buf = cb[c];
      const v = buf[ci[c]];
      cs[c] = v * (1 - damp) + cs[c] * damp;
      buf[ci[c]] = x + cs[c] * feedback;
      ci[c] = ci[c] + 1 === buf.length ? 0 : ci[c] + 1;
      y += v;
    }
    for (let k = 0; k < 2; k++) {
      const buf = ab[k];
      const v = buf[ai[k]];
      buf[ai[k]] = y + v * 0.5;
      ai[k] = ai[k] + 1 === buf.length ? 0 : ai[k] + 1;
      y = v - y;
    }
    out[i] += y;
  }
}

/** "Fita": a altura oscila devagar (wow) e rápido (flutter), por uma linha de atraso variável. */
export function tape(data: Float32Array, wow: number, flutter: number, seed: number): void {
  const copy = Float32Array.from(data);
  const rnd = random(seed);
  const wowRate = 0.35 + rnd() * 0.3;
  const phase = rnd() * TWO_PI;
  const base = 0.012 * SR;
  for (let i = 0; i < data.length; i++) {
    const t = i / SR;
    const delay = base * (1 + wow * Math.sin(TWO_PI * wowRate * t + phase) + flutter * 0.15 * Math.sin(TWO_PI * 7.3 * t));
    const pos = i - delay;
    const p0 = Math.floor(pos);
    const frac = pos - p0;
    const a = copy[p0] ?? 0;
    const b = copy[p0 + 1] ?? 0;
    data[i] = a + (b - a) * frac;
  }
}

/** A fita parando: do instante `from` até o fim, a velocidade cai até zero (o som desce e some). */
export function tapeStop(data: Float32Array, from: number): void {
  const start = Math.round(from * SR);
  const n = data.length - start;
  if (n <= 1) return;
  const copy = data.slice(start);
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const rate = (1 - p) * (1 - p);
    const p0 = Math.floor(pos);
    const frac = pos - p0;
    const a = copy[p0] ?? 0;
    const b = copy[p0 + 1] ?? 0;
    data[start + i] = (a + (b - a) * frac) * (1 - p * p);
    pos += rate;
  }
}

/** Passa-altas de 1ª ordem (tira o DC e o grave que só gasta volume). */
export function highpass(data: Float32Array, freq: number): void {
  const rc = 1 / (TWO_PI * freq);
  const k = rc / (rc + 1 / SR);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < data.length; i++) {
    const out = k * (prevOut + data[i] - prevIn);
    prevIn = data[i];
    data[i] = out;
    prevOut = out;
  }
}

/** Passa-baixas de 2 polos simples (o som "abafado" do lo-fi). */
export function lowpass(data: Float32Array, freq: number): void {
  const k = 1 - Math.exp((-TWO_PI * freq) / SR);
  let a = 0;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a += (data[i] - a) * k;
    b += (a - b) * k;
    data[i] = b;
  }
}
