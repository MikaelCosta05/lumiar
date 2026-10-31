import { AudioLines, Camera, CircleCheck, Download, Film, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { LOUDNESS_TARGETS, type LoudnessTarget } from '../media/loudness';
import { FORMAT_INFO, outputSize, supportsTransparency, type ExportFormat, type ExportProgress, type ExportSettings } from '../media/exporter';
import type { Project } from '../project/model';
import { t } from '../i18n';
import { formatTime } from './format';
import { Button, cx, IconButton, Segmented, Slider } from './kit';

export type ExportState =
  | { status: 'setup' }
  | { status: 'running'; progress: ExportProgress }
  | { status: 'done'; url: string; fileName: string; size: number }
  | { status: 'error'; message: string };

/** Um dos arquivos da exportação em vários formatos. */
export interface BatchJob {
  label: string;
  /** Tamanho do quadro deste arquivo (pode ter outra proporção que o projeto) */
  width: number;
  height: number;
  settings: ExportSettings;
  /** O que vai no fim do nome do arquivo ("9x16", "gif"…) */
  suffix?: string;
}

interface Props {
  state: ExportState;
  /** Exportar vários formatos de uma vez (um arquivo depois do outro) */
  onStartBatch: (jobs: BatchJob[], reframe: boolean) => void;
  project: Project;
  duration: number;
  /** Posição do cursor (para marcar o trecho) */
  time: number;
  onStart: (settings: ExportSettings) => void;
  onSnapshot: () => void;
  onCancel: () => void;
  /** Fecha a janela e continua exportando num cantinho */
  onBackground: () => void;
  onClose: () => void;
}

export function download(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
}

const SETTINGS_KEY = 'lumiar:export';
const HEIGHTS = [4320, 2160, 1440, 1080, 720, 480, 360, 240];
const VIDEO_FPS = [12, 24, 25, 30, 48, 50, 60];
const GIF_FPS = [10, 12, 15, 20, 25];

const DEFAULTS: ExportSettings = { format: 'mp4', height: null, fps: null, quality: 'high', range: null };

function loadSettings(): ExportSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<ExportSettings> | null;
    // O trecho depende do projeto: não é lembrado.
    return { ...DEFAULTS, ...saved, range: null, loop: undefined };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(settings: ExportSettings): void {
  try {
    // O loop vale só para aquela exportação (um GIF em boomerang não deve virar o padrão).
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, range: null, loop: undefined }));
  } catch {
    // Sem armazenamento: só não lembra da próxima vez.
  }
}

