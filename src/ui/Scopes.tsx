import { useEffect, useRef, useState, type RefObject } from 'react';
import { Segmented } from './kit';
import { t } from '../i18n';

type Kind = 'histogram' | 'waveform' | 'vectorscope';

const W = 256;
const H = 140;
/** Tamanho da cópia reduzida do quadro usada nas contas. */
const SW = 192;
const SH = 108;

/**
 * Gráficos de cor, como nos programas profissionais, lendo o quadro que está no preview:
 * - Histograma: quanto da imagem tem cada brilho (encostado na direita = estourado; na esquerda = preto).
 * - Forma de onda: o brilho de cada coluna da imagem, de 0 (embaixo) a 100% (em cima).
 * - Vetorscópio: para onde as cores puxam; a linha de pele mostra onde os rostos devem ficar.
 */
export function Scopes({ source }: { source: RefObject<HTMLCanvasElement | null> }) {
  const [kind, setKind] = useState<Kind>('histogram');
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const small = document.createElement('canvas');
    small.width = SW;
    small.height = SH;
    const sctx = small.getContext('2d', { willReadFrequently: true })!;
    const timer = setInterval(() => {
      const canvas = source.current;
      const ctx = ref.current?.getContext('2d');
      if (!canvas || !ctx || !canvas.width) return;
      sctx.drawImage(canvas, 0, 0, SW, SH);
      const { data } = sctx.getImageData(0, 0, SW, SH);
      ctx.fillStyle = '#0b0c10';
      ctx.fillRect(0, 0, W, H);
      if (kind === 'histogram') drawHistogram(ctx, data);
      else if (kind === 'waveform') drawWaveform(ctx, data);
      else drawVectorscope(ctx, data);
    }, 160);
    return () => clearInterval(timer);
  }, [kind, source]);

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-20 rounded-xl border border-line bg-black/80 p-2 shadow-2xl backdrop-blur">
      <div className="mb-1.5">
        <Segmented
          options={[
            { value: 'histogram', label: t('Histograma') },
            { value: 'waveform', label: t('Forma de onda') },
            { value: 'vectorscope', label: t('Vetorscópio') },
          ]}
          value={kind}
          onChange={setKind}
        />
      </div>
      <canvas ref={ref} width={W} height={H} className="block rounded-md" />
    </div>
  );
}

function drawHistogram(ctx: CanvasRenderingContext2D, data: Uint8ClampedArray) {
  const bins = [new Float32Array(256), new Float32Array(256), new Float32Array(256), new Float32Array(256)];
  for (let i = 0; i < data.length; i += 4) {
    bins[0][data[i]]++;
    bins[1][data[i + 1]]++;
    bins[2][data[i + 2]]++;
    bins[3][Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])]++;
  }
  // Escala pela maior coluna (sem contar as pontas, que costumam dominar).
  let max = 1;
  for (const b of bins) for (let v = 2; v < 254; v++) max = Math.max(max, b[v]);
  ctx.globalCompositeOperation = 'lighter';
  const colors = ['rgba(255,70,70,0.55)', 'rgba(70,255,110,0.55)', 'rgba(80,140,255,0.6)', 'rgba(220,220,220,0.35)'];
  bins.forEach((b, c) => {
    ctx.fillStyle = colors[c];
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let v = 0; v < 256; v++) ctx.lineTo((v / 255) * W, H - Math.min(1, b[v] / max) * (H - 6));
    ctx.lineTo(W, H);
    ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';
  // Avisos de estouro nas pontas.
  const total = data.length / 4;
  if (bins[3][255] / total > 0.02) {
    ctx.fillStyle = '#ff5c72';
    ctx.fillRect(W - 3, 0, 3, H);
  }
  if (bins[3][0] / total > 0.02) {
    ctx.fillStyle = '#4cc2ff';
    ctx.fillRect(0, 0, 3, H);
  }
}

function drawWaveform(ctx: CanvasRenderingContext2D, data: Uint8ClampedArray) {
  const img = ctx.createImageData(W, H);
  const acc = new Float32Array(W * H);
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      const i = (y * SW + x) * 4;
      const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      const px = Math.floor((x / SW) * W);
      const py = Math.round((1 - l) * (H - 1));
      acc[py * W + px] += 1;
    }
  }
  for (let k = 0; k < acc.length; k++) {
    const v = Math.min(255, acc[k] * 70);
    img.data[k * 4] = v * 0.55;
    img.data[k * 4 + 1] = v;
    img.data[k * 4 + 2] = v * 0.6;
    img.data[k * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // Linhas de referência: 0, 50 e 100%.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '9px sans-serif';
  for (const p of [0, 0.5, 1]) {
    const y = Math.round((1 - p) * (H - 1)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.fillText(`${p * 100}`, 2, Math.min(H - 2, Math.max(9, y - 2)));
  }
}

function drawVectorscope(ctx: CanvasRenderingContext2D, data: Uint8ClampedArray) {
  const cx = W / 2;
  const cy = H / 2;
  const r = H / 2 - 6;
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i] / 255;
    const G = data[i + 1] / 255;
    const B = data[i + 2] / 255;
    const cb = -0.1146 * R - 0.3854 * G + 0.5 * B;
    const cr = 0.5 * R - 0.4542 * G - 0.0458 * B;
    const x = Math.round(cx + cb * 2 * r);
    const y = Math.round(cy - cr * 2 * r);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = (y * W + x) * 4;
    img.data[k] = Math.min(255, img.data[k] + data[i] * 0.25 + 18);
    img.data[k + 1] = Math.min(255, img.data[k + 1] + data[i + 1] * 0.25 + 18);
    img.data[k + 2] = Math.min(255, img.data[k + 2] + data[i + 2] * 0.25 + 18);
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();
  // Linha de tom de pele (~123°): rostos bem corrigidos ficam em cima dela.
  ctx.strokeStyle = 'rgba(255,190,140,0.6)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos((-123 * Math.PI) / 180) * r, cy + Math.sin((-123 * Math.PI) / 180) * r);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,190,140,0.8)';
  ctx.font = '9px sans-serif';
  ctx.fillText(t('pele'),cx + Math.cos((-123 * Math.PI) / 180) * r - 22, cy + Math.sin((-123 * Math.PI) / 180) * r + 4);
}
