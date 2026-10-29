import { Check, Eraser, LassoSelect, LoaderCircle, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t, tc } from '../i18n';
import { maskForPoints, objectFrame, propagateObject } from '../media/objectSelect';
import { speedOf, updateClip, updateOverlayClip, type Project, type TimelineLayout, type VideoClip } from '../project/model';
import { maskSize, maskStats, togglePoint, type ObjectPoint } from '../project/objectMask';
import { Button, cx, SectionTitle, Segmented } from './kit';
import { startObjectPick, stopObjectPick, useObjectPick, type ObjectPickTarget } from './objectPick';

/**
 * Selecionar qualquer objeto com cliques, em cima do preview: o quadro do clipe no cursor aparece
 * sozinho (sem efeitos nem posição), clique esquerdo marca o objeto, direito marca o que não é, e a
 * IA mostra a máscara na hora. "Aplicar" segue o objeto pelo clipe todo.
 */
export function ObjectPicker(props: {
  project: Project;
  timeline: TimelineLayout;
  /** Cursor da timeline */
  time: number;
  setProject: (update: (p: Project) => Project) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const target = useObjectPick();
  if (!target) return null;
  return <Picker key={`${target.kind}:${target.id}`} target={target} {...props} />;
}

/** Cores da máscara no quadro: preenchimento e contorno. */
const FILL = [111, 125, 255, 120];
const EDGE = [255, 255, 255, 235];

function Picker({
  target,
  timeline,
  time,
  setProject,
  notify,
}: {
  target: ObjectPickTarget;
  timeline: TimelineLayout;
  time: number;
  setProject: (update: (p: Project) => Project) => void;
  notify: (text: string, error?: boolean) => void;
}) {
  // O clipe e o instante ficam fixos enquanto a seleção está aberta.
  const [opened] = useState(() => {
    const layout = target.kind === 'clip' ? timeline.clips.find((l) => l.clip.id === target.id) : timeline.overlays.find((l) => l.clip.id === target.id);
    if (!layout || layout.media.kind === 'audio') return null;
    const clipTime = Math.min(Math.max(0, layout.length - 0.001), Math.max(0, time - layout.start));
    const at = layout.media.kind === 'image' ? 0 : layout.clip.trimIn + clipTime * speedOf(layout.clip);
    return { clip: layout.clip, media: layout.media, at: Math.round(at * 1000) / 1000 };
  });
  const size = useMemo(() => (opened ? maskSize(opened.media.width, opened.media.height) : { width: 1, height: 1 }), [opened]);

  const [image, setImage] = useState<ImageData | null>(null);
  const [points, setPoints] = useState<ObjectPoint[]>([]);
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<{ stage: string; fraction: number | null } | null>(null);
  const [working, setWorking] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    if (!opened) {
      stopObjectPick();
      return;
    }
    let alive = true;
    objectFrame(opened.media, opened.at)
      .then((frame) => alive && setImage(frame))
      .catch((error) => {
        notifyRef.current(t('Não foi possível ler esse quadro: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
        stopObjectPick();
      });
    // Fechou no meio (outro clipe, Esc): a propagação para.
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, [opened]);

  // Cada mudança nos pontos pede uma máscara nova; enquanto a IA trabalha, só o pedido mais recente espera.
  const busy = useRef(false);
  const pending = useRef<ObjectPoint[] | null>(null);
  const request = (next: ObjectPoint[]) => {
    pending.current = next;
    if (busy.current || !image || !opened) return;
    busy.current = true;
    void (async () => {
      while (pending.current) {
        const pts = pending.current;
        pending.current = null;
        try {
          const bits = await maskForPoints(image, `objeto:${opened.media.id}:${opened.at}`, pts, size, null, (stage, fraction) => setStatus({ stage, fraction }));
          if (!pending.current) setMask(bits);
        } catch (error) {
          notify(t('A IA não conseguiu selecionar: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
        }
      }
      setStatus(null);
      busy.current = false;
    })();
  };
  const changePoints = (next: ObjectPoint[]) => {
    setPoints(next);
    request(next);
  };

  // O quadro ocupa o maior espaço possível do preview, sem distorcer.
  const area = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = area.current;
    if (!el || !image) return;
    const update = () => {
      const w = el.clientWidth - 32;
      const h = el.clientHeight - 96;
      const scale = Math.max(0.01, Math.min(w / image.width, h / image.height));
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

  const maskCanvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = maskCanvas.current;
    if (!c) return;
    c.width = size.width;
    c.height = size.height;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!mask) return;
    const out = ctx.createImageData(size.width, size.height);
    const { width: w, height: h } = size;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w];
        out.data.set(edge ? EDGE : FILL, i * 4);
      }
    }
    ctx.putImageData(out, 0, 0);
  }, [mask, size]);

  const close = () => {
    abort.current?.abort();
    stopObjectPick();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !working) stopObjectPick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [working]);

  const hasMask = !!mask && maskStats(mask, size.width, size.height).area > 0;

  const apply = async () => {
    if (!opened || !mask || !hasMask) return;
    const controller = new AbortController();
    abort.current = controller;
    setWorking(true);
    try {
      const selection = await propagateObject(
        opened.media,
        opened.clip.trimIn,
        opened.clip.trimOut,
        { at: opened.at, points, bits: mask },
        (stage, fraction) => setStatus({ stage, fraction }),
        controller.signal,
      );
      const set = <T extends VideoClip>(c: T): T => ({ ...c, object: selection });
      setProject((p) => (target.kind === 'clip' ? updateClip(p, target.id, set) : updateOverlayClip(p, target.id, set)));
      notify(
        t('Objeto selecionado ({n} quadro(s)). Os efeitos de pessoa deste clipe agora usam o objeto: fundo, contorno, recorte, texto atrás… Troque em Recorte, no painel do clipe.', {
          n: selection.frames.length,
        }),
      );
      stopObjectPick();
    } catch (error) {
      if (controller.signal.aborted) notify(t('Seleção de objeto cancelada.'));
      else notify(t('Não foi possível seguir o objeto: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
      setWorking(false);
      setStatus(null);
    }
  };

  if (!opened) return null;
  const pointAt = (e: React.MouseEvent, include: boolean): ObjectPoint => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, include };
  };
  const includes = points.filter((p) => p.include).length;

  return (
    <div ref={area} className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 backdrop-blur-sm">
      {!image ? (
        <div className="flex items-center gap-2 text-xs text-dim">
          <LoaderCircle size={14} className="animate-spin text-accent" />
          {t('Abrindo o quadro…')}
        </div>
      ) : (
        <div
          className={cx('relative mt-10 overflow-hidden rounded-md shadow-2xl ring-1 ring-white/10', working ? 'cursor-wait' : 'cursor-crosshair')}
          style={box}
          onPointerDown={(e) => {
            if (working || (e.button !== 0 && e.button !== 2)) return;
            e.preventDefault();
            changePoints(togglePoint(points, pointAt(e, e.button === 0)));
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <canvas ref={frameCanvas} className="absolute inset-0 size-full" />
          <canvas ref={maskCanvas} className="pointer-events-none absolute inset-0 size-full" style={{ imageRendering: 'auto' }} />
          {points.map((p, i) => (
            <span
              key={i}
              className={cx(
                'pointer-events-none absolute flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold leading-none text-white ring-2 ring-black/70',
                p.include ? 'bg-emerald-500' : 'bg-rose-500',
              )}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            >
              {p.include ? '+' : '−'}
            </span>
          ))}
        </div>
      )}

      <div className="absolute left-1/2 top-3 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-accent/50 bg-panel-2/95 py-1 pl-4 pr-1 text-xs shadow-2xl backdrop-blur">
        <span className="text-dim">
          {working
            ? t('Seguindo o objeto pelo clipe…')
            : includes
              ? t('{n} ponto(s) · clique marca o objeto, botão direito marca o que não é', { n: points.length })
              : t('Clique no objeto que você quer selecionar')}
        </span>
        {!working && (
          <>
            <Button className="h-7 text-xs" icon={<Undo2 size={12} />} disabled={!points.length} onClick={() => changePoints(points.slice(0, -1))}>
              {t('Desfazer ponto')}
            </Button>
            <Button className="h-7 text-xs" icon={<Eraser size={12} />} disabled={!points.length} onClick={() => (changePoints([]), setMask(null))}>
              {t('Limpar')}
            </Button>
          </>
        )}
        <Button className="h-7 text-xs" icon={<X size={12} />} onClick={close}>
          {working ? t('Parar') : t('Cancelar')}
        </Button>
        {!working && (
          <Button variant="primary" className="h-7 text-xs" icon={<Check size={12} />} disabled={!hasMask || !!status} onClick={() => void apply()}>
            {t('Aplicar')}
          </Button>
        )}
      </div>

      {status && (
        <div className="absolute bottom-4 left-1/2 z-30 flex min-w-56 -translate-x-1/2 flex-col gap-1.5 rounded-xl bg-black/80 px-4 py-2 text-xs text-dim backdrop-blur">
          <span className="flex items-center gap-2">
            <LoaderCircle size={13} className="animate-spin text-accent" />
            {status.stage}
            {status.fraction !== null && ` · ${Math.round(status.fraction * 100)}%`}
          </span>
          {status.fraction !== null && (
            <span className="h-1 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round(status.fraction * 100)}%` }} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Painel do clipe

/** "Recorte": o que os efeitos de pessoa recebem, a pessoa (automático) ou o objeto selecionado com cliques. */
export function ObjectCutoutSection({
  clip,
  target,
  onChange,
}: {
  clip: VideoClip;
  target: ObjectPickTarget;
  onChange: (update: (clip: VideoClip) => VideoClip) => void;
}) {
  const selection = clip.object;
  const value = selection?.use ? 'object' : 'person';
  return (
    <>
      <SectionTitle>{tc('recorte', 'Recorte')}</SectionTitle>
      <Segmented
        options={[
          { value: 'person', label: t('Pessoa (automático)'), title: t('A IA encontra a pessoa em cada quadro') },
          { value: 'object', label: t('Objeto selecionado'), title: t('Um objeto que você escolhe com cliques') },
        ]}
        value={value}
        onChange={(next) => {
          if (next === 'person') onChange((c) => (c.object ? { ...c, object: { ...c.object, use: false } } : c));
          else if (selection?.frames.length) onChange((c) => (c.object ? { ...c, object: { ...c.object, use: true } } : c));
          else startObjectPick(target);
        }}
      />
      {selection?.frames.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button className="h-7 text-xs" icon={<LassoSelect size={12} />} onClick={() => startObjectPick(target)}>
            {t('Selecionar de novo…')}
          </Button>
          <Button variant="ghost" className="h-7 text-xs" icon={<Trash2 size={12} />} onClick={() => onChange((c) => ({ ...c, object: undefined }))}>
            {t('Apagar a seleção')}
          </Button>
        </div>
      ) : null}
      <p className="mt-1.5 text-[11px] leading-snug text-faint">
        {t('Vale para tudo que usa a pessoa: o fundo acima, contorno, recortar, texto atrás e os efeitos "Desfocar o objeto" e "Apagar o objeto".')}
      </p>
    </>
  );
}
