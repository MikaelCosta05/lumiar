import { LoaderCircle } from 'lucide-react';
import { useRef, useState, type RefObject } from 'react';
import { exportProject, FORMAT_INFO, type ExportSettings } from '../media/exporter';
import { t } from '../i18n';
import type { Player } from '../preview/player';
import type { Project } from '../project/model';
import { download, type BatchJob, type ExportState } from '../ui/ExportDialog';
import type { Highlight } from '../ui/ShortsTools';

interface ExportJob {
  label: string;
  project: Project;
  settings: ExportSettings;
  fileName: string;
}

interface ExportPillState {
  label: string;
  fraction: number;
  pending: number;
}

/** Exportação em fila: pode rodar em segundo plano enquanto se continua editando. */
export function useExportQueue(project: Project, playerRef: RefObject<Player | null>, notify: (text: string, error?: boolean) => void) {
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  /** Cada arquivo a exportar leva uma cópia do projeto do momento (dá para continuar editando). */
  const exportQueue = useRef<ExportJob[]>([]);
  const exportRunning = useRef(false);
  const [exportBackground, setExportBackground] = useState(false);
  const exportBackgroundRef = useRef(false);
  exportBackgroundRef.current = exportBackground;
  const [exportPill, setExportPill] = useState<ExportPillState | null>(null);

  const fileBase = () => (project.name || 'lumiar').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'lumiar';

  const runExports = async () => {
    if (exportRunning.current) return;
    exportRunning.current = true;
    let last: { url: string; fileName: string; size: number } | null = null;
    let finished = 0;
    while (exportQueue.current.length) {
      const job = exportQueue.current[0];
      const controller = new AbortController();
      exportAbortRef.current = controller;
      const pending = exportQueue.current.length;
      const prefix = finished + pending > 1 ? `${t('({n} de {total}) {label}', { n: finished + 1, total: finished + pending, label: job.label })} · ` : '';
      const show = (stage: string, fraction: number) => {
        setExportPill({ label: prefix + stage, fraction, pending });
        if (!exportBackgroundRef.current) setExportState({ status: 'running', progress: { stage: prefix + stage, fraction } });
      };
      show(t('Preparando'), 0);
      try {
        const blob = await exportProject(job.project, job.settings, { signal: controller.signal, onProgress: (p) => show(p.stage, p.fraction) });
        const url = URL.createObjectURL(blob);
        download(url, job.fileName);
        last = { url, fileName: job.fileName, size: blob.size };
        finished++;
        if (exportBackgroundRef.current) notify(t('Exportado: {file}', { file: job.fileName }));
        exportQueue.current.shift();
      } catch (error) {
        exportQueue.current = [];
        if (controller.signal.aborted) {
          setExportState(null);
          notify(t('Exportação cancelada.'));
        } else {
          console.error(error);
          const message = error instanceof Error ? error.message : String(error);
          if (exportBackgroundRef.current) notify(t('A exportação falhou: {error}', { error: message }), true);
          else setExportState({ status: 'error', message });
        }
        last = null;
      }
    }
    exportRunning.current = false;
    setExportPill(null);
    if (last && !exportBackgroundRef.current) {
      setExportState({ status: 'done', ...last, fileName: finished > 1 ? t('{n} arquivos salvos · último: {file}', { n: finished, file: last.fileName }) : last.fileName });
    }
    setExportBackground(false);
  };

  const enqueueExports = (jobs: ExportJob[]) => {
    playerRef.current?.pause();
    exportQueue.current.push(...jobs);
    if (exportRunning.current) {
      notify(t('{n} arquivo(s) na fila de exportação.', { n: jobs.length }));
      setExportState(null);
      setExportBackground(true);
    }
    void runExports();
  };

  /** Destaques: cada trecho vira um MP4 vertical (9:16), com as sobras da imagem desfocadas. */
  const exportHighlights = (highlights: Highlight[]) => {
    enqueueExports(
      highlights.map((h, i) => ({
        label: t('Destaque {n}', { n: i + 1 }),
        project: { ...project, width: 1080, height: 1920, background: { kind: 'blur' as const, color: project.background.color } },
        settings: { format: 'mp4' as const, height: null, fps: null, quality: 'high' as const, range: { start: h.start, end: h.end } },
        fileName: `${fileBase()} - destaque ${i + 1}.mp4`,
      })),
    );
    setExportBackground(true);
  };

  const startExport = (settings: ExportSettings) =>
    enqueueExports([{ label: FORMAT_INFO[settings.format].label, project, settings, fileName: `${fileBase()}.${FORMAT_INFO[settings.format].extension}` }]);

  /** Vários formatos de uma vez: cada um é o projeto no tamanho do formato, exportado e baixado em sequência. */
  const startBatchExport = (jobs: BatchJob[]) =>
    enqueueExports(
      jobs.map((job) => {
        const sameShape = Math.abs(job.width / job.height - project.width / project.height) < 0.01;
        const suffix = job.label.split(' (')[0].toLowerCase().replace(/[^a-z0-9à-ú]+/gi, '-').replace(/-+$/, '');
        return {
          label: job.label,
          // Proporção diferente: as sobras ficam com a imagem desfocada em vez de barras pretas.
          project: { ...project, width: job.width, height: job.height, background: sameShape ? project.background : { kind: 'blur' as const, color: project.background.color } },
          settings: job.settings,
          fileName: `${fileBase()} - ${suffix}.${FORMAT_INFO[job.settings.format].extension}`,
        };
      }),
    );

  /** A janela de exportação fecha e o que está na fila continua em segundo plano. */
  const exportInBackground = () => {
    setExportBackground(true);
    setExportState(null);
  };

  /** Cancela o arquivo que está sendo exportado. */
  const cancelExport = () => exportAbortRef.current?.abort();

  /** Cancela o arquivo atual e todos os que esperam na fila. */
  const cancelAllExports = () => {
    exportQueue.current = [];
    exportAbortRef.current?.abort();
  };

  return { exportState, setExportState, exportPill, startExport, startBatchExport, exportHighlights, exportInBackground, cancelExport, cancelAllExports };
}

/** Progresso da exportação em segundo plano, no canto da tela. */
export function ExportPill({ pill, onCancel }: { pill: ExportPillState; onCancel: () => void }) {
  return (
    <div className="fixed bottom-4 left-4 z-50 flex w-72 animate-pop-in items-center gap-3 rounded-xl border border-line bg-panel-2/95 px-3 py-2.5 shadow-2xl backdrop-blur">
      <LoaderCircle size={16} className="shrink-0 animate-spin text-accent" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs">{pill.label}</p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-panel-3">
          <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${pill.fraction * 100}%` }} />
        </div>
      </div>
      <span className="font-mono text-[11px] text-dim">{Math.round(pill.fraction * 100)}%</span>
      <button title={t('Cancelar a exportação')} onClick={onCancel} className="text-faint transition-colors hover:text-danger">
        ✕
      </button>
    </div>
  );
}
