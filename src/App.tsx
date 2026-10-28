import {
  CircleCheck,
  Download,
  Feather,
  Smartphone,
  FilePlus,
  FolderOpen,
  LifeBuoy,
  LoaderCircle,
  Monitor,
  Save,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Renderer } from './engine/renderer';
import { getPlugin } from './engine/registry';
import type { ShaderPlugin } from './engine/types';
import { exportProject, FORMAT_INFO, type ExportSettings } from './media/exporter';
import { VoiceRecorder } from './media/recorder';
import { speak } from './media/speech';
import { assets, PEAKS_PER_SECOND } from './media/assets';
import { savedRecordOptions, type RecordOptions, type VoiceSession } from './ui/VoicePanel';
import { Teleprompter } from './ui/Teleprompter';
import { grabFrame, reverseMedia } from './media/reverse';
import { aspectLabel, presetName } from './project/formats';
import { AspectBox, ProjectDialog } from './ui/ProjectDialog';
import { analyzeMedia, importMedia, mediaKindOf } from './media/importer';
import { Player } from './preview/player';
import {
  addMedia,
  clipLength,
  createAudioClip,
  createEffect,
  createFilter,
  createProject,
  createTransition,
  addMarker,
  createOverlayClip,
  createVideoClip,
  editPoints,
  fitToBeats,
  keepRanges,
  insertFreezeFrame,
  placeVoiceClip,
  placeSfxClip,
  updateAudioClip,
  demoteToMain,
  detachAudio,
  findAudioClip,
  findOverlayClip,
  getMedia,
  insertVideoClips,
  layoutProject,
  placeAudioClip,
  placeOverlayClip,
  removeAudioClip,
  removeClip,
  removeOverlayClip,
  removeMedia,
  setTransition,
  splitAudioClip,
  speedOf,
  splitOverlayClip,
  splitVideoClip,
  updateClip,
  updateOverlayClip,
  type MediaItem,
  type Project,
  type VideoClip,
} from './project/model';
import { copySelection, duplicate, pasteAt, type CopiedItem, type EditResult } from './project/clipboard';
import { ContextMenu, type MenuEntry, type MenuState } from './ui/ContextMenu';
import { mediaMenu, packMenu, pluginMenu, previewMenu, timelineMenu, type EditorApi } from './ui/menus';
import { applyPack, deletePack, findPackClip, setPackFace, splitPackClip, type PackTemplate } from './project/packs';
import { getSound, soundFile, type SoundEffect } from './media/sfx';
import { findPackTemplate } from './ui/packStore';
import { download, ExportDialog, type ExportState } from './ui/ExportDialog';
import { formatTime } from './ui/format';
import { Inspector } from './ui/Inspector';
import { Button, cx, IconButton, Slider } from './ui/kit';
import { Library, Rail, type LibraryTab } from './ui/Library';
import { loadFonts } from './media/fonts';
import { trackFace, trackPoint } from './media/tracking';
import { loadSamplePhotos, setPreviewClip } from './ui/previews';
import { assetUrl } from './assetUrl';
import { createCamera, evaluateCamera, screenToSource, type CameraFollow, type TrackPoint } from './project/camera';
import { detectBeats } from './media/beats';
import { findSpeech } from './media/silence';
import { makeProxy, needsProxy } from './media/proxy';
import {
  autosave,
  clearAutosave,
  hasContent,
  loadAutosave,
  openProjectFile,
  pickProjectFile,
  saveProject,
} from './project/storage';
import {
  createTextClip,
  findTextClip,
  findTextPreset,
  placeTextClip,
  removeTextClip,
  splitTextClip,
  updateTextClip,
  type TextPreset,
} from './project/text';
import { PLUGIN_MIME, MEDIA_MIME, TEXT_PRESET_MIME, type Selection } from './ui/selection';
import { Timeline, type MediaDropTarget, type TimelineTarget } from './ui/Timeline';
import { useHistory } from './ui/useHistory';


interface Toast {
  id: number;
  text: string;
  error?: boolean;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportAbortRef = useRef<AbortController | null>(null);

