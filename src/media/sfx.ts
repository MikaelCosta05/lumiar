/**
 * Efeitos sonoros gerados na hora (síntese), sem arquivos baixados: vine boom, whoosh, trombone triste,
 * grilos, ba-dum-tss… Cada som é desenhado com osciladores, ruído e filtros num OfflineAudioContext
 * e vira um WAV, que entra no projeto como qualquer outra mídia.
 */

export type SoundCategory = 'Comédia e memes' | 'Passagens' | 'Impacto' | 'Câmera lenta e tensão' | 'Jogos e alertas';

export const SOUND_CATEGORIES: SoundCategory[] = ['Comédia e memes', 'Passagens', 'Impacto', 'Câmera lenta e tensão', 'Jogos e alertas'];

export interface SoundEffect {
  id: string;
  name: string;
  category: SoundCategory;
  /** Segundos */
  duration: number;
  description: string;
  build: (ctx: OfflineAudioContext, out: AudioNode) => void;
}

const SAMPLE_RATE = 44100;

// ---------------------------------------------------------------- Peças da síntese

/** Números "aleatórios" que se repetem: o som sai sempre igual. */
function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed = 1): AudioBuffer {
  const length = Math.max(1, Math.ceil(seconds * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rnd = random(seed);
  for (let i = 0; i < length; i++) data[i] = rnd() * 2 - 1;
  return buffer;
}

/** Ruído branco tocando de `at` até `at + seconds`. */
function noise(ctx: BaseAudioContext, at: number, seconds: number, seed = 1): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, seconds, seed);
  source.start(at);
  return source;
}

function tone(ctx: BaseAudioContext, type: OscillatorType, frequency: number, at: number, stop: number): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  osc.start(at);
  osc.stop(stop);
  return osc;
}

/** Pontos [tempo, valor, curva até ele]. "exp" soa natural para volume e altura. */
type EnvPoint = [number, number, ('lin' | 'exp')?];

function env(param: AudioParam, points: EnvPoint[]): void {
  const [t0, v0] = points[0];
  param.setValueAtTime(v0, t0);
  for (const [t, v, curve] of points.slice(1)) {
    if (curve === 'exp') param.exponentialRampToValueAtTime(Math.max(1e-4, v), t);
    else param.linearRampToValueAtTime(v, t);
  }
}

