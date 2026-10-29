import {
  Download,
  Feather,
  Smartphone,
  FilePlus,
  FolderOpen,
  LayoutTemplate,
  ImagePlus,
  History,
  LoaderCircle,
  Monitor,
  Save,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Upload,
  Wrench,
  Columns2,
  Map as MapIcon,
  AudioLines,
  Code,
  Boxes,
  BadgeCheck,
  Layers,
  HardDrive,
  MessagesSquare,
  Group,
  Trash,
  Fish,
  ListOrdered,
  ChartColumn,
  ArrowRightLeft,
  Clapperboard,
  Search,
  Store,
  Keyboard,
  Sparkles,
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
import { audioTools } from './app/audioTools';
import { cameraFollowTools } from './app/cameraFollow';
import type { EditorContext } from './app/context';
import { creationTools } from './app/creationTools';
import { UpdateBanner, useDesktopUpdate } from './app/desktopUpdate';
import { ExportPill, useExportQueue } from './app/exportQueue';
import { PrerenderPill, usePrerender } from './app/prerender';
import { GpuLostOverlay, NoWebGL2Screen } from './app/gpu';
import {
  BatchDialog,
  BrandKitDialog,
  BrollDialog,
  ChaptersDialog,
  CompoundDialog,
  EffectEditor,
  FaceBlurDialog,
  GalleryDialog,
  HighlightsDialog,
  HistoryDialog,
  HookDialog,
  InterchangeDialog,
  MaskDrawer,
  MediaManagerDialog,
  MediaSearchDialog,
  Scopes,
  ScreenRecordDialog,
  ScriptAssemblyDialog,
  ShortcutsDialog,
  SplitScreenDialog,
  TemplateDialog,
  ThumbnailDialog,
} from './app/lazyDialogs';
import { multicamTools } from './app/multicamTools';
import { BusyOverlay, DropOverlay, RecoveryBanner } from './app/overlays';
import { packTools } from './app/packTools';
import { ScreenRecordingBar, useScreenRecording } from './app/screenRecording';
import { Toasts, useToasts } from './app/toasts';
import { useCompounds } from './app/useCompounds';
import { useFaceBlur } from './app/useFaceBlur';
import { useFileDrop } from './app/useFileDrop';
import { useKeyboardShortcuts } from './app/useKeyboardShortcuts';
import { onShortcutsDialogRequest, shortcutLabel, useShortcutsVersion, withShortcut } from './app/shortcuts';
import { SampleOffer, useSampleProject } from './app/sample';
import { usePreviewPlayer } from './app/usePreviewPlayer';
import { missingMediaText, useProjectFiles } from './app/useProjectFiles';
import { useProxies } from './app/useProxies';
import { useVoice } from './app/useVoice';
import { visualTools } from './app/visualTools';
import { stabilizeTools } from './app/stabilizeTools';
import { getPlugin } from './engine/registry';
import { t } from './i18n';
import { keys } from './i18n/keys';
import type { ShaderPlugin } from './engine/types';
import { assets } from './media/assets';
import { savedRecordOptions } from './ui/VoicePanel';
import { Teleprompter } from './ui/Teleprompter';
import { aspectLabel, presetName } from './project/formats';
import { AspectBox, ProjectDialog } from './ui/ProjectDialog';
import { analyzeMedia, importMedia, mediaKindOf } from './media/importer';
import type { Player } from './preview/player';
import {
  addMedia,
  createAudioClip,
  createEffect,
  createFilter,
  createProject,
  createTransition,
  addMarker,
  createOverlayClip,
  createVideoClip,
  editPoints,
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
  removeOverlayClip,
  removeMedia,
  setTransition,
  splitAudioClip,
  splitOverlayClip,
  splitVideoClip,
  trimAudioClip,
  trimOverlayClip,
  updateClip,
  updateOverlayClip,
  type MediaItem,
  type Project,
  type VideoClip,
} from './project/model';
import { copySelection, duplicate, pasteAt, type CopiedItem, type EditResult } from './project/clipboard';
import { ContextMenu, type MenuEntry, type MenuState } from './ui/ContextMenu';
import { mediaMenu, packMenu, pluginMenu, previewMenu, timelineMenu, type EditorApi } from './ui/menus';
import { deletePack, findPackClip, splitPackClip } from './project/packs';
import { getSound } from './media/sfx';
import { download, ExportDialog } from './ui/ExportDialog';
import { formatTime } from './ui/format';
import { Inspector } from './ui/Inspector';
import { Button, cx, IconButton, Slider } from './ui/kit';
import { LanguagePicker } from './ui/LanguagePicker';
import { Library, Rail, type LibraryTab } from './ui/Library';
import { loadFonts } from './media/fonts';
import { loadSamplePhotos, setPreviewClip } from './ui/previews';
import { typingDuration } from './media/typingRender';
import { addComment, CommentsDialog, removeComment, updateComment } from './ui/CommentsDialog';
import { groupItems } from './project/groups';
import type { MultiItem } from './ui/selection';
import { mergeDuplicates } from './project/mediaUsage';
import { replaceClipMedia } from './project/templates';
import { deleteMainClip, removeTimeRanges } from './project/ripple';
import { hasContent, loadVersion } from './project/storage';
import {
  createTextClip,
  findTextClip,
  findTextPreset,
  placeTextClip,
  removeTextClip,
  resizeTextClip,
  splitTextClip,
  updateTextClip,
  type TextPreset,
} from './project/text';
import { type Selection } from './ui/selection';
import { Timeline, type MediaDropTarget, type TimelineTarget } from './ui/Timeline';
import { MixerPanel } from './ui/Mixer';
import { useHistory } from './ui/useHistory';
import { ObjectPicker } from './ui/ObjectPicker';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const history = useHistory<Project>(createProject);
  const project = history.state;
  const setProject = history.update;
  const [selection, setSelection] = useState<Selection>(null);
  /** Seleção de vários itens na timeline (Ctrl/Shift + clique ou retângulo) */
  const [multi, setMulti] = useState<MultiItem[]>([]);

  /** Camada com a forma sendo desenhada no vídeo */
  const [maskEdit, setMaskEdit] = useState<string | null>(null);
  /** Gráficos de cor por cima do preview */
  const [scopes, setScopes] = useState(false);
  /** Painel do mixer de áudio (acima da timeline) */
  const [mixerOpen, setMixerOpen] = useState(false);
  /** Janela de comentários aberta (com o comentário em foco) */
  const [commentsOpen, setCommentsOpen] = useState<{ focus: string | null } | null>(null);
  const [tab, setTab] = useState<LibraryTab>('media');
  const [importing, setImporting] = useState(0);
  /** Mensagem de "trabalhando…" (salvar/abrir/analisar). */
  const [busy, setBusy] = useState<string | null>(null);
  /** Clipe esperando o clique no vídeo para escolher o ponto que a câmera vai seguir. */
  const [picking, setPicking] = useState<string | null>(null);
  const [timelineHeight, startTimelineResize] = useTimelineHeight();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [clipboard, setClipboard] = useState<CopiedItem | null>(null);
  const [projectDialog, setProjectDialog] = useState(false);
  const [templateDialog, setTemplateDialog] = useState(false);
  /** Janela "Atalhos do teclado" (também abre pela tecla ? e pelo painel da direita) */
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => onShortcutsDialogRequest(() => setShortcutsOpen(true)), []);
  // As dicas com atalho (Salvar, Desfazer…) mostram a tecla atual: redesenha quando a pessoa muda.
  useShortcutsVersion();
  const [toolDialog, setToolDialog] = useState<'chapters' | 'highlights' | 'history' | 'hook' | 'script' | null>(null);
  // Ferramentas: tela dividida, marca, lote, mídias…
  const [extraDialog, setExtraDialog] = useState<'split' | 'brand' | 'batch' | 'media' | 'effects' | 'interchange' | 'search' | 'broll' | null>(null);
  /** Quadro usado no criador de capa */
  const [thumbFrame, setThumbFrame] = useState<ImageBitmap | null>(null);
  /** Galeria da comunidade aberta (já filtrada em efeitos ou pacotes quando vem da aba) */
  const [gallery, setGallery] = useState<{ kind: 'effect' | 'pack' | null } | null>(null);

  const timeline = useMemo(() => layoutProject(project), [project]);

  // Cortes na trilha principal levam o resto junto (preferência do editor).
  const [ripple, setRipple] = useState(() => {
    try {
      return localStorage.getItem('lumiar:ripple') !== '0';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('lumiar:ripple', ripple ? '1' : '0');
    } catch {
      // Sem armazenamento: vale só nesta sessão.
    }
  }, [ripple]);

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

  const { toasts, notify } = useToasts();
  const { proxyMode, setProxyMode, proxyJob } = useProxies(project.media, playerRef, notify);
  const { time, playing, gpu } = usePreviewPlayer(canvasRef, playerRef, notify);

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

  const currentTime = () => playerRef.current?.currentTime ?? 0;

  /** Aplica uma edição que também troca a seleção (colar, duplicar…). */
  const applyEdit = (result: EditResult | null, fail = t('Não foi possível fazer isso aqui.')) => {
    if (!result) {
      notify(fail, true);
      return;
    }
    setProject(() => result.project);
    setSelection(result.selection);
  };

  // As ferramentas (em src/app) recebem o estado deste render, como se estivessem aqui dentro.
  const ctx: EditorContext = { history, project, timeline, setProject, selection, setSelection, notify, setBusy, applyEdit, playerRef, currentTime, ripple };
  const compounds = useCompounds(ctx);
  const files = useProjectFiles(ctx, compounds, () => setMulti([]));
  const { isDirty } = files;
  const sample = useSampleProject(ctx, files);
  const desktopUpdate = useDesktopUpdate(notify, isDirty);
  const screen = useScreenRecording(ctx);
  const voice = useVoice(ctx);
  const faces = useFaceBlur(ctx);
  const exporting = useExportQueue(project, playerRef, notify);
  const audio = audioTools(ctx);
  const multicam = multicamTools(ctx);
  const visual = visualTools(ctx);
  const follow = cameraFollowTools(ctx, setPicking);
  const stabilizer = stabilizeTools(ctx);
  const packs = packTools(ctx, audio);
  const creation = creationTools(ctx);
  const prerender = usePrerender(ctx);

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
        notify(t('Nenhum vídeo, áudio ou imagem suportado.'), true);
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
      notify(t('{n} arquivo(s) adicionado(s) à timeline.', { n: items.length }));
    },
    // addToTimeline só usa funções puras e o ref do player, então não precisa estar aqui.
    [notify, setProject],
  );

  const dropMedia = (mediaId: string, target: MediaDropTarget) => {
    const media = getMedia(project, mediaId);
    if (!media) return;
    if (target.row === 'overlay') {
      if (media.kind === 'audio') {
        notify(t('Áudios vão para a trilha de áudio.'), true);
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
        notify(t('Áudios vão para a trilha de áudio.'));
      } else {
        setProject((p) => insertVideoClips(p, [createVideoClip(media)], target.index));
      }
      return;
    }
    if (!media.hasAudio) {
      notify(t('Imagens e vídeos sem som vão para a trilha de vídeo.'), true);
      return;
    }
    setProject((p) => placeAudioClip(p, createAudioClip(media, target.time), target.track));
  };

  /** Aplica um efeito/filtro num clipe ou uma transição entre clipes. */
  const applyTo = (target: Selection, plugin: ShaderPlugin) => {
    if (plugin.kind === 'transition') {
      if (target?.kind !== 'transition') {
        notify(t('Selecione uma transição (◆ entre dois clipes) — ou arraste até ela.'), true);
        return;
      }
      setProject((p) => setTransition(p, target.index, createTransition(plugin.id, p.transitions[target.index]?.duration)));
      setSelection(target);
      return;
    }
    const visuals = multi.filter((m) => m.kind === 'clip' || m.kind === 'overlay');
    if (visuals.length > 1 && (!target || multi.some((m) => 'id' in target && m.id === target.id))) {
      setProject((p) =>
        visuals.reduce((acc, m) => {
          const fn = (c: VideoClip): VideoClip => {
            if (plugin.kind === 'filter') return { ...c, filter: createFilter(plugin.id) };
            const effect = createEffect(plugin.id);
            return effect ? { ...c, effects: [...c.effects, effect] } : c;
          };
          return m.kind === 'clip' ? updateClip(acc, m.id, fn) : updateOverlayClip(acc, m.id, (c) => ({ ...c, ...fn(c) }));
        }, p),
      );
      notify(t('"{name}" aplicado em {n} clipes.', { name: t(plugin.name), n: visuals.length }));
      return;
    }
    if (target?.kind !== 'clip' && target?.kind !== 'overlay') {
      notify(
        plugin.kind === 'filter'
          ? t('Selecione um clipe de vídeo primeiro — ou arraste o filtro até ele.')
          : t('Selecione um clipe de vídeo primeiro — ou arraste o efeito até ele.'),
        true,
      );
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
    notify(t('"{name}" aplicado.', { name: t(plugin.name) }));
  };

  const split = () => {
    const now = currentTime();
    let result: { project: Project; newId: string } | null = null;
    if (selection?.kind === 'audio') {
      result = splitAudioClip(project, selection.id, now);
      if (result) setSelection({ kind: 'audio', id: result.newId });
    } else if (selection?.kind === 'text') {
      result = splitTextClip(project, selection.id, now);
      if (result) setSelection({ kind: 'text', id: result.newId });
    } else if (selection?.kind === 'overlay') {
      result = splitOverlayClip(project, selection.id, now);
      if (result) setSelection({ kind: 'overlay', id: result.newId });
    } else if (selection?.kind === 'pack') {
      result = splitPackClip(project, selection.id, now);
      if (result) setSelection({ kind: 'pack', id: result.newId });
    } else {
      // Clipe selecionado, ou o clipe de vídeo que está sob o cursor.
      const id =
        selection?.kind === 'clip'
          ? selection.id
          : timeline.clips.find((l) => now > l.start && now < l.start + l.length)?.clip.id;
      result = id ? splitVideoClip(project, id, now) : null;
      if (result) setSelection({ kind: 'clip', id: result.newId });
    }
    if (result) setProject(() => result.project);
    else notify(t('Posicione o cursor dentro de um clipe para dividir.'), true);
  };

  const detach = (clipId: string) => {
    const result = detachAudio(project, clipId);
    if (!result) return;
    setProject(() => result.project);
    setSelection({ kind: 'audio', id: result.audioId });
    notify(t('Áudio separado para a trilha de áudio.'));
  };

  /** Remove um item da timeline, seja de que tipo for. */
  const removeItem = (p: Project, item: MultiItem): Project =>
    item.kind === 'clip'
      ? deleteMainClip(p, item.id, ripple)
      : item.kind === 'audio'
        ? removeAudioClip(p, item.id)
        : item.kind === 'text'
          ? removeTextClip(p, item.id)
          : item.kind === 'overlay'
            ? removeOverlayClip(p, item.id)
            : deletePack(p, item.id);

  const deleteSelection = () => {
    if (multi.length > 1) {
      // Da direita para a esquerda: excluir um clipe principal não muda onde os anteriores estão.
      const order = (m: MultiItem) => layoutProject(history.current()).clips.find((l) => l.clip.id === m.id)?.start ?? 0;
      const items = [...multi].sort((a, b) => order(b) - order(a));
      setProject((p) => items.reduce(removeItem, p));
      notify(t('{n} itens excluídos.', { n: items.length }));
      setMulti([]);
      setSelection(null);
      return;
    }
    if (selection?.kind === 'clip') setProject((p) => deleteMainClip(p, selection.id, ripple));
    else if (selection?.kind === 'audio') setProject((p) => removeAudioClip(p, selection.id));
    else if (selection?.kind === 'text') setProject((p) => removeTextClip(p, selection.id));
    else if (selection?.kind === 'overlay') setProject((p) => removeOverlayClip(p, selection.id));
    else if (selection?.kind === 'pack') setProject((p) => deletePack(p, selection.id));
    else return;
    setSelection(null);
  };

  const copy = (cut = false) => {
    const item = copySelection(project, selection);
    if (!item) return;
    setClipboard(item);
    if (cut) deleteSelection();
    else notify(t('Copiado. {keys} cola no cursor.', { keys: keys('Ctrl+V') }));
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
    notify(t('Quadro salvo como PNG.'));
  };
  const copyFrame = async () => {
    try {
      const blob = await frameBlob();
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      notify(t('Quadro copiado. Cole ({keys}) em outro programa.', { keys: keys('Ctrl+V') }));
    } catch {
      notify(t('O navegador não deixou copiar a imagem.'), true);
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

  /** Q / W: corta o clipe principal do começo até o cursor, ou do cursor até o fim (o resto anda junto). */
  const trimToCursor = (edge: 'start' | 'end') => {
    const now = currentTime();
    if (selection?.kind === 'audio' || selection?.kind === 'text' || selection?.kind === 'overlay') {
      const fn = selection.kind === 'audio' ? trimAudioClip : selection.kind === 'overlay' ? trimOverlayClip : resizeTextClip;
      setProject((p) => fn(p, selection.id, edge === 'start' ? 'in' : 'out', now));
      return;
    }
    const layout = timeline.clips.find((l) => now > l.start + 0.05 && now < l.start + l.length - 0.05);
    if (!layout) {
      notify(t('Ponha o cursor dentro de um clipe.'), true);
      return;
    }
    const range: [number, number] = edge === 'start' ? [layout.start, now] : [now, layout.start + layout.length];
    setProject((p) => removeTimeRanges(p, [range], ripple).project);
    if (edge === 'start') playerRef.current?.seek(layout.start);
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
      if (item && item.kind !== 'look') notify(t('Copiado. {keys} cola no cursor.', { keys: keys('Ctrl+V') }));
    },
    split: () => split(),
    detach: (id) => detach(id),
    openImport: () => openImport(),
    togglePlay: () => playerRef.current?.toggle(),
    saveFrame: () => void saveFrame(),
    copyFrame: () => void copyFrame(),
    freeze: (id) => void visual.freeze(id),
    reverse: (target) => void visual.reverse(target),
    addMarker: (t) => markHere(t),
    dub: (target) => void voice.startRecording({ ...savedRecordOptions(), dub: target }),
    normalize: (id) => audio.normalizeAudio(id),
    addPack: (pack, t) => void packs.addPack(pack, t),
    markBeats: (t) => void audio.markBeats(t),
    cutSilences: (ids) => void audio.cutSilences(ids),
    beatMontage: (every, fill, t) => void audio.beatMontage(every, fill, t),
    ripple,
    reframeVertical: () => void visual.reframeVertical(),
    cleanAudio: (target, strength) => void audio.cleanAudio(target, strength),
    makeThumbnail: () => void makeThumbnail(),
    syncAudio: (id) => void audio.syncAudioClip(id),
    matchColor: (id, reference) => void visual.matchColor(id, reference),
    stabilize: (target, strength) => void stabilizer.stabilize(target, strength),
    openTool: (tool) => setToolDialog(tool),
    syncCameras: () => void multicam.syncCameras(),
    autoMulticam: () => void multicam.autoMulticam(),
    compound: (from, to) => compounds.setCompoundRange({ from, to }),
    fitMusic: (id, seconds) => void audio.fitMusic(id, seconds),
    addComment: (t) => {
      let id = '';
      setProject((p) => {
        const r = addComment(p, t);
        id = r.id;
        return r.project;
      });
      setCommentsOpen({ focus: id });
    },
    openComment: (id) => setCommentsOpen({ focus: id }),
    splitScenes: (id) => void visual.splitScenes(id),
    blurFaces: (target) => void faces.findFaces(target),
    followEraser: (target, uid) => void visual.followEraser(target, uid),
    photo3d: (target, motion) => void visual.photo3d(target, motion),
    splitVoice: (target) => void audio.splitVoice(target),
    upscalePhoto: (id) => void visual.upscalePhoto(id),
    toggleComment: (id) => setProject((p) => updateComment(p, id, { done: !p.comments?.find((c) => c.id === id)?.done })),
    deleteComment: (id) => setProject((p) => removeComment(p, id)),
    openCompound: (mediaId) => compounds.enterCompound(mediaId),
    punchIn: (id) => void multicam.autoPunchIn(id),
    replaceMedia: (clipId, mediaId) => {
      const media = getMedia(project, mediaId);
      if (!media || media.kind === 'audio') return;
      setProject((p) => replaceClipMedia(p, clipId, media));
      notify(t('Cena trocada por "{name}".', { name: media.name }));
    },
  };

  const openMenu = (e: ReactMouseEvent, entries: MenuEntry[]) => {
    e.preventDefault();
    e.stopPropagation();
    if (entries.some(Boolean)) setMenu({ x: e.clientX, y: e.clientY, entries });
  };
  const closeMenu = useCallback(() => setMenu(null), []);

  // ------------------------------------------------ Textos

  /** Quanto tempo o texto (ou sticker, ou elemento) fica na tela ao ser inserido. */
  const presetDuration = (preset: TextPreset) =>
    preset.typing
      ? typingDuration(preset.sample, preset.typing.speed)
      : preset.shape === 'map'
        ? 8
        : preset.shape === 'audiowave'
          ? Math.max(3, timeline.duration - currentTime())
          : preset.shape === 'progress' ? Math.max(1, timeline.duration - currentTime()) : preset.shape === 'countdown' ? 5 : preset.id.startsWith('sticker/') || preset.shape ? 3 : 4;

  const toolsMenu = (e: ReactMouseEvent) => {
    const add = (id: string) => {
      const p = findTextPreset(id);
      if (p) addText(p);
    };
    openMenu(e, [
      { header: t('Criar') },
      { label: t('Tela dividida…'), icon: <Columns2 size={14} />, onClick: () => setExtraDialog('split') },
      (project.captions?.captions.length ?? 0) > 0 && { label: t('Imagens de apoio automáticas (pela fala)…'), icon: <Clapperboard size={14} />, onClick: () => setExtraDialog('broll') },
      { label: t('Rota animada no mapa'), icon: <MapIcon size={14} />, onClick: () => add('element/mapa') },
      { label: t('Ondas de som (barras)'), icon: <AudioLines size={14} />, onClick: () => add('element/ondas') },
      { label: t('Ondas de som (círculo)'), icon: <AudioLines size={14} />, onClick: () => add('element/ondas-circulo') },
      { label: t('Código digitando'), icon: <Code size={14} />, onClick: () => add('codigo') },
      { label: t('Terminal digitando'), icon: <Code size={14} />, onClick: () => add('terminal') },
      project.clips.length > 0 && { label: t('Gancho de abertura…'), icon: <Fish size={14} />, onClick: () => setToolDialog('hook') },
      !!project.script.trim() && (project.captions?.captions.length ?? 0) > 0 && {
        label: t('Montar pelo roteiro (melhores tentativas)…'),
        icon: <ListOrdered size={14} />,
        onClick: () => setToolDialog('script'),
      },
      project.clips.length > 0 && {
        label: t('Clipe composto a partir do cursor…'),
        icon: <Boxes size={14} />,
        onClick: () => compounds.setCompoundRange({ from: currentTime(), to: currentTime() + 5 }),
      },
      'separator',
      { header: t('Organizar') },
      {
        label: t('Comentários e tarefas ({n})…', { n: (project.comments ?? []).filter((c) => !c.done).length }),
        icon: <MessagesSquare size={14} />,
        onClick: () => setCommentsOpen({ focus: null }),
      },
      { label: t('Editor de efeitos (criar o seu)…'), icon: <Code size={14} />, onClick: () => setExtraDialog('effects') },
      { label: t('Galeria da comunidade (efeitos e pacotes)…'), icon: <Store size={14} />, onClick: () => setGallery({ kind: null }) },
      { label: t('Buscar nas mídias (o que aparece ou é falado)…'), icon: <Search size={14} />, onClick: () => setExtraDialog('search') },
      { label: t('Kit da marca…'), icon: <BadgeCheck size={14} />, onClick: () => setExtraDialog('brand') },
      { label: t('Processar vários vídeos…'), icon: <Layers size={14} />, onClick: () => setExtraDialog('batch') },
      { label: t('Levar para Premiere / DaVinci (XML, EDL)…'), icon: <ArrowRightLeft size={14} />, onClick: () => setExtraDialog('interchange') },
      { label: t('Mídias do projeto ({n})…', { n: project.media.length }), icon: <HardDrive size={14} />, onClick: () => setExtraDialog('media') },
      'separator',
      { header: t('Ajuda') },
      { label: t('Atalhos do teclado…'), icon: <Keyboard size={14} />, shortcut: shortcutLabel('shortcuts'), onClick: () => setShortcutsOpen(true) },
      { label: t('Abrir projeto de exemplo'), icon: <Sparkles size={14} />, onClick: () => void sample.openSample() },
    ]);
  };

  const addText = (preset: TextPreset) => {
    // Stickers ficam pouco tempo na tela.
    const clip = createTextClip(preset, currentTime(), presetDuration(preset));
    setProject((p) => placeTextClip(p, clip));
    setSelection({ kind: 'text', id: clip.id });
  };

  const dropTextPreset = (presetId: string, track: number, time: number) => {
    const preset = findTextPreset(presetId);
    if (!preset) return;
    const clip = createTextClip(preset, time, presetDuration(preset));
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
      const screen = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
      if (picking.startsWith('text:')) void follow.followTextPoint(picking.slice(5), screen);
      else void follow.followPoint(picking, screen);
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

  /** Abre o criador de capa com o quadro que está na tela. */
  const makeThumbnail = async () => {
    const canvas = canvasRef.current;
    if (!canvas || timeline.duration === 0) {
      notify(t('Coloque um vídeo ou uma foto na timeline primeiro.'), true);
      return;
    }
    playerRef.current?.pause();
    setThumbFrame(await createImageBitmap(canvas));
  };

  const step = (seconds: number) => {
    const player = playerRef.current;
    if (player) player.seek(player.currentTime + seconds);
  };

  useKeyboardShortcuts(
    {
      split,
      deleteSelection,
      undo: history.undo,
      redo: history.redo,
      save: files.save,
      open: files.open,
      copy,
      paste,
      duplicateSelection,
      markHere,
      jumpEdit,
      toggleVoice: voice.toggleVoice,
      trimToCursor,
      cutToCamera: multicam.cutToCamera,
      showShortcuts: () => setShortcutsOpen(true),
    },
    playerRef,
    project.fps,
    !!exporting.exportState,
  );
  const draggingFiles = useFileDrop(importFiles);

  const openImport = () => fileInputRef.current?.click();
  const empty = project.media.length === 0;
  /** Os diálogos que dão play num trecho para ouvir antes de usar. */
  const seekAndPlay = (t: number) => {
    playerRef.current?.seek(t);
    playerRef.current?.play();
  };

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
          <IconButton label={t('Novo projeto')} onClick={files.newProject}>
            <FilePlus size={16} />
          </IconButton>
          <IconButton label={t('Começar de um modelo (receita, viagem, review, top 5…)')} onClick={() => setTemplateDialog(true)}>
            <LayoutTemplate size={16} />
          </IconButton>
          <IconButton label={t('Histórico e cópias de segurança')} onClick={() => setToolDialog('history')}>
            <History size={16} />
          </IconButton>
          <IconButton label={withShortcut(t('Abrir projeto'), 'open')} onClick={() => void files.open()}>
            <FolderOpen size={16} />
          </IconButton>
          <IconButton
            label={`${withShortcut(t('Salvar projeto'), 'save')} · ${t('{shift}: salvar como', { shift: keys('Shift') })}`}
            onClick={(e) => void files.save(e.shiftKey)}
            className="relative"
          >
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
          title={t('Nome do projeto')}
          className="field-sizing-content min-w-24 max-w-72 truncate rounded-md border border-transparent bg-transparent px-2 py-1 font-medium text-fg outline-none transition-colors hover:border-line focus:border-accent"
        />
        {compounds.compoundPath.length > 0 && (
          <span className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 py-0.5 pl-3 pr-0.5 text-xs">
            <span className="text-dim">{t('Dentro de')}</span>
            <b className="max-w-48 truncate">{compounds.compoundPath.join(' › ')}</b>
            <Button variant="primary" className="h-6 rounded-full px-2.5 text-[11px]" onClick={() => void compounds.leaveCompound()}>
              {t('Voltar ao projeto')}
            </Button>
          </span>
        )}
        {isDirty && (
          <span
            className="-ml-2 flex items-center gap-1 rounded-full bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber"
            title={withShortcut(t('Há mudanças que ainda não foram salvas em arquivo'), 'save')}
          >
            <span className="size-1.5 rounded-full bg-amber" />
            {t('não salvo')}
          </span>
        )}

        <span className="flex-1" />

        <IconButton label={withShortcut(t('Atalhos do teclado (dá para mudar)'), 'shortcuts')} onClick={() => setShortcutsOpen(true)}>
          <Keyboard size={16} />
        </IconButton>

        <LanguagePicker />

        <button
          onClick={() => setProjectDialog(true)}
          title={t('Formato do projeto: tamanho, proporção, fps e fundo')}
          className="flex h-8 items-center gap-2 rounded-lg border border-line bg-panel-2 pl-1.5 pr-3 text-xs transition-colors hover:border-line-strong hover:bg-panel-3"
        >
          <AspectBox width={project.width} height={project.height} size={20} />
          <span className="font-medium">{presetName(project.width, project.height)}</span>
          <span className="font-mono text-faint">
            {project.width}×{project.height} · {aspectLabel(project.width, project.height)} · {project.fps} fps
          </span>
          <Monitor size={13} className="text-faint" />
        </button>

        <Button
          icon={<Wrench size={14} />}
          className="h-8 text-xs"
          onClick={toolsMenu}
          title={t('Tela dividida, mapa, ondas de som, kit da marca, vários vídeos de uma vez, mídias do projeto')}
        >
          {t('Ferramentas')}
        </Button>

        <IconButton label={t('Criar capa (thumbnail) com o quadro atual')} onClick={() => void makeThumbnail()}>
          <ImagePlus size={16} />
        </IconButton>

        {project.width > project.height && project.clips.length > 0 && (
          <IconButton label={t('Converter para vertical (Reels/TikTok/Shorts), com a câmera seguindo os rostos')} onClick={() => void visual.reframeVertical()}>
            <Smartphone size={16} />
          </IconButton>
        )}

        <Button
          variant="primary"
          icon={<Download size={15} />}
          disabled={timeline.duration === 0}
          onClick={() => {
            playerRef.current?.pause();
            exporting.setExportState({ status: 'setup' });
          }}
          className="px-4"
        >
          {t('Exportar')}
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
        onAddSound={(sound) => void audio.addSound(sound)}
        onRecordScreen={() => screen.setScreenDialog(true)}
        onScriptAssembly={() => setToolDialog('script')}
        time={time}
        onChange={setProject}
        onSeek={(t) => playerRef.current?.seek(t)}
        notify={notify}
        onGallery={(kind) => setGallery({ kind })}
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
        onAddPack={(pack) => void packs.addPack(pack)}
        onPackMenu={(e, pack) => openMenu(e, packMenu(editorApi, pack))}
        voice={{
          selection,
          session: voice.session,
          speaking: voice.speaking,
          onRecord: (options) => void voice.startRecording(options),
          onStop: () => void voice.stopRecording(),
          onSpeak: (text, v) => void voice.speakText(text, v),
          onSpeakCaptions: (v) => void voice.speakCaptions(v),
          onDubEnglish: () => void voice.dubInEnglish(),
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
                ? t('Clique no ponto que a câmera deve seguir')
                : selection?.kind === 'text' || selection?.kind === 'overlay'
                  ? t('Arraste para posicionar')
                  : t('Clique para tocar/pausar')
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
              <span className="text-lg font-semibold text-fg">{t('Arraste vídeos, músicas e imagens aqui')}</span>
              <span className="text-xs text-faint">{t('ou clique para escolher · MP4, MOV, WebM, MP3, WAV, JPG, PNG…')}</span>
            </button>
          )}
          {empty && sample.offer && <SampleOffer onOpen={() => void sample.openSample()} onDismiss={sample.dismiss} />}

          {scopes && !empty && <Scopes source={canvasRef} />}
          {maskEdit &&
            (() => {
              const found = findOverlayClip(project, maskEdit);
              const layout = timeline.overlays.find((l) => l.clip.id === maskEdit);
              if (!found || !layout) return null;
              return (
                <MaskDrawer
                  project={project}
                  clip={found.clip}
                  media={layout.media}
                  clipTime={Math.min(layout.length, Math.max(0, time - layout.start))}
                  canvasRef={canvasRef}
                  onChange={(mask) => setProject((p) => updateOverlayClip(p, maskEdit, (c) => ({ ...c, transform: { ...c.transform, mask } })))}
                  onDone={() => setMaskEdit(null)}
                />
              );
            })()}
          <ObjectPicker project={project} timeline={timeline} time={time} setProject={setProject} notify={notify} />

          {voice.session && (
            <Teleprompter
              session={voice.session}
              script={voice.voiceRef.current?.options.prompter ? project.script : ''}
              wordsPerMinute={voice.voiceRef.current?.options.prompterSpeed ?? 140}
              follow={voice.voiceRef.current?.options.prompterFollow ?? true}
              onStop={() => void voice.stopRecording()}
            />
          )}

          {importing > 0 && (
            <div className="absolute bottom-6 flex animate-pop-in items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-xs backdrop-blur">
              <LoaderCircle size={14} className="animate-spin text-accent" />
              {t('Importando {n} arquivo(s)…', { n: importing })}
            </div>
          )}

          {(gpu === 'lost' || gpu === 'failed') && <GpuLostOverlay failed={gpu === 'failed'} />}
        </div>

        <div className="border-t border-line bg-panel">
          <div className="px-4 pt-2">
            <Slider
              label={t('Posição')}
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
              <IconButton label={withShortcut(t('Início'), 'goStart')} onClick={() => playerRef.current?.seek(0)}>
                <SkipBack size={16} />
              </IconButton>
              <IconButton label={withShortcut(t('Quadro anterior'), 'frameBack')} onClick={() => step(-1 / project.fps)}>
                <StepBack size={16} />
              </IconButton>
              <button
                title={withShortcut(t('Tocar / pausar'), 'playPause')}
                disabled={timeline.duration === 0}
                onClick={() => playerRef.current?.toggle()}
                className="mx-1.5 flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/30 transition hover:scale-105 hover:brightness-110 disabled:opacity-40 disabled:hover:scale-100"
              >
                {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
              </button>
              <IconButton label={withShortcut(t('Próximo quadro'), 'frameForward')} onClick={() => step(1 / project.fps)}>
                <StepForward size={16} />
              </IconButton>
              <IconButton label={withShortcut(t('Fim'), 'goEnd')} onClick={() => playerRef.current?.seek(playerRef.current.duration)}>
                <SkipForward size={16} />
              </IconButton>
            </div>
            <span className="flex items-center justify-end gap-2 text-right font-mono text-xs text-faint">
              {proxyJob && <span className="truncate font-sans text-[11px] text-dim">{proxyJob}</span>}
              <button
                onClick={() => setScopes((v) => !v)}
                title={t('Gráficos de cor: histograma, forma de onda e vetorscópio do quadro atual,\npara acertar a exposição e a cor com precisão')}
                className={cx(
                  'flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-sans text-[11px] transition-colors',
                  scopes ? 'border-accent/60 bg-accent/15 text-fg' : 'border-line text-faint hover:border-line-strong hover:text-dim',
                )}
              >
                <ChartColumn size={11} />
                {t('Gráficos')}
              </button>
              <button
                onClick={() => setProxyMode((v) => !v)}
                title={t(
                  'Prévia leve: cria cópias em 540p dos vídeos pesados (4K, 1080p) só para editar.\nTocar e pular na timeline fica mais rápido; a exportação continua usando os arquivos originais.',
                )}
                className={cx(
                  'flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-sans text-[11px] transition-colors',
                  proxyMode ? 'border-accent/60 bg-accent/15 text-fg' : 'border-line text-faint hover:border-line-strong hover:text-dim',
                )}
              >
                <Feather size={11} />
                {t('Prévia leve')}
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
        onFollowFace={(id) => void follow.followFace(id)}
        onDrawMask={(id) => {
          setMaskEdit(id);
          const layout = timeline.overlays.find((l) => l.clip.id === id);
          // O cursor vai para dentro da camada, para ela aparecer enquanto desenha.
          if (layout && (time < layout.start || time >= layout.start + layout.length)) playerRef.current?.seek(layout.start + Math.min(0.5, layout.length / 2));
        }}
        onPickPoint={(id) => {
          playerRef.current?.pause();
          setPicking((p) => (p === id ? null : id));
          notify(t('Clique no ponto do vídeo que a câmera deve acompanhar.'));
        }}
        picking={picking}
        onPickTextPoint={(id) => {
          playerRef.current?.pause();
          setPicking((p) => (p === `text:${id}` ? null : `text:${id}`));
          notify(t('Clique no que o texto deve seguir (com o cursor num quadro em que aparece).'));
        }}
        onNormalize={(id) => audio.normalizeAudio(id)}
        onCleanAudio={(target, strength) => void audio.cleanAudio(target, strength)}
        notify={(text) => notify(text)}
        ripple={ripple}
        onToMain={(id) => {
          const result = demoteToMain(project, id);
          applyEdit(result && { project: result.project, selection: { kind: 'clip', id: result.id } });
        }}
      />

      {/* ------------------------------------------------ Timeline */}
      <div className="relative col-span-4 min-h-0">
        {/* Divisória: arraste para dar mais espaço à timeline ou ao vídeo. */}
        <div
          title={t('Arraste para redimensionar')}
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
          multi={multi}
          onMulti={setMulti}
          onComment={(id) => setCommentsOpen({ focus: id })}
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
          onDropPack={packs.dropPack}
          onDropSound={(soundId, track, t) => {
            const sound = getSound(soundId);
            if (sound) void audio.addSound(sound, t, track);
          }}
          onContextMenu={(e, target: TimelineTarget) => {
            // Botão direito num dos itens selecionados: menu para todos eles.
            if (multi.length > 1 && 'id' in target && multi.some((m) => m.id === target.id)) {
              openMenu(e, [
                { header: t('{n} itens selecionados', { n: multi.length }) },
                {
                  label: t('Agrupar (andam juntos)'),
                  icon: <Group size={14} />,
                  onClick: () => {
                    setProject((p) => groupItems(p, multi.filter((m) => m.kind !== 'clip').map((m) => m.id)));
                    notify(t('Agrupados: arraste qualquer um e os outros vão junto.'));
                  },
                },
                { label: t('Excluir os {n}', { n: multi.length }), icon: <Trash size={14} />, danger: true, onClick: deleteSelection },
                { label: t('Limpar a seleção'), onClick: () => setMulti([]) },
              ]);
              return;
            }
            openMenu(e, prerender.withEntries(timelineMenu(editorApi, target), target));
          }}
          onAddMarker={() => markHere()}
          recording={voice.session ? voice.session.elapsed : null}
          onToggleRecord={() => void (voice.session ? voice.stopRecording() : voice.startRecording(savedRecordOptions()))}
          ripple={ripple}
          onToggleRipple={() => {
            setRipple((r) => !r);
            notify(
              ripple
                ? t('Mover o resto junto desligado: cortes na trilha principal não mexem nas outras trilhas.')
                : t('Mover o resto junto ligado: textos, áudios e legendas acompanham os cortes da trilha principal.'),
            );
          }}
          mixerOpen={mixerOpen}
          onToggleMixer={() => setMixerOpen((o) => !o)}
        />
        {mixerOpen && <MixerPanel project={project} onEdit={setProject} playerRef={playerRef} playing={playing} onClose={() => setMixerOpen(false)} />}
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

      {files.recovery && <RecoveryBanner recovery={files.recovery} onRecover={() => void files.recover()} onDiscard={() => void files.discardRecovery()} />}

      {busy && <BusyOverlay text={busy} />}

      {draggingFiles && <DropOverlay />}

      {exporting.exportState && (
        <ExportDialog
          state={exporting.exportState}
          project={project}
          duration={timeline.duration}
          time={time}
          onStart={(settings) => exporting.startExport(settings)}
          onStartBatch={(jobs) => exporting.startBatchExport(jobs)}
          onBackground={exporting.exportInBackground}
          onSnapshot={() => {
            exporting.setExportState(null);
            void saveFrame();
          }}
          onCancel={exporting.cancelExport}
          onClose={() => exporting.setExportState(null)}
        />
      )}

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}

      {exporting.exportPill && !exporting.exportState && <ExportPill pill={exporting.exportPill} onCancel={exporting.cancelAllExports} />}
      {prerender.progress && <PrerenderPill progress={prerender.progress} onCancel={prerender.cancel} />}

      {thumbFrame && (
        <ThumbnailDialog frame={thumbFrame} vertical={project.height > project.width} notify={notify} onClose={() => setThumbFrame(null)} />
      )}
      {toolDialog === 'history' && (
        <HistoryDialog
          entries={history.entries()}
          onJump={(steps) => {
            history.jump(steps);
            setToolDialog(null);
          }}
          onRestore={async (key) => {
            if (!confirm(t('Abrir esta cópia? O projeto atual continua no histórico ({keys} volta).', { keys: keys('Ctrl+Z') }))) return;
            const restored = await loadVersion(key).catch(() => null);
            if (!restored) return notify(t('Não foi possível abrir essa cópia.'), true);
            setProject(() => restored.project);
            setSelection(null);
            setToolDialog(null);
            if (restored.missing.length)
              notify(t('Cópia aberta, mas sem {missing}. {keys} volta ao que estava antes.', { missing: missingMediaText(restored.missing), keys: keys('Ctrl+Z') }), true);
            else notify(t('Cópia aberta. {keys} volta ao que estava antes.', { keys: keys('Ctrl+Z') }));
          }}
          onClose={() => setToolDialog(null)}
        />
      )}
      {toolDialog === 'hook' && (
        <HookDialog
          project={project}
          onSeek={seekAndPlay}
          onUse={(start, end) => {
            setToolDialog(null);
            creation.applyHook(start, end);
          }}
          onClose={() => setToolDialog(null)}
        />
      )}
      {toolDialog === 'script' && (
        <ScriptAssemblyDialog
          project={project}
          onSeek={seekAndPlay}
          onApply={(kept) => {
            setToolDialog(null);
            creation.assembleFromScript(kept);
          }}
          onClose={() => setToolDialog(null)}
        />
      )}
      {faces.faceChoice && <FaceBlurDialog tracks={faces.faceChoice.tracks} onApply={faces.blurFaces} onClose={faces.closeFaceChoice} />}
      {toolDialog === 'chapters' && <ChaptersDialog project={project} notify={notify} onClose={() => setToolDialog(null)} />}
      {toolDialog === 'highlights' && (
        <HighlightsDialog
          project={project}
          onClose={() => setToolDialog(null)}
          onSeek={seekAndPlay}
          onExport={(highlights) => {
            setToolDialog(null);
            exporting.exportHighlights(highlights);
          }}
          onMark={(highlights) => {
            setProject((p) =>
              highlights.reduce((acc, h, i) => {
                const added = addMarker(acc, h.start);
                return { ...added.project, markers: added.project.markers.map((m) => (m.id === added.id ? { ...m, label: t('Destaque {n}', { n: i + 1 }) } : m)) };
              }, p),
            );
            setToolDialog(null);
            notify(t('Destaques marcados na régua.'));
          }}
        />
      )}
      {commentsOpen && (
        <CommentsDialog
          project={project}
          time={time}
          focus={commentsOpen.focus}
          onChange={setProject}
          onSeek={(t) => playerRef.current?.seek(t)}
          onClose={() => setCommentsOpen(null)}
        />
      )}
      {extraDialog === 'split' && (
        <SplitScreenDialog
          project={project}
          time={time}
          onImport={creation.importOne}
          onApply={(choice) => {
            setExtraDialog(null);
            void creation.applySplit(choice);
          }}
          onClose={() => setExtraDialog(null)}
        />
      )}
      {extraDialog === 'brand' && (
        <BrandKitDialog
          onApply={(kit, options) => {
            setExtraDialog(null);
            void creation.applyBrandKit(kit, options);
          }}
          onClose={() => setExtraDialog(null)}
        />
      )}
      {extraDialog === 'batch' && <BatchDialog notify={notify} onClose={() => setExtraDialog(null)} />}
      {extraDialog === 'search' && <MediaSearchDialog project={project} notify={notify} onInsert={visual.insertHit} onClose={() => setExtraDialog(null)} />}
      {extraDialog === 'broll' && (
        <BrollDialog
          project={project}
          onApply={(picks) => {
            setExtraDialog(null);
            creation.applyBroll(picks);
          }}
          onClose={() => setExtraDialog(null)}
        />
      )}
      {extraDialog === 'effects' && <EffectEditor notify={notify} onClose={() => setExtraDialog(null)} />}
      {gallery && <GalleryDialog initialKind={gallery.kind} notify={notify} onClose={() => setGallery(null)} />}
      {extraDialog === 'interchange' && (
        <InterchangeDialog project={project} notify={notify} onImport={(next) => setProject(() => next)} onClose={() => setExtraDialog(null)} />
      )}
      {extraDialog === 'media' && (
        <MediaManagerDialog
          project={project}
          onRemove={(ids) => {
            setProject((p) => ids.reduce((acc, id) => removeMedia(acc, id), p));
            notify(t('{n} mídia(s) tirada(s) do projeto.', { n: ids.length }));
          }}
          onMerge={() => {
            let removed = 0;
            setProject((p) => {
              const result = mergeDuplicates(p);
              removed = result.removed;
              return result.project;
            });
            notify(t('{n} mídia(s) repetida(s) juntada(s).', { n: removed }));
          }}
          onReplace={creation.replaceMediaWithFile}
          onClose={() => setExtraDialog(null)}
        />
      )}
      {compounds.compoundRange && (
        <CompoundDialog
          project={project}
          from={compounds.compoundRange.from}
          to={compounds.compoundRange.to}
          onCreate={(from, to) => void compounds.createCompound(from, to)}
          onClose={() => compounds.setCompoundRange(null)}
        />
      )}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
      {templateDialog && (
        <TemplateDialog
          onPick={(t) => {
            setTemplateDialog(false);
            void files.startTemplate(t);
          }}
          onClose={() => setTemplateDialog(false)}
        />
      )}
      {screen.screenDialog && (
        <ScreenRecordDialog hasScript={!!project.script.trim()} onStart={(options) => void screen.startScreenRecording(options)} onClose={() => screen.setScreenDialog(false)} />
      )}
      <ScreenRecordingBar screen={screen} script={project.script} />

      {projectDialog && (
        <ProjectDialog
          project={project}
          onApply={(patch) => setProject((p) => ({ ...p, ...patch }))}
          onClose={() => setProjectDialog(false)}
        />
      )}

      {desktopUpdate.update && (
        <UpdateBanner update={desktopUpdate.update} onInstall={() => void desktopUpdate.installUpdate()} onDismiss={desktopUpdate.dismissUpdate} />
      )}

      <Toasts toasts={toasts} />

      {gpu === 'unsupported' && <NoWebGL2Screen />}
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
