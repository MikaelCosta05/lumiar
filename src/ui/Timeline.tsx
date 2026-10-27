import {
  AudioLines,
  Blend,
  Bookmark,
  ChevronDown,
  Eye,
  EyeOff,
  Layers,
  Headphones,
  Mic,
  Square,
  Captions as CaptionsIcon,
  Film,
  Image as ImageIcon,
  Magnet,
  Maximize2,
  Palette,
  Plus,
  Redo2,
  ScanFace,
  Gauge,
  Video,
  Scissors,
  Sparkles,
  Trash,
  Type,
  Undo2,
  Unlink,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { keyframeTimes } from '../engine/keyframes';
import { getPlugin } from '../engine/registry';
import {
  addAudioTrack,
  addVideoTrack,
  clipLength,
  getMedia,
  moveAudioClip,
  moveOverlayClip,
  removeAudioTrack,
  removeVideoTrack,
  speedOf,
  trimAudioClip,
  trimOverlayClip,
  trimVideoClip,
  updateAudioTrack,
  updateVideoTrack,
  type Project,
  type TimelineLayout,
} from '../project/model';
import { addTextTrack, moveTextClip, removeTextTrack, resizeTextClip } from '../project/text';
import { formatTime } from './format';
import { Button, cx, IconButton, Slider } from './kit';
import { Filmstrip, Waveform } from './MediaVisuals';
import { MicPicker } from './MicPicker';
import { MEDIA_MIME, PLUGIN_MIME, TEXT_PRESET_MIME, type Selection } from './selection';

export type MediaDropTarget =
  | { row: 'video'; index: number }
  | { row: 'overlay'; track: number; time: number }
  | { row: 'audio'; track: number; time: number };

/** O que recebeu o clique direito na timeline. */
export type TimelineTarget = NonNullable<Selection> | { kind: 'empty'; time: number } | { kind: 'marker'; id: string };

interface Props {
  project: Project;
  timeline: TimelineLayout;
  time: number;
  playing: boolean;
  selection: Selection;
  canUndo: boolean;
  canRedo: boolean;
  onSelect: (selection: Selection) => void;
  onSeek: (time: number) => void;
  onEdit: (update: (project: Project) => Project) => void;
  onImport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSplit: () => void;
  onDetach: () => void;
  onDelete: () => void;
  onDropPlugin: (target: NonNullable<Selection>, pluginId: string) => void;
  onDropMedia: (mediaId: string, target: MediaDropTarget) => void;
  onDropTextPreset: (presetId: string, track: number, time: number) => void;
  onContextMenu: (e: ReactMouseEvent, target: TimelineTarget) => void;
  onAddMarker: () => void;
  /** Segundos gravados da narração (null = não está gravando) */
  recording: number | null;
  onToggleRecord: () => void;
}

const HEADER_W = 172;
const RULER_H = 28;
const VIDEO_H = 84;
const AUDIO_H = 60;
const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120];
const MIN_ZOOM = 10;
const MAX_ZOOM = 300;
const SNAP_PX = 8;

const TEXT_H = 44;
const OVERLAY_H = 56;

type Drag =
  | { type: 'video-in' | 'video-out'; id: string; x0: number; trimIn: number; trimOut: number; speed: number }
  | { type: 'audio-move' | 'text-move' | 'overlay-move'; id: string; x0: number; y0: number; start: number; length: number; track: number }
  | {
      type: 'audio-in' | 'audio-out' | 'text-in' | 'text-out' | 'overlay-in' | 'overlay-out';
      id: string;
      x0: number;
      start: number;
      length: number;
    };

