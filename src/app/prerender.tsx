import { Eraser, LoaderCircle, Zap } from 'lucide-react';
import { canEncodeVideo, QUALITY_HIGH } from 'mediabunny';
import { useRef, useState } from 'react';
import { locale, t } from '../i18n';
import { exportProject, outputSize, type ExportFormat } from '../media/exporter';
import { prerenderCache } from '../preview/prerenderCache';
import { layoutProject, type Project } from '../project/model';
import {
  normalizeSpan,
  prerenderFingerprint,
  prerenderSpanFor,
  PRERENDER_MEMORY_LIMIT,
  PRERENDER_SHORT_SIDE,
  PRERENDER_WARMUP,
  type PrerenderTarget,
  type Span,
} from '../project/prerender';
import type { MenuEntry } from '../ui/ContextMenu';
import { formatTime } from '../ui/format';
import type { EditorContext } from './context';

interface PrerenderJob {
  /** Cópia do projeto no momento do pedido (dá para continuar editando; se mudar ali, o trecho já nasce desatualizado) */
  project: Project;
  span: Span;
}

export interface PrerenderProgress {
  label: string;
  fraction: number;
  /** Trechos esperando na fila depois deste */
  pending: number;
}

const megabytes = (bytes: number) => `${(bytes / 1024 ** 2).toLocaleString(locale(), { maximumFractionDigits: 0 })} MB`;
const gigabytes = (bytes: number) => `${(bytes / 1024 ** 3).toLocaleString(locale(), { maximumFractionDigits: 1 })} GB`;

/**
 * Pré-renderizar trecho: renderiza o trecho uma vez com o mesmo caminho da exportação (máscaras,
 * profundidade, textos…), só a imagem, num vídeo leve guardado na memória. O preview toca dele
 * enquanto nada mudar ali (ver preview/prerenderPlayback.ts). Um trecho por vez, os outros em fila.
 */
