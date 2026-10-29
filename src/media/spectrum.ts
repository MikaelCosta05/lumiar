import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import { audioAt, layoutProject, type MediaItem, type Project, type TimelineLayout } from '../project/model';
import type { TextClip } from '../project/text';
import { fft } from './denoise';
import { elementDataReady } from './elementData';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Quadros de análise por segundo e faixas de frequência guardadas. */
const RATE = 30;
const BANDS = 64;
const WINDOW = 2048;

interface Spectrum {
  /** frames × BANDS, de 0 a 1 */
  data: Float32Array;
  frames: number;
}

const cache = new Map<string, Spectrum | 'loading' | 'failed'>();

/**
 * Espectro do arquivo inteiro (30× por segundo, 64 faixas de 40 Hz a 16 kHz, em escala de
 * decibéis): é o que faz as barras pularem com o som. Calculado uma vez por mídia.
 */
async function analyze(media: MediaItem): Promise<Spectrum> {
  const frames = Math.max(1, Math.ceil(media.duration * RATE));
  const data = new Float32Array(frames * BANDS);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media.file) });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return { data, frames };
    const sink = new AudioBufferSink(track);
    let sampleRate = 0;
    let edges: number[] = [];
    // Amostras ainda não analisadas (o começo é o instante `bufferStart`).
    let pending = new Float32Array(0);
    let bufferStart = 0;
    let frame = 0;
    const re = new Float64Array(WINDOW);
    const im = new Float64Array(WINDOW);
    const hann = Float64Array.from({ length: WINDOW }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WINDOW - 1)));
    for await (const { buffer, timestamp } of sink.buffers()) {
      if (!sampleRate) {
        sampleRate = buffer.sampleRate;
        bufferStart = timestamp;
        // Faixas em escala logarítmica (como o ouvido percebe).
        edges = Array.from({ length: BANDS + 1 }, (_, b) => Math.min(WINDOW / 2, Math.max(1, Math.round(((40 * Math.pow(16000 / 40, b / BANDS)) / sampleRate) * WINDOW))));
      }
      const mono = buffer.getChannelData(0);
      const joined = new Float32Array(pending.length + mono.length);
      joined.set(pending);
      joined.set(mono, pending.length);
      pending = joined;
      // Analisa todos os quadros cuja janela já chegou inteira.
      for (;;) {
        const center = Math.round((frame / RATE - bufferStart) * sampleRate);
        const start = center - WINDOW / 2;
        if (start + WINDOW > pending.length || frame >= frames) break;
        for (let i = 0; i < WINDOW; i++) {
          re[i] = (start + i >= 0 ? pending[start + i] : 0) * hann[i];
          im[i] = 0;
        }
        fft(re, im, false);
        for (let b = 0; b < BANDS; b++) {
          let peak = 0;
          for (let k = edges[b]; k <= Math.max(edges[b], edges[b + 1] - 1); k++) peak = Math.max(peak, re[k] * re[k] + im[k] * im[k]);
          const db = 10 * Math.log10(peak / (WINDOW * WINDOW) + 1e-12);
          // -75 dB = parado, -15 dB = no máximo; os agudos ganham um empurrão (têm menos energia).
          data[frame * BANDS + b] = Math.min(1, Math.max(0, (db + 75 + b * 0.35) / 60));
        }
        frame++;
      }
      // Guarda só o que ainda vai ser usado.
      const keepFrom = Math.max(0, Math.round((frame / RATE - bufferStart) * sampleRate) - WINDOW);
      if (keepFrom > 0) {
        pending = pending.slice(keepFrom);
        bufferStart += keepFrom / sampleRate;
      }
    }
  } finally {
    input.dispose();
  }
  return { data, frames };
}

function spectrumOf(media: MediaItem): Spectrum | null {
  const entry = cache.get(media.id);
  if (entry === undefined) {
    cache.set(media.id, 'loading');
    analyze(media)
      .then((s) => {
        cache.set(media.id, s);
        elementDataReady();
      })
      .catch(() => cache.set(media.id, 'failed'));
    return null;
  }
  return typeof entry === 'string' ? null : entry;
}

/** Espectro de uma mídia (calcula se ainda não existe): RATE quadros/s × BANDS faixas. */
export async function spectrumFor(media: MediaItem): Promise<Spectrum & { rate: number; bands: number }> {
  let entry = cache.get(media.id);
  if (!entry || typeof entry === 'string') {
    entry = await analyze(media);
    cache.set(media.id, entry);
  }
  return { ...entry, rate: RATE, bands: BANDS };
}