export function Timeline(props: Props) {
  const { project, timeline, time, playing, selection, onSelect, onSeek, onEdit } = props;
  const [pxPerSecond, setPxPerSecond] = useState(60);
  const [snapping, setSnapping] = useState(true);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<{ row: string; x: number } | null>(null);
  const [pluginTarget, setPluginTarget] = useState<string | null>(null);
  const [micOpen, setMicOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentWidth = Math.max(timeline.duration * pxPerSecond + 400, 2400);

  // Acompanha o cursor enquanto toca.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const x = time * pxPerSecond;
    const visible = el.clientWidth - HEADER_W;
    if (x < el.scrollLeft || x > el.scrollLeft + visible - 60) el.scrollLeft = x - 60;
  }, [time, playing, pxPerSecond]);

  const fit = () => {
    const el = scrollRef.current;
    if (!el || timeline.duration <= 0) return;
    setPxPerSecond(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (el.clientWidth - HEADER_W - 80) / timeline.duration)));
    el.scrollLeft = 0;
  };

  const timeAt = (e: { clientX: number; currentTarget: Element }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, (e.clientX - rect.left) / pxPerSecond);
  };

  // ------------------------------------------------ Ímã (snap)
  const snapPoints = (ignoreId?: string) => [
    0,
    time,
    ...timeline.clips.flatMap((l) => [l.start, l.start + l.length]),
    ...project.markers.map((m) => m.time),
    ...project.videoTracks.flatMap((t) =>
      t.clips.filter((c) => c.id !== ignoreId).flatMap((c) => [c.start, c.start + clipLength(c)]),
    ),
    ...project.audioTracks.flatMap((t) =>
      t.clips.filter((c) => c.id !== ignoreId).flatMap((c) => [c.start, c.start + clipLength(c)]),
    ),
    ...project.textTracks.flatMap((t) =>
      t.clips.filter((c) => c.id !== ignoreId).flatMap((c) => [c.start, c.start + c.duration]),
    ),
  ];
  const snapTo = (value: number, points: number[]): number | null => {
    if (!snapping) return null;
    let best: number | null = null;
    for (const p of points) {
      if (Math.abs(p - value) * pxPerSecond <= SNAP_PX && (best === null || Math.abs(p - value) < Math.abs(best - value))) best = p;
    }
    return best;
  };

  // ------------------------------------------------ Arrastar bordas e clipes
  const startDrag = (e: ReactPointerEvent, drag: Drag) => {
    e.stopPropagation();
    e.preventDefault();
    const points = snapPoints(drag.id);
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - drag.x0) / pxPerSecond;
      switch (drag.type) {
        case 'video-in':
          onEdit((p) => trimVideoClip(p, drag.id, 'in', drag.trimIn + dt * drag.speed));
          break;
        case 'video-out':
          onEdit((p) => trimVideoClip(p, drag.id, 'out', drag.trimOut + dt * drag.speed));
          break;
        case 'audio-move':
        case 'overlay-move':
        case 'text-move': {
          let start = Math.max(0, drag.start + dt);
          const a = snapTo(start, points);
          const b = snapTo(start + drag.length, points);
          let line: number | null = null;
          if (a !== null && (b === null || Math.abs(a - start) <= Math.abs(b - start - drag.length))) {
            start = a;
            line = a;
          } else if (b !== null) {
            start = b - drag.length;
            line = b;
          }
          setSnapLine(line);
          if (drag.type === 'audio-move') {
            const track = drag.track + Math.round((ev.clientY - drag.y0) / AUDIO_H);
            onEdit((p) => moveAudioClip(p, drag.id, track, start));
          } else if (drag.type === 'overlay-move') {
            // Trilhas de vídeo extras também aparecem de baixo para cima.
            const track = drag.track - Math.round((ev.clientY - drag.y0) / OVERLAY_H);
            onEdit((p) => moveOverlayClip(p, drag.id, track, start));
          } else {
            // As trilhas de texto aparecem de baixo para cima (a última fica por cima de tudo).
            const track = drag.track - Math.round((ev.clientY - drag.y0) / TEXT_H);
            onEdit((p) => moveTextClip(p, drag.id, track, start));
          }
          break;
        }
        case 'audio-in':
        case 'audio-out':
        case 'text-in':
        case 'text-out':
        case 'overlay-in':
        case 'overlay-out': {
          const entering = drag.type.endsWith('-in');
          const raw = entering ? drag.start + dt : drag.start + drag.length + dt;
          const snapped = snapTo(raw, points);
          setSnapLine(snapped);
          const edge = entering ? 'in' : 'out';
          onEdit((p) =>
            drag.type.startsWith('audio')
              ? trimAudioClip(p, drag.id, edge, snapped ?? raw)
              : drag.type.startsWith('overlay')
                ? trimOverlayClip(p, drag.id, edge, snapped ?? raw)
                : resizeTextClip(p, drag.id, edge, snapped ?? raw),
          );
          break;
        }
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setSnapLine(null);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = drag.type.endsWith('move') ? 'grabbing' : 'ew-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ------------------------------------------------ Soltar mídia e plugins
  const mediaDrop = (row: string, resolve: (e: DragEvent<HTMLDivElement>) => MediaDropTarget) => ({
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes(MEDIA_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropHint({ row, x: timeAt(e) * pxPerSecond });
    },
    onDragLeave: () => setDropHint(null),
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      const mediaId = e.dataTransfer.getData(MEDIA_MIME);
      setDropHint(null);
      if (!mediaId) return;
      e.preventDefault();
      props.onDropMedia(mediaId, resolve(e));
    },
  });

  const pluginDrop = (key: string, target: NonNullable<Selection>) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(PLUGIN_MIME)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setPluginTarget(key);
    },
    onDragLeave: () => setPluginTarget((k) => (k === key ? null : k)),
    onDrop: (e: DragEvent) => {
      const pluginId = e.dataTransfer.getData(PLUGIN_MIME);
      setPluginTarget(null);
      if (!pluginId) return;
      e.preventDefault();
      e.stopPropagation();
      props.onDropPlugin(target, pluginId);
    },
  });

  const step = TICK_STEPS.find((s) => s * pxPerSecond >= 80) ?? 300;
  const ticks: number[] = [];
  for (let t = 0; t <= contentWidth / pxPerSecond; t += step) ticks.push(t);
  const minorPx = (step * pxPerSecond) / 5;

  const selectedVideo = selection?.kind === 'clip' ? project.clips.find((c) => c.id === selection.id) : undefined;
  const canDetach =
    !!selectedVideo && !selectedVideo.audioDetached && !!getMedia(project, selectedVideo.mediaId)?.hasAudio;

  return (
    <section className="flex h-full min-h-0 flex-col border-t border-line bg-panel">
      {/* ------------------------------------------------ Barra de ferramentas */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3">
        <Button variant="secondary" icon={<Plus size={14} />} onClick={props.onImport} className="mr-2">
          Importar
        </Button>
        <IconButton label="Desfazer (Ctrl+Z)" disabled={!props.canUndo} onClick={props.onUndo}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label="Refazer (Ctrl+Shift+Z)" disabled={!props.canRedo} onClick={props.onRedo}>
          <Redo2 size={15} />
        </IconButton>
        <span className="mx-1.5 h-5 w-px bg-line" />
        <IconButton label="Dividir no cursor (S)" onClick={props.onSplit}>
          <Scissors size={15} />
        </IconButton>
        <IconButton label="Separar áudio do vídeo" disabled={!canDetach} onClick={props.onDetach}>
          <Unlink size={15} />
        </IconButton>
        <IconButton
          label="Excluir (Delete)"
          disabled={!selection || selection.kind === 'transition'}
          onClick={props.onDelete}
          className="hover:!text-danger"
        >
          <Trash size={15} />
        </IconButton>
        <span className="mx-1.5 h-5 w-px bg-line" />
        <IconButton label="Ímã (encaixar nas bordas)" active={snapping} onClick={() => setSnapping(!snapping)}>
          <Magnet size={15} />
        </IconButton>

        <IconButton label="Marcador no cursor (M)" onClick={props.onAddMarker}>
          <Bookmark size={15} />
        </IconButton>
        <div className="relative flex items-center">
        <button
          onClick={props.onToggleRecord}
          title={props.recording !== null ? 'Parar a gravação' : 'Gravar narração pelo microfone (a partir do cursor) · R'}
          className={cx(
            'flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors',
            props.recording !== null ? 'bg-danger/15 font-medium text-danger' : 'text-dim hover:bg-panel-3 hover:text-fg',
          )}
        >
          {props.recording !== null ? (
            <>
              <Square size={11} fill="currentColor" />
              <span className="size-1.5 animate-pulse rounded-full bg-danger" />
              {formatTime(props.recording).replace(/\.\d+$/, '')}
            </>
          ) : (
            <>
              <Mic size={14} />
              Narrar
            </>
          )}
        </button>
        {props.recording === null && (
          <button
            title="Escolher o microfone"
            onClick={() => setMicOpen((o) => !o)}
            className={cx('flex h-7 w-5 items-center justify-center rounded-md text-faint transition-colors hover:bg-panel-3 hover:text-fg', micOpen && 'bg-panel-3 text-fg')}
          >
            <ChevronDown size={13} />
          </button>
        )}
        {micOpen && (
          <>
            <div className="fixed inset-0 z-40" onPointerDown={() => setMicOpen(false)} />
            <div className="absolute left-0 top-9 z-50 w-80 animate-pop-in rounded-xl border border-line-strong bg-panel-2 p-3 shadow-2xl shadow-black/50">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Microfone</p>
              <MicPicker compact />
              <Button
                variant="primary"
                icon={<Mic size={13} />}
                className="mt-3 h-8 w-full text-xs"
                onClick={() => {
                  setMicOpen(false);
                  props.onToggleRecord();
                }}
              >
                Gravar narração no cursor
              </Button>
            </div>
          </>
        )}
        </div>
        <span className="mx-1.5 h-5 w-px bg-line" />
        <button
          onClick={() => onEdit(addVideoTrack)}
          title="Nova trilha de vídeo (sobreposição, picture-in-picture)"
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-dim transition-colors hover:bg-panel-3 hover:text-fg"
        >
          <Plus size={13} />
          <Film size={13} className="text-accent" />
          Trilha
        </button>
        <button
          onClick={() => onEdit(addAudioTrack)}
          title="Nova trilha de áudio"
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-dim transition-colors hover:bg-panel-3 hover:text-fg"
        >
          <Plus size={13} />
          <AudioLines size={13} className="text-teal-300" />
          Trilha
        </button>
        <button
          onClick={() => onEdit(addTextTrack)}
          title="Nova trilha de texto"
          className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-dim transition-colors hover:bg-panel-3 hover:text-fg"
        >
          <Plus size={13} />
          <Type size={13} className="text-fuchsia-300" />
          Trilha
        </button>
        <span className="flex-1" />
        <IconButton label="Diminuir zoom" onClick={() => setPxPerSecond((z) => Math.max(MIN_ZOOM, z / 1.4))}>
          <ZoomOut size={15} />
        </IconButton>
        <Slider label="Zoom" className="!w-28" value={pxPerSecond} min={MIN_ZOOM} max={MAX_ZOOM} step={1} onChange={setPxPerSecond} />
        <IconButton label="Aumentar zoom" onClick={() => setPxPerSecond((z) => Math.min(MAX_ZOOM, z * 1.4))}>
          <ZoomIn size={15} />
        </IconButton>
        <IconButton label="Encaixar tudo" onClick={fit}>
          <Maximize2 size={14} />
        </IconButton>
      </div>

      {/* ------------------------------------------------ Trilhas */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: HEADER_W + contentWidth }}>
          {/* Régua */}
          <div className="sticky top-0 z-30 flex border-b border-line bg-panel" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-panel" style={{ width: HEADER_W }} />
            <div
              className="relative flex-1 cursor-pointer"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, var(--color-line) 0 1px, transparent 1px ${minorPx}px)`,
                backgroundSize: '100% 6px',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'bottom',
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                onSeek(timeAt(e));
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) onSeek(timeAt(e));
              }}
            >
              {ticks.map((t) => (
                <span
                  key={t}
                  className="pointer-events-none absolute inset-y-0 border-l border-line-strong pl-1 pt-1 font-mono text-[10px] text-faint"
                  style={{ left: t * pxPerSecond }}
                >
                  {formatTime(t).replace(/\.\d+$/, '')}
                </span>
              ))}
              {project.markers.map((m) => (
                <button
                  key={m.id}
                  title={`${m.label} · ${formatTime(m.time)}\nClique para ir · botão direito para editar`}
                  className="absolute bottom-0 z-[11] -ml-[5px] flex h-4 w-[11px] items-start justify-center transition-transform hover:scale-125"
                  style={{ left: m.time * pxPerSecond }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSeek(m.time);
                  }}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    props.onContextMenu(e, { kind: 'marker', id: m.id });
                  }}
                >
                  <span className="h-full w-full [clip-path:polygon(0_0,100%_0,100%_65%,50%_100%,0_65%)]" style={{ background: m.color }} />
                </button>
              ))}
              <div
                className="pointer-events-none absolute top-0 z-10 -ml-[6px] h-3.5 w-[13px] bg-playhead [clip-path:polygon(0_0,100%_0,100%_55%,50%_100%,0_55%)]"
                style={{ left: time * pxPerSecond }}
              />
            </div>
          </div>

          {/* Legendas */}
          {project.captions && project.captions.captions.length > 0 && (
            <Row
              height={30}
              className={cx(!project.captions.enabled && 'opacity-40')}
              header={<TrackHeader icon={<CaptionsIcon size={13} />} name="Legendas" accent="amber" />}
              contentProps={{
                onPointerDown: (e) => {
                  if (e.target !== e.currentTarget) return;
                  onSelect(null);
                  onSeek(timeAt(e));
                },
                onContextMenu: (e) => {
                  if (e.target === e.currentTarget) props.onContextMenu(e, { kind: 'empty', time: timeAt(e) });
                },
              }}
            >
              {project.captions.captions.map((c) => {
                const playing = time >= c.start && time < c.end;
                return (
                  <button
                    key={c.id}
                    title={c.text}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSeek(c.start + 0.01);
                    }}
                    className={cx(
                      'absolute inset-y-1 overflow-hidden rounded px-1 text-left text-[10px] font-medium text-amber-950 transition-colors',
                      playing ? 'bg-amber' : 'bg-amber/60 hover:bg-amber/80',
                    )}
                    style={{ left: c.start * pxPerSecond, width: Math.max(4, (c.end - c.start) * pxPerSecond - 1) }}
                  >
                    <span className="block truncate">{c.text}</span>
                  </button>
                );
              })}
            </Row>
          )}

          {/* Trilhas de texto (a última fica por cima, então aparece no topo) */}
          {[...project.textTracks].reverse().map((track) => {
            const trackIndex = project.textTracks.indexOf(track);
            return (
              <Row
                key={track.id}
                height={TEXT_H}
                className="bg-accent-2/[0.03]"
                header={
                  <TrackHeader
                    icon={<Type size={13} />}
                    name={track.name}
                    accent="violet"
                    actions={
                      project.textTracks.length > 1 &&
                      track.clips.length === 0 && (
                        <IconButton label="Remover trilha" onClick={() => onEdit((p) => removeTextTrack(p, track.id))}>
                          <X size={13} />
                        </IconButton>
                      )
                    }
                  />
                }
                contentProps={{
                  onPointerDown: (e) => {
                    if (e.target !== e.currentTarget) return;
                    onSelect(null);
                    onSeek(timeAt(e));
                  },
                  onContextMenu: (e) => {
                    if (e.target === e.currentTarget) props.onContextMenu(e, { kind: 'empty', time: timeAt(e) });
                  },
                  onDragOver: (e) => {
                    if (!e.dataTransfer.types.includes(TEXT_PRESET_MIME)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    setDropHint({ row: `text:${trackIndex}`, x: timeAt(e) * pxPerSecond });
                  },
                  onDragLeave: () => setDropHint(null),
                  onDrop: (e) => {
                    const presetId = e.dataTransfer.getData(TEXT_PRESET_MIME);
                    setDropHint(null);
                    if (!presetId) return;
                    e.preventDefault();
                    const t = timeAt(e);
                    props.onDropTextPreset(presetId, trackIndex, snapTo(t, snapPoints()) ?? t);
                  },
                }}
              >
                {project.textTracks.every((t) => t.clips.length === 0) && trackIndex === 0 && (
                  <div className="pointer-events-none absolute inset-y-1.5 left-3 flex w-96 items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-faint">
                    Arraste textos da aba “Textos” para cá
                  </div>
                )}
                {track.clips.map((clip) => {
                  const selected = selection?.kind === 'text' && selection.id === clip.id;
                  return (
                    <div
                      key={clip.id}
                      title={clip.text}
                      className={cx(
                        'group absolute inset-y-1 cursor-grab overflow-hidden rounded-md bg-gradient-to-r from-[#6d28d9] to-[#c026d3] ring-2 transition-shadow active:cursor-grabbing',
                        selected ? 'z-10 ring-white shadow-lg shadow-fuchsia-500/30' : 'ring-black/50 hover:ring-white/40',
                      )}
                      style={{ left: clip.start * pxPerSecond, width: Math.max(6, clip.duration * pxPerSecond) }}
                      onContextMenu={(e) => {
                        onSelect({ kind: 'text', id: clip.id });
                        props.onContextMenu(e, { kind: 'text', id: clip.id });
                      }}
                      onPointerDown={(e) => {
                        onSelect({ kind: 'text', id: clip.id });
                        startDrag(e, {
                          type: 'text-move',
                          id: clip.id,
                          x0: e.clientX,
                          y0: e.clientY,
                          start: clip.start,
                          length: clip.duration,
                          track: trackIndex,
                        });
                      }}
                    >
                      <div className="pointer-events-none flex h-full items-center gap-1.5 px-2 text-[11px] text-white">
                        <Type size={12} className="shrink-0 opacity-80" />
                        <span className="truncate font-medium" style={{ fontFamily: `"${clip.style.font}"` }}>
                          {clip.text.split('\n')[0]}
                        </span>
                      </div>
                      <TrimHandle
                        side="left"
                        visible={selected}
                        onPointerDown={(e) => {
                          onSelect({ kind: 'text', id: clip.id });
                          startDrag(e, { type: 'text-in', id: clip.id, x0: e.clientX, start: clip.start, length: clip.duration });
                        }}
                      />
                      <TrimHandle
                        side="right"
                        visible={selected}
                        onPointerDown={(e) => {
                          onSelect({ kind: 'text', id: clip.id });
                          startDrag(e, { type: 'text-out', id: clip.id, x0: e.clientX, start: clip.start, length: clip.duration });
                        }}
                      />
                    </div>
                  );
                })}
                {dropHint?.row === `text:${trackIndex}` && <DropLine x={dropHint.x} />}
              </Row>
            );
          })}

          {/* Trilhas de vídeo extras (a última fica por cima de tudo) */}
          {[...project.videoTracks].reverse().map((track) => {
            const trackIndex = project.videoTracks.indexOf(track);
            return (
              <Row
                key={track.id}
                height={OVERLAY_H}
                className={cx('bg-accent/[0.02]', track.hidden && 'opacity-40')}
                header={
                  <TrackHeader
                    icon={<Layers size={13} />}
                    name={track.name}
                    accent="accent"
                    actions={
                      <>
                        <IconButton
                          label={track.hidden ? 'Mostrar trilha' : 'Esconder trilha'}
                          active={track.hidden}
                          onClick={() => onEdit((p) => updateVideoTrack(p, track.id, (t) => ({ ...t, hidden: !t.hidden })))}
                        >
                          {track.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </IconButton>
                        <IconButton
                          label={track.muted ? 'Ativar som' : 'Silenciar trilha'}
                          active={track.muted}
                          onClick={() => onEdit((p) => updateVideoTrack(p, track.id, (t) => ({ ...t, muted: !t.muted })))}
                        >
                          {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                        </IconButton>
                        {track.clips.length === 0 && (
                          <IconButton label="Remover trilha" onClick={() => onEdit((p) => removeVideoTrack(p, track.id))}>
                            <X size={13} />
                          </IconButton>
                        )}
                      </>
                    }
                  />
                }
                contentProps={{
                  onPointerDown: (e) => {
                    if (e.target !== e.currentTarget) return;
                    onSelect(null);
                    onSeek(timeAt(e));
                  },
                  onContextMenu: (e) => {
                    if (e.target === e.currentTarget) props.onContextMenu(e, { kind: 'empty', time: timeAt(e) });
                  },
                  ...mediaDrop(`overlay:${trackIndex}`, (e) => {
                    const t = timeAt(e);
                    return { row: 'overlay', track: trackIndex, time: snapTo(t, snapPoints()) ?? t };
                  }),
                }}
              >
                {track.clips.length === 0 && (
                  <div className="pointer-events-none absolute inset-y-1.5 left-3 flex w-96 items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-faint">
                    Arraste vídeos e imagens para sobrepor
                  </div>
                )}
                {track.clips.map((clip) => {
                  const media = getMedia(project, clip.mediaId);
                  if (!media) return null;
                  const length = clipLength(clip);
                  const width = Math.max(6, length * pxPerSecond);
                  const selected = selection?.kind === 'overlay' && selection.id === clip.id;
                  const dropping = pluginTarget === `overlay:${clip.id}`;
                  return (
                    <div
                      key={clip.id}
                      title={media.name}
                      className={cx(
                        'group absolute inset-y-1 cursor-grab overflow-hidden rounded-md bg-[#2a2f5e] ring-2 transition-shadow active:cursor-grabbing',
                        selected ? 'z-10 ring-white shadow-lg shadow-accent/30' : 'ring-black/50 hover:ring-white/40',
                        dropping && 'z-10 ring-accent-2',
                      )}
                      style={{ left: clip.start * pxPerSecond, width }}
                      onPointerDown={(e) => {
                        onSelect({ kind: 'overlay', id: clip.id });
                        startDrag(e, { type: 'overlay-move', id: clip.id, x0: e.clientX, y0: e.clientY, start: clip.start, length, track: trackIndex });
                      }}
                      onContextMenu={(e) => {
                        onSelect({ kind: 'overlay', id: clip.id });
                        props.onContextMenu(e, { kind: 'overlay', id: clip.id });
                      }}
                      {...pluginDrop(`overlay:${clip.id}`, { kind: 'overlay', id: clip.id })}
                    >
                      <Filmstrip media={media} trimIn={clip.trimIn} pxPerSecond={pxPerSecond / speedOf(clip)} width={width} height={OVERLAY_H} />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent" />
                      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1 px-1.5 pt-1">
                        <span className="flex size-[18px] shrink-0 items-center justify-center rounded bg-black/50 text-white/90 backdrop-blur-sm">
                          <Layers size={11} />
                        </span>
                        <span className="truncate rounded bg-black/50 px-1.5 py-px text-[11px] font-medium text-white backdrop-blur-sm">{media.name}</span>
                        {clip.filter && (
                          <span className="flex shrink-0 items-center rounded-full bg-pink px-1 py-px text-white" title="Filtro">
                            <Palette size={9} />
                          </span>
                        )}
                        {clip.effects.length > 0 && (
                          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent-2 px-1.5 py-px text-[10px] font-bold text-white">
                            <Sparkles size={9} />
                            {clip.effects.length}
                          </span>
                        )}
                        {clip.transform.chroma && (
                          <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 py-px text-[9px] font-bold text-white" title="Chroma key">
                            KEY
                          </span>
                        )}
                      </div>
                      {dropping && (
                        <div className="absolute inset-0 flex items-center justify-center bg-accent-2/30 text-xs font-semibold text-white">
                          Soltar para aplicar
                        </div>
                      )}
                      <TrimHandle
                        side="left"
                        visible={selected}
                        onPointerDown={(e) => {
                          onSelect({ kind: 'overlay', id: clip.id });
                          startDrag(e, { type: 'overlay-in', id: clip.id, x0: e.clientX, start: clip.start, length });
                        }}
                      />
                      <TrimHandle
                        side="right"
                        visible={selected}
                        onPointerDown={(e) => {
                          onSelect({ kind: 'overlay', id: clip.id });
                          startDrag(e, { type: 'overlay-out', id: clip.id, x0: e.clientX, start: clip.start, length });
                        }}
                      />
                    </div>
                  );
                })}
                {dropHint?.row === `overlay:${trackIndex}` && <DropLine x={dropHint.x} />}
              </Row>
            );
          })}

          {/* Trilha de vídeo */}
          <Row
            header={<TrackHeader icon={<Film size={13} />} name={project.videoTracks.length ? 'Vídeo 1' : 'Vídeo'} accent="accent" />}
            height={VIDEO_H}
            className="bg-accent/[0.03]"
            contentProps={{
              onPointerDown: (e) => {
                if (e.target !== e.currentTarget) return;
                onSelect(null);
                onSeek(timeAt(e));
              },
              onContextMenu: (e) => {
                if (e.target === e.currentTarget) props.onContextMenu(e, { kind: 'empty', time: timeAt(e) });
              },
              ...mediaDrop('video', (e) => {
                const t = timeAt(e);
                return { row: 'video', index: timeline.clips.filter((l) => l.start + l.length / 2 < t).length };
              }),
            }}
          >
            {project.clips.length === 0 && (
              <div className="pointer-events-none absolute inset-y-2 left-3 flex w-96 items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-xs text-faint">
                Arraste vídeos e imagens para cá
              </div>
            )}

            {timeline.clips.map((layout) => {
              const { clip, media } = layout;
              const selected = selection?.kind === 'clip' && selection.id === clip.id;
              const dropping = pluginTarget === `clip:${clip.id}`;
              const width = Math.max(6, layout.length * pxPerSecond);
              const showAudio = media.hasAudio && !clip.audioDetached;
              return (
                <div
                  key={clip.id}
                  title={media.name}
                  className={cx(
                    'group absolute inset-y-1.5 cursor-pointer overflow-hidden rounded-md bg-[#24345e] ring-2 transition-shadow',
                    selected ? 'z-10 ring-white shadow-lg shadow-accent/30' : 'ring-black/50 hover:ring-white/40',
                    dropping && 'z-10 ring-accent-2',
                  )}
                  style={{ left: layout.start * pxPerSecond, width }}
                  onContextMenu={(e) => {
                    onSelect({ kind: 'clip', id: clip.id });
                    props.onContextMenu(e, { kind: 'clip', id: clip.id });
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect({ kind: 'clip', id: clip.id });
                  }}
                  {...pluginDrop(`clip:${clip.id}`, { kind: 'clip', id: clip.id })}
                >
                  <div className="flex h-full flex-col">
                    <div className="relative min-h-0 flex-1">
                      <Filmstrip media={media} trimIn={clip.trimIn} pxPerSecond={pxPerSecond / speedOf(clip)} width={width} height={VIDEO_H} />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent" />
                      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1 px-1.5 pt-1">
                        <span className="flex size-[18px] shrink-0 items-center justify-center rounded bg-black/50 text-white/90 backdrop-blur-sm">{media.kind === 'image' ? <ImageIcon size={11} /> : <Film size={11} />}</span>
                        <span className="truncate rounded bg-black/50 px-1.5 py-px text-[11px] font-medium text-white backdrop-blur-sm">{media.name}</span>
                        {clip.filter && (
                          <span className="flex shrink-0 items-center rounded-full bg-pink px-1 py-px text-white" title="Filtro">
                            <Palette size={9} />
                          </span>
                        )}
                        {clip.effects.length > 0 && (
                          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent-2 px-1.5 py-px text-[10px] font-bold text-white">
                            <Sparkles size={9} />
                            {clip.effects.length}
                          </span>
                        )}
                        {speedOf(clip) !== 1 && (
                          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-sky-500 px-1.5 py-px font-mono text-[10px] font-bold text-white" title="Velocidade">
                            <Gauge size={9} />
                            {speedOf(clip)}×
                          </span>
                        )}
                        {clip.camera && (clip.camera.follow || Object.keys(clip.camera.keyframes).length > 0) && (
                          <span className="flex shrink-0 items-center rounded-full bg-emerald-500 px-1 py-px text-white" title="Câmera animada">
                            {clip.camera.follow?.kind === 'face' ? <ScanFace size={9} /> : <Video size={9} />}
                          </span>
                        )}
                      </div>
                      {/* Losangos dos keyframes */}
                      {keyframeTimes(...clip.effects.map((e) => e.keyframes), clip.filter?.keyframes, clip.camera?.keyframes).map((t) => (
                        <span
                          key={t}
                          className="pointer-events-none absolute bottom-1 size-2 -translate-x-1/2 rotate-45 rounded-[1px] border border-black/60 bg-amber"
                          style={{ left: t * pxPerSecond }}
                        />
                      ))}
                    </div>
                    {showAudio && (
                      <div className="h-5 shrink-0 border-t border-black/40 bg-[#0b2a2b]">
                        <Waveform
                          mediaId={media.id}
                          trimIn={clip.trimIn}
                          trimOut={clip.trimOut}
                          width={width}
                          height={20}
                          color="rgba(94, 234, 212, 0.5)"
                        />
                      </div>
                    )}
                  </div>
                  {dropping && (
                    <div className="absolute inset-0 flex items-center justify-center bg-accent-2/30 text-xs font-semibold text-white">
                      Soltar para aplicar
                    </div>
                  )}
                  <TrimHandle
                    side="left"
                    visible={selected}
                    onPointerDown={(e) =>
                      startDrag(e, { type: 'video-in', id: clip.id, x0: e.clientX, trimIn: clip.trimIn, trimOut: clip.trimOut, speed: speedOf(clip) })
                    }
                  />
                  <TrimHandle
                    side="right"
                    visible={selected}
                    onPointerDown={(e) =>
                      startDrag(e, { type: 'video-out', id: clip.id, x0: e.clientX, trimIn: clip.trimIn, trimOut: clip.trimOut, speed: speedOf(clip) })
                    }
                  />
                </div>
              );
            })}

            {timeline.clips.slice(1).map((next, i) => {
              const transition = project.transitions[i];
              const overlap = timeline.clips[i].transitionOut;
              const selected = selection?.kind === 'transition' && selection.index === i;
              const dropping = pluginTarget === `transition:${i}`;
              const plugin = transition && getPlugin(transition.pluginId);
              const markerWidth = Math.max(24, overlap * pxPerSecond);
              return (
                <button
                  key={`t${i}`}
                  title={plugin ? `${plugin.name} · ${transition!.duration.toFixed(2)}s` : 'Sem transição — clique para escolher'}
                  className={cx(
                    'absolute top-0 z-20 flex h-5 -translate-y-1/3 items-center justify-center rounded-full text-[10px] font-bold shadow-md transition-all',
                    transition
                      ? 'bg-amber text-black/80 hover:brightness-110'
                      : 'border border-dashed border-faint bg-panel-2 text-faint hover:border-amber hover:text-amber',
                    (selected || dropping) && 'ring-2 ring-white',
                    dropping && 'scale-125',
                  )}
                  style={{
                    left: transition ? next.start * pxPerSecond : next.start * pxPerSecond - markerWidth / 2,
                    width: markerWidth,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSelect({ kind: 'transition', index: i });
                  }}
                  onContextMenu={(e) => {
                    onSelect({ kind: 'transition', index: i });
                    props.onContextMenu(e, { kind: 'transition', index: i });
                  }}
                  {...pluginDrop(`transition:${i}`, { kind: 'transition', index: i })}
                >
                  {transition ? <Blend size={11} /> : <Plus size={11} />}
                </button>
              );
            })}
            {dropHint?.row === 'video' && <DropLine x={dropHint.x} />}
          </Row>

          {/* Trilhas de áudio */}
          {project.audioTracks.map((track, trackIndex) => (
            <Row
              key={track.id}
              height={AUDIO_H}
              header={
                <TrackHeader
                  icon={track.kind === 'voice' ? <Mic size={13} /> : track.kind === 'music' ? <Headphones size={13} /> : <AudioLines size={13} />}
                  name={track.name}
                  accent="teal"
                  actions={
                    <>
                      <IconButton
                        label={track.muted ? 'Ativar som' : 'Silenciar trilha'}
                        active={track.muted}
                        onClick={() => onEdit((p) => updateAudioTrack(p, track.id, (t) => ({ ...t, muted: !t.muted })))}
                      >
                        {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                      </IconButton>
                      {project.audioTracks.length > 1 && track.clips.length === 0 && (
                        <IconButton label="Remover trilha" onClick={() => onEdit((p) => removeAudioTrack(p, track.id))}>
                          <X size={13} />
                        </IconButton>
                      )}
                    </>
                  }
                />
              }
              className={cx(track.muted && 'opacity-50')}
              contentProps={{
                onPointerDown: (e) => {
                  if (e.target !== e.currentTarget) return;
                  onSelect(null);
                  onSeek(timeAt(e));
                },
                onContextMenu: (e) => {
                  if (e.target === e.currentTarget) props.onContextMenu(e, { kind: 'empty', time: timeAt(e) });
                },
                ...mediaDrop(`audio:${trackIndex}`, (e) => {
                  const t = timeAt(e);
                  return { row: 'audio', track: trackIndex, time: snapTo(t, snapPoints()) ?? t };
                }),
              }}
            >
              {track.clips.length === 0 && trackIndex === 0 && (
                <div className="pointer-events-none absolute inset-y-2 left-3 flex w-96 items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-faint">
                  Arraste músicas e áudios para cá
                </div>
              )}
              {track.clips.map((clip) => {
                const media = getMedia(project, clip.mediaId);
                if (!media) return null;
                const length = clipLength(clip);
                const width = Math.max(6, length * pxPerSecond);
                const height = AUDIO_H - 8;
                const selected = selection?.kind === 'audio' && selection.id === clip.id;
                const fadeIn = Math.min(width, clip.fadeIn * pxPerSecond);
                const fadeOut = Math.min(width, clip.fadeOut * pxPerSecond);
                return (
                  <div
                    key={clip.id}
                    title={media.name}
                    className={cx(
                      'group absolute top-1 cursor-grab overflow-hidden rounded-md bg-gradient-to-b from-[#115e59] to-[#0b3f3c] ring-2 transition-shadow active:cursor-grabbing',
                      selected ? 'z-10 ring-white shadow-lg shadow-teal-500/20' : 'ring-black/50 hover:ring-white/40',
                    )}
                    style={{ left: clip.start * pxPerSecond, width, height }}
                    onContextMenu={(e) => {
                      onSelect({ kind: 'audio', id: clip.id });
                      props.onContextMenu(e, { kind: 'audio', id: clip.id });
                    }}
                    onPointerDown={(e) => {
                      onSelect({ kind: 'audio', id: clip.id });
                      startDrag(e, {
                        type: 'audio-move',
                        id: clip.id,
                        x0: e.clientX,
                        y0: e.clientY,
                        start: clip.start,
                        length,
                        track: trackIndex,
                      });
                    }}
                  >
                    <div className="absolute inset-x-0 bottom-0 top-3.5">
                      <Waveform
                        mediaId={media.id}
                        trimIn={clip.trimIn}
                        trimOut={clip.trimOut}
                        width={width}
                        height={height - 14}
                        color="rgba(153, 246, 228, 0.85)"
                      />
                    </div>
                    <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
                      {fadeIn > 0 && <polygon points={`0,0 ${fadeIn},0 0,${height}`} fill="rgba(0,0,0,0.45)" />}
                      {fadeOut > 0 && <polygon points={`${width - fadeOut},0 ${width},0 ${width},${height}`} fill="rgba(0,0,0,0.45)" />}
                    </svg>
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1 px-1.5 pt-0.5 text-[11px] text-teal-50">
                      <AudioLines size={11} className="shrink-0 opacity-80" />
                      <span className="truncate font-medium">{media.name}</span>
                      {clip.volume !== 1 && (
                        <span className="shrink-0 rounded bg-black/30 px-1 font-mono text-[9px]">{Math.round(clip.volume * 100)}%</span>
                      )}
                    </div>
                    <TrimHandle
                      side="left"
                      visible={selected}
                      onPointerDown={(e) => {
                        onSelect({ kind: 'audio', id: clip.id });
                        startDrag(e, { type: 'audio-in', id: clip.id, x0: e.clientX, start: clip.start, length });
                      }}
                    />
                    <TrimHandle
                      side="right"
                      visible={selected}
                      onPointerDown={(e) => {
                        onSelect({ kind: 'audio', id: clip.id });
                        startDrag(e, { type: 'audio-out', id: clip.id, x0: e.clientX, start: clip.start, length });
                      }}
                    />
                  </div>
                );
              })}
              {dropHint?.row === `audio:${trackIndex}` && <DropLine x={dropHint.x} />}
            </Row>
          ))}

          {/* Marcadores atravessando as trilhas */}
          {project.markers.map((m) => (
            <div
              key={m.id}
              className="pointer-events-none absolute bottom-0 z-[14] w-px opacity-40"
              style={{ left: HEADER_W + m.time * pxPerSecond, top: RULER_H, background: m.color }}
            />
          ))}

          {/* Cursor de reprodução e linha do ímã */}
          <div
            className="pointer-events-none absolute bottom-0 z-[15] w-px bg-playhead"
            style={{ left: HEADER_W + time * pxPerSecond, top: RULER_H }}
          />
          {snapLine !== null && (
            <div
              className="pointer-events-none absolute bottom-0 z-[16] w-px bg-amber shadow-[0_0_6px_var(--color-amber)]"
              style={{ left: HEADER_W + snapLine * pxPerSecond, top: RULER_H }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function Row({
  header,
  height,
  className,
  contentProps,
  children,
}: {
  header: ReactNode;
  height: number;
  className?: string;
  contentProps: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div className="flex border-b border-line" style={{ height }}>
      <div className="sticky left-0 z-20 shrink-0 border-r border-line bg-panel" style={{ width: HEADER_W }}>
        {header}
      </div>
      <div className={cx('relative flex-1', className)} {...contentProps}>
        {children}
      </div>
    </div>
  );
}

function TrackHeader({
  icon,
  name,
  accent,
  actions,
}: {
  icon: ReactNode;
  name: string;
  accent: 'accent' | 'teal' | 'violet' | 'amber';
  actions?: ReactNode;
}) {
  return (
    <div className="flex h-full items-center gap-2 pl-3 pr-2">
      <span
        className={cx(
          'flex size-6 shrink-0 items-center justify-center rounded-md',
          accent === 'accent' && 'bg-accent/15 text-accent',
          accent === 'teal' && 'bg-teal-400/15 text-teal-300',
          accent === 'violet' && 'bg-fuchsia-400/15 text-fuchsia-300',
          accent === 'amber' && 'bg-amber/15 text-amber',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-dim">{name}</span>
      {actions && <div className="-mr-1.5 flex shrink-0 items-center [&_button]:!size-6">{actions}</div>}
    </div>
  );
}

function TrimHandle({
  side,
  visible,
  onPointerDown,
}: {
  side: 'left' | 'right';
  visible: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  return (
    <div
      title="Arraste para cortar"
      onPointerDown={onPointerDown}
      className={cx(
        'absolute inset-y-0 z-10 flex w-2.5 cursor-ew-resize items-center justify-center bg-white/0 transition-all hover:bg-white/25',
        side === 'left' ? 'left-0' : 'right-0',
        visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}
    >
      <span className="h-6 w-1 rounded-full bg-white shadow" />
    </div>
  );
}

function DropLine({ x }: { x: number }) {
  return (
    <div className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-accent shadow-[0_0_8px_var(--color-accent)]" style={{ left: x }} />
  );
}
