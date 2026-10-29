import { t } from '../i18n';
import type { VoiceEffect } from '../project/model';

export const VOICE_EFFECTS: { id: VoiceEffect; label: string; hint: string }[] = [
  { id: 'none', label: t('Nenhum'), hint: t('Som original') },
  { id: 'clean', label: t('Voz limpa'), hint: t('Tira o grave do ambiente, dá presença e equilibra o volume (podcast)') },
  { id: 'phone', label: t('Telefone'), hint: t('Só os médios, como numa ligação') },
  { id: 'radio', label: t('Rádio'), hint: t('Rádio AM antigo, um pouco saturado') },
  { id: 'megaphone', label: t('Megafone'), hint: t('Estourado e anasalado') },
  { id: 'echo', label: t('Eco'), hint: t('Repetições que vão sumindo') },
  { id: 'cave', label: t('Caverna'), hint: t('Reverberação longa, como num salão grande') },
  { id: 'robot', label: t('Robô'), hint: t('Voz metálica de robô') },
  { id: 'underwater', label: t('Debaixo d’água'), hint: t('Abafado e distante') },
  { id: 'deep', label: t('Monstro'), hint: t('Voz bem grave (sem mudar a velocidade)') },
  { id: 'chipmunk', label: t('Esquilo'), hint: t('Voz bem aguda (sem mudar a velocidade)') },
];

export interface VoiceChain {
  input: AudioNode;
  output: AudioNode;
  /** Para os osciladores e fontes internas (no preview, ao trocar de efeito). */
  stop: () => void;
}

/**
 * Monta a cadeia de nós do Web Audio de um efeito de voz.
 * Funciona igual no preview (AudioContext) e na exportação (OfflineAudioContext).
 */
export function buildVoiceChain(ctx: BaseAudioContext, effect: VoiceEffect | undefined): VoiceChain | null {
  if (!effect || effect === 'none') return null;
  const input = ctx.createGain();
  const output = ctx.createGain();
  const stoppers: AudioScheduledSourceNode[] = [];
  const filter = (type: BiquadFilterType, frequency: number, Q = 0.7, gain = 0) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = Q;
    f.gain.value = gain;
    return f;
  };
  const chain = (...nodes: AudioNode[]) => {
    nodes.reduce((a, b) => {
      a.connect(b);
      return b;
    });
  };

  switch (effect) {
    case 'clean': {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -26;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.005;
      comp.release.value = 0.2;
      const makeup = ctx.createGain();
      makeup.gain.value = 1.5;
      chain(input, filter('highpass', 85), filter('peaking', 250, 1, -2), filter('peaking', 3200, 0.8, 4), comp, makeup, output);
      break;
    }
    case 'phone':
      chain(input, filter('highpass', 420, 1), filter('lowpass', 3000, 1), distortion(ctx, 4), gainOf(ctx, 1.4), output);
      break;
    case 'radio':
      chain(input, filter('highpass', 300, 1), filter('lowpass', 4200, 1), filter('peaking', 1800, 1, 5), distortion(ctx, 12), compressor(ctx), gainOf(ctx, 1.2), output);
      break;
    case 'megaphone':
      chain(input, filter('highpass', 650, 1.2), filter('lowpass', 3600, 1.2), filter('peaking', 1500, 2, 10), distortion(ctx, 40), gainOf(ctx, 0.7), output);
      break;
    case 'echo': {
      const delay = ctx.createDelay(2);
      delay.delayTime.value = 0.32;
      const feedback = gainOf(ctx, 0.42);
      const wet = gainOf(ctx, 0.55);
      input.connect(output);
      input.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(filter('lowpass', 3500)).connect(wet).connect(output);
      break;
    }
    case 'cave': {
      const convolver = ctx.createConvolver();
      convolver.buffer = impulse(ctx, 3.2, 2.2);
      const wet = gainOf(ctx, 0.75);
      const dry = gainOf(ctx, 0.7);
      chain(input, dry, output);
      chain(input, convolver, wet, output);
      break;
    }
    case 'robot': {
      // Modulação em anel (multiplica a voz por uma senoide) + filtro de pente metálico.
      const ring = ctx.createGain();
      ring.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.frequency.value = 55;
      osc.connect(ring.gain);
      osc.start();
      stoppers.push(osc);
      const comb = ctx.createDelay(0.1);
      comb.delayTime.value = 0.006;
      const combFeedback = gainOf(ctx, 0.55);
      chain(input, ring, comb, output);
      comb.connect(combFeedback).connect(comb);
      ring.connect(gainOf(ctx, 0.6)).connect(output);
      break;
    }
    case 'underwater': {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.6;
      const depth = gainOf(ctx, 120);
      const low = filter('lowpass', 480, 6);
      lfo.connect(depth).connect(low.frequency);
      lfo.start();
      stoppers.push(lfo);
      chain(input, low, gainOf(ctx, 1.6), output);
      break;
    }
    case 'deep':
    case 'chipmunk': {
      const shifter = pitchShifter(ctx, effect === 'deep' ? -0.45 : 0.6);
      stoppers.push(...shifter.sources);
      chain(input, shifter.input);
      shifter.output.connect(output);
      break;
    }
  }
  return {
    input,
    output,
    stop: () =>
      stoppers.forEach((s) => {
        try {
          s.stop();
        } catch {
          // já parado
        }
      }),
  };
}