function gain(ctx: BaseAudioContext, points: EnvPoint[]): GainNode {
  const node = ctx.createGain();
  env(node.gain, points);
  return node;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

/** Eco de sala: resposta de impulso feita de ruído que some aos poucos. */
function reverb(ctx: BaseAudioContext, seconds: number, decay: number, seed = 7): ConvolverNode {
  const length = Math.ceil(seconds * ctx.sampleRate);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = ir.getChannelData(c);
    const rnd = random(seed + c);
    for (let i = 0; i < length; i++) data[i] = (rnd() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  const node = ctx.createConvolver();
  node.buffer = ir;
  return node;
}

/** Saturação: deixa o grave "estourado", como nos memes. */
function drive(ctx: BaseAudioContext, amount: number): WaveShaperNode {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  const node = ctx.createWaveShaper();
  node.curve = curve;
  return node;
}

/** Liga em série e devolve o último. */
function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

/** Mistura um eco junto do som seco. */
function withReverb(ctx: BaseAudioContext, input: AudioNode, out: AudioNode, wet: number, seconds = 1.5, decay = 3): void {
  input.connect(out);
  chain(input, reverb(ctx, seconds, decay), gain(ctx, [[0, wet]]), out);
}

/** Pancada grave (bumbo, tímpano): seno que cai de altura. */
function thump(ctx: BaseAudioContext, out: AudioNode, at: number, from: number, to: number, length: number, level = 1): void {
  const osc = tone(ctx, 'sine', from, at, at + length + 0.05);
  osc.frequency.exponentialRampToValueAtTime(to, at + length * 0.6);
  chain(osc, gain(ctx, [[at, 0], [at + 0.004, level], [at + length, 0.001, 'exp']]), out);
}

/** Ruído curto filtrado (caixa, palma, clique). */
function burst(ctx: BaseAudioContext, out: AudioNode, at: number, length: number, type: BiquadFilterType, frequency: number, level = 1, seed = 1, q = 1): void {
  chain(noise(ctx, at, length + 0.02, seed), filter(ctx, type, frequency, q), gain(ctx, [[at, 0], [at + 0.002, level], [at + length, 0.001, 'exp']]), out);
}

/** Nota com ataque e queda. */
function note(
  ctx: BaseAudioContext,
  out: AudioNode,
  type: OscillatorType,
  frequency: number,
  at: number,
  length: number,
  level = 0.5,
  attack = 0.01,
): OscillatorNode {
  const osc = tone(ctx, type, frequency, at, at + length + 0.05);
  chain(osc, gain(ctx, [[at, 0], [at + attack, level], [at + length, 0.001, 'exp']]), out);
  return osc;
}

/** Sino: parciais inarmônicas, cada uma sumindo no seu tempo. */
function bell(ctx: BaseAudioContext, out: AudioNode, at: number, base: number, length: number, level = 0.4): void {
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [2.0, 0.6, 0.7],
    [2.76, 0.4, 0.5],
    [5.4, 0.25, 0.3],
    [8.93, 0.12, 0.2],
  ];
  for (const [ratio, amp, decay] of partials) note(ctx, out, 'sine', base * ratio, at, length * decay, level * amp, 0.002);
}

// ---------------------------------------------------------------- Os sons

const NOTE = { G2: 98, A2: 110, B2: 123.47, D3: 146.83, Eb3: 155.56, G3: 196, Ab3: 207.65, A3: 220, Bb3: 233.08, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

export const SOUNDS: SoundEffect[] = [
  // -------- Comédia e memes
  {
    id: 'vine-boom',
    name: 'Vine boom',
    category: 'Comédia e memes',
    duration: 1.6,
    description: 'O "BUM" grave e estourado dos memes.',
    build(ctx, out) {
      const mix = gain(ctx, [[0, 0.9]]);
      for (const [from, to, level] of [
        [120, 42, 1],
        [62, 34, 0.8],
      ] as const) {
        const osc = tone(ctx, 'sine', from, 0, 1.5);
        osc.frequency.exponentialRampToValueAtTime(to, 0.55);
        chain(osc, gain(ctx, [[0, 0], [0.006, level], [0.25, level * 0.8], [1.45, 0.001, 'exp']]), mix);
      }
      burst(ctx, mix, 0, 0.06, 'lowpass', 1800, 0.6, 3);
      const shaped = chain(mix, drive(ctx, 4), filter(ctx, 'lowpass', 2400));
      withReverb(ctx, shaped, out, 0.35, 1.4, 2.5);
    },
  },
  {
    id: 'trombone-triste',
    name: 'Trombone triste',
    category: 'Comédia e memes',
    duration: 2.9,
    description: '"Uá, uá, uá, uááá…" para quando tudo dá errado.',
    build(ctx, out) {
      const notes: [number, number, number][] = [
        [NOTE.Bb3, 0, 0.42],
        [NOTE.A3, 0.48, 0.42],
        [NOTE.Ab3, 0.96, 0.42],
        [NOTE.G3, 1.44, 1.4],
      ];
      notes.forEach(([freq, at, length], i) => {
        const last = i === notes.length - 1;
        const osc = tone(ctx, 'sawtooth', freq, at, at + length + 0.05);
        if (last) {
          // A última nota treme (vibrato) e desce um pouquinho.
          const lfo = tone(ctx, 'sine', 5.5, at, at + length);
          chain(lfo, gain(ctx, [[at, 0], [at + 0.3, 7]])).connect(osc.frequency);
          osc.frequency.setValueAtTime(freq, at + 0.3);
          osc.frequency.linearRampToValueAtTime(freq * 0.94, at + length);
        }
        // O "uá": o filtro abre e fecha como a surdina do trombone.
        const wah = filter(ctx, 'lowpass', 400, 4);
        env(wah.frequency, [[at, 350], [at + 0.12, 1500], [at + length, 450, 'exp']]);
        chain(osc, wah, gain(ctx, [[at, 0], [at + 0.04, 0.35], [at + length - 0.08, 0.3], [at + length, 0.001, 'exp']]), out);
      });
    },
  },
  {
    id: 'grilos',
    name: 'Grilos (cri cri)',
    category: 'Comédia e memes',
    duration: 3,
    description: 'Silêncio constrangedor depois da piada.',
    build(ctx, out) {
      for (const [freq, pan, offset] of [
        [4400, -0.5, 0],
        [4750, 0.6, 0.27],
      ] as const) {
        const osc = tone(ctx, 'sine', freq, 0, 3);
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(0, 0);
        // Cada "cri" são 4 pulsos rápidos; um a cada ~0,55 s.
        for (let chirp = offset; chirp < 2.9; chirp += 0.55) {
          for (let k = 0; k < 4; k++) {
            const t = chirp + k * 0.032;
            amp.gain.setValueAtTime(0, t);
            amp.gain.linearRampToValueAtTime(0.18, t + 0.008);
            amp.gain.linearRampToValueAtTime(0, t + 0.024);
          }
        }
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        chain(osc, amp, panner, out);
      }
    },
  },
  {
    id: 'ba-dum-tss',
    name: 'Ba dum tss',
    category: 'Comédia e memes',
    duration: 1.8,
    description: 'A bateria da piada (ruim).',
    build(ctx, out) {
      thump(ctx, out, 0, 230, 160, 0.18, 0.7);
      burst(ctx, out, 0, 0.12, 'bandpass', 1800, 0.35, 2);
      thump(ctx, out, 0.2, 150, 55, 0.35, 1);
      // Prato: ruído agudo que demora a sumir.
      burst(ctx, out, 0.46, 1.25, 'highpass', 6500, 0.45, 5);
      burst(ctx, out, 0.46, 0.4, 'bandpass', 9000, 0.25, 6, 2);
    },
  },
  {
    id: 'boing',
    name: 'Boing',
    category: 'Comédia e memes',
    duration: 1,
    description: 'Mola de desenho animado.',
    build(ctx, out) {
      const osc = tone(ctx, 'sine', 160, 0, 1);
      osc.frequency.linearRampToValueAtTime(260, 0.9);
      const lfo = tone(ctx, 'sine', 16, 0, 1);
      chain(lfo, gain(ctx, [[0, 90], [0.9, 2, 'exp']])).connect(osc.frequency);
      chain(osc, gain(ctx, [[0, 0], [0.01, 0.6], [0.95, 0.001, 'exp']]), out);
    },
  },
  {
    id: 'disco-arranhado',
    name: 'Disco arranhado',
    category: 'Comédia e memes',
    duration: 0.8,
    description: 'Tudo para de repente: "rrriiic".',
    build(ctx, out) {
      const band = filter(ctx, 'bandpass', 2000, 3);
      env(band.frequency, [[0, 2800], [0.12, 500, 'exp'], [0.26, 2600, 'exp'], [0.45, 380, 'exp'], [0.7, 900, 'exp']]);
      chain(noise(ctx, 0, 0.8, 9), band, gain(ctx, [[0, 0], [0.01, 1.2], [0.6, 0.8], [0.75, 0.001, 'exp']]), out);
      const saw = tone(ctx, 'sawtooth', 220, 0, 0.75);
      env(saw.frequency, [[0, 240], [0.12, 70, 'exp'], [0.26, 210, 'exp'], [0.45, 55, 'exp']]);
      chain(saw, filter(ctx, 'lowpass', 900), gain(ctx, [[0, 0.25], [0.7, 0.001, 'exp']]), out);
    },
  },
  {
    id: 'erro',
    name: 'Resposta errada',
    category: 'Comédia e memes',
    duration: 0.9,
    description: 'A campainha de "errou!" dos programas de TV.',
    build(ctx, out) {
      for (const [at, length] of [
        [0, 0.24],
        [0.32, 0.5],
      ] as const) {
        for (const freq of [110, 116.5]) {
          chain(tone(ctx, 'square', freq, at, at + length), filter(ctx, 'lowpass', 1600), gain(ctx, [[at, 0], [at + 0.01, 0.18], [at + length - 0.02, 0.18], [at + length, 0]]), out);
        }
      }
    },
  },
  {
    id: 'escorregao',
    name: 'Escorregão',
    category: 'Comédia e memes',
    duration: 1,
    description: 'Apito que desce: alguém caiu.',
    build(ctx, out) {
      const osc = tone(ctx, 'sine', 1800, 0, 1);
      osc.frequency.exponentialRampToValueAtTime(260, 0.9);
      const lfo = tone(ctx, 'sine', 7, 0, 1);
      chain(lfo, gain(ctx, [[0, 18]])).connect(osc.frequency);
      chain(osc, gain(ctx, [[0, 0], [0.03, 0.4], [0.85, 0.3], [0.98, 0]]), out);
      chain(noise(ctx, 0, 1, 4), filter(ctx, 'bandpass', 1500, 0.8), gain(ctx, [[0, 0.04], [0.9, 0]]), out);
    },
  },
  {
    id: 'apito-subindo',
    name: 'Apito subindo',
    category: 'Comédia e memes',
    duration: 0.8,
    description: 'Algo sobe (ou alguém pula).',
    build(ctx, out) {
      const osc = tone(ctx, 'sine', 380, 0, 0.8);
      osc.frequency.exponentialRampToValueAtTime(1900, 0.7);
      chain(osc, gain(ctx, [[0, 0], [0.03, 0.4], [0.65, 0.3], [0.78, 0]]), out);
    },
  },
  {
    id: 'bip',
    name: 'Bip de censura',
    category: 'Comédia e memes',
    duration: 0.9,
    description: 'O "piiii" que cobre o palavrão.',
    build(ctx, out) {
      chain(tone(ctx, 'sine', 1000, 0, 0.9), gain(ctx, [[0, 0], [0.01, 0.5], [0.86, 0.5], [0.9, 0]]), out);
    },
  },
  {
    id: 'pop',
    name: 'Pop',
    category: 'Comédia e memes',
    duration: 0.3,
    description: 'Bolha estourando: bom para stickers e textos.',
    build(ctx, out) {
      const osc = tone(ctx, 'sine', 380, 0, 0.3);
      osc.frequency.exponentialRampToValueAtTime(1300, 0.035);
      chain(osc, gain(ctx, [[0, 0], [0.004, 0.7], [0.18, 0.001, 'exp']]), out);
    },
  },
  {
    id: 'aplausos',
    name: 'Aplausos',
    category: 'Comédia e memes',
    duration: 3,
    description: 'Plateia aplaudindo.',
    build(ctx, out) {
      const rnd = random(11);
      const claps = ctx.createGain();
      env(claps.gain, [[0, 0], [0.4, 1], [2.2, 0.9], [3, 0]]);
      claps.connect(out);
      for (let i = 0; i < 520; i++) {
        const at = rnd() * 2.9;
        burst(ctx, claps, at, 0.012 + rnd() * 0.01, 'bandpass', 900 + rnd() * 1800, 0.12 + rnd() * 0.15, i + 20, 1.5);
      }
    },
  },

  // -------- Passagens
  {
    id: 'whoosh',
    name: 'Whoosh',
    category: 'Passagens',
    duration: 0.9,
    description: 'Vento passando: combina com cortes rápidos.',
    build(ctx, out) {
      const band = filter(ctx, 'bandpass', 400, 1.1);
      env(band.frequency, [[0, 300], [0.45, 2600, 'exp'], [0.9, 500, 'exp']]);
      const panner = ctx.createStereoPanner();
      env(panner.pan, [[0, -0.8], [0.9, 0.8]]);
      chain(noise(ctx, 0, 0.9, 13), band, gain(ctx, [[0, 0], [0.42, 0.9], [0.88, 0]]), panner, out);
    },
  },
  {
    id: 'swish',
    name: 'Swish rápido',
    category: 'Passagens',
    duration: 0.4,
    description: 'Passada curta e aguda.',
    build(ctx, out) {
      const band = filter(ctx, 'bandpass', 2000, 1.4);
      env(band.frequency, [[0, 1200], [0.18, 5500, 'exp'], [0.38, 2000, 'exp']]);
      chain(noise(ctx, 0, 0.4, 14), band, gain(ctx, [[0, 0], [0.16, 0.9], [0.38, 0]]), out);
    },
  },
  {
    id: 'subida',
    name: 'Subida (riser)',
    category: 'Passagens',
    duration: 2.2,
    description: 'Tensão que sobe até o corte.',
    build(ctx, out) {
      const band = filter(ctx, 'bandpass', 200, 1.5);
      env(band.frequency, [[0, 200], [2.1, 7000, 'exp']]);
      chain(noise(ctx, 0, 2.2, 15), band, gain(ctx, [[0, 0], [2.05, 0.8], [2.2, 0]]), out);
      const osc = tone(ctx, 'sawtooth', 90, 0, 2.2);
      osc.frequency.exponentialRampToValueAtTime(880, 2.1);
      chain(osc, filter(ctx, 'lowpass', 1800), gain(ctx, [[0, 0], [2.05, 0.18], [2.2, 0]]), out);
    },
  },
  {
    id: 'whoosh-reverso',
    name: 'Sucção (reverso)',
    category: 'Passagens',
    duration: 1.2,
    description: 'Som "puxado de trás pra frente", antes de um impacto.',
    build(ctx, out) {
      const band = filter(ctx, 'bandpass', 600, 0.9);
      env(band.frequency, [[0, 500], [1.15, 4000, 'exp']]);
      const verb = reverb(ctx, 0.6, 2);
      const dry = chain(noise(ctx, 0, 1.2, 16), band, gain(ctx, [[0, 0.001], [1.1, 1, 'exp'], [1.18, 0]]));
      dry.connect(out);
      chain(dry, verb, gain(ctx, [[0, 0.3]]), out);
    },
  },
  {
    id: 'glitch',
    name: 'Glitch',
    category: 'Passagens',
    duration: 0.7,
    description: 'Falha digital picotada.',
    build(ctx, out) {
      const rnd = random(21);
      let t = 0;
      while (t < 0.62) {
        const length = 0.015 + rnd() * 0.05;
        const freq = 120 + rnd() * 1800;
        const level = 0.15 + rnd() * 0.15;
        if (rnd() > 0.3) {
          chain(tone(ctx, rnd() > 0.5 ? 'square' : 'sawtooth', freq, t, t + length), gain(ctx, [[t, level], [t + length, level]]), out);
        } else {
          burst(ctx, out, t, length, 'highpass', 2000, 0.5, Math.floor(rnd() * 1000));
        }
        t += length + rnd() * 0.03;
      }
    },
  },

  // -------- Impacto
  {
    id: 'impacto',
    name: 'Impacto',
    category: 'Impacto',
    duration: 1.3,
    description: 'Soco forte, para zooms e cortes secos.',
    build(ctx, out) {
      const mix = ctx.createGain();
      thump(ctx, mix, 0, 160, 40, 0.5, 1);
      burst(ctx, mix, 0, 0.25, 'lowpass', 2400, 0.7, 31);
      withReverb(ctx, chain(mix, drive(ctx, 2)), out, 0.3, 1.2, 3);
    },
  },
  {
    id: 'boom-cinema',
    name: 'Boom de cinema',
    category: 'Impacto',
    duration: 3,
    description: 'Estrondo grave de trailer.',
    build(ctx, out) {
      const mix = ctx.createGain();
      thump(ctx, mix, 0, 70, 28, 2.6, 1);
      burst(ctx, mix, 0, 1.4, 'lowpass', 380, 1, 32);
      withReverb(ctx, mix, out, 0.5, 2.8, 2.2);
    },
  },
  {
    id: 'soco',
    name: 'Soco',
    category: 'Impacto',
    duration: 0.5,
    description: 'Pancada seca de luta.',
    build(ctx, out) {
      thump(ctx, out, 0, 200, 60, 0.18, 0.9);
      burst(ctx, out, 0, 0.09, 'bandpass', 1400, 0.9, 33, 0.8);
      burst(ctx, out, 0.005, 0.03, 'highpass', 5000, 0.4, 34);
    },
  },
  {
    id: 'flash-camera',
    name: 'Clique de câmera',
    category: 'Impacto',
    duration: 0.4,
    description: 'Obturador de foto: bom para congelar o quadro.',
    build(ctx, out) {
      burst(ctx, out, 0, 0.025, 'highpass', 3000, 0.9, 41);
      burst(ctx, out, 0.11, 0.04, 'bandpass', 2200, 0.7, 42, 2);
      thump(ctx, out, 0.11, 400, 200, 0.05, 0.3);
    },
  },

  // -------- Câmera lenta e tensão
  {
    id: 'camera-lenta',
    name: 'Entrando em câmera lenta',
    category: 'Câmera lenta e tensão',
    duration: 2.4,
    description: '"Bwooom": o som desacelerando, como fita freando.',
    build(ctx, out) {
      const mix = ctx.createGain();
      for (const [freq, type, level] of [
        [110, 'sawtooth', 0.22],
        [165, 'sawtooth', 0.15],
        [55, 'sine', 0.6],
      ] as const) {
        const osc = tone(ctx, type, freq, 0, 2.4);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.35, 2.2);
        chain(osc, gain(ctx, [[0, 0], [0.05, level], [2.3, 0.001, 'exp']]), mix);
      }
      const lp = filter(ctx, 'lowpass', 2000, 2);
      env(lp.frequency, [[0, 2200], [2.2, 180, 'exp']]);
      withReverb(ctx, chain(mix, lp), out, 0.45, 2, 2);
    },
  },
  {
    id: 'saindo-camera-lenta',
    name: 'Voltando ao normal',
    category: 'Câmera lenta e tensão',
    duration: 1.4,
    description: 'O som acelerando de volta (fim da câmera lenta).',
    build(ctx, out) {
      const mix = ctx.createGain();
      for (const [freq, level] of [
        [40, 0.22],
        [60, 0.15],
      ] as const) {
        const osc = tone(ctx, 'sawtooth', freq, 0, 1.4);
        osc.frequency.exponentialRampToValueAtTime(freq * 3, 1.2);
        chain(osc, gain(ctx, [[0, 0.001], [1.1, level, 'exp'], [1.35, 0]]), mix);
      }
      const lp = filter(ctx, 'lowpass', 200, 2);
      env(lp.frequency, [[0, 200], [1.2, 2400, 'exp']]);
      chain(mix, lp, out);
    },
  },
  {
    id: 'coracao',
    name: 'Coração batendo',
    category: 'Câmera lenta e tensão',
    duration: 2.6,
    description: '"Tum-tum… tum-tum…" de suspense.',
    build(ctx, out) {
      const lp = filter(ctx, 'lowpass', 160);
      lp.connect(out);
      for (const beat of [0, 1.1]) {
        thump(ctx, lp, beat, 75, 45, 0.22, 1);
        thump(ctx, lp, beat + 0.26, 65, 40, 0.2, 0.7);
      }
    },
  },
  {
    id: 'tique-taque',
    name: 'Tique-taque',
    category: 'Câmera lenta e tensão',
    duration: 3,
    description: 'Relógio contando o tempo.',
    build(ctx, out) {
      for (let k = 0; k < 6; k++) {
        const at = k * 0.5;
        note(ctx, out, 'sine', k % 2 ? 1800 : 2500, at, 0.04, 0.35, 0.001);
        burst(ctx, out, at, 0.012, 'highpass', 4000, 0.5, 50 + k);
      }
    },
  },
  {
    id: 'suspense',
    name: 'Dun dun duuun',
    category: 'Câmera lenta e tensão',
    duration: 3,
    description: 'Revelação dramática.',
    build(ctx, out) {
      const brass = ctx.createGain();
      const lp = filter(ctx, 'lowpass', 900, 1);
      withReverb(ctx, chain(brass, lp), out, 0.35, 2.2, 2.5);
      const notes: [number, number, number][] = [
        [NOTE.Eb3, 0, 0.32],
        [NOTE.D3, 0.42, 0.32],
        [NOTE.B2, 0.86, 2],
      ];
      for (const [freq, at, length] of notes) {
        for (const detune of [1, 1.006, 0.5]) {
          chain(tone(ctx, 'sawtooth', freq * detune, at, at + length), gain(ctx, [[at, 0], [at + 0.04, 0.16], [at + length * 0.7, 0.12], [at + length, 0.001, 'exp']]), brass);
        }
        thump(ctx, out, at, 90, 50, 0.6, 0.7);
      }
    },
  },
  {
    id: 'rufar',
    name: 'Rufar de tambor',
    category: 'Câmera lenta e tensão',
    duration: 2.6,
    description: 'Expectativa… e o prato no fim.',
    build(ctx, out) {
      let t = 0;
      let k = 0;
      while (t < 1.75) {
        const level = 0.12 + (t / 1.75) * 0.4;
        burst(ctx, out, t, 0.06, 'bandpass', 1900, level, 60 + k, 0.9);
        t += Math.max(0.035, 0.09 - t * 0.03);
        k++;
      }
      thump(ctx, out, 1.8, 140, 50, 0.4, 1);
      burst(ctx, out, 1.8, 0.75, 'highpass', 6000, 0.5, 70);
    },
  },

  // -------- Jogos e alertas
  {
    id: 'ding',
    name: 'Ding',
    category: 'Jogos e alertas',
    duration: 1.6,
    description: 'Sininho de ideia ou acerto.',
    build(ctx, out) {
      bell(ctx, out, 0, 1320, 1.5, 0.35);
    },
  },
  {
    id: 'moeda',
    name: 'Moeda',
    category: 'Jogos e alertas',
    duration: 0.7,
    description: 'Pegou a moeda (videogame).',
    build(ctx, out) {
      chain(tone(ctx, 'square', 988, 0, 0.08), gain(ctx, [[0, 0.16], [0.08, 0.16]]), out);
      chain(tone(ctx, 'square', 1319, 0.08, 0.7), gain(ctx, [[0.08, 0.16], [0.65, 0.001, 'exp']]), out);
    },
  },
  {
    id: 'vitoria',
    name: 'Vitória (tcharam)',
    category: 'Jogos e alertas',
    duration: 1.8,
    description: 'Fanfarra curta de conquista.',
    build(ctx, out) {
      const input = filter(ctx, 'lowpass', 3200);
      input.connect(out);
      const steps: [number[], number, number][] = [
        [[NOTE.C5], 0, 0.12],
        [[NOTE.E5], 0.13, 0.12],
        [[NOTE.G5], 0.26, 0.12],
        [[NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6], 0.4, 1.35],
      ];
      for (const [freqs, at, length] of steps) {
        for (const freq of freqs) note(ctx, input, 'sawtooth', freq, at, length, 0.12, 0.015);
      }
    },
  },
  {
    id: 'level-up',
    name: 'Subiu de nível',
    category: 'Jogos e alertas',
    duration: 1,
    description: 'Arpejo rápido de 8 bits.',
    build(ctx, out) {
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((freq, i) =>
        chain(tone(ctx, 'square', freq, i * 0.07, i * 0.07 + 0.3), gain(ctx, [[i * 0.07, 0.12], [i * 0.07 + 0.28, 0.001, 'exp']]), out),
      );
    },
  },
  {
    id: 'sino-luta',
    name: 'Sino de luta',
    category: 'Jogos e alertas',
    duration: 2.4,
    description: '"Ding ding ding": começou a briga.',
    build(ctx, out) {
      for (const at of [0, 0.2, 0.4]) bell(ctx, out, at, 620, 1.9, 0.3);
    },
  },
  {
    id: 'notificacao',
    name: 'Notificação',
    category: 'Jogos e alertas',
    duration: 0.7,
    description: 'Mensagem chegando.',
    build(ctx, out) {
      note(ctx, out, 'sine', 1046.5, 0, 0.25, 0.4, 0.005);
      note(ctx, out, 'sine', 1568, 0.12, 0.5, 0.4, 0.005);
    },
  },
  {
    id: 'sirene',
    name: 'Sirene',
    category: 'Jogos e alertas',
    duration: 2.5,
    description: 'Alarme subindo e descendo.',
    build(ctx, out) {
      const osc = tone(ctx, 'triangle', 800, 0, 2.5);
      const lfo = tone(ctx, 'sine', 1.6, 0, 2.5);
      chain(lfo, gain(ctx, [[0, 300]])).connect(osc.frequency);
      chain(osc, gain(ctx, [[0, 0], [0.1, 0.3], [2.3, 0.3], [2.5, 0]]), out);
    },
  },
];

export function getSound(id: string): SoundEffect | undefined {
  return SOUNDS.find((s) => s.id === id);
}

// ---------------------------------------------------------------- Gerar o arquivo

const files = new Map<string, Promise<File>>();
const urls = new Map<string, string>();

/** Toca a síntese e devolve o som como WAV (o resultado fica guardado). */
export function soundFile(id: string): Promise<File> {
  let file = files.get(id);
  if (!file) {
    file = render(id);
    files.set(id, file);
    file.catch(() => files.delete(id));
  }
  return file;
}

/** Endereço para ouvir o som na biblioteca. */
export async function soundUrl(id: string): Promise<string> {
  const cached = urls.get(id);
  if (cached) return cached;
  const url = URL.createObjectURL(await soundFile(id));
  urls.set(id, url);
  return url;
}

async function render(id: string): Promise<File> {
  const sound = getSound(id);
  if (!sound) throw new Error(`Som desconhecido: ${id}`);
  const ctx = new OfflineAudioContext(2, Math.ceil(sound.duration * SAMPLE_RATE), SAMPLE_RATE);
  // Um limitador no fim deixa todos os sons com volume parecido e sem estourar.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.15;
  limiter.connect(ctx.destination);
  sound.build(ctx, limiter);
  const buffer = normalize(await ctx.startRendering());
  return new File([encodeWav(buffer)], `${sound.name}.wav`, { type: 'audio/wav' });
}

/** Pico em -1 dB. */
function normalize(buffer: AudioBuffer): AudioBuffer {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    for (const v of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  }
  if (peak < 1e-4) return buffer;
  const k = 0.89 / peak;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] *= k;
  }
  return buffer;
}

function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const out = new ArrayBuffer(44 + frames * channels * 2);
  const view = new DataView(out);
  const text = (offset: number, s: string) => [...s].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * channels * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      view.setInt16(offset, Math.max(-1, Math.min(1, data[c][i])) * 32767, true);
      offset += 2;
    }
  }
  return out;
}