/** Espera a análise de todas as mídias com som (antes de exportar). */
export async function prepareSpectra(project: Project): Promise<void> {
  const media = project.media.filter((m) => m.hasAudio || m.kind === 'audio');
  await Promise.all(
    media.map(async (m) => {
      if (cache.get(m.id) && cache.get(m.id) !== 'loading') return;
      cache.set(m.id, 'loading');
      try {
        cache.set(m.id, await analyze(m));
      } catch {
        cache.set(m.id, 'failed');
      }
    }),
  );
}

let lastLayout: { project: Project; timeline: TimelineLayout } | null = null;

/** Nível de cada faixa (0 a 1) do som que toca no instante t, somando tudo que está soando. */
export function levelsAt(project: Project, t: number, bands: number): Float32Array {
  if (lastLayout?.project !== project) lastLayout = { project, timeline: layoutProject(project) };
  const out = new Float32Array(bands);
  for (const source of audioAt(project, lastLayout.timeline, t)) {
    const spectrum = spectrumOf(source.media);
    if (!spectrum || source.gain <= 0.001) continue;
    const gain = Math.min(1, source.gain);
    const f = source.sourceTime * RATE;
    // Média de 3 quadros vizinhos: movimento mais macio.
    for (let b = 0; b < bands; b++) {
      const from = Math.floor((b / bands) * BANDS);
      const to = Math.max(from + 1, Math.floor(((b + 1) / bands) * BANDS));
      let sum = 0;
      let n = 0;
      for (let d = -1; d <= 1; d++) {
        const fi = Math.round(f) + d;
        if (fi < 0 || fi >= spectrum.frames) continue;
        for (let k = from; k < to; k++) {
          sum += spectrum.data[fi * BANDS + k];
          n++;
        }
      }
      if (n) out[b] = Math.max(out[b], (sum / n) * (0.4 + 0.6 * gain));
    }
  }
  return out;
}

/** Barras, espelho, círculo ou linha que pulam com o som do projeto. */
export function drawWave(ctx: Ctx, clip: TextClip, size: number, W: number, project: Project | null, time: number): void {
  const wave = clip.wave;
  if (!wave) return;
  const levels = project ? levelsAt(project, time, wave.bands) : new Float32Array(wave.bands).map((_, i) => 0.3 + 0.3 * Math.sin(i));
  const color = clip.style.color;
  const grad = (x0: number, y0: number, x1: number, y1: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, color);
    g.addColorStop(1, wave.color2);
    return g;
  };
  ctx.lineCap = 'round';
  if (wave.kind === 'circle') {
    const r = size * 1.3;
    ctx.strokeStyle = grad(-r, -r, r, r);
    ctx.lineWidth = Math.max(2, ((Math.PI * 2 * r) / wave.bands) * 0.55);
    for (let i = 0; i < wave.bands; i++) {
      // Espelhado: as duas metades do círculo mostram as mesmas faixas (fica simétrico).
      const level = levels[i < wave.bands / 2 ? i * 2 : (wave.bands - 1 - i) * 2 + 1] ?? levels[i];
      const a = (i / wave.bands) * Math.PI * 2 - Math.PI / 2;
      const len = size * 0.15 + level * size * 1.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.lineTo(Math.cos(a) * (r + len), Math.sin(a) * (r + len));
      ctx.stroke();
    }
    ctx.globalAlpha *= 0.25;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const width = W * 0.8;
  const step = width / wave.bands;
  const x0 = -width / 2;
  if (wave.kind === 'line') {
    ctx.strokeStyle = grad(x0, 0, -x0, 0);
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= wave.bands; i++) {
      const level = levels[Math.min(wave.bands - 1, i)];
      const y = (i % 2 ? -1 : 1) * level * size * 1.2;
      const x = x0 + i * step;
      if (i === 0) ctx.moveTo(x, 0);
      else ctx.quadraticCurveTo(x - step / 2, y, x, 0);
    }
    ctx.stroke();
    return;
  }
  // Barras (de baixo para cima) ou espelho (crescem para cima e para baixo a partir do meio).
  const mirror = wave.kind === 'mirror';
  ctx.fillStyle = grad(0, size * 1.5, 0, -size * 1.5);
  const barW = Math.max(1.5, step * 0.62);
  for (let i = 0; i < wave.bands; i++) {
    const h = Math.max(barW, levels[i] * size * 3);
    const x = x0 + i * step + (step - barW) / 2;
    ctx.beginPath();
    if (mirror) ctx.roundRect(x, -h / 2, barW, h, barW / 2);
    else ctx.roundRect(x, size * 1.5 - h, barW, h, barW / 2);
    ctx.fill();
  }
}
