import { Download, FileUp, LoaderCircle, Mic, Plus, Trash, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { loadFonts } from '../media/fonts';
import { CAPTION_LANGUAGES, CAPTION_MODELS, transcribeProject } from '../media/captioning';
import { drawCaption } from '../media/textRender';
import {
  CAPTION_PRESETS,
  captionAt,
  captionStyle,
  getCaptions,
  parseSubtitles,
  regroup,
  toSrt,
  toVtt,
  updateCaptions,
  type Caption,
  type CaptionStyle,
  type CaptionTrack,
} from '../project/captions';
import { uid, type Project } from '../project/model';
import { formatTime } from './format';
import { Button, cx, IconButton, SectionTitle, Segmented, Slider, Switch } from './kit';
import { previewStore, sceneCanvas } from './previews';

interface Props {
  project: Project;
  time: number;
  onChange: (update: (project: Project) => Project) => void;
  onSeek: (time: number) => void;
  notify: (text: string, error?: boolean) => void;
}

const POSITIONS = [
  { label: 'Em cima', y: 0.15 },
  { label: 'No meio', y: 0.5 },
  { label: 'Embaixo', y: 0.85 },
];

export function CaptionsPanel({ project, time, onChange, onSeek, notify }: Props) {
  const track = getCaptions(project);
  const style = track.style;
  const [language, setLanguage] = useState<string | null>('portuguese');
  const [model, setModel] = useState(CAPTION_MODELS[1].id);
  const [progress, setProgress] = useState<{ stage: string; fraction: number | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = captionAt(track, time);
  const listRef = useRef<HTMLDivElement>(null);

  const setTrack = (update: (t: CaptionTrack) => CaptionTrack) => onChange((p) => updateCaptions(p, update));
  const setStyle = (patch: Partial<CaptionStyle>) => setTrack((t) => ({ ...t, style: { ...t.style, ...patch } }));
  const setCaption = (id: string, patch: Partial<Caption>) =>
    setTrack((t) => ({ ...t, captions: t.captions.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  // A legenda que está tocando fica visível na lista.
  useEffect(() => {
    if (!active) return;
    listRef.current?.querySelector(`[data-caption="${active.id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active?.id]);

  const generate = async () => {
    if (track.captions.length && !confirm('Substituir as legendas atuais pelas novas?')) return;
    try {
      setProgress({ stage: 'Preparando', fraction: null });
      const captions = await transcribeProject(project, { model, language, maxWords: track.maxWords }, (stage, fraction) =>
        setProgress({ stage, fraction }),
      );
      setTrack((t) => ({ ...t, enabled: true, captions }));
      notify(captions.length ? `${captions.length} legendas criadas. Confira e corrija o texto na lista.` : 'Nenhuma fala reconhecida.', !captions.length);
    } catch (error) {
      notify(`Não foi possível gerar as legendas: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setProgress(null);
    }
  };

  const importFile = async (file: File) => {
    const captions = parseSubtitles(await file.text());
    if (captions.length === 0) {
      notify(`Nenhuma legenda encontrada em "${file.name}".`, true);
      return;
    }
    setTrack((t) => ({ ...t, enabled: true, captions }));
    notify(`${captions.length} legendas importadas.`);
  };

  const exportFile = (format: 'srt' | 'vtt') => {
    const content = format === 'srt' ? toSrt(track.captions) : toVtt(track.captions);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    link.download = `${project.name || 'legendas'}.${format}`;
    link.click();
  };

  const addAtCursor = () => {
    const caption: Caption = { id: uid(), start: time, end: time + 2.5, text: 'Nova legenda' };
    setTrack((t) => ({ ...t, enabled: true, captions: [...t.captions, caption].sort((a, b) => a.start - b.start) }));
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <h2 className="text-[15px] font-semibold">Legendas</h2>
        <span className="text-xs text-faint">{track.captions.length}</span>
        <span className="flex-1" />
        <Switch checked={track.enabled} label="Mostrar legendas" onChange={(enabled) => setTrack((t) => ({ ...t, enabled }))} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {/* Automático */}
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Mic size={13} className="text-accent" /> Legendas automáticas
          </p>
          <p className="mt-1 text-[11px] leading-snug text-faint">
            Reconhece a fala de todo o áudio do projeto, no seu computador (nada é enviado). Cada palavra ganha seu tempo.
          </p>
          <p className="mb-1 mt-3 text-[11px] text-faint">Idioma falado</p>
          <select className="field h-8 w-full text-xs" value={language ?? ''} onChange={(e) => setLanguage(e.target.value || null)} disabled={!!progress}>
            {CAPTION_LANGUAGES.map((l) => (
              <option key={l.label} value={l.id ?? ''}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="mb-1 mt-2.5 text-[11px] text-faint">Qualidade (mais precisa = mais lenta)</p>
          <Segmented
            options={CAPTION_MODELS.map((m) => ({ value: m.id, label: m.label, title: `${m.label} · modelo de ${m.size}` }))}
            value={model}
            onChange={(id) => !progress && setModel(id)}
          />
          {progress ? (
            <div className="mt-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-dim">
                <LoaderCircle size={12} className="animate-spin text-accent" />
                {progress.stage}
                {progress.fraction !== null && ` · ${Math.round(progress.fraction * 100)}%`}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-3">
                <div
                  className={cx('h-full rounded-full bg-gradient-to-r from-accent to-accent-2', progress.fraction === null && 'w-1/3 animate-pulse')}
                  style={progress.fraction !== null ? { width: `${progress.fraction * 100}%` } : undefined}
                />
              </div>
            </div>
          ) : (
            <Button variant="primary" icon={<Mic size={14} />} className="mt-2.5 w-full" onClick={() => void generate()}>
              Gerar legendas
            </Button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Button variant="secondary" className="h-8 text-xs" icon={<Plus size={13} />} onClick={addAtCursor}>
            Nova
          </Button>
          <Button variant="secondary" className="h-8 text-xs" icon={<FileUp size={13} />} onClick={() => fileRef.current?.click()}>
            Importar
          </Button>
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          <span className="flex-1 text-[11px] text-faint">Exportar legendas</span>
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs"
            icon={<Download size={12} />}
            disabled={!track.captions.length}
            onClick={() => exportFile('srt')}
            title="Baixar as legendas em .srt"
          >
            .srt
          </Button>
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs"
            icon={<Download size={12} />}
            disabled={!track.captions.length}
            onClick={() => exportFile('vtt')}
            title="Baixar as legendas em .vtt"
          >
            .vtt
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".srt,.vtt,text/vtt"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />

        {/* Estilo */}
        <SectionTitle>Estilo</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {CAPTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setTrack((t) => ({ ...t, style: captionStyle(preset.id, { y: t.style.y }) }))}
              className="group text-left"
            >
              <div
                className={cx(
                  'aspect-video overflow-hidden rounded-lg ring-2 transition-all',
                  style.preset === preset.id ? 'ring-accent' : 'ring-transparent group-hover:ring-line-strong',
                )}
              >
                <CaptionThumb presetId={preset.id} />
              </div>
              <p className={cx('mt-1 truncate text-[11px]', style.preset === preset.id ? 'text-fg' : 'text-dim')}>{preset.name}</p>
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-1.5">
          {POSITIONS.map((p) => (
            <button
              key={p.label}
              onClick={() => setStyle({ y: p.y })}
              className={cx(
                'flex-1 rounded-lg border px-2 py-1 text-[11px] transition-colors',
                Math.abs(style.y - p.y) < 0.05 ? 'border-accent bg-accent/15 text-fg' : 'border-line text-dim hover:border-line-strong',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Range label="Tamanho" value={style.size} display={`${Math.round(style.size * 100)}%`} min={0.025} max={0.18} step={0.005} onChange={(size) => setStyle({ size })} />
        <Range label="Altura" value={style.y} display={`${Math.round(style.y * 100)}%`} min={0.05} max={0.95} step={0.01} onChange={(y) => setStyle({ y })} />
        <Range
          label="Palavras por legenda"
          value={track.maxWords}
          display={String(track.maxWords)}
          min={1}
          max={12}
          step={1}
          onChange={(maxWords) => setTrack((t) => regroup(t, maxWords))}
        />
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-dim">Maiúsculas</span>
          <Switch checked={style.uppercase} label="Maiúsculas" onChange={(uppercase) => setStyle({ uppercase })} />
        </div>
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-dim">Cor / destaque</span>
          <span className="flex gap-1.5">
            <ColorDot value={style.color} onChange={(color) => setStyle({ color })} />
            <ColorDot value={style.highlight} onChange={(highlight) => setStyle({ highlight })} />
          </span>
        </div>

        {/* Lista */}
        <SectionTitle extra={<span className="text-[11px] text-faint">{track.captions.length}</span>}>Texto</SectionTitle>
        {track.captions.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-faint">
            Gere automaticamente, importe um .srt ou crie uma nova no cursor.
          </p>
        )}
        <div ref={listRef} className="space-y-1.5">
          {track.captions.map((c) => (
            <div
              key={c.id}
              data-caption={c.id}
              className={cx('rounded-lg border p-2 transition-colors', active?.id === c.id ? 'border-accent bg-accent/10' : 'border-line bg-panel-2')}
            >
              <div className="mb-1 flex items-center gap-1">
                <button onClick={() => onSeek(c.start + 0.01)} className="font-mono text-[10px] text-faint hover:text-accent" title="Ir para esta legenda">
                  {formatTime(c.start)} → {formatTime(c.end)}
                </button>
                <span className="flex-1" />
                <button
                  title="Começar no cursor"
                  onClick={() => setCaption(c.id, { start: Math.min(time, c.end - 0.1), words: undefined })}
                  className="rounded px-1 text-[10px] text-faint hover:bg-panel-3 hover:text-fg"
                >
                  ⇤
                </button>
                <button
                  title="Terminar no cursor"
                  onClick={() => setCaption(c.id, { end: Math.max(time, c.start + 0.1), words: undefined })}
                  className="rounded px-1 text-[10px] text-faint hover:bg-panel-3 hover:text-fg"
                >
                  ⇥
                </button>
                <IconButton
                  label="Apagar legenda"
                  className="size-5 hover:!text-danger"
                  onClick={() => setTrack((t) => ({ ...t, captions: t.captions.filter((x) => x.id !== c.id) }))}
                >
                  <X size={12} />
                </IconButton>
              </div>
              <textarea
                value={c.text}
                rows={Math.min(3, Math.ceil(c.text.length / 34) || 1)}
                onChange={(e) => {
                  const text = e.target.value;
                  // Mudou o texto: o tempo das palavras deixa de valer (é redistribuído).
                  setCaption(c.id, { text, words: c.words && c.words.map((w) => w.text).join(' ') === text ? c.words : undefined });
                }}
                className="w-full resize-none bg-transparent text-xs leading-snug outline-none"
              />
            </div>
          ))}
        </div>
        {track.captions.length > 0 && (
          <Button
            variant="danger"
            icon={<Trash size={13} />}
            className="mt-3 w-full text-xs"
            onClick={() => confirm('Apagar todas as legendas?') && setTrack((t) => ({ ...t, captions: [] }))}
          >
            Apagar todas
          </Button>
        )}
      </div>
    </>
  );
}

function Range(props: { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-dim">{props.label}</span>
        <span className="font-mono text-[11px]">{props.display}</span>
      </div>
      <Slider label={props.label} value={props.value} min={props.min} max={props.max} step={props.step} onChange={props.onChange} />
    </div>
  );
}

function ColorDot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative size-6 cursor-pointer rounded-md ring-1 ring-white/20" style={{ background: value }}>
      <input type="color" className="sr-only" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Miniatura do estilo: uma legenda de exemplo com a 2ª palavra "sendo falada". */
function CaptionThumb({ presetId }: { presetId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useSyncExternalStore(previewStore.subscribe, previewStore.getVersion);
  const style = useMemo(() => captionStyle(presetId), [presetId]);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    let cancelled = false;
    void loadFonts().then(() => {
      if (cancelled) return;
      ctx.drawImage(sceneCanvas(0), 0, 0, 256, 144);
      const caption: Caption = {
        id: 'x',
        start: 0,
        end: 3,
        text: 'sua legenda aqui',
        words: [
          { text: 'sua', start: 0, end: 0.5 },
          { text: 'legenda', start: 0.5, end: 1.2 },
          { text: 'aqui', start: 1.2, end: 2 },
        ],
      };
      drawCaption(ctx, { ...style, size: Math.max(style.size, 0.07) }, caption, 0.9, 256, 144);
    });
    return () => {
      cancelled = true;
    };
  }, [style, version]);
  return <canvas ref={ref} width={256} height={144} className="size-full" />;
}
