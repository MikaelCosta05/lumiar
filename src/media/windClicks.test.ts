import { describe, expect, it } from 'vitest';
import { fft } from './denoise';
import { removeClicks, removeWind } from './windClicks';

const SR = 48000;

function rnd(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** "Fala" sintética: vogais com harmônicos de 140 Hz, formantes e sílabas (liga e desliga 4x por segundo). */
function speech(seconds: number, seed = 1): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const r = rnd(seed);
  const formants = [
    [600, 1200, 2500],
    [350, 2000, 2800],
    [500, 900, 2400],
  ];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const syllable = Math.floor(t * 4);
    const [f1, f2, f3] = formants[syllable % 3];
    const within = (t * 4) % 1;
    const env = within < 0.7 ? Math.sin((Math.PI * within) / 0.7) ** 0.5 : 0;
    const f0 = 140 * (1 + 0.04 * Math.sin(2 * Math.PI * 3 * t));
    phase += f0 / SR;
    let v = 0;
    for (let h = 1; h * f0 < 4000; h++) {
      const f = h * f0;
      const amp = Math.exp(-(((f - f1) / 150) ** 2)) + 0.6 * Math.exp(-(((f - f2) / 200) ** 2)) + 0.3 * Math.exp(-(((f - f3) / 250) ** 2)) + 0.05;
      v += amp * Math.sin(2 * Math.PI * h * phase) / h ** 0.3;
    }
    out[i] = v * env * 0.08;
  }
  void r;
  return out;
}

/** Vento: ruído bem grave com rajadas que vêm e vão. */
function wind(seconds: number, level: number, seed = 2): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const r = rnd(seed);
  const k = 1 - Math.exp((-2 * Math.PI * 70) / SR);
  let a = 0;
  let b = 0;
  let gust = 0.5;
  let target = 0.5;
  for (let i = 0; i < n; i++) {
    if (i % Math.round(SR * 0.4) === 0) target = 0.15 + r() * 0.85;
    gust += (target - gust) * 0.00005;
    a += (r() * 2 - 1 - a) * k;
    b += (a - b) * k;
    out[i] = b * gust * level;
  }
  return out;
}

/** Energia por faixa de frequência (média de FFTs de 4096 pontos). */
function band(data: Float32Array, lo: number, hi: number): number {
  const N = 4096;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let total = 0;
  for (let p = 0; p + N <= data.length; p += N) {
    for (let i = 0; i < N; i++) {
      re[i] = data[p + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im, false);
    for (let k = Math.ceil((lo * N) / SR); k <= Math.floor((hi * N) / SR); k++) total += re[k] * re[k] + im[k] * im[k];
  }
  return total;
}

const db = (x: number) => 10 * Math.log10(x);

describe('tirar o vento', () => {
  it('abaixa muito o ronco grave e mantém a voz', () => {
    const clean = speech(6);
    const w = wind(6, 6);
    const noisy = clean.map((v, i) => v + w[i]);
    // O vento é bem mais forte que a voz (como num microfone sem espuma).
    expect(db(band(noisy, 20, 150)) - db(band(clean, 20, 150))).toBeGreaterThan(15);
    const out = Float32Array.from(noisy);
    const windy = removeWind(out, SR, 1);
    expect(windy).toBeGreaterThan(0.3);
    // Graves (onde está o vento): pelo menos 15 dB a menos.
    expect(db(band(noisy, 20, 150)) - db(band(out, 20, 150))).toBeGreaterThan(15);
    // Médios (onde está a voz): praticamente iguais aos da voz limpa.
    expect(Math.abs(db(band(out, 300, 3500)) - db(band(clean, 300, 3500)))).toBeLessThan(1.5);
  });

  it('em voz sem vento quase não mexe', () => {
    const clean = speech(4, 3);
    const out = Float32Array.from(clean);
    const windy = removeWind(out, SR, 1);
    expect(windy).toBeLessThan(0.05);
    expect(Math.abs(db(band(out, 300, 3500)) - db(band(clean, 300, 3500)))).toBeLessThan(0.5);
    // A fundamental da voz (140 Hz) continua lá.
    expect(db(band(clean, 120, 170)) - db(band(out, 120, 170))).toBeLessThan(3);
  });
});

describe('tirar estalos de boca', () => {
  /** Estalo: um "tic" agudo de 0,5 a 1,5 ms. */
  function addClicks(data: Float32Array, count: number, seed = 9): number[] {
    const r = rnd(seed);
    const at: number[] = [];
    for (let c = 0; c < count; c++) {
      const pos = Math.round((0.05 + 0.9 * ((c + r() * 0.5) / count)) * data.length);
      const len = Math.round(SR * (0.0005 + r() * 0.001));
      const amp = 0.15 + r() * 0.3;
      const freq = 4000 + r() * 4000;
      for (let k = 0; k < len; k++) data[pos + k] += amp * Math.sin((2 * Math.PI * freq * k) / SR) * Math.exp((-4 * k) / len);
      at.push(pos);
    }
    return at;
  }

  it('acha os estalos inseridos e conserta o som em volta deles', () => {
    const clean = speech(5, 4);
    const noisy = Float32Array.from(clean);
    const clicks = addClicks(noisy, 30);
    const out = Float32Array.from(noisy);
    const regions = removeClicks(out, SR, 1);
    const found = clicks.filter((p) => regions.some(([a, b]) => p >= a - 10 && p <= b));
    expect(found.length).toBeGreaterThanOrEqual(28);
    // Pouca coisa além dos estalos foi mexida.
    expect(regions.length).toBeLessThanOrEqual(clicks.length + 2);
    const touched = regions.reduce((s, [a, b]) => s + b - a, 0);
    expect(touched / out.length).toBeLessThan(0.01);
    // Nos estalos encontrados, o erro (diferença para a voz limpa) cai pelo menos 12 dB.
    let before = 0;
    let after = 0;
    for (const p of found) {
      for (let i = p - 48; i < p + 144; i++) {
        before += (noisy[i] - clean[i]) ** 2;
        after += (out[i] - clean[i]) ** 2;
      }
    }
    expect(db(before) - db(after)).toBeGreaterThan(12);
  });

  it('não confunde a voz nem um "s" com estalo', () => {
    const clean = speech(4, 5);
    // Um "sss" de 150 ms: ruído agudo contínuo.
    const r = rnd(7);
    for (let i = Math.round(SR * 1.7); i < Math.round(SR * 1.85); i++) clean[i] += (r() * 2 - 1) * 0.05;
    const out = Float32Array.from(clean);
    const regions = removeClicks(out, SR, 1);
    expect(regions.length).toBeLessThanOrEqual(1);
  });
});