export function usePrerender(ctx: EditorContext) {
  const [progress, setProgress] = useState<PrerenderProgress | null>(null);
  const queue = useRef<PrerenderJob[]>([]);
  const running = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const notify = useRef(ctx.notify);
  notify.current = ctx.notify;

  const run = async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length) {
      const { project, span } = queue.current[0];
      const controller = new AbortController();
      abort.current = controller;
      const label = t('Pré-renderizando {from} – {to}', { from: formatTime(span.start), to: formatTime(span.end) });
      // Só redesenha o editor quando o número muda (a cada quadro seria pesado à toa).
      let shown = -1;
      const show = (fraction: number) => {
        const percent = Math.floor(fraction * 100);
        if (percent === shown) return;
        shown = percent;
        setProgress({ label, fraction, pending: queue.current.length - 1 });
      };
      show(0);
      try {
        const short = Math.min(PRERENDER_SHORT_SIDE, project.width, project.height);
        const { width, height } = outputSize(project, short);
        const format = await pickFormat(width, height);
        const fingerprint = prerenderFingerprint(project, layoutProject(project), span);
        const blob = await exportProject(
          project,
          { format, height: short, fps: project.fps, quality: 'high', range: span },
          // Quadro-chave a cada segundo: arrastar o cursor dentro do trecho continua rápido.
          { signal: controller.signal, onProgress: (p) => show(p.fraction), videoOnly: true, keyFrameInterval: 1, warmup: PRERENDER_WARMUP },
        );
        const { evicted } = prerenderCache.add({ start: span.start, end: span.end, fingerprint, blob, bytes: blob.size, width, height, fps: project.fps });
        notify.current(t('Pré-renderização pronta: {from} – {to} agora toca sem engasgos ({size}).', { from: formatTime(span.start), to: formatTime(span.end), size: megabytes(blob.size) }));
        if (evicted) {
          notify.current(t('{n} pré-renderização(ões) mais antiga(s) apagada(s) para não passar de {limit} de memória.',{ limit: gigabytes(PRERENDER_MEMORY_LIMIT), n: evicted }));
        }
      } catch (error) {
        if (controller.signal.aborted) {
          queue.current = [];
          notify.current(t('Pré-renderização cancelada.'));
        } else {
          console.error(error);
          notify.current(t('Não foi possível pré-renderizar o trecho: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
        }
      }
      queue.current.shift();
    }
    running.current = false;
    abort.current = null;
    setProgress(null);
  };

  const request = (target: PrerenderTarget) => {
    const found = prerenderSpanFor(ctx.project, ctx.timeline, target);
    const span = found && normalizeSpan(found, ctx.project.fps, ctx.timeline.duration);
    if (!span) {
      ctx.notify(t('Não há nada para pré-renderizar neste ponto da timeline.'), true);
      return;
    }
    ctx.playerRef.current?.pause();
    queue.current.push({ project: ctx.project, span });
    if (running.current) ctx.notify(t('Trecho na fila de pré-renderização.'));
    void run();
  };

  const clear = () => {
    prerenderCache.clear();
    ctx.notify(t('Pré-renderizações apagadas: o preview volta a renderizar ao vivo.'));
  };

  /** Cancela o trecho atual e os que esperam na fila. */
  const cancel = () => abort.current?.abort();

  /** Junta ao menu do clique direito da timeline (antes do último bloco, que costuma ser o "Excluir"). */
  const withEntries = (entries: MenuEntry[], clicked: { kind: string }): MenuEntry[] => {
    if (!entries.some(Boolean)) return entries;
    // Tipos de item que a pré-renderização não conhece caem no "não há nada aqui" (ver prerenderSpanFor).
    const target = clicked as PrerenderTarget;
    const span = prerenderSpanFor(ctx.project, ctx.timeline, target);
    const extra: MenuEntry[] = [
      {
        label: t('Pré-renderizar este trecho'),
        icon: <Zap size={14} />,
        shortcut: span ? `${(span.end - span.start).toLocaleString(locale(), { maximumFractionDigits: 1 })} s` : undefined,
        disabled: !span,
        onClick: () => request(target),
      },
      prerenderCache.count > 0 && {
        label: t('Apagar pré-renderizações ({size})', { size: megabytes(prerenderCache.bytes) }),
        icon: <Eraser size={14} />,
        onClick: clear,
      },
    ];
    const last = entries.lastIndexOf('separator');
    return last < 0 ? [...entries, 'separator', ...extra] : [...entries.slice(0, last), 'separator', ...extra, ...entries.slice(last)];
  };

  return { progress, request, clear, cancel, withEntries };
}

/** H.264 (MP4) quando dá, que costuma ser codificado pela placa de vídeo; senão VP9 (WebM). */
async function pickFormat(width: number, height: number): Promise<ExportFormat> {
  const avc = await canEncodeVideo('avc', { width, height, bitrate: QUALITY_HIGH }).catch(() => false);
  return avc ? 'mp4' : 'webm';
}

/** Progresso da pré-renderização no canto da tela (dá para continuar editando). */
export function PrerenderPill({ progress, onCancel }: { progress: PrerenderProgress; onCancel: () => void }) {
  return (
    <div className="fixed bottom-20 left-4 z-50 flex w-72 animate-pop-in items-center gap-3 rounded-xl border border-line bg-panel-2/95 px-3 py-2.5 shadow-2xl backdrop-blur">
      <LoaderCircle size={16} className="shrink-0 animate-spin text-success" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs">
          {progress.label}
          {progress.pending > 0 && <span className="text-faint"> · {t('+{n} na fila', { n: progress.pending })}</span>}
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-panel-3">
          <div className="h-full rounded-full bg-success" style={{ width: `${progress.fraction * 100}%` }} />
        </div>
      </div>
      <span className="font-mono text-[11px] text-dim">{Math.round(progress.fraction * 100)}%</span>
      <button title={t('Cancelar a pré-renderização')} onClick={onCancel} className="text-faint transition-colors hover:text-danger">
        ✕
      </button>
    </div>
  );
}
