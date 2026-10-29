/**
 * O caminho de áudio de um canal do mixer, igual no preview (AudioContext) e na exportação
 * (OfflineAudioContext): entrada → volume do canal → divide em esquerda/direita → pan → junta de novo.
 * Mono vira estéreo na entrada (os dois lados inteiros), então no centro o som fica exatamente como antes.
 */

import { anySolo, masterGain, panGains, stripGain, stripSettings, type StripId } from '../project/mixer';
import type { Project } from '../project/model';

export interface StripNodes {
  /** Onde os clipes do canal se ligam */
  input: GainNode;
  /** Saída estéreo do canal (já com volume e pan) */
  output: ChannelMergerNode;
  /** Esquerda e direita depois do pan: os medidores escutam aqui */
  sides: [GainNode, GainNode];
  /** Aplica volume (multiplicador) e pan; `smooth` evita estalos ao mexer durante a reprodução. */
  set(gain: number, pan: number, smooth?: boolean): void;
}

export function createStrip(context: BaseAudioContext): StripNodes {
  const input = context.createGain();
  input.channelCount = 2;
  input.channelCountMode = 'explicit';
  input.channelInterpretation = 'speakers';
  const splitter = context.createChannelSplitter(2);
  const left = context.createGain();
  const right = context.createGain();
  const merger = context.createChannelMerger(2);
  input.connect(splitter);
  splitter.connect(left, 0);
  splitter.connect(right, 1);
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);

  const set = (gain: number, pan: number, smooth = false) => {
    const [l, r] = panGains(pan);
    const now = context.currentTime;
    for (const [param, value] of [
      [input.gain, gain],
      [left.gain, l],
      [right.gain, r],
    ] as const) {
      if (smooth) param.setTargetAtTime(value, now, 0.02);
      else param.setValueAtTime(value, now);
    }
  };
  return { input, output: merger, sides: [left, right], set };
}

/**
 * Mixer da exportação: os mesmos canais do preview, com valores fixos. `input(canal)` devolve onde ligar os
 * clipes daquela trilha, ou null quando o canal não é ouvido (mudo, fora do solo ou no −∞), para nem agendar.
 */
export function buildMixBus(context: BaseAudioContext, project: Project, destination: AudioNode = context.destination) {
  const master = context.createGain();
  master.gain.value = masterGain(project);
  master.connect(destination);
  const solo = anySolo(project);
  const strips = new Map<StripId, AudioNode>();
  return {
    input(id: StripId): AudioNode | null {
      const gain = stripGain(project, id, solo);
      if (gain <= 0) return null;
      let node = strips.get(id);
      if (!node) {
        const strip = createStrip(context);
        strip.set(gain, stripSettings(project, id).pan);
        strip.output.connect(master);
        node = strip.input;
        strips.set(id, node);
      }
      return node;
    },
  };
}
