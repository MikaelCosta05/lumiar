import { lazy, Suspense, type ComponentType } from 'react';

/**
 * Janela que só aparece quando pedida: o código dela fica num arquivo à parte, baixado na primeira
 * vez que abre (o editor abre mais rápido). Cada uma tem o próprio Suspense: enquanto carrega,
 * só ela não aparece, sem esconder o resto da tela.
 */
function lazyDialog<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  const Lazy = lazy(async () => ({ default: await load() })) as unknown as ComponentType<P>;
  return function LazyDialog(props: P) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}

// Não entram aqui os módulos que o App também importa direto por outras funções (o import direto
// prenderia o arquivo no pacote principal): CommentsDialog (addComment…), ExportDialog (download),
// ProjectDialog (AspectBox), FloatingPrompter (openPrompterWindow) e o Teleprompter (usado por ele).
export const ThumbnailDialog = lazyDialog(() => import('../ui/ThumbnailDialog').then((m) => m.ThumbnailDialog));
export const HistoryDialog = lazyDialog(() => import('../ui/HistoryDialog').then((m) => m.HistoryDialog));
export const HookDialog = lazyDialog(() => import('../ui/ShortsTools').then((m) => m.HookDialog));
export const ChaptersDialog = lazyDialog(() => import('../ui/ShortsTools').then((m) => m.ChaptersDialog));
export const HighlightsDialog = lazyDialog(() => import('../ui/ShortsTools').then((m) => m.HighlightsDialog));
export const ScriptAssemblyDialog = lazyDialog(() => import('../ui/ScriptAssembly').then((m) => m.ScriptAssemblyDialog));
export const FaceBlurDialog = lazyDialog(() => import('../ui/FaceBlurDialog').then((m) => m.FaceBlurDialog));
export const SplitScreenDialog = lazyDialog(() => import('../ui/SplitScreenDialog').then((m) => m.SplitScreenDialog));
export const BrandKitDialog = lazyDialog(() => import('../ui/BrandKitDialog').then((m) => m.BrandKitDialog));
export const BatchDialog = lazyDialog(() => import('../ui/BatchDialog').then((m) => m.BatchDialog));
export const MediaSearchDialog = lazyDialog(() => import('../ui/MediaSearch').then((m) => m.MediaSearchDialog));
export const BrollDialog = lazyDialog(() => import('../ui/BrollDialog').then((m) => m.BrollDialog));
export const EffectEditor = lazyDialog(() => import('../ui/EffectEditor').then((m) => m.EffectEditor));
export const InterchangeDialog = lazyDialog(() => import('../ui/InterchangeDialog').then((m) => m.InterchangeDialog));
export const MediaManagerDialog = lazyDialog(() => import('../ui/MediaManagerDialog').then((m) => m.MediaManagerDialog));
export const CompoundDialog = lazyDialog(() => import('../ui/CompoundDialog').then((m) => m.CompoundDialog));
export const TemplateDialog = lazyDialog(() => import('../ui/TemplateDialog').then((m) => m.TemplateDialog));
export const ScreenRecordDialog = lazyDialog(() => import('../ui/ScreenRecordDialog').then((m) => m.ScreenRecordDialog));
export const ShortcutsDialog = lazyDialog(() => import('../ui/ShortcutsDialog').then((m) => m.ShortcutsDialog));
export const GalleryDialog = lazyDialog(() => import('../ui/GalleryDialog').then((m) => m.GalleryDialog));
// Também só aparecem quando pedidos: os gráficos de cor e o desenho da máscara por cima do vídeo.
export const Scopes = lazyDialog(() => import('../ui/Scopes').then((m) => m.Scopes));
export const MaskDrawer = lazyDialog(() => import('../ui/MaskDrawer').then((m) => m.MaskDrawer));
