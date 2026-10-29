import { Copy, Download, ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { loadSegmenter, segmentFrame } from '../media/segment';
import { t } from '../i18n';
import { Button, cx, IconButton, Segmented, SwitchRow } from './kit';
import { LabeledSlider } from './Inspector';

interface Options {
  title: string;
  subtitle: string;
  color: string;
  accent: string;
  position: 'top' | 'bottom' | 'left';
  outline: boolean;
  outlineColor: string;
  dimBackground: boolean;
  boost: number;
  sticker: string;
}

const STICKERS = ['', '😱', '🔥', '🤯', '😂', '💀', '👀', '✅', '❌', '💯', '🏆', '👉'];

/**
 * Capa (thumbnail) a partir do quadro atual: texto grande com contorno, a pessoa destacada
 * com um contorno colorido (recortada pela IA), fundo escurecido e um sticker.
 */
export function ThumbnailDialog({ frame, vertical, onClose, notify }: { frame: ImageBitmap; vertical: boolean; onClose: () => void; notify: (text: string, error?: boolean) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [o, setO] = useState<Options>({
    title: t('VOCÊ NÃO VAI ACREDITAR'),
    subtitle: '',
    color: '#ffffff',
    accent: '#ffe14d',
    position: vertical ? 'top' : 'left',
    outline: true,
    outlineColor: '#ffffff',
    dimBackground: true,
    boost: 0.25,
    sticker: '😱',
  });
  const set = (patch: Partial<Options>) => setO((v) => ({ ...v, ...patch }));
  const W = vertical ? 1080 : 1280;
  const H = vertical ? 1920 : 720;

  useEffect(() => {
    void loadSegmenter()
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    // O quadro cobrindo a capa inteira.
    const scale = Math.max(W / frame.width, H / frame.height);
    const dw = frame.width * scale;
    const dh = frame.height * scale;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    const look = `saturate(${1 + o.boost * 1.5}) contrast(${1 + o.boost * 0.6}) brightness(${1 + o.boost * 0.15})`;
    const mask = ready && (o.outline || o.dimBackground) ? segmentFrame(frame, frame.width, frame.height, 'capa') : null;

    ctx.filter = o.dimBackground && mask ? `${look} brightness(0.55) blur(2px)` : look;
    ctx.drawImage(frame, dx, dy, dw, dh);
    ctx.filter = 'none';

    if (mask) {
      // A pessoa recortada: a máscara vira o canal de transparência.
      const alpha = document.createElement('canvas');
      alpha.width = mask.width;
      alpha.height = mask.height;
      const actx = alpha.getContext('2d')!;
      const img = mask.getContext('2d')!.getImageData(0, 0, mask.width, mask.height);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i + 3] = img.data[i] > 140 ? 255 : img.data[i] > 90 ? (img.data[i] - 90) * 5 : 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      }
      actx.putImageData(img, 0, 0);
      const person = document.createElement('canvas');
      person.width = W;
      person.height = H;
      const pctx = person.getContext('2d')!;
      pctx.filter = look;
      pctx.drawImage(frame, dx, dy, dw, dh);
      pctx.filter = 'none';
      pctx.globalCompositeOperation = 'destination-in';
      pctx.drawImage(alpha, dx, dy, dw, dh);
      if (o.outline) {
        // Contorno: a silhueta pintada, desenhada um pouco deslocada em volta.
        const silhouette = document.createElement('canvas');
        silhouette.width = W;
        silhouette.height = H;
        const sctx = silhouette.getContext('2d')!;
        sctx.drawImage(alpha, dx, dy, dw, dh);
        sctx.globalCompositeOperation = 'source-in';
        sctx.fillStyle = o.outlineColor;
        sctx.fillRect(0, 0, W, H);
        const r = Math.round(Math.min(W, H) * 0.012);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = r * 3;
        for (let a = 0; a < 16; a++) ctx.drawImage(silhouette, Math.cos((a / 16) * Math.PI * 2) * r, Math.sin((a / 16) * Math.PI * 2) * r);
        ctx.restore();
      }
      ctx.drawImage(person, 0, 0);
    }

    // Texto grande com contorno grosso (estilo YouTube).
    const lines = o.title.toUpperCase().split('\n').flatMap((line) => wrap(ctx, line, o.position === 'left' ? W * 0.5 : W * 0.9, H));
    const size = Math.min(H * (vertical ? 0.075 : 0.14), (W * (o.position === 'left' ? 0.5 : 0.9)) / Math.max(4, Math.max(...lines.map((l) => l.length)) * 0.5));
    ctx.font = `400 ${size}px "Bebas Neue", "Montserrat Variable", sans-serif`;
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    const lineH = size * 0.95;
    const blockH = lines.length * lineH + (o.subtitle ? size * 0.7 : 0);
    const x = o.position === 'left' ? W * 0.05 : W / 2;
    ctx.textAlign = o.position === 'left' ? 'left' : 'center';
    let y = o.position === 'bottom' ? H - blockH - H * 0.06 : o.position === 'left' ? (H - blockH) / 2 : H * 0.06;
    lines.forEach((line, i) => {
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(line, x, y);
      ctx.fillStyle = i === lines.length - 1 && lines.length > 1 ? o.accent : o.color;
      ctx.fillText(line, x, y);
      y += lineH;
    });
    if (o.subtitle) {
      const sub = size * 0.55;
      ctx.font = `800 ${sub}px "Montserrat Variable", sans-serif`;
      const w = ctx.measureText(o.subtitle).width;
      const bx = o.position === 'left' ? x : x - w / 2;
      ctx.fillStyle = o.accent;
      ctx.fillRect(bx - sub * 0.3, y + sub * 0.1, w + sub * 0.6, sub * 1.3);
      ctx.fillStyle = '#111111';
      ctx.fillText(o.subtitle, x, y + sub * 0.25);
    }
    if (o.sticker) {
      const s = Math.min(W, H) * 0.22;
      ctx.font = `${s}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(o.position === 'left' ? W * 0.88 : W * 0.85, o.position === 'bottom' ? H * 0.16 : H * 0.8);
      ctx.rotate(-0.15);
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = s * 0.15;
      ctx.fillText(o.sticker, 0, 0);
      ctx.restore();
    }
  }, [o, ready, frame, W, H, vertical]);

  const blob = () => new Promise<Blob>((resolve) => ref.current!.toBlob((b) => resolve(b!), 'image/png'));

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[calc(100vh-48px)] w-[min(1100px,calc(100vw-48px))] animate-pop-in gap-5 rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <canvas ref={ref} className={cx('max-h-[calc(100vh-110px)] max-w-full rounded-lg shadow-xl ring-1 ring-white/10', vertical ? 'h-[calc(100vh-110px)]' : 'w-full')} />
        </div>
        <div className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
          <div className="flex items-center gap-2">
            <ImagePlus size={17} className="text-accent" />
            <h2 className="flex-1 text-[15px] font-semibold">{t('Criar capa')}</h2>
            <IconButton label={t('Fechar')} onClick={onClose}>
              <X size={15} />
            </IconButton>
          </div>
          <p className="-mt-1 text-[11px] leading-snug text-faint">
            {t('Feita a partir do quadro que está no cursor ({width}×{height}). A última linha do título fica na cor de destaque (use Enter para quebrar).', {
              width: W,
              height: H,
            })}
          </p>
          <textarea className="field h-auto min-h-16 py-2 leading-snug" rows={2} value={o.title} onChange={(e) => set({ title: e.target.value })} />
          <input className="field" placeholder={t('Faixa embaixo (opcional)')} value={o.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
          <div className="flex items-center gap-2 text-xs text-dim">
            {t('Cores')}
            <input type="color" value={o.color} onChange={(e) => set({ color: e.target.value })} className="size-7 cursor-pointer rounded bg-transparent" title={t('Texto')} />
            <input type="color" value={o.accent} onChange={(e) => set({ accent: e.target.value })} className="size-7 cursor-pointer rounded bg-transparent" title={t('Destaque')} />
          </div>
          <Segmented
            value={o.position}
            onChange={(position) => set({ position })}
            options={[
              { value: 'top', label: t('Em cima') },
              { value: 'left', label: t('Ao lado') },
              { value: 'bottom', label: t('Embaixo') },
            ]}
          />
          <SwitchRow checked={o.outline} onChange={(outline) => set({ outline })} label={t('Contorno na pessoa')} />
          {o.outline && (
            <div className="-mt-1 flex items-center gap-2 text-xs text-dim">
              {t('Cor do contorno')}
              {['#ffffff', '#ffe14d', '#ff3b3b', '#22d3ee'].map((c) => (
                <button key={c} onClick={() => set({ outlineColor: c })} className={cx('size-5 rounded ring-1 ring-white/20', o.outlineColor === c && 'ring-2 ring-accent')} style={{ background: c }} />
              ))}
            </div>
          )}
          <SwitchRow checked={o.dimBackground} onChange={(dimBackground) => set({ dimBackground })} label={t('Escurecer e desfocar o fundo')} />
          <LabeledSlider label={t('Cor mais forte')} value={o.boost} display={`${Math.round(o.boost * 100)}%`} min={0} max={1} step={0.01} onChange={(boost) => set({ boost })} />
          <div>
            <p className="mb-1 text-xs text-dim">{t('Sticker')}</p>
            <div className="flex flex-wrap gap-1">
              {STICKERS.map((s) => (
                <button
                  key={s || 'nenhum'}
                  onClick={() => set({ sticker: s })}
                  className={cx('flex size-8 items-center justify-center rounded-lg border text-lg', o.sticker === s ? 'border-accent bg-accent/15' : 'border-line hover:border-line-strong')}
                >
                  {s || <X size={13} className="text-faint" />}
                </button>
              ))}
            </div>
          </div>
          {!ready && <p className="text-[11px] text-faint">{t('Carregando o recorte da pessoa…')}</p>}
          <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
            <Button
              icon={<Copy size={14} />}
              onClick={async () => {
                try {
                  await navigator.clipboard.write([new ClipboardItem({ 'image/png': await blob() })]);
                  notify(t('Capa copiada.'));
                } catch {
                  notify(t('Não foi possível copiar a imagem.'), true);
                }
              }}
            >
              {t('Copiar')}
            </Button>
            <Button
              variant="primary"
              icon={<Download size={14} />}
              onClick={async () => {
                const url = URL.createObjectURL(await blob());
                const a = document.createElement('a');
                a.href = url;
                a.download = 'capa.png';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 10_000);
              }}
            >
              {t('Baixar PNG')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Quebra a linha para caber na largura (o tamanho da letra é ajustado depois). */
function wrap(ctx: CanvasRenderingContext2D, line: string, width: number, height: number): string[] {
  ctx.font = `400 ${height * 0.12}px "Bebas Neue", sans-serif`;
  const words = line.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > width) {
      out.push(current);
      current = word;
    } else current = next;
  }
  if (current) out.push(current);
  return out.length ? out : [''];
}