function gainOf(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

function compressor(ctx: BaseAudioContext): DynamicsCompressorNode {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = -20;
  c.ratio.value = 6;
  return c;
}

/** Saturação suave (quanto maior "amount", mais estourado). */
function distortion(ctx: BaseAudioContext, amount: number): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  return shaper;
}

/** Resposta de impulso artificial (ruído que decai): reverberação de salão/caverna. */
function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buffer;
}

/**
 * Muda o tom sem mudar a velocidade: duas linhas de atraso que "andam" (dente de serra)
 * e se revezam com fade. offset < 0 deixa grave, > 0 agudo.
 */
function pitchShifter(ctx: BaseAudioContext, offset: number) {
  const delayTime = 0.1;
  const fadeTime = 0.05;
  const bufferTime = 0.1;
  const input = ctx.createGain();
  const output = ctx.createGain();
  const shiftUp = offset > 0;

  const rampBuffer = (up: boolean) => {
    const length1 = Math.floor(bufferTime * ctx.sampleRate);
    const length2 = Math.floor((bufferTime - 2 * fadeTime) * ctx.sampleRate);
    const buffer = ctx.createBuffer(1, length1 + length2, ctx.sampleRate);
    const p = buffer.getChannelData(0);
    for (let i = 0; i < length1; i++) p[i] = up ? (length1 - i) / length1 : i / length1;
    return buffer;
  };
  const fadeBuffer = () => {
    const length1 = Math.floor(bufferTime * ctx.sampleRate);
    const length2 = Math.floor((bufferTime - 2 * fadeTime) * ctx.sampleRate);
    const buffer = ctx.createBuffer(1, length1 + length2, ctx.sampleRate);
    const p = buffer.getChannelData(0);
    const fadeLength = Math.floor(fadeTime * ctx.sampleRate);
    const fadeEnd = length1 - fadeLength;
    for (let i = 0; i < length1; i++) {
      p[i] = i < fadeLength ? Math.sqrt(i / fadeLength) : i >= fadeEnd ? Math.sqrt(1 - (i - fadeEnd) / fadeLength) : 1;
    }
    return buffer;
  };
  const looping = (buffer: AudioBuffer) => {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    return s;
  };

  const ramp = rampBuffer(shiftUp);
  const mod1 = looping(ramp);
  const mod2 = looping(ramp);
  const depth1 = gainOf(ctx, delayTime * Math.abs(offset));
  const depth2 = gainOf(ctx, delayTime * Math.abs(offset));
  const delay1 = ctx.createDelay(1);
  const delay2 = ctx.createDelay(1);
  mod1.connect(depth1).connect(delay1.delayTime);
  mod2.connect(depth2).connect(delay2.delayTime);

  const fades = fadeBuffer();
  const fade1 = looping(fades);
  const fade2 = looping(fades);
  const mix1 = gainOf(ctx, 0);
  const mix2 = gainOf(ctx, 0);
  fade1.connect(mix1.gain);
  fade2.connect(mix2.gain);
  input.connect(delay1).connect(mix1).connect(output);
  input.connect(delay2).connect(mix2).connect(output);

  const t = ctx.currentTime + 0.01;
  const t2 = t + bufferTime - fadeTime;
  mod1.start(t);
  fade1.start(t);
  mod2.start(t2);
  fade2.start(t2);
  return { input, output, sources: [mod1, mod2, fade1, fade2] };
}

/** Equalizador de 3 faixas (graves, médios, agudos). null se está tudo em 0 dB. */
export function buildEq(ctx: BaseAudioContext, eq: { low: number; mid: number; high: number } | undefined): VoiceChain | null {
  if (!eq || (Math.abs(eq.low) < 0.1 && Math.abs(eq.mid) < 0.1 && Math.abs(eq.high) < 0.1)) return null;
  const band = (type: BiquadFilterType, frequency: number, gain: number, Q = 0.8) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.gain.value = gain;
    f.Q.value = Q;
    return f;
  };
  const low = band('lowshelf', 200, eq.low);
  const mid = band('peaking', 1200, eq.mid);
  const high = band('highshelf', 4500, eq.high);
  low.connect(mid).connect(high);
  return { input: low, output: high, stop: () => {} };
}

/** Efeito de voz seguido do equalizador (cada um pode faltar). */
export function buildAudioChain(ctx: BaseAudioContext, voice: VoiceEffect | undefined, eq: { low: number; mid: number; high: number } | undefined): VoiceChain | null {
  const a = buildVoiceChain(ctx, voice);
  const b = buildEq(ctx, eq);
  if (!a || !b) return a ?? b;
  a.output.connect(b.input);
  return { input: a.input, output: b.output, stop: a.stop };
}