export function ExportDialog({ state, project, duration, time, onStart, onStartBatch, onSnapshot, onCancel, onBackground, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className={cx(
          'max-h-full w-full animate-pop-in overflow-y-auto rounded-2xl border border-line bg-panel p-6 shadow-2xl',
          state.status === 'setup' ? 'max-w-xl' : 'max-w-md',
        )}
      >
        {state.status === 'setup' && (
          <ExportSetup project={project} duration={duration} time={time} onStart={onStart} onStartBatch={onStartBatch} onSnapshot={onSnapshot} onClose={onClose} />
        )}

        {state.status === 'running' && (
          <>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                <LoaderCircle size={20} className="animate-spin" />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold">{t('Exportando')}</h3>
                <p className="text-xs text-dim">{state.progress.stage}…</p>
              </div>
              <span className="ml-auto font-mono text-xl font-semibold">{Math.round(state.progress.fraction * 100)}%</span>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-panel-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent via-accent-2 to-pink transition-[width] duration-150"
                style={{ width: `${state.progress.fraction * 100}%` }}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={onCancel}>{t('Cancelar')}</Button>
              <Button variant="primary" onClick={onBackground} title={t('A exportação continua num cantinho da tela; o arquivo é baixado quando terminar')}>
                {t('Continuar editando')}
              </Button>
            </div>
          </>
        )}

        {state.status === 'done' && (
          <>
            <div className="flex items-start gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
                <CircleCheck size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-[15px] font-semibold">{t('Arquivo pronto!')}</h3>
                <p className="truncate text-xs text-dim">{state.fileName}</p>
                <p className="font-mono text-xs text-faint">{(state.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <IconButton label={t('Fechar')} onClick={onClose}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={onClose}>{t('Fechar')}</Button>
              <Button variant="primary" icon={<Download size={14} />} onClick={() => download(state.url, state.fileName)}>
                {t('Baixar de novo')}
              </Button>
            </div>
          </>
        )}

        {state.status === 'error' && (
          <>
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
                <TriangleAlert size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold">{t('Não foi possível exportar')}</h3>
                <p className="mt-1 whitespace-pre-wrap text-xs text-dim">{state.message}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={onClose}>{t('Fechar')}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExportSetup({
  project,
  duration,
  time,
  onStart,
  onStartBatch,
  onSnapshot,
  onClose,
}: Pick<Props, 'project' | 'duration' | 'time' | 'onStart' | 'onStartBatch' | 'onSnapshot' | 'onClose'>) {
  const [settings, setSettings] = useState(loadSettings);
  const [batch, setBatch] = useState<Set<string>>(() => new Set());
  /** Exportação em vários formatos: seguir o rosto em cada formato (corta) ou mostrar tudo com as sobras desfocadas */
  const [reframe, setReframe] = useState(true);
  const [custom, setCustom] = useState(false);
  const [range, setRange] = useState({ start: 0, end: duration });
  const set = (patch: Partial<ExportSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const info = FORMAT_INFO[settings.format];
  const gif = settings.format === 'gif';
  // Sequência de PNG: sem som e sem compressão com perdas (qualidade e volume não se aplicam).
  const png = settings.format === 'png';
  const transparent = !!settings.transparent && supportsTransparency(settings.format);
  const size = outputSize(project, settings.height ?? (gif ? 360 : null));
  const fps = settings.fps ?? (gif ? 15 : project.fps);
  const length = custom ? Math.max(0, range.end - range.start) : duration;

  const chooseFormat = (format: ExportFormat) => {
    // GIF pesado não faz sentido: ao trocar, já sugere tamanho e fps menores.
    if (format === 'gif' && settings.format !== 'gif') set({ format, height: 360, fps: 15 });
    else if (format !== 'gif' && settings.format === 'gif') set({ format, height: null, fps: null });
    else set({ format });
  };

  const start = () => {
    const final: ExportSettings = { ...settings, height: settings.height ?? (gif ? 360 : null), fps: settings.fps ?? (gif ? 15 : null) };
    saveSettings(final);
    onStart({ ...final, range: custom ? range : null });
  };

  const heights = HEIGHTS.filter((h) => h !== Math.min(project.width, project.height) && (gif ? h <= 720 : true));

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold">{t('Exportar')}</h3>
          <p className="text-xs text-dim">{t('Escolha o formato e as opções do arquivo.')}</p>
        </div>
        <IconButton label={t('Fechar')} onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      <Label>{t('Formato')}</Label>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(FORMAT_INFO) as ExportFormat[]).map((f) => {
          const item = FORMAT_INFO[f];
          return (
            <button
              key={f}
              onClick={() => chooseFormat(f)}
              className={cx(
                'flex items-start gap-2 rounded-xl border p-2.5 text-left transition-colors',
                settings.format === f ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong hover:bg-panel-2',
              )}
            >
              <span className={cx('mt-0.5 shrink-0', settings.format === f ? 'text-accent' : 'text-faint')}>
                {item.video ? <Film size={14} /> : <AudioLines size={14} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block text-[10px] leading-tight text-faint">{item.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {supportsTransparency(settings.format) && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-line bg-panel-2 p-2.5 text-xs">
          <input
            type="checkbox"
            checked={!!settings.transparent}
            onChange={(e) => set({ transparent: e.target.checked })}
            className="mt-0.5 accent-[var(--color-accent)]"
          />
          <span className="min-w-0">
            <span className="block font-medium">{t('Fundo transparente')}</span>
            <span className="block text-[11px] leading-snug text-faint">
              {t('Onde não há vídeo fica transparente: leve títulos, stickers, elementos animados ou a pessoa recortada para outro editor.')}
            </span>
          </span>
        </label>
      )}

      {info.video && (
        <div className="grid grid-cols-2 gap-x-4">
          <div>
            <Label>{t('Resolução')}</Label>
            <select
              className="field w-full"
              value={settings.height ?? ''}
              onChange={(e) => set({ height: e.target.value ? Number(e.target.value) : null })}
            >
              {!gif && <option value="">{t('Do projeto ({width}×{height})', { width: project.width, height: project.height })}</option>}
              {heights.map((h) => {
                const s = outputSize(project, h);
                return (
                  <option key={h} value={h}>
                    {h === 4320 ? '8K' : h === 2160 ? '4K' : h === 1440 ? '2K' : `${h}p`} ({s.width}×{s.height})
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <Label>{t('Quadros por segundo')}</Label>
            <select className="field w-full" value={settings.fps ?? ''} onChange={(e) => set({ fps: e.target.value ? Number(e.target.value) : null })}>
              {!gif && <option value="">{t('Do projeto ({fps} fps)', { fps: project.fps })}</option>}
              {(gif ? GIF_FPS : VIDEO_FPS).map((f) => (
                <option key={f} value={f}>
                  {f} fps
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!gif && !png && settings.format !== 'wav' && (
        <>
          <Label>{t('Qualidade')}</Label>
          <Segmented
            options={[
              { value: 'low', label: t('Baixa') },
              { value: 'medium', label: t('Média') },
              { value: 'high', label: t('Alta') },
              { value: 'very-high', label: t('Máxima') },
            ]}
            value={settings.quality}
            onChange={(quality) => set({ quality })}
          />
        </>
      )}

      {!gif && !png && (
        <>
          <Label>{t('Volume')}</Label>
          <Segmented
            options={[
              { value: 'off', label: t('Como está'), title: t('Sem ajuste: o volume sai como você mixou') },
              ...Object.entries(LOUDNESS_TARGETS).map(([value, target]) => ({
                value: value as LoudnessTarget,
                label: target.label,
                title: `${target.lufs} LUFS · ${target.hint}`,
              })),
            ]}
            value={settings.loudness ?? 'off'}
            onChange={(loudness) => set({ loudness })}
          />
          {(settings.loudness ?? 'off') !== 'off' && (
            <p className="mt-1 text-[11px] leading-snug text-faint">
              {t('O volume do vídeo inteiro é ajustado para {lufs} LUFS e os picos ficam abaixo de -1 dB: não sai baixo nem é abaixado pela plataforma.', {
                lufs: LOUDNESS_TARGETS[settings.loudness as Exclude<LoudnessTarget, 'off'>].lufs,
              })}
            </p>
          )}
        </>
      )}

      {info.video && (
        <>
          <Label>{t('Loop')}</Label>
          <Segmented
            options={[
              { value: 'none', label: t('Normal') },
              { value: 'seamless', label: t('Loop perfeito'), title: t('O fim dissolve no começo: repetindo, não dá para ver a emenda') },
              { value: 'boomerang', label: t('Boomerang'), title: t('Vai e volta: o trecho toca para frente e depois de trás para frente') },
            ]}
            value={settings.loop ?? 'none'}
            onChange={(loop) => set({ loop })}
          />
          {(settings.loop ?? 'none') !== 'none' && (
            <p className="mt-1 text-[11px] leading-snug text-faint">
              {settings.loop === 'seamless'
                ? t('Bom para GIFs e Reels, que repetem sozinhos: o arquivo fica meio segundo mais curto e o fim emenda no começo.')
                : t('O arquivo fica com quase o dobro da duração do trecho (ida e volta).')}
            </p>
          )}
        </>
      )}

      <Label>{t('Trecho')}</Label>
      <Segmented
        options={[
          { value: 'all', label: t('Tudo ({duration})', { duration: formatTime(duration) }) },
          { value: 'custom', label: t('Escolher trecho') },
        ]}
        value={custom ? 'custom' : 'all'}
        onChange={(v) => setCustom(v === 'custom')}
      />
      {custom && (
        <div className="mt-2 space-y-1 rounded-xl border border-line bg-panel-2 p-3">
          <RangeRow
            label={t('Início')}
            value={range.start}
            max={duration}
            onChange={(v) => setRange((r) => ({ ...r, start: Math.min(v, r.end - 0.1) }))}
            onCursor={() => setRange((r) => ({ ...r, start: Math.min(time, r.end - 0.1) }))}
          />
          <RangeRow
            label={t('Fim')}
            value={range.end}
            max={duration}
            onChange={(v) => setRange((r) => ({ ...r, end: Math.max(v, r.start + 0.1) }))}
            onCursor={() => setRange((r) => ({ ...r, end: Math.max(time, r.start + 0.1) }))}
          />
        </div>
      )}

      <p className="mt-4 rounded-lg bg-panel-2 px-3 py-2 font-mono text-[11px] text-dim">
        {info.label}
        {png && ` (.zip)`}
        {info.video && ` · ${size.width}×${size.height} · ${fps} fps`} · {formatTime(length)}
        {transparent && ` · ${t('fundo transparente')}`}
        {gif && length > 15 && <span className="text-amber"> · {t('GIFs longos ficam pesados')}</span>}
      </p>

      <details className="mt-3 rounded-lg border border-line px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-dim">{t('Exportar em vários formatos de uma vez')}</summary>
        <p className="mt-1.5 text-[11px] leading-snug text-faint">
          {t('Um arquivo depois do outro, com o formato no fim do nome (ex.: "{name} - 9x16.mp4").', { name: project.name || 'lumiar' })}
        </p>
        <p className="mb-1 mt-2 text-[11px] text-dim">{t('Quando a proporção muda (ex.: deitado → vertical)')}</p>
        <Segmented
          options={[
            { value: 'follow', label: t('Seguir o rosto'), title: t('Cada clipe preenche a tela e a câmera acompanha quem aparece (como "Converter para vertical")') },
            { value: 'blur', label: t('Mostrar tudo'), title: t('A imagem inteira, com as sobras desfocadas') },
          ]}
          value={reframe ? 'follow' : 'blur'}
          onChange={(v) => setReframe(v === 'follow')}
        />
        <div className="mt-2 space-y-1">
          {batchJobs(project, time, duration).map((job) => (
            <label key={job.label} className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={batch.has(job.label)}
                onChange={(e) =>
                  setBatch((b) => {
                    const next = new Set(b);
                    if (e.target.checked) next.add(job.label);
                    else next.delete(job.label);
                    return next;
                  })
                }
                className="accent-[var(--color-accent)]"
              />
              <span className="flex-1">{job.label}</span>
              <span className="font-mono text-[10px] text-faint">
                {job.width}×{job.height}
              </span>
            </label>
          ))}
        </div>
        <Button
          variant="primary"
          className="mt-2 h-8 w-full text-xs"
          icon={<Download size={13} />}
          disabled={batch.size === 0}
          onClick={() => onStartBatch(batchJobs(project, time, duration).filter((j) => batch.has(j.label)), reframe)}
        >
          {batch.size === 0 ? t('Exportar arquivos') : batch.size === 1 ? t('Exportar 1 arquivo') : t('Exportar {n} arquivos', { n: batch.size })}
        </Button>
      </details>

      <div className="mt-5 flex items-center gap-2">
        <Button variant="ghost" icon={<Camera size={14} />} onClick={onSnapshot} title={t('Salva a imagem que está no preview agora')}>
          {t('Quadro atual (PNG)')}
        </Button>
        <span className="flex-1" />
        <Button onClick={onClose}>{t('Cancelar')}</Button>
        <Button variant="primary" icon={<Download size={14} />} onClick={start} disabled={length < 0.05}>
          {t('Exportar {format}', { format: info.label })}
        </Button>
      </div>
    </>
  );
}

function Label({ children }: { children: string }) {
  return <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-faint">{children}</p>;
}

function RangeRow({
  label,
  value,
  max,
  onChange,
  onCursor,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  onCursor: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 text-xs text-dim">{label}</span>
      <Slider label={label} value={value} min={0} max={max} step={0.01} onChange={onChange} />
      <span className="w-16 text-right font-mono text-[11px]">{formatTime(value)}</span>
      <button onClick={onCursor} className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] text-faint hover:bg-panel-3 hover:text-fg" title={t('Usar a posição do cursor')}>
        {t('cursor')}
      </button>
    </div>
  );
}

/** Os formatos da exportação em lote. */
function batchJobs(project: Project, time: number, duration: number): BatchJob[] {
  const video = (): ExportSettings => ({ format: 'mp4', height: null, fps: null, quality: 'high', range: null });
  const ratio = project.width / project.height;
  const gifW = Math.round((ratio >= 1 ? 360 * ratio : 360) / 2) * 2;
  const gifH = Math.round((ratio >= 1 ? 360 : 360 / ratio) / 2) * 2;
  const gifStart = Math.min(Math.max(0, time), Math.max(0, duration - 5));
  return [
    { label: 'YouTube (16:9, 1080p, MP4)', width: 1920, height: 1080, settings: video(), suffix: '16x9' },
    { label: t('Reels, TikTok e Shorts (9:16, MP4)'), width: 1080, height: 1920, settings: video(), suffix: '9x16' },
    { label: t('Feed do Instagram (4:5, MP4)'), width: 1080, height: 1350, settings: video(), suffix: '4x5' },
    { label: t('Quadrado (1:1, MP4)'), width: 1080, height: 1080, settings: video(), suffix: '1x1' },
    {
      label: t('GIF curto (5 s a partir do cursor)'),
      width: gifW,
      height: gifH,
      settings: { format: 'gif', height: null, fps: 15, quality: 'medium', range: { start: gifStart, end: Math.min(duration, gifStart + 5) } },
      suffix: 'gif',
    },
  ];
}
