import { Check, Crosshair, Eye, EyeOff, LoaderCircle, ScanLine, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { homography, invert, isConvexQuad, project as applyH, UNIT_SQUARE } from '../engine/homography';
import { t } from '../i18n';
import { objectFrame } from '../media/objectSelect';
import { matchCut, trackCorners, trackMaskPoint, type TrackingContext } from '../app/trackingTools';
import { correctCorners, cornersAt, defaultCorners, type CornerPin } from '../project/cornerPin';
import { layerToSource, maskMotion, moveMask } from '../project/maskFollow';
import { maskAt, resolveFrame, speedOf, updateOverlayClip, type Project, type TimelineLayout } from '../project/model';
import { Button, cx } from './kit';
import { requestTracking, useTrackingRequest } from './trackingStore';

interface Props {
  project: Project;
  timeline: TimelineLayout;
  /** Cursor da timeline */
  time: number;
  setProject: (update: (p: Project) => Project) => void;
  notify: (text: string, error?: boolean) => void;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** "Mover o resto junto" ligado */
  ripple: boolean;
}

/**
 * Ferramentas de rastreamento em cima do preview: marcar os cantos da tela trocada, clicar no ponto
 * que a forma acompanha e o "trabalhando…" do rastreamento e do corte casado.
 */
export function TrackingTools(props: Props) {
  const request = useTrackingRequest();
  const [progress, setProgress] = useState<string | null>(null);
  // Os trabalhos demoram: sempre leem o projeto e o cursor mais recentes.
  const latest = useRef(props);
  latest.current = props;
  const ctx: TrackingContext = {
    project: () => latest.current.project,
    setProject: (update) => latest.current.setProject(update),
    notify: (text, error) => latest.current.notify(text, error),
    progress: setProgress,
    ripple: () => latest.current.ripple,
  };

  // Pedidos que não abrem nada no preview: rodam direto.
  useEffect(() => {
    if (!request || progress) return;
    if (request.kind === 'matchCut') {
      requestTracking(null);
      void matchCut(ctx, request.index);
    } else if (request.kind === 'maskCenter') {
      requestTracking(null);
      const target = maskTarget(latest.current, request.id);
      if (typeof target === 'string') latest.current.notify(target, true);
      else void trackMaskPoint(ctx, request.id, target.sourceTime, target.center);
    }
  }, [request]);

  return (
    <>
      {request?.kind === 'corners' && !progress && <CornerEditor key={request.id} overlayId={request.id} {...props} ctx={ctx} />}
      {request?.kind === 'maskPoint' && !progress && <MaskPointPicker key={request.id} overlayId={request.id} {...props} ctx={ctx} />}
      {progress && (
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-xs text-dim backdrop-blur">
          <LoaderCircle size={14} className="animate-spin text-accent" />
          {progress}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Sobreposição no cursor

/** A sobreposição no cursor como está no quadro (posição, cantos da tela trocada, forma já andando). */
function overlayAt(props: Pick<Props, 'project' | 'timeline' | 'time'>, id: string) {
  const layout = props.timeline.overlays.find((l) => l.clip.id === id);
  if (!layout) return null;
  const time = Math.min(layout.start + layout.length - 0.001, Math.max(layout.start, props.time));
  const frame = resolveFrame(props.project, props.timeline, time);
  const active = frame.overlays.find((o) => o.active.layout.clip.id === id);
  if (!active) return null;
  return { layout, time, active, sourceTime: active.active.sourceTime };
}

/** Da tela (0 a 1) para dentro da camada (0 a 1): o contrário do que o renderizador faz. */
function screenToLayer(o: NonNullable<ReturnType<typeof overlayAt>>, project: Project, p: { x: number; y: number }): { x: number; y: number } | null {
  if (o.active.corners) {
    const h = homography(UNIT_SQUARE, o.active.corners);
    const back = h && invert(h);
    return back ? applyH(back, p.x, p.y) : null;
  }
  const { clip, media } = o.layout;
  const tf = o.active.transform;
  const ratio = project.width / project.height;
  const sideways = clip.turn === 90 || clip.turn === 270;
  const mediaRatio = (sideways ? media.height / media.width : media.width / media.height) || ratio;
  const fit = mediaRatio > ratio ? [1, ratio / mediaRatio] : [mediaRatio / ratio, 1];
  const half = [0.5 * fit[0] * tf.scale * ratio, 0.5 * fit[1] * tf.scale];
  const angle = (tf.rotation * Math.PI) / 180;
  const x = (p.x - tf.x) * ratio;
  const y = p.y - tf.y;
  const dx = Math.cos(-angle) * x - Math.sin(-angle) * y;
  const dy = Math.sin(-angle) * x + Math.cos(-angle) * y;
  return { x: dx / (2 * half[0]) + 0.5, y: dy / (2 * half[1]) + 0.5 };
}

/** O centro da forma da sobreposição no cursor, na imagem da mídia (para rastrear sem clicar). Texto = erro. */
function maskTarget(props: Props, id: string): { sourceTime: number; center: { x: number; y: number } } | string {
  const o = overlayAt(props, id);
  if (!o) return t('Pare o cursor em cima da sobreposição e tente de novo.');
  const { clip, media } = o.layout;
  const tf = clip.transform;
  const drawn = maskAt(tf.mask, o.active.active.clipTime);
  if (!drawn) return t('Desenhe ou escolha uma forma primeiro.');
  const shown = moveMask(drawn, maskMotion(tf.maskFollow, clip, media, o.sourceTime));
  const pts = shown.shape === 'path' ? (shown.points ?? []) : [];
  if (shown.shape === 'path' && pts.length < 6) return t('Desenhe ou escolha uma forma primeiro.');
  let local = { x: shown.x, y: shown.y };
  if (pts.length) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]);
      x1 = Math.max(x1, pts[i]);
      y0 = Math.min(y0, pts[i + 1]);
      y1 = Math.max(y1, pts[i + 1]);
    }
    local = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  }
  return { sourceTime: o.sourceTime, center: layerToSource(local, clip, media, o.sourceTime) };
}

/** O SVG/caixa fica exatamente em cima do canvas do preview (que muda de tamanho com a janela). */
function useCanvasBox(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const [box, setBox] = useState({ left: 0, top: 0, width: 1, height: 1 });
  useEffect(() => {
    const update = () => {
      const c = canvasRef.current;
      if (c) setBox({ left: c.offsetLeft, top: c.offsetTop, width: c.offsetWidth, height: c.offsetHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [canvasRef]);
  return box;
}

function useEscape(close: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

// ---------------------------------------------------------------- Ponto que a forma acompanha

function MaskPointPicker({ overlayId, ctx, ...props }: Props & { overlayId: string; ctx: TrackingContext }) {
  const box = useCanvasBox(props.canvasRef);
  const close = () => requestTracking(null);
  useEscape(close);
  return (
    <>
      <div
        className="absolute z-20 cursor-crosshair ring-2 ring-amber"
        style={box}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const r = e.currentTarget.getBoundingClientRect();
          const screen = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
          const o = overlayAt(props, overlayId);
          const local = o && screenToLayer(o, props.project, screen);
          if (!o || !local || local.x < 0 || local.x > 1 || local.y < 0 || local.y > 1) {
            props.notify(t('Clique em cima da sobreposição.'), true);
            return;
          }
          close();
          void trackMaskPoint(ctx, overlayId, o.sourceTime, layerToSource(local, o.layout.clip, o.layout.media, o.sourceTime));
        }}
      />
      <Banner>
        <span className="text-dim">{t('Clique no ponto do vídeo da sobreposição que a forma deve acompanhar')}</span>
        <Button className="h-7 text-xs" icon={<X size={12} />} onClick={close}>
          {t('Cancelar')}
        </Button>
      </Banner>
    </>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-accent/50 bg-panel-2/95 py-1 pl-4 pr-1 text-xs shadow-2xl backdrop-blur">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Cantos da tela trocada

const CORNER_COLORS = ['#ffd23f', '#3ddc97', '#4cc2ff', '#ff5c72'];

/** CSS matrix3d que deita um elemento de w×h px dentro dos cantos (px). */
function cssWarp(corners: number[], w: number, h: number): string | null {
  const m = homography(UNIT_SQUARE, corners);
  if (!m) return null;
  const [a, b, c, d, e, f, g, hh, i] = m;
  return `matrix3d(${[a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, i].join(',')})`;
}

function CornerEditor({ overlayId, ctx, ...props }: Props & { overlayId: string; ctx: TrackingContext }) {
  const close = () => requestTracking(null);
  // O clipe de baixo e o instante ficam fixos enquanto o editor está aberto.
  const [opened] = useState(() => {
    const overlay = props.timeline.overlays.find((l) => l.clip.id === overlayId);
    if (!overlay || overlay.media.kind === 'audio') return null;
    const time = Math.min(overlay.start + overlay.length - 0.001, Math.max(overlay.start, props.time));
    const pin = overlay.clip.cornerPin;
    const under = (l: (typeof props.timeline.clips)[number]) => time >= l.start && time < l.start + l.length && l.media.kind !== 'audio';
    const below = props.timeline.clips.find((l) => l.clip.id === pin?.clipId && under(l)) ?? props.timeline.clips.find(under);
    if (!below) return null;
    const sourceTime = below.clip.trimIn + (time - below.start) * speedOf(below.clip);
    const corners = pin && pin.clipId === below.clip.id ? cornersAt(pin, sourceTime) : defaultCorners(below.media, overlay.media);
    return { overlay, below, sourceTime: Math.round(sourceTime * 1000) / 1000, corners, pin: pin?.clipId === below.clip.id ? pin : undefined };
  });
  const [corners, setCorners] = useState<number[]>(opened?.corners ?? []);
  const [image, setImage] = useState<ImageData | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  useEscape(close);

  useEffect(() => {
    if (!opened) {
      props.notify(t('Pare o cursor num ponto em que a sobreposição fica por cima de um clipe da trilha principal.'), true);
      close();
      return;
    }
    let alive = true;
    objectFrame(opened.below.media, opened.sourceTime)
      .then((frame) => alive && setImage(frame))
      .catch((error) => {
        props.notify(t('Não foi possível ler esse quadro: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
        close();
      });
    return () => {
      alive = false;
    };
  }, [opened]);

  // O quadro ocupa o maior espaço possível do preview, sem distorcer.
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || !image) return;
    const update = () => {
      const scale = Math.max(0.01, Math.min((el.clientWidth - 48) / image.width, (el.clientHeight - 120) / image.height));
      setBox({ width: Math.round(image.width * scale), height: Math.round(image.height * scale) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [image]);

  const frameCanvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = frameCanvas.current;
    if (!c || !image) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d')!.putImageData(image, 0, 0);
  }, [image]);

  if (!opened) return null;
  const valid = isConvexQuad(corners);
  const px = corners.map((v, i) => v * (i % 2 === 0 ? box.width : box.height));
  const warp = valid && box.width > 1 ? cssWarp(px, box.width, box.height) : null;
  const tracked = !!opened.pin?.track?.length;
  const isVideo = opened.below.media.kind === 'video';

  const startDrag = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = ((e.currentTarget as SVGGElement).ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      // Um canto pode ficar um pouco fora do quadro (tela cortada pela borda).
      const x = Math.min(1.25, Math.max(-0.25, (ev.clientX - rect.left) / rect.width));
      const y = Math.min(1.25, Math.max(-0.25, (ev.clientY - rect.top) / rect.height));
      setCorners((c) => c.map((v, k) => (k === index * 2 ? x : k === index * 2 + 1 ? y : v)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const save = (pin: CornerPin | undefined) => props.setProject((p) => updateOverlayClip(p, overlayId, (c) => ({ ...c, cornerPin: pin })));
  const base: CornerPin = { clipId: opened.below.clip.id, corners, at: opened.sourceTime };

  return (
    <div ref={area} className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 backdrop-blur-sm">
      {!image ? (
        <div className="flex items-center gap-2 text-xs text-dim">
          <LoaderCircle size={14} className="animate-spin text-accent" />
          {t('Abrindo o quadro…')}
        </div>
      ) : (
        <div className="relative mt-12 rounded-md shadow-2xl ring-1 ring-white/10" style={box}>
          <canvas ref={frameCanvas} className="absolute inset-0 size-full rounded-md" />
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
            {showOverlay && warp && opened.overlay.media.thumbnail && (
              <img
                src={opened.overlay.media.thumbnail}
                alt=""
                className="absolute left-0 top-0 max-w-none opacity-80"
                style={{ width: box.width, height: box.height, transformOrigin: '0 0', transform: warp }}
              />
            )}
          </div>
          <svg className="absolute inset-0 size-full overflow-visible">
            <polygon
              points={[0, 1, 2, 3].map((k) => `${px[k * 2]},${px[k * 2 + 1]}`).join(' ')}
              fill={showOverlay && warp ? 'none' : 'rgba(111,125,255,0.18)'}
              stroke={valid ? '#8b96ff' : '#ff5c72'}
              strokeWidth={2}
            />
            {[0, 1, 2, 3].map((k) => (
              <g key={k} className="cursor-move" onPointerDown={(e) => startDrag(k, e)}>
                <circle cx={px[k * 2]} cy={px[k * 2 + 1]} r={14} fill="transparent" />
                <circle cx={px[k * 2]} cy={px[k * 2 + 1]} r={7} fill={CORNER_COLORS[k]} stroke="#111" strokeWidth={1.5} />
                <line x1={px[k * 2] - 3} x2={px[k * 2] + 3} y1={px[k * 2 + 1]} y2={px[k * 2 + 1]} stroke="#111" strokeWidth={1} />
                <line x1={px[k * 2]} x2={px[k * 2]} y1={px[k * 2 + 1] - 3} y2={px[k * 2 + 1] + 3} stroke="#111" strokeWidth={1} />
              </g>
            ))}
          </svg>
        </div>
      )}

      <Banner>
        <span className={cx(valid ? 'text-dim' : 'text-danger')}>
          {valid
            ? tracked
              ? t('Ajuste os cantos neste quadro. "Corrigir aqui" muda só em volta deste momento; "Rastrear de novo" refaz o rastro a partir daqui.')
              : t('Arraste os 4 cantos até os cantos da tela (ou quadro, placa) no vídeo de baixo.')
            : t('Os cantos se cruzaram: arraste para formar um quadrilátero.')}
        </span>
        <Button className="h-7 text-xs" icon={showOverlay ? <EyeOff size={12} /> : <Eye size={12} />} onClick={() => setShowOverlay((v) => !v)}>
          {showOverlay ? t('Esconder a sobreposição') : t('Ver a sobreposição')}
        </Button>
        {opened.pin && (
          <Button
            className="h-7 text-xs"
            icon={<Trash2 size={12} />}
            onClick={() => {
              save(undefined);
              close();
            }}
          >
            {t('Desfazer a troca de tela')}
          </Button>
        )}
        <Button className="h-7 text-xs" icon={<X size={12} />} onClick={close}>
          {t('Cancelar')}
        </Button>
        {tracked && (
          <Button
            className="h-7 text-xs"
            icon={<Check size={12} />}
            disabled={!valid}
            onClick={() => {
              save(correctCorners(opened.pin!, opened.sourceTime, corners));
              close();
            }}
          >
            {t('Corrigir aqui')}
          </Button>
        )}
        {!tracked && (
          <Button
            className="h-7 text-xs"
            icon={<Check size={12} />}
            disabled={!valid}
            onClick={() => {
              save(base);
              close();
            }}
          >
            {t('Usar sem rastrear')}
          </Button>
        )}
        {isVideo && (
          <Button
            variant="primary"
            className="h-7 text-xs"
            icon={tracked ? <ScanLine size={12} /> : <Crosshair size={12} />}
            disabled={!valid}
            onClick={() => {
              close();
              void trackCorners(ctx, overlayId, opened.below.clip.id, opened.sourceTime, corners);
            }}
          >
            {tracked ? t('Rastrear de novo daqui') : t('Rastrear os cantos')}
          </Button>
        )}
      </Banner>
    </div>
  );
}
