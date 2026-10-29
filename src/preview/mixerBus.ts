/**
 * O mixer no preview: cada elemento de mídia (já com o volume do clipe) entra no canal da sua trilha, e todos
 * os canais passam pelo Master antes de sair. Cada canal tem um par de analisadores (esquerda/direita) para os
 * medidores, e o Master tem mais um par depois do filtro K, para a sonoridade (LUFS) ao vivo.
 */

import { kWeightStages } from '../media/loudness';
import { createStrip, type StripNodes } from '../media/mixGraph';
import { anySolo, clipStrips, masterGain, mixerStrips, stripGain, stripSettings, type StripId } from '../project/mixer';
import type { Project } from '../project/model';
import { readLevel, ShortTermLoudness, SILENT, type Level } from './meters';

const FFT = 2048;

interface Strip {
  nodes: StripNodes;
  meters: [AnalyserNode, AnalyserNode];
}

export interface MixerLevels {
  strips: Map<StripId, Level>;
  master: Level;
  /** Sonoridade de curto prazo do Master (LUFS, últimos 3 s) */
  lufs: number;
}

export class MixerBus {
  private readonly strips = new Map<StripId, Strip>();
  private readonly routes = new WeakMap<AudioNode, StripId>();
  private readonly master: GainNode;
  private readonly masterMeters: [AnalyserNode, AnalyserNode];
  private readonly loudnessMeters: [AnalyserNode, AnalyserNode];
  private readonly loudness = new ShortTermLoudness();
  private readonly buffer = new Float32Array(FFT);
  private project: Project | null = null;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
  ) {
    this.master = context.createGain();
    this.master.connect(destination);
    this.masterMeters = this.tap(this.master);
    // Filtro K (os dois estágios num filtro só) antes de medir a sonoridade, como na exportação.
    const [shelf, highpass] = kWeightStages(context.sampleRate);
    const weighted = context.createIIRFilter(convolve(shelf.b, highpass.b), convolve([1, ...shelf.a], [1, ...highpass.a]));
    this.master.connect(weighted);
    this.loudnessMeters = this.tap(weighted);
  }

  /** Liga a saída de um elemento (o ganho do clipe) ao canal certo; troca de canal se o clipe mudou de trilha. */
  route(node: AudioNode, strip: StripId): void {
    if (this.routes.get(node) === strip) return;
    if (this.routes.has(node)) node.disconnect();
    node.connect(this.strip(strip).nodes.input);
    this.routes.set(node, strip);
  }

  /** Liga cada elemento ao seu canal e aplica volume, mudo/solo e pan do projeto. */
  apply(project: Project, elements: Iterable<[clipId: string, node: AudioNode]>): void {
    this.project = project;
    const strips = clipStrips(project);
    for (const [clipId, node] of elements) this.route(node, strips.get(clipId) ?? 'main');
    // Canais de trilhas que não existem mais.
    const wanted = new Set<StripId>([...mixerStrips(project).map((s) => s.id), ...strips.values()]);
    for (const [id, strip] of this.strips) {
      if (wanted.has(id)) continue;
      strip.nodes.output.disconnect();
      this.strips.delete(id);
    }
    const solo = anySolo(project);
    for (const [id, strip] of this.strips) strip.nodes.set(stripGain(project, id, solo), stripSettings(project, id).pan, true);
    this.master.gain.setTargetAtTime(masterGain(project), this.context.currentTime, 0.02);
  }

  /** Níveis do momento (o painel do mixer chama a cada quadro enquanto está aberto). */
  levels(): MixerLevels {
    const strips = new Map<StripId, Level>();
    for (const s of this.project ? mixerStrips(this.project) : []) {
      const strip = this.strips.get(s.id);
      strips.set(s.id, strip ? readLevel(strip.meters, this.buffer) : SILENT);
    }
    const master = readLevel(this.masterMeters, this.buffer);
    const k = readLevel(this.loudnessMeters, this.buffer);
    this.loudness.push(performance.now() / 1000, k.rms[0] ** 2 + k.rms[1] ** 2);
    return { strips, master, lufs: this.loudness.value() };
  }

  /** Zera a média da sonoridade (ao começar a tocar de novo). */
  resetLoudness(): void {
    this.loudness.reset();
  }

  private strip(id: StripId): Strip {
    let strip = this.strips.get(id);
    if (!strip) {
      const nodes = createStrip(this.context);
      nodes.output.connect(this.master);
      const [left, right] = nodes.sides;
      strip = { nodes, meters: [this.analyser(left), this.analyser(right)] };
      if (this.project) nodes.set(stripGain(this.project, id), stripSettings(this.project, id).pan);
      this.strips.set(id, strip);
    }
    return strip;
  }

  private analyser(source: AudioNode, output = 0): AnalyserNode {
    const analyser = this.context.createAnalyser();
    analyser.fftSize = FFT;
    source.connect(analyser, output);
    return analyser;
  }

  /** Par de analisadores (esquerda/direita) escutando um nó estéreo. */
  private tap(node: AudioNode): [AnalyserNode, AnalyserNode] {
    const splitter = this.context.createChannelSplitter(2);
    node.connect(splitter);
    return [this.analyser(splitter, 0), this.analyser(splitter, 1)];
  }
}

/** Multiplica dois polinômios (junta dois filtros em série num só). */
function convolve(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
}