  const history = useHistory<Project>(createProject);
  const project = history.state;
  const setProject = history.update;
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<LibraryTab>('media');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [exportState, setExportState] = useState<ExportState | null>(null);
  const [importing, setImporting] = useState(0);
  const [draggingFiles, setDraggingFiles] = useState(false);
  /** Mensagem de "trabalhando…" (salvar/abrir/analisar). */
  const [busy, setBusy] = useState<string | null>(null);
  /** Clipe esperando o clique no vídeo para escolher o ponto que a câmera vai seguir. */
  const [picking, setPicking] = useState<string | null>(null);
  /** Projeto encontrado no salvamento automático, esperando o usuário decidir. */
  const [timelineHeight, startTimelineResize] = useTimelineHeight();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [clipboard, setClipboard] = useState<CopiedItem | null>(null);
  const [projectDialog, setProjectDialog] = useState(false);
  /** Gravação de voz em andamento (o que a interface mostra) e os dados dela */
  const [session, setSession] = useState<VoiceSession | null>(null);
  const voiceRef = useRef<{
    recorder: VoiceRecorder;
    start: number;
    until: number | null;
    options: RecordOptions;
    startedAt: number;
    recording: boolean;
  } | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ project: Project; savedAt: number } | null>(null);
  const fileHandle = useRef<FileSystemFileHandle | null>(null);
  const savedProject = useRef<Project | null>(null);
  /** O salvamento automático só começa depois de decidir sobre a recuperação. */
  const autosaveReady = useRef(false);

  const timeline = useMemo(() => layoutProject(project), [project]);

  // As prévias da biblioteca (ao passar o mouse) mostram o clipe selecionado.
  const previewTarget =
    selection?.kind === 'clip' ? project.clips.find((c) => c.id === selection.id) : selection?.kind === 'overlay' ? findOverlayClip(project, selection.id)?.clip : null;
  const previewMedia = previewTarget ? getMedia(project, previewTarget.mediaId) : undefined;
  useEffect(() => {
    if (!previewTarget || !previewMedia || previewMedia.kind === 'audio') {
      setPreviewClip(null);
      return;
    }
    setPreviewClip({
      key: previewTarget.id,
      url: previewMedia.url,
      image: previewMedia.kind === 'image' ? (assets.bitmaps.get(previewMedia.id) ?? null) : null,
      from: previewTarget.trimIn,
      to: previewMedia.kind === 'image' ? previewTarget.trimIn + 5 : previewTarget.trimOut,
      width: previewMedia.width,
      height: previewMedia.height,
    });
  }, [previewTarget?.id, previewTarget?.trimIn, previewTarget?.trimOut, previewMedia]);
  const isDirty = hasContent(project) && project !== savedProject.current;

  const notify = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, error }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), error ? 8000 : 3500);
  }, []);

  // ------------------------------------------------ Prévia leve (cópias em 540p para editar vídeos pesados)
  const [proxyMode, setProxyMode] = useState(() => {
    try {
      return localStorage.getItem('lumiar:proxies') === '1';
    } catch {
      return false;
    }
  });
  const [proxyJob, setProxyJob] = useState<string | null>(null);
  const proxyQueue = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      localStorage.setItem('lumiar:proxies', proxyMode ? '1' : '0');
    } catch {
      // Sem armazenamento: vale só nesta sessão.
    }
    if (!proxyMode) return;
    const pending = project.media.filter((m) => needsProxy(m) && !assets.proxies.has(m.id) && !proxyQueue.current.has(m.id));
    if (pending.length === 0) return;
    pending.forEach((m) => proxyQueue.current.add(m.id));
    void (async () => {
      for (const media of pending) {
        try {
          setProxyJob(`Prévia leve: ${media.name} 0%`);
          const url = await makeProxy(media, (f) => setProxyJob(`Prévia leve: ${media.name} ${Math.round(f * 100)}%`));
          assets.proxies.set(media.id, url);
          playerRef.current?.refreshSources();
        } catch (error) {
          notify(`Não foi possível criar a prévia leve de "${media.name}": ${error instanceof Error ? error.message : String(error)}`, true);
        } finally {
          proxyQueue.current.delete(media.id);
        }
      }
      setProxyJob(null);
    })();
  }, [proxyMode, project.media, notify]);

  // Cria o motor de renderização e o player uma única vez.
  useEffect(() => {
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvasRef.current!, 1280, 720);
    } catch (error) {
      notify(String(error instanceof Error ? error.message : error), true);
      return;
    }
    renderer.onShaderError = (plugin, message) => notify(`Erro no shader "${plugin.name}": ${message}`, true);
    const player = new Player(renderer);
    player.onTime = setTime;
    player.onPlayingChange = setPlaying;
    playerRef.current = player;
    return () => {
      player.dispose();
      renderer.dispose();
      playerRef.current = null;
    };
  }, [notify]);

  useEffect(() => {
    playerRef.current?.setProxies(proxyMode);
    playerRef.current?.setProject(project);
  }, [project, proxyMode]);

  // A seleção pode deixar de existir depois de desfazer/refazer.
  useEffect(() => {
    if (selection?.kind === 'clip' && !project.clips.some((c) => c.id === selection.id)) setSelection(null);
    if (selection?.kind === 'audio' && !findAudioClip(project, selection.id)) setSelection(null);
    if (selection?.kind === 'text' && !findTextClip(project, selection.id)) setSelection(null);
    if (selection?.kind === 'overlay' && !findOverlayClip(project, selection.id)) setSelection(null);
    if (selection?.kind === 'pack' && !findPackClip(project, selection.id)) setSelection(null);
    if (selection?.kind === 'transition' && selection.index >= project.transitions.length) setSelection(null);
  }, [project, selection]);

  // Fontes dos textos: quando terminam de carregar, redesenha o quadro.
  useEffect(() => {
    void loadFonts().then(() => playerRef.current?.refresh());
    void loadSamplePhotos();
  }, []);

  // Ao abrir o editor, procura um projeto não salvo no salvamento automático.
  useEffect(() => {
    loadAutosave()
      .then((found) => {
        if (found) setRecovery(found);
        else autosaveReady.current = true;
      })
      .catch(() => {
        autosaveReady.current = true;
      });
  }, []);

  // Salvamento automático no navegador, um pouco depois de cada mudança.
  useEffect(() => {
    if (!autosaveReady.current) return;
    const timer = setTimeout(() => {
      const save = hasContent(project) ? autosave(project) : clearAutosave();
      save.catch((error) => console.warn('[Lumiar] salvamento automático falhou', error));
    }, 1500);
    return () => clearTimeout(timer);
  }, [project]);

  // Aviso do navegador ao fechar com alterações não salvas em arquivo.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const currentTime = () => playerRef.current?.currentTime ?? 0;

  /** Coloca mídias na timeline: vídeos e imagens no fim da trilha de vídeo, áudios no cursor. */
  const addToTimeline = (p: Project, items: MediaItem[], audioStart = currentTime()): Project => {
    const visual = items.filter((m) => m.kind !== 'audio');
    let next = insertVideoClips(p, visual.map(createVideoClip));
    let start = audioStart;
    for (const media of items.filter((m) => m.kind === 'audio')) {
      next = placeAudioClip(next, createAudioClip(media, start));
      start += media.duration;
    }
    return next;
  };

  const importFiles = useCallback(
    async (files: File[]) => {
      const supported = files.filter((f) => mediaKindOf(f) !== null);
      if (supported.length === 0) {
        notify('Nenhum vídeo, áudio ou imagem suportado.', true);
        return;
      }
      setImporting((n) => n + supported.length);
      const items: MediaItem[] = [];
      for (const file of supported) {
        try {
          items.push(await importMedia(file));
        } catch (error) {
          notify(error instanceof Error ? error.message : String(error), true);
        } finally {
          setImporting((n) => n - 1);
        }
      }
      if (items.length === 0) return;
      setProject((p) => addToTimeline(addMedia(p, items), items));
      items.forEach((m) => void analyzeMedia(m));
      notify(`${items.length} arquivo(s) adicionado(s) à timeline.`);
    },
    // addToTimeline só usa funções puras e o ref do player, então não precisa estar aqui.
    [notify, setProject],
  );

  const dropMedia = (mediaId: string, target: MediaDropTarget) => {
    const media = getMedia(project, mediaId);
    if (!media) return;
    if (target.row === 'overlay') {
      if (media.kind === 'audio') {
        notify('Áudios vão para a trilha de áudio.', true);
        return;
      }
      const clip = createOverlayClip(media, target.time);
      setProject((p) => placeOverlayClip(p, clip, target.track));
      setSelection({ kind: 'overlay', id: clip.id });
      return;
    }
    if (target.row === 'video') {
      if (media.kind === 'audio') {
        setProject((p) => placeAudioClip(p, createAudioClip(media, currentTime())));
        notify('Áudios vão para a trilha de áudio.');
      } else {
        setProject((p) => insertVideoClips(p, [createVideoClip(media)], target.index));
      }
      return;
    }
    if (!media.hasAudio) {
      notify('Imagens e vídeos sem som vão para a trilha de vídeo.', true);
      return;
    }
    setProject((p) => placeAudioClip(p, createAudioClip(media, target.time), target.track));
  };

  /** Aplica um efeito/filtro num clipe ou uma transição entre clipes. */
  const applyTo = (target: Selection, plugin: ShaderPlugin) => {
    if (plugin.kind === 'transition') {
      if (target?.kind !== 'transition') {
        notify('Selecione uma transição (◆ entre dois clipes) — ou arraste até ela.', true);
        return;
      }
      setProject((p) => setTransition(p, target.index, createTransition(plugin.id, p.transitions[target.index]?.duration)));
      setSelection(target);
      return;
    }
    if (target?.kind !== 'clip' && target?.kind !== 'overlay') {
      notify(`Selecione um clipe de vídeo primeiro — ou arraste o ${plugin.kind === 'filter' ? 'filtro' : 'efeito'} até ele.`, true);
      return;
    }
    const update = (fn: (c: VideoClip) => VideoClip) =>
      setProject((p) =>
        target.kind === 'clip' ? updateClip(p, target.id, fn) : updateOverlayClip(p, target.id, (c) => ({ ...c, ...fn(c) })),
      );
    if (plugin.kind === 'filter') {
      const filter = createFilter(plugin.id);
      update((c) => ({ ...c, filter }));
    } else {
      const effect = createEffect(plugin.id);
      if (!effect) return;
      update((c) => ({ ...c, effects: [...c.effects, effect] }));
    }
    setSelection(target);
    notify(`"${plugin.name}" aplicado.`);
  };

  const split = () => {
    const t = currentTime();
    let result: { project: Project; newId: string } | null = null;
    if (selection?.kind === 'audio') {
      result = splitAudioClip(project, selection.id, t);
      if (result) setSelection({ kind: 'audio', id: result.newId });
    } else if (selection?.kind === 'text') {
      result = splitTextClip(project, selection.id, t);
      if (result) setSelection({ kind: 'text', id: result.newId });
    } else if (selection?.kind === 'overlay') {
      result = splitOverlayClip(project, selection.id, t);
      if (result) setSelection({ kind: 'overlay', id: result.newId });
    } else if (selection?.kind === 'pack') {
      result = splitPackClip(project, selection.id, t);
      if (result) setSelection({ kind: 'pack', id: result.newId });
    } else {
      // Clipe selecionado, ou o clipe de vídeo que está sob o cursor.
      const id =
        selection?.kind === 'clip'
          ? selection.id
          : timeline.clips.find((l) => t > l.start && t < l.start + l.length)?.clip.id;
      result = id ? splitVideoClip(project, id, t) : null;
      if (result) setSelection({ kind: 'clip', id: result.newId });
    }
    if (result) setProject(() => result.project);
    else notify('Posicione o cursor dentro de um clipe para dividir.', true);
  };

  const detach = (clipId: string) => {
    const result = detachAudio(project, clipId);
    if (!result) return;
    setProject(() => result.project);
    setSelection({ kind: 'audio', id: result.audioId });
    notify('Áudio separado para a trilha de áudio.');
  };

  const deleteSelection = () => {
    if (selection?.kind === 'clip') setProject((p) => removeClip(p, selection.id));
    else if (selection?.kind === 'audio') setProject((p) => removeAudioClip(p, selection.id));
    else if (selection?.kind === 'text') setProject((p) => removeTextClip(p, selection.id));
    else if (selection?.kind === 'overlay') setProject((p) => removeOverlayClip(p, selection.id));
    else if (selection?.kind === 'pack') setProject((p) => deletePack(p, selection.id));
    else return;
    setSelection(null);
  };

  /** Aplica uma edição que também troca a seleção (colar, duplicar…). */
  const applyEdit = (result: EditResult | null, fail = 'Não foi possível fazer isso aqui.') => {
    if (!result) {
      notify(fail, true);
      return;
    }
    setProject(() => result.project);
    setSelection(result.selection);
  };

  const copy = (cut = false) => {
    const item = copySelection(project, selection);
    if (!item) return;
    setClipboard(item);
    if (cut) deleteSelection();
    else notify('Copiado. Ctrl+V cola no cursor.');
  };
  const paste = () => {
    if (!clipboard || clipboard.kind === 'look') return;
    applyEdit(pasteAt(project, clipboard, currentTime()));
  };
  const duplicateSelection = () => {
    if (selection && selection.kind !== 'transition') applyEdit(duplicate(project, selection));
  };

  /** Quadro que está no preview, como PNG. */
  const frameBlob = () =>
    new Promise<Blob | null>((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) resolve(null);
      else canvas.toBlob(resolve, 'image/png');
    });
  const saveFrame = async () => {
    const blob = await frameBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    download(url, `${project.name || 'lumiar'}-${formatTime(currentTime()).replace(/[:.]/g, '-')}.png`);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    notify('Quadro salvo como PNG.');
  };
  const copyFrame = async () => {
    try {
      const blob = await frameBlob();
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      notify('Quadro copiado. Cole (Ctrl+V) em outro programa.');
    } catch {
      notify('O navegador não deixou copiar a imagem.', true);
    }
  };

  /** Congela o quadro do cursor: o clipe é dividido e uma imagem parada de 2s entra no meio. */
  const freeze = async (clipId: string) => {
    const layout = timeline.clips.find((l) => l.clip.id === clipId);
    if (!layout || layout.media.kind !== 'video') return;
    const t = Math.min(Math.max(currentTime(), layout.start), layout.start + layout.length - 0.01);
    const sourceTime = layout.clip.trimIn + (t - layout.start) * speedOf(layout.clip);
    try {
      setBusy('Congelando o quadro…');
      const still = { ...(await importMedia(await grabFrame(layout.media, sourceTime))), name: `Quadro congelado · ${layout.media.name}` };
      const result = insertFreezeFrame(project, clipId, t, still);
      applyEdit(result && { project: result.project, selection: { kind: 'clip', id: result.id } });
      if (result) notify('Quadro congelado por 2s. Ajuste o tempo puxando a borda do clipe.');
    } catch (error) {
      notify(`Não foi possível congelar: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setBusy(null);
    }
  };

  /** Cria uma cópia do trecho tocando de trás para frente e troca a mídia do clipe por ela. */
  const reverse = async (target: { kind: 'clip' | 'overlay'; id: string }) => {
    const clip = target.kind === 'clip' ? project.clips.find((c) => c.id === target.id) : findOverlayClip(project, target.id)?.clip;
    const media = clip && getMedia(project, clip.mediaId);
    if (!clip || !media || media.kind !== 'video') return;
    try {
      setBusy('Invertendo o clipe… 0%');
      const file = await reverseMedia(media, clip.trimIn, clip.trimOut, (f) => setBusy(`Invertendo o clipe… ${Math.round(f * 100)}%`));
      const reversed = await importMedia(file);
      void analyzeMedia(reversed);
      const swap = <T extends VideoClip>(c: T): T => ({ ...c, mediaId: reversed.id, trimIn: 0, trimOut: reversed.duration });
      setProject((p) => {
        const withMedia = addMedia(p, [reversed]);
        return target.kind === 'clip' ? updateClip(withMedia, target.id, swap) : updateOverlayClip(withMedia, target.id, swap);
      });
      notify('Clipe invertido: agora ele toca de trás para frente.');
    } catch (error) {
      notify(`Não foi possível inverter: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setBusy(null);
    }
  };

  const markHere = (t = currentTime()) => {
    const result = addMarker(project, t);
    setProject(() => result.project);
  };

  /** Pula para o ponto de edição anterior/seguinte (bordas de clipes e marcadores). */
  const jumpEdit = (direction: 1 | -1) => {
    const t = currentTime();
    const points = editPoints(project, timeline);
    const target = direction > 0 ? points.find((p) => p > t + 0.01) : [...points].reverse().find((p) => p < t - 0.01);
    if (target !== undefined) playerRef.current?.seek(target);
  };

  // ------------------------------------------------ Voz: narração, dublagem e voz sintética

  /** Começa a gravar (narração no cursor ou dublagem no trecho de um clipe). */
  const startRecording = async (options: RecordOptions) => {
    const player = playerRef.current;
    if (!player || voiceRef.current) return;
    player.pause();
    let from = currentTime();
    let until: number | null = null;
    if (options.dub) {
      const target = options.dub;
      const layout =
        target.kind === 'clip'
          ? timeline.clips.find((l) => l.clip.id === target.id)
          : timeline.overlays.find((l) => l.clip.id === target.id);
      if (!layout) return;
      from = layout.start;
      until = layout.start + layout.length;
      if (options.muteOriginal && layout.media.hasAudio && !layout.clip.audioDetached) {
        if (target.kind === 'clip') setProject((p) => updateClip(p, target.id, (c) => ({ ...c, volume: 0 })));
        else setProject((p) => updateOverlayClip(p, target.id, (c) => ({ ...c, volume: 0 })));
      }
    }
    let recorder: VoiceRecorder;
    try {
      recorder = await VoiceRecorder.open(options.deviceId);
    } catch (error) {
      notify(`Não foi possível usar o microfone: ${error instanceof Error ? error.message : String(error)}`, true);
      return;
    }
    const mode = options.dub ? 'dub' : 'narration';
    const state = { recorder, start: from, until, options, startedAt: 0, recording: false };
    voiceRef.current = state;
    player.seek(from);
    if (options.muteProject) player.setMuted(true);
    if (options.countdown) {
      for (let n = 3; n > 0; n--) {
        if (voiceRef.current !== state) return;
        setSession({ mode, phase: 'countdown', countdown: n, elapsed: 0, level: recorder.level() });
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (voiceRef.current !== state) return;
    }
    recorder.begin();
    player.play();
    state.startedAt = performance.now();
    state.recording = true;
    setSession({ mode, phase: 'recording', countdown: 0, elapsed: 0, level: 0 });
  };

  /** Para a gravação e coloca a voz numa trilha de narração, no ponto onde começou. */
  const stopRecording = async () => {
    const state = voiceRef.current;
    if (!state) return;
    voiceRef.current = null;
    setSession(null);
    playerRef.current?.pause();
    playerRef.current?.setMuted(false);
    if (!state.recording) {
      state.recorder.cancel();
      return;
    }
    try {
      setBusy('Salvando a gravação…');
      const kind = state.options.dub ? 'Dublagem' : 'Narração';
      const count = project.media.filter((m) => m.name.startsWith(kind)).length + 1;
      const media = await importMedia(await state.recorder.stop(`${kind} ${count}`));
      void analyzeMedia(media);
      const clip = createAudioClip(media, state.start);
      // Na dublagem, a voz não passa do fim do clipe.
      if (state.until !== null) clip.trimOut = Math.min(media.duration, state.until - state.start);
      setProject((p) => placeVoiceClip(addMedia(p, [media]), clip));
      setSelection({ kind: 'audio', id: clip.id });
      notify(`${kind} adicionada na trilha "Narração".`);
    } catch (error) {
      notify(`Não foi possível salvar a gravação: ${String(error)}`, true);
    } finally {
      setBusy(null);
    }
  };

  // Relógio, medidor de nível e fim automático da dublagem.
  useEffect(() => {
    if (session?.phase !== 'recording') return;
    const timer = setInterval(() => {
      const state = voiceRef.current;
      if (!state?.recording) return;
      setSession((s) => s && { ...s, elapsed: (performance.now() - state.startedAt) / 1000, level: state.recorder.level() });
      if (state.until !== null && (playerRef.current?.currentTime ?? 0) >= state.until - 0.02) void stopRecording();
    }, 80);
    return () => clearInterval(timer);
  }, [session?.phase]);

  /** Gera voz sintética e coloca na trilha de narração (textos longos viram vários clipes em sequência). */
  const speakText = async (text: string, voice: string, at = currentTime()) => {
    const parts = splitSentences(text);
    if (parts.length === 0) return;
    let t = at;
    let lastId: string | null = null;
    try {
      for (let i = 0; i < parts.length; i++) {
        setSpeaking(parts.length > 1 ? `Gerando a voz… ${i + 1} de ${parts.length}` : 'Gerando a voz…');
        const file = await speak(parts[i], voice, (f) => setSpeaking(`Carregando a voz… ${Math.round(f * 100)}%`));
        const media = await importMedia(file);
        void analyzeMedia(media);
        const clip = createAudioClip(media, t);
        t += media.duration;
        lastId = clip.id;
        setProject((p) => placeVoiceClip(addMedia(p, [media]), clip));
      }
      if (lastId) setSelection({ kind: 'audio', id: lastId });
      notify(parts.length > 1 ? `${parts.length} trechos de voz adicionados.` : 'Voz adicionada na trilha "Narração".');
    } catch (error) {
      notify(`Não foi possível gerar a voz: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setSpeaking(null);
    }
  };

  /** Dublagem automática: cada legenda vira uma fala sintética no tempo dela. */
  const speakCaptions = async (voice: string) => {
    const captions = project.captions?.captions ?? [];
    try {
      for (let i = 0; i < captions.length; i++) {
        setSpeaking(`Dublando as legendas… ${i + 1} de ${captions.length}`);
        const media = await importMedia(await speak(captions[i].text, voice));
        void analyzeMedia(media);
        const clip = createAudioClip(media, Math.max(0, captions[i].start - 0.15));
        setProject((p) => placeVoiceClip(addMedia(p, [media]), clip));
      }
      notify(`${captions.length} falas criadas a partir das legendas.`);
    } catch (error) {
      notify(`Não foi possível dublar: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setSpeaking(null);
    }
  };

  /** Deixa o pico do clipe de áudio em -1 dB. */
  const normalizeAudio = (clipId: string) => {
    const found = findAudioClip(project, clipId);
    const peaks = found && assets.peaks.get(found.clip.mediaId);
    if (!found || !peaks) {
      notify('A forma de onda ainda está sendo analisada. Tente de novo em instantes.', true);
      return;
    }
    let peak = 0;
    const from = Math.floor(found.clip.trimIn * PEAKS_PER_SECOND);
    const to = Math.ceil(found.clip.trimOut * PEAKS_PER_SECOND);
    for (let i = from; i < Math.min(to, peaks.length); i++) peak = Math.max(peak, peaks[i]);
    if (peak < 0.005) {
      notify('Esse trecho está praticamente em silêncio.', true);
      return;
    }
    const volume = Math.min(2, Math.max(0.05, 0.89 / peak));
    setProject((p) => updateAudioClip(p, clipId, (c) => ({ ...c, volume })));
    notify(`Volume ajustado para ${Math.round(volume * 100)}%.`);
  };

  /** Corta as pausas (silêncios) dos clipes da trilha principal. */
  const cutSilences = async (clipIds: string[]) => {
    const p = history.current();
    const layouts = layoutProject(p).clips.filter((l) => clipIds.includes(l.clip.id) && l.media.hasAudio && !l.clip.audioDetached);
    if (layouts.length === 0) {
      notify('Esse clipe não tem som para encontrar as pausas.', true);
      return;
    }
    const found = new Map<string, [number, number][]>();
    try {
      for (const [n, l] of layouts.entries()) {
        setBusy(`Procurando as pausas… ${Math.round((n / layouts.length) * 100)}%`);
        found.set(l.clip.id, await findSpeech(l.media.file, l.clip.trimIn, l.clip.trimOut));
      }
    } catch (error) {
      notify(`Não foi possível ouvir o áudio: ${error instanceof Error ? error.message : String(error)}`, true);
      return;
    } finally {
      setBusy(null);
    }
    let removed = 0;
    let cuts = 0;
    setProject((q) => {
      let next = q;
      for (const [id, keep] of found) {
        const result = keepRanges(next, id, keep);
        if (!result || result.removed < 0.05) continue;
        next = result.project;
        removed += result.removed;
        // Pausas no meio, mais as do começo e do fim do clipe.
        const clip = q.clips.find((c) => c.id === id);
        cuts += keep.length - 1 + (clip && keep[0][0] > clip.trimIn + 0.05 ? 1 : 0) + (clip && keep[keep.length - 1][1] < clip.trimOut - 0.05 ? 1 : 0);
      }
      return next;
    });
    notify(removed > 0 ? `${cuts} pausa(s) cortada(s): o vídeo ficou ${removed.toFixed(1)}s mais curto.` : 'Não encontrei pausas para cortar.', removed === 0);
  };

  /** Corta os clipes da trilha principal nas batidas da música. */
  const beatMontage = async (every: number, fill: boolean, t = currentTime()) => {
    let beats = history.current().beats ?? [];
    if (beats.length < 4) {
      const detected = await markBeats(t);
      if (!detected) return;
      beats = detected.beats;
    }
    let cuts = 0;
    setProject((p) => {
      const result = fitToBeats(p, beats, every, fill);
      cuts = result?.cuts ?? 0;
      return result?.project ?? p;
    });
    notify(cuts ? `Montagem no ritmo: ${cuts} clipes, cada um trocando em cima de uma batida.` : 'Coloque vídeos ou imagens na trilha principal para montar no ritmo.', cuts === 0);
  };

  /** Deixa o projeto vertical (9:16) e cada clipe acompanha o rosto de quem aparece. */
  const reframeVertical = async () => {
    const p = history.current();
    const size = p.width > p.height ? { width: p.height, height: p.width } : { width: p.width, height: p.height };
    const layouts = layoutProject(p).clips;
    const follows = new Map<string, CameraFollow>();
    try {
      for (const [n, l] of layouts.entries()) {
        if (l.media.kind !== 'video') continue;
        setBusy(`Reenquadrando para vertical… ${Math.round((n / layouts.length) * 100)}%`);
        const points = await trackFace(l.media, l.clip.trimIn, l.clip.trimOut, (f) =>
          setBusy(`Reenquadrando para vertical… ${Math.round(((n + f) / layouts.length) * 100)}%`),
        );
        if (points.length) follows.set(l.clip.id, { kind: 'face', points, zoom: 1, smoothness: 0.8, mode: 'center', anchorTime: l.clip.trimIn });
      }
    } catch (error) {
      notify(`Não foi possível analisar o vídeo: ${error instanceof Error ? error.message : String(error)}`, true);
      return;
    } finally {
      setBusy(null);
    }
    setProject((q) => ({
      ...q,
      ...size,
      clips: q.clips.map((c) => {
        const camera = c.camera ?? createCamera();
        return { ...c, camera: { ...camera, fill: true, follow: follows.get(c.id) ?? camera.follow } };
      }),
    }));
    notify(
      `Projeto agora em ${size.width}×${size.height} (vertical). ${follows.size} clipe(s) acompanham o rosto; os outros ficam centralizados.`,
    );
  };

  const editorApi: EditorApi = {
    project,
    timeline,
    time,
    playing,
    clipboard,
    selection,
    edit: setProject,
    apply: applyEdit,
    select: setSelection,
    seek: (t) => playerRef.current?.seek(t),
    notify,
    setClipboard: (item) => {
      setClipboard(item);
      if (item && item.kind !== 'look') notify('Copiado. Ctrl+V cola no cursor.');
    },
    split: () => split(),
    detach: (id) => detach(id),
    openImport: () => openImport(),
    togglePlay: () => playerRef.current?.toggle(),
    saveFrame: () => void saveFrame(),
    copyFrame: () => void copyFrame(),
    freeze: (id) => void freeze(id),
    reverse: (target) => void reverse(target),
    addMarker: (t) => markHere(t),
    dub: (target) => void startRecording({ ...savedRecordOptions(), dub: target }),
    normalize: (id) => normalizeAudio(id),
    addPack: (pack, t) => void addPack(pack, t),
    markBeats: (t) => void markBeats(t),
    cutSilences: (ids) => void cutSilences(ids),
    beatMontage: (every, fill, t) => void beatMontage(every, fill, t),
    reframeVertical: () => void reframeVertical(),
  };

  const openMenu = (e: ReactMouseEvent, entries: MenuEntry[]) => {
    e.preventDefault();
    e.stopPropagation();
    if (entries.some(Boolean)) setMenu({ x: e.clientX, y: e.clientY, entries });
  };
  const closeMenu = useCallback(() => setMenu(null), []);

  // ------------------------------------------------ Pacotes de edição

  /** Trecho do clipe selecionado (pacotes de visual cobrem ele inteiro). */
  const selectedSpan = () => {
    if (selection?.kind === 'clip') {
      const layout = timeline.clips.find((l) => l.clip.id === selection.id);
      return layout ? { start: layout.start, length: layout.length } : null;
    }
    if (selection?.kind === 'overlay') {
      const layout = timeline.overlays.find((l) => l.clip.id === selection.id);
      return layout ? { start: layout.start, length: layout.length } : null;
    }
    return null;
  };

  /**
   * Música de onde tirar as batidas: o áudio selecionado, a música no cursor, qualquer áudio no cursor,
   * a primeira música do projeto ou o som do próprio vídeo.
   */
  const musicAt = (p: Project, t: number) => {
    const tl = layoutProject(p);
    const covers = (start: number, length: number) => t >= start && t < start + length;
    const audio = p.audioTracks.flatMap((track) => track.clips.map((clip) => ({ track, clip })));
    const pick =
      (selection?.kind === 'audio' && audio.find((a) => a.clip.id === selection.id)) ||
      audio.find((a) => a.track.kind === 'music' && !a.track.muted && covers(a.clip.start, clipLength(a.clip))) ||
      audio.find((a) => a.track.kind !== 'voice' && !a.track.muted && covers(a.clip.start, clipLength(a.clip))) ||
      audio.find((a) => a.track.kind === 'music' && !a.track.muted);
    if (pick) {
      const media = getMedia(p, pick.clip.mediaId);
      if (media) return { media, trimIn: pick.clip.trimIn, trimOut: pick.clip.trimOut, start: pick.clip.start, speed: speedOf(pick.clip) };
    }
    const video = tl.clips.find((l) => covers(l.start, l.length) && l.media.hasAudio && !l.clip.audioDetached);
    return video ? { media: video.media, trimIn: video.clip.trimIn, trimOut: video.clip.trimOut, start: video.start, speed: speedOf(video.clip) } : null;
  };

  /** Detecta as batidas da música no cursor e guarda no projeto (aparecem na régua e servem de ímã). */
  const markBeats = async (t = currentTime()) => {
    const music = musicAt(history.current(), t);
    if (!music) {
      notify('Coloque uma música (ou um vídeo com som) na timeline para detectar as batidas.', true);
      return null;
    }
    setBusy('Ouvindo a música…');
    try {
      const result = await detectBeats(music.media.file, music.trimIn, music.trimOut);
      const beats = result.beats.map((b) => music.start + (b - music.trimIn) / music.speed);
      const length = (music.trimOut - music.trimIn) / music.speed;
      const span = { start: music.start, length };
      if (beats.length < 2) {
        notify('Não encontrei um ritmo claro nesse áudio.', true);
        return null;
      }
      setProject((p) => ({
        ...p,
        beats: [...(p.beats ?? []).filter((b) => b < span.start || b > span.start + span.length), ...beats].sort((a, b) => a - b),
      }));
      notify(`${beats.length} batidas marcadas · ${Math.round(result.bpm)} BPM`);
      return { beats, span };
    } catch (error) {
      notify(`Não foi possível ouvir o áudio: ${error instanceof Error ? error.message : String(error)}`, true);
      return null;
    } finally {
      setBusy(null);
    }
  };

  /** Procura o rosto no vídeo embaixo do bloco e liga o "seguir rosto" na câmera do pacote. */
  const faceForPack = async (packId: string, face: NonNullable<PackTemplate['face']>) => {
    const p = history.current();
    const found = findPackClip(p, packId);
    if (!found) return;
    const { start: s, duration } = found.clip;
    const e = s + duration;
    const points: TrackPoint[] = [];
    const under = layoutProject(p).clips.filter((l) => l.start < e && l.start + l.length > s);
    setBusy('Procurando rostos… 0%');
    try {
      for (const [n, l] of under.entries()) {
        const speed = speedOf(l.clip);
        const a = Math.max(s, l.start);
        const b = Math.min(e, l.start + l.length);
        const from = l.clip.trimIn + (a - l.start) * speed;
        const to = l.clip.trimIn + (b - l.start) * speed;
        const found = await trackFace(l.media, from, to, (f) => setBusy(`Procurando rostos… ${Math.round(((n + f) / under.length) * 100)}%`));
        // Posição na imagem do clipe → posição na tela (a mídia pode ter barras em volta).
        const ratio = p.width / p.height;
        const mediaRatio = l.media.width / l.media.height || ratio;
        const [fw, fh] = mediaRatio > ratio ? [1, ratio / mediaRatio] : [mediaRatio / ratio, 1];
        for (const pt of found) {
          points.push({
            t: l.start + (pt.t - l.clip.trimIn) / speed - s,
            x: 0.5 + (pt.x - 0.5) * fw,
            y: 0.5 + (pt.y - 0.5) * fh,
            size: pt.size * fw,
          });
        }
      }
    } catch (error) {
      notify(`Não foi possível analisar o vídeo: ${error instanceof Error ? error.message : String(error)}`, true);
      return;
    } finally {
      setBusy(null);
    }
    if (points.length === 0) {
      notify('Nenhum rosto encontrado embaixo do pacote: ele ficou com a câmera no centro.', true);
      return;
    }
    setProject((q) => setPackFace(q, packId, points, face));
    notify('Rosto encontrado: a câmera do pacote vai acompanhar.');
  };

  const addPack = async (template: PackTemplate, t = currentTime(), track = 0, cover = selectedSpan()) => {
    let beats: number[] | undefined;
    let music: { start: number; length: number } | null = null;
    if (template.beat) {
      // Usa as batidas já marcadas no trecho; se não houver, ouve a música agora.
      const p = history.current();
      const source = musicAt(p, t);
      const span = cover ?? (source ? { start: source.start, length: (source.trimOut - source.trimIn) / source.speed } : null);
      const known = span ? (p.beats ?? []).filter((b) => b >= span.start && b < span.start + span.length) : [];
      if (span && known.length >= 4) {
        beats = known;
        music = span;
      } else {
        const detected = await markBeats(t);
        if (!detected) return;
        beats = detected.beats;
        music = detected.span;
      }
    }
    const sounds = template.sounds?.length ? await soundMedia(template.sounds.map((s) => s.id)) : undefined;
    let id = '';
    let speedApplied = false;
    setProject((p) => {
      const result = applyPack(p, layoutProject(p), template, t, { cover, music, beats, track, sounds });
      id = result.id;
      speedApplied = result.speedApplied;
      return result.project;
    });
    setSelection({ kind: 'pack', id });
    if (template.speed && !speedApplied) notify(`"${template.name}" aplicado, mas a velocidade só muda em vídeos da trilha principal.`, true);
    else if (template.beat) notify(`"${template.name}" aplicado em ${beats?.length ?? 0} batidas.`);
    else notify(`"${template.name}" aplicado. Puxe as bordas do bloco para encaixar.`);
    if (template.face) await faceForPack(id, template.face);
  };

  const dropPack = (packId: string, track: number, t: number) => {
    const template = findPackTemplate(packId);
    if (template) void addPack(template, t, track, null);
  };

  // ------------------------------------------------ Efeitos sonoros

  /** Gera (ou reaproveita) a mídia de cada efeito sonoro. */
  const soundMedia = async (ids: string[]): Promise<Map<string, MediaItem>> => {
    const result = new Map<string, MediaItem>();
    for (const id of new Set(ids)) {
      const existing = history.current().media.find((m) => m.sfx === id);
      const sound = getSound(id);
      if (existing) result.set(id, existing);
      else if (sound) {
        const media: MediaItem = { ...(await importMedia(await soundFile(id))), name: sound.name, sfx: id };
        void analyzeMedia(media);
        result.set(id, media);
      }
    }
    return result;
  };

  const addSound = async (sound: SoundEffect, t = currentTime(), track?: number) => {
    try {
      const media = (await soundMedia([sound.id])).get(sound.id);
      if (!media) return;
      const clip = createAudioClip(media, t);
      setProject((p) => {
        const next = p.media.some((m) => m.id === media.id) ? p : addMedia(p, [media]);
        // Solto numa trilha livre: fica nela; senão vai para a trilha de efeitos sonoros.
        const target = track === undefined ? undefined : next.audioTracks[track];
        const free = target && !target.clips.some((c) => clip.start < c.start + clipLength(c) && clip.start + clipLength(clip) > c.start);
        if (target && free) return { ...next, audioTracks: next.audioTracks.map((tr, i) => (i === track ? { ...tr, clips: [...tr.clips, clip] } : tr)) };
        return placeSfxClip(next, clip);
      });
      setSelection({ kind: 'audio', id: clip.id });
    } catch (error) {
      notify(`Não foi possível gerar o som: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  };

  // ------------------------------------------------ Textos

  const addText = (preset: TextPreset) => {
    // Stickers ficam pouco tempo na tela.
    const clip = createTextClip(preset, currentTime(), preset.id.startsWith('sticker/') ? 2 : 4);
    setProject((p) => placeTextClip(p, clip));
    setSelection({ kind: 'text', id: clip.id });
  };

  const dropTextPreset = (presetId: string, track: number, time: number) => {
    const preset = findTextPreset(presetId);
    if (!preset) return;
    const clip = createTextClip(preset, time, preset.id.startsWith('sticker/') ? 2 : 4);
    setProject((p) => {
      const target = p.textTracks[track];
      const free = target && !target.clips.some((c) => clip.start < c.start + c.duration && clip.start + clip.duration > c.start);
      if (!free) return placeTextClip(p, clip);
      return { ...p, textTracks: p.textTracks.map((t, i) => (i === track ? { ...t, clips: [...t.clips, clip] } : t)) };
    });
    setSelection({ kind: 'text', id: clip.id });
  };

  /** Arrastar o texto selecionado direto no preview. */
  const textDrag = useRef<{ kind: 'text' | 'overlay'; id: string; x0: number; y0: number; startX: number; startY: number } | null>(null);
  const onCanvasPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (picking) {
      const rect = e.currentTarget.getBoundingClientRect();
      void followPoint(picking, { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height });
      return;
    }
    if (e.button !== 0) return;
    const overlay = selection?.kind === 'overlay' ? findOverlayClip(project, selection.id) : null;
    if (overlay) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const { x, y } = overlay.clip.transform;
      textDrag.current = { kind: 'overlay', id: overlay.clip.id, x0: e.clientX, y0: e.clientY, startX: x, startY: y };
      return;
    }
    const found = selection?.kind === 'text' ? findTextClip(project, selection.id) : null;
    if (!found) {
      playerRef.current?.toggle();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    textDrag.current = { kind: 'text', id: found.clip.id, x0: e.clientX, y0: e.clientY, startX: found.clip.x, startY: found.clip.y };
  };
  const onCanvasPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = textDrag.current;
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - drag.x0) / rect.width;
    const dy = (e.clientY - drag.y0) / rect.height;
    if (drag.kind === 'overlay') {
      // A camada pode sair um pouco da tela (como num editor de verdade).
      const x = Math.min(1.25, Math.max(-0.25, drag.startX + dx));
      const y = Math.min(1.25, Math.max(-0.25, drag.startY + dy));
      setProject((p) => updateOverlayClip(p, drag.id, (c) => ({ ...c, transform: { ...c.transform, x, y } })));
      return;
    }
    const x = Math.min(1, Math.max(0, drag.startX + dx));
    const y = Math.min(1, Math.max(0, drag.startY + dy));
    setProject((p) => updateTextClip(p, drag.id, (c) => ({ ...c, x, y })));
  };

  // ------------------------------------------------ Salvar e abrir

  const newProject = () => {
    if (isDirty && !confirm('Começar um projeto novo? O que não foi salvo será perdido.')) return;
    playerRef.current?.pause();
    history.reset(createProject());
    fileHandle.current = null;
    savedProject.current = null;
    setSelection(null);
    playerRef.current?.seek(0);
  };

  const save = async (saveAs = false) => {
    try {
      setBusy('Salvando projeto…');
      const result = await saveProject(project, saveAs ? null : fileHandle.current);
      if (result.relinked) {
        // As mídias agora são lidas do arquivo salvo; os passos de desfazer também passam a usá-lo.
        const media = new Map(result.relinked.media.map((m) => [m.id, m]));
        history.rewrite((p) => ({ ...p, media: p.media.map((m) => media.get(m.id) ?? m) }));
        savedProject.current = result.relinked;
      } else {
        savedProject.current = project;
      }
      fileHandle.current = result.handle;
      notify(`Projeto salvo${result.handle ? ` em "${result.handle.name}"` : ''}.`);
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') notify(`Não foi possível salvar: ${String(error)}`, true);
    } finally {
      setBusy(null);
    }
  };

  const open = async () => {
    if (isDirty && !confirm('Abrir outro projeto? O que não foi salvo neste será perdido.')) return;
    try {
      const picked = await pickProjectFile();
      if (!picked) return;
      setBusy('Abrindo projeto…');
      const opened = await openProjectFile(picked.file);
      playerRef.current?.pause();
      history.reset(opened);
      fileHandle.current = picked.handle;
      savedProject.current = opened;
      setSelection(null);
      playerRef.current?.seek(0);
      notify(`"${opened.name}" aberto.`);
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setBusy(null);
    }
  };

  const recover = async () => {
    const pending = recovery;
    setRecovery(null);
    if (!pending) return;
    history.reset(pending.project);
    autosaveReady.current = true;
    notify('Projeto recuperado.');
  };

  const discardRecovery = async () => {
    setRecovery(null);
    autosaveReady.current = true;
    await clearAutosave().catch(() => {});
  };

  /** Importa as mídias de exemplo (domínio público, em /public/samples). */
  const loadSamples = async () => {
    const samples: [string, string][] = [
      ['entrevista.webm', 'video/webm'],
      ['drone.webm', 'video/webm'],
      ['paisagem.jpg', 'image/jpeg'],
      ['astronauta.jpg', 'image/jpeg'],
      ['cidade.jpg', 'image/jpeg'],
    ];
    try {
      setBusy('Baixando mídias de exemplo…');
      const files = await Promise.all(
        samples.map(async ([name, type]) => new File([await (await fetch(assetUrl(`samples/${name}`))).blob()], name, { type })),
      );
      setBusy(null);
      await importFiles(files);
    } catch (error) {
      notify(`Não foi possível carregar os exemplos: ${String(error)}`, true);
    } finally {
      setBusy(null);
    }
  };

  // ------------------------------------------------ Câmera que segue rosto / ponto

  const setFollow = (clipId: string, follow: CameraFollow, fill: boolean) =>
    setProject((p) =>
      updateClip(p, clipId, (c) => {
        const camera = c.camera ?? createCamera();
        return { ...c, camera: { ...camera, fill: camera.fill || fill, follow } };
      }),
    );

  const followFace = async (clipId: string) => {
    const layout = timeline.clips.find((l) => l.clip.id === clipId);
    if (!layout) return;
    try {
      setBusy('Procurando rostos… 0%');
      const points = await trackFace(layout.media, layout.clip.trimIn, layout.clip.trimOut, (f) =>
        setBusy(`Procurando rostos… ${Math.round(f * 100)}%`),
      );
      if (points.length === 0) {
        notify('Nenhum rosto encontrado neste clipe.', true);
        return;
      }
      // Zoom para o rosto ocupar ~22% da largura da tela (entre 1,2× e 3×).
      const size = points.reduce((s, p) => s + p.size, 0) / points.length;
      const zoom = Math.min(3, Math.max(1.2, 0.22 / Math.max(0.01, size)));
      setFollow(clipId, { kind: 'face', points, zoom, smoothness: 0.6, mode: 'center', anchorTime: layout.clip.trimIn }, true);
      notify(`Rosto encontrado em ${points.length} momentos. A câmera vai acompanhar.`);
    } catch (error) {
      console.error(error);
      notify(`Não foi possível analisar o vídeo: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setBusy(null);
    }
  };

  const followPoint = async (clipId: string, screen: { x: number; y: number }) => {
    setPicking(null);
    const layout = timeline.clips.find((l) => l.clip.id === clipId);
    if (!layout) return;
    const t = Math.min(Math.max(currentTime(), layout.start), layout.start + layout.length);
    const clipTime = t - layout.start;
    const sourceTime = layout.clip.trimIn + clipTime * speedOf(layout.clip);
    // Converte o clique na tela para a posição na imagem, desfazendo a câmera atual.
    const view = { ...evaluateCamera(layout.clip.camera, clipTime, sourceTime), fill: layout.clip.camera?.fill ?? false };
    const point = screenToSource(screen, view, project, layout.media);
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
      notify('Clique dentro da imagem do clipe.', true);
      return;
    }
    try {
      setBusy('Acompanhando o ponto… 0%');
      const points = await trackPoint(layout.media, sourceTime, point, layout.clip.trimIn, layout.clip.trimOut, (f) =>
        setBusy(`Acompanhando o ponto… ${Math.round(f * 100)}%`),
      );
      setFollow(clipId, { kind: 'point', points, zoom: 1.4, smoothness: 0.25, mode: 'center', anchorTime: sourceTime }, false);
      notify('Ponto rastreado. A câmera vai acompanhar.');
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setBusy(null);
    }
  };

  const startExport = async (settings: ExportSettings) => {
    playerRef.current?.pause();
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportState({ status: 'running', progress: { stage: 'Preparando', fraction: 0 } });
    try {
      const blob = await exportProject(project, settings, {
        signal: controller.signal,
        onProgress: (progress) => setExportState({ status: 'running', progress }),
      });
      const url = URL.createObjectURL(blob);
      const base = (project.name || 'lumiar').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'lumiar';
      const fileName = `${base}.${FORMAT_INFO[settings.format].extension}`;
      download(url, fileName);
      setExportState({ status: 'done', url, fileName, size: blob.size });
    } catch (error) {
      if (controller.signal.aborted) {
        setExportState(null);
        notify('Exportação cancelada.');
      } else {
        console.error(error);
        setExportState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    }
  };

  const step = (seconds: number) => {
    const player = playerRef.current;
    if (player) player.seek(player.currentTime + seconds);
  };

  // Atalhos de teclado (a versão mais recente das funções fica num ref).
  const keyActions = useRef({ split, deleteSelection, undo: history.undo, redo: history.redo, save, open, copy, paste, duplicateSelection, markHere, jumpEdit, toggleVoice: () => {} });
  const toggleVoice = () => void (voiceRef.current ? stopRecording() : startRecording(savedRecordOptions()));
  keyActions.current = { split, deleteSelection, undo: history.undo, redo: history.redo, save, open, copy, paste, duplicateSelection, markHere, jumpEdit, toggleVoice };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const actions = keyActions.current;
      const ctrl = e.ctrlKey || e.metaKey;
      // Salvar e abrir funcionam até com o foco num campo de texto.
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void actions.save(e.shiftKey);
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void actions.open();
        return;
      }
      const target = e.target;
      if ((target instanceof Element && target.closest('input, select, textarea')) || exportState) return;
      const player = playerRef.current;
      if (!player) return;
      const frame = 1 / project.fps;
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
      } else if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        actions.redo();
      } else if (ctrl && e.key.toLowerCase() === 'c') {
        actions.copy();
      } else if (ctrl && e.key.toLowerCase() === 'x') {
        actions.copy(true);
      } else if (ctrl && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        actions.paste();
      } else if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        actions.duplicateSelection();
      } else if (e.code === 'Space') {
        e.preventDefault();
        player.toggle();
      } else if (e.key.toLowerCase() === 's' && !ctrl) {
        actions.split();
      } else if (e.key.toLowerCase() === 'm' && !ctrl) {
        actions.markHere();
      } else if (e.key.toLowerCase() === 'r' && !ctrl) {
        actions.toggleVoice();
      } else if (ctrl && e.key === 'ArrowLeft') {
        e.preventDefault();
        actions.jumpEdit(-1);
      } else if (ctrl && e.key === 'ArrowRight') {
        e.preventDefault();
        actions.jumpEdit(1);
      } else if (e.key === 'ArrowLeft') {
        player.seek(player.currentTime - (e.shiftKey ? 1 : frame));
      } else if (e.key === 'ArrowRight') {
        player.seek(player.currentTime + (e.shiftKey ? 1 : frame));
      } else if (e.key === 'Home') {
        player.seek(0);
      } else if (e.key === 'End') {
        player.seek(player.duration);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        actions.deleteSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project.fps, exportState]);

  // Arrastar arquivos do computador para qualquer lugar da janela
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDraggingFiles(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDraggingFiles(false);
    };
    const onDrop = (e: DragEvent) => {
      setDraggingFiles(false);
      const types = e.dataTransfer?.types ?? [];
      if (types.includes(PLUGIN_MIME) || types.includes(MEDIA_MIME) || types.includes(TEXT_PRESET_MIME)) return;
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) void importFiles(files);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [importFiles]);

  const openImport = () => fileInputRef.current?.click();
  const empty = project.media.length === 0;

  return (
    <div
      className="grid h-full grid-cols-[64px_272px_minmax(0,1fr)_304px] grid-rows-[52px_minmax(0,1fr)_var(--timeline-h)] min-[1500px]:grid-cols-[72px_320px_minmax(0,1fr)_340px]"
      style={{ '--timeline-h': `${timelineHeight}px` } as CSSProperties}
    >
      {/* ------------------------------------------------ Barra superior */}
      <header className="col-span-4 flex items-center gap-4 border-b border-line bg-panel px-4">
        <div className="flex items-center gap-2.5">
          <span className="size-6 rounded-full bg-[conic-gradient(from_200deg,var(--color-accent),var(--color-accent-2),var(--color-pink),var(--color-accent))] shadow-[0_0_16px_rgba(111,125,255,0.6)]" />
          <span className="text-[17px] font-bold tracking-tight">Lumiar</span>
          <span className="rounded-full border border-line-strong px-1.5 text-[10px] font-medium text-faint">beta</span>
        </div>
        <span className="h-5 w-px bg-line" />
        <div className="flex items-center gap-0.5">
          <IconButton label="Novo projeto" onClick={newProject}>
            <FilePlus size={16} />
          </IconButton>
          <IconButton label="Abrir projeto (Ctrl+O)" onClick={() => void open()}>
            <FolderOpen size={16} />
          </IconButton>
          <IconButton label="Salvar projeto (Ctrl+S) · Shift: salvar como" onClick={(e) => void save(e.shiftKey)} className="relative">
            <Save size={16} />
            {isDirty && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber" />}
          </IconButton>
        </div>
        <input
          value={project.name}
          onChange={(e) => {
            const name = e.target.value;
            setProject((p) => ({ ...p, name }));
          }}
          spellCheck={false}
          title="Nome do projeto"
          className="field-sizing-content min-w-24 max-w-72 truncate rounded-md border border-transparent bg-transparent px-2 py-1 font-medium text-fg outline-none transition-colors hover:border-line focus:border-accent"
        />
        {isDirty && (
          <span className="-ml-2 flex items-center gap-1 rounded-full bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber" title="Há mudanças que ainda não foram salvas em arquivo (Ctrl+S)">
            <span className="size-1.5 rounded-full bg-amber" />
            não salvo
          </span>
        )}

        <span className="flex-1" />

        <button
          onClick={() => setProjectDialog(true)}
          title="Formato do projeto: tamanho, proporção, fps e fundo"
          className="flex h-8 items-center gap-2 rounded-lg border border-line bg-panel-2 pl-1.5 pr-3 text-xs transition-colors hover:border-line-strong hover:bg-panel-3"
        >
          <AspectBox width={project.width} height={project.height} size={20} />
          <span className="font-medium">{presetName(project.width, project.height)}</span>
          <span className="font-mono text-faint">
            {project.width}×{project.height} · {aspectLabel(project.width, project.height)} · {project.fps} fps
          </span>
          <Monitor size={13} className="text-faint" />
        </button>

        {project.width > project.height && project.clips.length > 0 && (
          <IconButton label="Converter para vertical (Reels/TikTok/Shorts), com a câmera seguindo os rostos" onClick={() => void reframeVertical()}>
            <Smartphone size={16} />
          </IconButton>
        )}

        <Button
          variant="primary"
          icon={<Download size={15} />}
          disabled={timeline.duration === 0}
          onClick={() => {
            playerRef.current?.pause();
            setExportState({ status: 'setup' });
          }}
          className="px-4"
        >
          Exportar
        </Button>
      </header>

      {/* ------------------------------------------------ Laterais */}
      <Rail tab={tab} onTab={setTab} />
      <Library
        tab={tab}
        project={project}
        onApply={(plugin) => applyTo(selection, plugin)}
        onImport={openImport}
        onAddMedia={(media) => setProject((p) => addToTimeline(p, [media]))}
        onAddText={addText}
        onAddSound={(sound) => void addSound(sound)}
        onLoadSamples={() => void loadSamples()}
        time={time}
        onChange={setProject}
        onSeek={(t) => playerRef.current?.seek(t)}
        notify={notify}
        onRemoveMedia={(media) => {
          setProject((p) => removeMedia(p, media.id));
          setSelection(null);
        }}
        onMediaMenu={(e, media) =>
          openMenu(
            e,
            mediaMenu(editorApi, media, () => {
              setProject((p) => removeMedia(p, media.id));
              setSelection(null);
            }),
          )
        }
        onPluginMenu={(e, plugin) => openMenu(e, pluginMenu(editorApi, plugin, () => applyTo(selection, plugin)))}
        onAddPack={(pack) => void addPack(pack)}
        onPackMenu={(e, pack) => openMenu(e, packMenu(editorApi, pack))}
        voice={{
          selection,
          session,
          speaking,
          onRecord: (options) => void startRecording(options),
          onStop: () => void stopRecording(),
          onSpeak: (text, voice) => void speakText(text, voice),
          onSpeakCaptions: (voice) => void speakCaptions(voice),
          onChange: setProject,
        }}
      />

      {/* ------------------------------------------------ Visualizador */}
      <main className="flex min-h-0 flex-col bg-[radial-gradient(ellipse_at_center,#171a24_0%,#0a0b0e_70%)]">
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-5">
          <canvas
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={() => (textDrag.current = null)}
            onContextMenu={(e) => openMenu(e, previewMenu(editorApi))}
            title={
              picking
                ? 'Clique no ponto que a câmera deve seguir'
                : selection?.kind === 'text' || selection?.kind === 'overlay'
                  ? 'Arraste para posicionar'
                  : 'Clique para tocar/pausar'
            }
            className={cx(
              'max-h-full max-w-full rounded-md bg-black shadow-[0_10px_40px_rgba(0,0,0,0.7)] ring-1 ring-white/5',
              selection?.kind === 'text' && !picking && 'cursor-move ring-2 ring-fuchsia-400/60',
              selection?.kind === 'overlay' && !picking && 'cursor-move ring-2 ring-accent/60',
              picking && 'cursor-crosshair ring-2 ring-amber',
              empty && !hasContent(project) && 'opacity-0',
            )}
            style={{ aspectRatio: `${project.width} / ${project.height}` }}
          />

          {empty && !hasContent(project) && (
            <button
              onClick={openImport}
              className="group absolute inset-8 flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-line-strong text-dim transition-colors hover:border-accent hover:bg-accent/5"
            >
              <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-xl shadow-accent/30 transition-transform group-hover:scale-110">
                <Upload size={28} />
              </span>
              <span className="text-lg font-semibold text-fg">Arraste vídeos, músicas e imagens aqui</span>
              <span className="text-xs text-faint">ou clique para escolher · MP4, MOV, WebM, MP3, WAV, JPG, PNG…</span>
            </button>
          )}

          {session && (
            <Teleprompter
              session={session}
              script={voiceRef.current?.options.prompter ? project.script : ''}
              wordsPerMinute={voiceRef.current?.options.prompterSpeed ?? 140}
              onStop={() => void stopRecording()}
            />
          )}

          {importing > 0 && (
            <div className="absolute bottom-6 flex animate-pop-in items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-xs backdrop-blur">
              <LoaderCircle size={14} className="animate-spin text-accent" />
              Importando {importing} arquivo(s)…
            </div>
          )}
        </div>

        <div className="border-t border-line bg-panel">
          <div className="px-4 pt-2">
            <Slider
              label="Posição"
              value={time}
              min={0}
              max={timeline.duration || 1}
              step={0.001}
              onChange={(t) => playerRef.current?.seek(t)}
            />
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pb-2.5 pt-1">
            <span className="font-mono text-sm tabular-nums">
              {formatTime(time)}
              <span className="text-faint"> / {formatTime(timeline.duration)}</span>
            </span>
            <div className="flex items-center gap-1">
              <IconButton label="Início (Home)" onClick={() => playerRef.current?.seek(0)}>
                <SkipBack size={16} />
              </IconButton>
              <IconButton label="Quadro anterior (←)" onClick={() => step(-1 / project.fps)}>
                <StepBack size={16} />
              </IconButton>
              <button
                title="Tocar / pausar (Espaço)"
                disabled={timeline.duration === 0}
                onClick={() => playerRef.current?.toggle()}
                className="mx-1.5 flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/30 transition hover:scale-105 hover:brightness-110 disabled:opacity-40 disabled:hover:scale-100"
              >
                {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
              </button>
              <IconButton label="Próximo quadro (→)" onClick={() => step(1 / project.fps)}>
                <StepForward size={16} />
              </IconButton>
              <IconButton label="Fim (End)" onClick={() => playerRef.current?.seek(playerRef.current.duration)}>
                <SkipForward size={16} />
              </IconButton>
            </div>
            <span className="flex items-center justify-end gap-2 text-right font-mono text-xs text-faint">
              {proxyJob && <span className="truncate font-sans text-[11px] text-dim">{proxyJob}</span>}
              <button
                onClick={() => setProxyMode((v) => !v)}
                title={
                  'Prévia leve: cria cópias em 540p dos vídeos pesados (4K, 1080p) só para editar.\nTocar e pular na timeline fica mais rápido; a exportação continua usando os arquivos originais.'
                }
                className={cx(
                  'flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-sans text-[11px] transition-colors',
                  proxyMode ? 'border-accent/60 bg-accent/15 text-fg' : 'border-line text-faint hover:border-line-strong hover:text-dim',
                )}
              >
                <Feather size={11} />
                Prévia leve
              </button>
              {project.width}×{project.height} · {project.fps} fps
            </span>
          </div>
        </div>
      </main>

      <Inspector
        project={project}
        selection={selection}
        time={time}
        onSeek={(t) => playerRef.current?.seek(t)}
        onChange={setProject}
        onSelect={setSelection}
        onDetach={detach}
        onFollowFace={(id) => void followFace(id)}
        onPickPoint={(id) => {
          playerRef.current?.pause();
          setPicking((p) => (p === id ? null : id));
          notify('Clique no ponto do vídeo que a câmera deve acompanhar.');
        }}
        picking={picking}
        onNormalize={(id) => normalizeAudio(id)}
        notify={(text) => notify(text)}
        onToMain={(id) => {
          const result = demoteToMain(project, id);
          applyEdit(result && { project: result.project, selection: { kind: 'clip', id: result.id } });
        }}
      />

      {/* ------------------------------------------------ Timeline */}
      <div className="relative col-span-4 min-h-0">
        {/* Divisória: arraste para dar mais espaço à timeline ou ao vídeo. */}
        <div
          title="Arraste para redimensionar"
          onPointerDown={startTimelineResize}
          className="group absolute inset-x-0 -top-1.5 z-40 flex h-3 cursor-row-resize items-center justify-center"
        >
          <span className="h-1 w-12 rounded-full bg-line-strong opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <Timeline
          project={project}
          timeline={timeline}
          time={time}
          playing={playing}
          selection={selection}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onSelect={setSelection}
          onSeek={(t) => playerRef.current?.seek(t)}
          onEdit={setProject}
          onImport={openImport}
          onUndo={history.undo}
          onRedo={history.redo}
          onSplit={split}
          onDetach={() => selection?.kind === 'clip' && detach(selection.id)}
          onDelete={deleteSelection}
          onDropPlugin={(target, pluginId) => {
            const plugin = getPlugin(pluginId);
            if (plugin) applyTo(target, plugin);
          }}
          onDropMedia={dropMedia}
          onDropTextPreset={dropTextPreset}
          onDropPack={dropPack}
          onDropSound={(soundId, track, t) => {
            const sound = getSound(soundId);
            if (sound) void addSound(sound, t, track);
          }}
          onContextMenu={(e, target: TimelineTarget) => openMenu(e, timelineMenu(editorApi, target))}
          onAddMarker={() => markHere()}
          recording={session ? session.elapsed : null}
          onToggleRecord={() => void (session ? stopRecording() : startRecording(savedRecordOptions()))}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,image/*"
        multiple
        hidden
        onChange={(e) => {
          void importFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />

      {recovery && (
        <div className="fixed left-1/2 top-16 z-50 flex w-[min(560px,calc(100vw-32px))] -translate-x-1/2 animate-pop-in items-center gap-3 rounded-2xl border border-accent/40 bg-panel-2/95 px-4 py-3 shadow-2xl backdrop-blur">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <LifeBuoy size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Recuperar o projeto anterior?</p>
            <p className="truncate text-xs text-dim">
              “{recovery.project.name}” · salvo automaticamente em {new Date(recovery.savedAt).toLocaleString('pt-BR')}
            </p>
          </div>
          <Button onClick={() => void discardRecovery()}>Descartar</Button>
          <Button variant="primary" onClick={() => void recover()}>
            Recuperar
          </Button>
        </div>
      )}

      {busy && (
        <div className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-5 py-4 shadow-2xl">
            <LoaderCircle size={18} className="animate-spin text-accent" />
            {busy}
          </div>
        </div>
      )}

      {draggingFiles && (
        <div className="pointer-events-none fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-bg/80 p-6 backdrop-blur-sm">
          <div className="flex size-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-accent bg-accent/5">
            <Upload size={40} className="text-accent" />
            <p className="text-xl font-semibold">Solte para importar</p>
            <p className="text-sm text-dim">Vídeos, músicas e imagens</p>
          </div>
        </div>
      )}

      {exportState && (
        <ExportDialog
          state={exportState}
          project={project}
          duration={timeline.duration}
          time={time}
          onStart={(settings) => void startExport(settings)}
          onSnapshot={() => {
            setExportState(null);
            void saveFrame();
          }}
          onCancel={() => exportAbortRef.current?.abort()}
          onClose={() => setExportState(null)}
        />
      )}

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}

      {projectDialog && (
        <ProjectDialog
          project={project}
          onApply={(patch) => setProject((p) => ({ ...p, ...patch }))}
          onClose={() => setProjectDialog(false)}
        />
      )}

      <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'flex animate-toast-in items-start gap-2.5 rounded-xl border bg-panel-2/95 px-3.5 py-3 text-xs shadow-2xl backdrop-blur',
              t.error ? 'border-danger/40' : 'border-line',
            )}
          >
            {t.error ? (
              <TriangleAlert size={15} className="mt-px shrink-0 text-danger" />
            ) : (
              <CircleCheck size={15} className="mt-px shrink-0 text-success" />
            )}
            <span className="whitespace-pre-wrap leading-relaxed">{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TIMELINE_KEY = 'lumiar:timeline-height';

/** Altura da timeline, ajustável pela divisória e lembrada entre as sessões. */
function useTimelineHeight(): [number, (e: ReactPointerEvent) => void] {
  const clamp = (h: number) => Math.round(Math.min(Math.max(h, 180), window.innerHeight - 280));
  const [height, setHeight] = useState(() => {
    let saved = NaN;
    try {
      saved = Number(localStorage.getItem(TIMELINE_KEY));
    } catch {
      // Sem acesso ao armazenamento: usa o padrão.
    }
    return clamp(saved > 0 ? saved : Math.max(270, window.innerHeight * 0.3));
  });

  useEffect(() => {
    const onResize = () => setHeight((h) => clamp(h));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const start = (e: ReactPointerEvent) => {
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = height;
    let last = h0;
    const move = (ev: PointerEvent) => {
      last = clamp(h0 + (y0 - ev.clientY));
      setHeight(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      try {
        localStorage.setItem(TIMELINE_KEY, String(last));
      } catch {
        // Sem acesso ao armazenamento: só não lembra na próxima vez.
      }
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return [height, start];
}

/** Divide um texto longo em frases (a voz sintética funciona melhor com trechos curtos). */
function splitSentences(text: string): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…;:])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Junta frases curtas até ~180 letras.
  const parts: string[] = [];
  for (const sentence of sentences) {
    const last = parts[parts.length - 1];
    if (last && last.length + sentence.length < 180) parts[parts.length - 1] = `${last} ${sentence}`;
    else parts.push(sentence);
  }
  return parts;
}
