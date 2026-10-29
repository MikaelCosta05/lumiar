import { AudioLines, BellRing, Film, Headphones, Mic, RotateCcw, SlidersVertical, Video, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { t, tc } from '../i18n';
import {
  anySolo,
  clearSolos,
  dbToFader,
  faderToDb,
  formatDb,
  isAudible,
  MAX_DB,
  MIN_DB,
  masterGainDb,
  mixerStrips,
  resetMix,
  setMasterGainDb,
  setStripMix,
  stripSettings,
  type MixerStrip,
  type StripId,
} from '../project/mixer';
import type { Project } from '../project/model';
import type { Player } from '../preview/player';
import { meterFall, toDbfs, type Level } from '../preview/meters';
import { cx, IconButton, Slider } from './kit';

type Edit = (update: (project: Project) => Project) => void;

const FADER_H = 132;
const METER_W = 14;
/** Marcas da escala (dB) ao lado dos medidores */
const TICKS = [6, 0, -6, -12, -24, -48];
/** Quanto tempo (s) a marca do pico máximo fica parada antes de cair */
const HOLD = 1.5;

/**
 * Mixer de áudio: um canal por trilha com som (principal, trilhas de vídeo e de áudio) e o Master.
 * Cada canal tem fader em dB, pan, mudo, solo e medidor ao vivo; o Master mostra o pico e a sonoridade (LUFS).
 * Os ajustes ficam no projeto e valem igual no preview e na exportação.
 */
export function MixerPanel({
  project,
  onEdit,
  playerRef,
  playing,
  onClose,
}: {
  project: Project;
  onEdit: Edit;
  playerRef: RefObject<Player | null>;
  playing: boolean;
  onClose: () => void;
}) {
  const strips = mixerStrips(project);
  const solo = anySolo(project);
  const canvases = useRef(new Map<string, HTMLCanvasElement>());
  const lufsRef = useRef<HTMLSpanElement>(null);
  const peakRef = useRef<HTMLSpanElement>(null);

  // A média da sonoridade recomeça a cada vez que o vídeo volta a tocar.
  useEffect(() => {
    if (playing) playerRef.current?.mixer.resetLoudness();
  }, [playing, playerRef]);

  // Medidores: um laço por quadro desenhando direto nos canvases (sem passar pelo React).
  useEffect(() => {
    const state = new Map<string, MeterState>();
    let frame = 0;
    let last = performance.now();
    let lastText = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = (now - last) / 1000;
      last = now;
      const levels = playerRef.current?.mixer.levels();
      if (!levels) return;
      const draw = (key: string, level: Level) => {
        const canvas = canvases.current.get(key);
        if (!canvas) return;
        let s = state.get(key);
        if (!s) state.set(key, (s = newMeterState()));
        updateMeter(s, level, dt, now / 1000);
        drawMeter(canvas, s);
      };
      for (const [id, level] of levels.strips) draw(id, level);
      draw('master', levels.master);
      // Os números mudam devagar, para dar para ler.
      if (now - lastText > 250) {
        lastText = now;
        if (lufsRef.current) lufsRef.current.textContent = Number.isFinite(levels.lufs) && levels.lufs > -70 ? levels.lufs.toFixed(1) : '—';
        const master = state.get('master');
        if (peakRef.current && master) peakRef.current.textContent = formatDb(Math.max(...master.hold));
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playerRef]);

  const canvasRef = (key: string) => (el: HTMLCanvasElement | null) => {
    if (el) canvases.current.set(key, el);
    else canvases.current.delete(key);
  };

  return (
    <div
      className="absolute bottom-full right-3 z-40 mb-2 flex max-w-[calc(100%-1.5rem)] animate-pop-in flex-col rounded-xl border border-line-strong bg-panel-2/95 shadow-2xl shadow-black/50 backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line pl-3 pr-1.5">
        <SlidersVertical size={13} className="text-accent" />
        <span className="mr-auto text-xs font-semibold">{t('Mixer de áudio')}</span>
        {solo && (
          <button
            className="rounded-md bg-amber/15 px-2 py-0.5 text-[11px] font-medium text-amber hover:bg-amber/25"
            title={t('Com algum solo ligado, só os canais em solo tocam')}
            onClick={() => onEdit(clearSolos)}
          >
            {t('Tirar os solos')}
          </button>
        )}
        <IconButton label={t('Zerar o mixer: todos os canais em 0 dB, no centro e sem solo')} onClick={() => onEdit(resetMix)}>
          <RotateCcw size={13} />
        </IconButton>
        <IconButton label={t('Fechar')} onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>
      <div className="flex min-h-0 overflow-x-auto">
        <div className="flex">
          {strips.map((strip) => (
            <Strip key={strip.id} project={project} strip={strip} solo={solo} onEdit={onEdit} meter={canvasRef(strip.id)} />
          ))}
        </div>
        {/* Master */}
        <div className="sticky right-0 flex w-[92px] shrink-0 flex-col items-center gap-1.5 border-l border-line bg-panel-2 px-2 py-2">
          <span className="w-full truncate text-center text-[11px] font-semibold text-fg">{t('Master')}</span>
          <div className="flex h-6 w-full flex-col items-center justify-center text-[10px] leading-tight text-faint" title={t('Sonoridade de curto prazo (últimos 3 s), como as plataformas medem')}>
            <span>
              <span ref={lufsRef} className="font-mono text-[11px] text-fg">—</span> LUFS
            </span>
          </div>
          <FaderWithMeter
            db={masterGainDb(project)}
            onChange={(db) => onEdit((p) => setMasterGainDb(p, db))}
            meter={canvasRef('master')}
            label={t('Volume geral (Master)')}
          />
          <span className="font-mono text-[10px] text-dim">{formatDb(masterGainDb(project))} dB</span>
          <span className="text-[10px] text-faint" title={t('Pico mais alto do último instante (dBFS)')}>
            {t('pico')} <span ref={peakRef} className="font-mono text-dim">−∞</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function stripIcon(strip: MixerStrip): ReactNode {
  if (strip.kind === 'main') return <Film size={12} />;
  if (strip.kind === 'video') return <Video size={12} />;
  if (strip.trackKind === 'voice') return <Mic size={12} />;
  if (strip.trackKind === 'music') return <Headphones size={12} />;
  if (strip.trackKind === 'sfx') return <BellRing size={12} />;
  return <AudioLines size={12} />;
}

function panLabel(pan: number): string {
  const n = Math.round(Math.abs(pan) * 100);
  if (n === 0) return tc('pan', 'C');
  return pan < 0 ? t('E{n}', { n }) : t('D{n}', { n });
}

function Strip({
  project,
  strip,
  solo,
  onEdit,
  meter,
}: {
  project: Project;
  strip: MixerStrip;
  solo: boolean;
  onEdit: Edit;
  meter: (el: HTMLCanvasElement | null) => void;
}) {
  const s = stripSettings(project, strip.id);
  const audible = isAudible(project, strip.id, solo);
  const set = (patch: Parameters<typeof setStripMix>[2]) => onEdit((p) => setStripMix(p, strip.id, patch));
  return (
    <div className="flex w-[78px] shrink-0 flex-col items-center gap-1.5 border-r border-line px-1.5 py-2 last:border-r-0">
      <span className="flex w-full items-center justify-center gap-1 text-[11px] font-medium text-dim" title={strip.name}>
        <span className="shrink-0 text-faint">{stripIcon(strip)}</span>
        <span className="truncate">{strip.name}</span>
      </span>
      <div className="flex h-6 w-full items-center gap-1" title={t('Pan: esquerda ou direita (dois cliques: centro)')} onDoubleClick={() => set({ pan: 0 })}>
        <Slider value={s.pan} min={-1} max={1} step={0.02} onChange={(pan) => set({ pan: Math.abs(pan) < 0.03 ? 0 : pan })} className="min-w-0 flex-1" label={t('Pan')} />
        <span className="w-6 shrink-0 text-right font-mono text-[9px] text-faint">{panLabel(s.pan)}</span>
      </div>
      <div className={cx('transition-opacity', !audible && 'opacity-40')}>
        <FaderWithMeter db={s.gainDb} onChange={(gainDb) => set({ gainDb })} meter={meter} label={t('Volume de "{name}"', { name: strip.name })} />
      </div>
      <span className="font-mono text-[10px] text-dim">{formatDb(s.gainDb)} dB</span>
      <div className="flex gap-1">
        <button
          title={s.muted ? t('Ativar som') : t('Silenciar trilha')}
          onClick={() => set({ muted: !s.muted })}
          className={cx(
            'h-5 w-7 rounded text-[10px] font-bold transition-colors',
            s.muted ? 'bg-danger/80 text-white' : !audible ? 'bg-panel-3 text-danger/70 ring-1 ring-danger/40' : 'bg-panel-3 text-dim hover:text-fg',
          )}
        >
          {tc('mixer', 'M')}
        </button>
        <button
          title={s.solo ? t('Tirar o solo') : t('Solo: ouvir só esta trilha')}
          onClick={() => set({ solo: !s.solo })}
          className={cx('h-5 w-7 rounded text-[10px] font-bold transition-colors', s.solo ? 'bg-amber text-black/80' : 'bg-panel-3 text-dim hover:text-fg')}
        >
          {tc('mixer', 'S')}
        </button>
      </div>
    </div>
  );
}

/** Fader vertical em dB (−∞ a +6) com o medidor do canal ao lado, na mesma escala. */
function FaderWithMeter({
  db,
  onChange,
  meter,
  label,
}: {
  db: number;
  onChange: (db: number) => void;
  meter: (el: HTMLCanvasElement | null) => void;
  label: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const position = dbToFader(db);
  const store = (value: number) => onChange(Number.isFinite(value) ? Math.round(value * 10) / 10 : MIN_DB);

  const fromPointer = (e: ReactPointerEvent) => {
    const rect = track.current!.getBoundingClientRect();
    const p = 1 - (e.clientY - rect.top) / rect.height;
    // Perto do 0 dB, gruda nele.
    const value = faderToDb(p);
    store(Math.abs(value) < 0.4 ? 0 : value);
  };

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 3 : 0.5;
    const current = db <= MIN_DB ? MIN_DB : db;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') store(Math.min(MAX_DB, current + step));
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') store(Math.max(MIN_DB, current - step));
    else if (e.key === 'Home' || e.key === '0') store(0);
    else return;
    // As setas não andam com o cursor da timeline enquanto o fader está em foco.
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="flex items-stretch gap-1" style={{ height: FADER_H }}>
      <canvas ref={meter} width={METER_W} height={FADER_H} className="rounded-sm" style={{ width: METER_W, height: FADER_H }} />
      <div className="relative w-4 text-[8px] leading-none text-faint" aria-hidden>
        {TICKS.map((tick) => (
          <span key={tick} className="absolute left-0 translate-y-1/2 font-mono" style={{ bottom: `${dbToFader(tick) * 100}%` }}>
            {tick > 0 ? `+${tick}` : tick}
          </span>
        ))}
      </div>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={MIN_DB}
        aria-valuemax={MAX_DB}
        aria-valuenow={db}
        aria-valuetext={`${formatDb(db)} dB`}
        title={`${label} · ${t('dois cliques: 0 dB')}`}
        className="relative w-5 cursor-ns-resize touch-none rounded outline-none focus-visible:ring-2 focus-visible:ring-accent"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
        }}
        onDoubleClick={() => store(0)}
        onKeyDown={onKey}
      >
        <span className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-black/50" />
        {/* Marca do 0 dB */}
        <span className="absolute left-0.5 right-0.5 h-px bg-line-strong" style={{ bottom: `${dbToFader(0) * 100}%` }} />
        <span
          className="absolute left-0 right-0 h-2.5 translate-y-1/2 rounded-sm border border-black/60 bg-gradient-to-b from-zinc-200 to-zinc-400 shadow"
          style={{ bottom: `${position * 100}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Desenho dos medidores

interface MeterState {
  /** dBFS mostrados (pico e RMS), com a queda suave */
  peak: [number, number];
  rms: [number, number];
  /** Marca do pico máximo e quando ela foi marcada */
  hold: [number, number];
  holdAt: [number, number];
  /** Passou de 0 dBFS (fica vermelho até sair do mixer) */
  clipped: [boolean, boolean];
}

function newMeterState(): MeterState {
  return { peak: [-Infinity, -Infinity], rms: [-Infinity, -Infinity], hold: [-Infinity, -Infinity], holdAt: [0, 0], clipped: [false, false] };
}

function updateMeter(s: MeterState, level: Level, dt: number, now: number): void {
  for (const side of [0, 1] as const) {
    const peak = toDbfs(level.peak[side]);
    s.peak[side] = meterFall(s.peak[side], peak, dt);
    s.rms[side] = meterFall(s.rms[side], toDbfs(level.rms[side]), dt, 18);
    if (peak >= s.hold[side] || now - s.holdAt[side] > HOLD) {
      s.hold[side] = peak;
      s.holdAt[side] = now;
    }
    if (level.peak[side] >= 1) s.clipped[side] = true;
  }
}

function drawMeter(canvas: HTMLCanvasElement, s: MeterState): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, w, h);
  const y = (db: number) => h - dbToFader(Math.min(MAX_DB, db)) * h;
  // Marcas da escala.
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (const tick of TICKS) ctx.fillRect(0, Math.round(y(tick)), w, 1);
  const bar = Math.floor((w - 1) / 2);
  const gradient = ctx.createLinearGradient(0, h, 0, 0);
  gradient.addColorStop(0, '#22c55e');
  gradient.addColorStop(dbToFader(-12), '#4ade80');
  gradient.addColorStop(dbToFader(-6), '#facc15');
  gradient.addColorStop(dbToFader(-1), '#f97316');
  gradient.addColorStop(dbToFader(0), '#ef4444');
  gradient.addColorStop(1, '#ef4444');
  for (const side of [0, 1] as const) {
    const x = side * (bar + 1);
    // Pico mais claro por trás, RMS cheio na frente.
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = gradient;
    const peakY = y(s.peak[side]);
    ctx.fillRect(x, peakY, bar, h - peakY);
    ctx.globalAlpha = 1;
    const rmsY = y(s.rms[side]);
    ctx.fillRect(x, rmsY, bar, h - rmsY);
    if (Number.isFinite(s.hold[side]) && s.hold[side] > MIN_DB) {
      ctx.fillStyle = s.hold[side] >= 0 ? '#ef4444' : '#e5e7eb';
      ctx.fillRect(x, Math.round(y(s.hold[side])), bar, 2);
    }
    if (s.clipped[side]) {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x, 0, bar, 3);
    }
  }
}

// ---------------------------------------------------------------- Botões nos cabeçalhos da timeline

/** Solo da trilha, no cabeçalho da timeline (o mesmo do mixer). */
export function SoloButton({ project, strip, onEdit }: { project: Project; strip: StripId; onEdit: Edit }) {
  const solo = stripSettings(project, strip).solo;
  return (
    <IconButton
      label={solo ? t('Tirar o solo') : t('Solo: ouvir só esta trilha')}
      active={solo}
      className={cx(solo && '!bg-amber/20 !text-amber')}
      onClick={() => onEdit((p) => setStripMix(p, strip, { solo: !solo }))}
    >
      <span className="text-[10px] font-bold leading-none">{tc('mixer', 'S')}</span>
    </IconButton>
  );
}

/** Mudo e solo da trilha principal (que antes não tinha botões no cabeçalho). */
export function MainTrackMixButtons({ project, onEdit }: { project: Project; onEdit: Edit }) {
  const { muted } = stripSettings(project, 'main');
  return (
    <>
      <SoloButton project={project} strip="main" onEdit={onEdit} />
      <IconButton label={muted ? t('Ativar som') : t('Silenciar trilha')} active={muted} onClick={() => onEdit((p) => setStripMix(p, 'main', { muted: !muted }))}>
        {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
      </IconButton>
    </>
  );
}
