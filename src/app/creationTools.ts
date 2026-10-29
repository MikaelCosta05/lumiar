import { analyzeMedia, importMedia, mediaKindOf } from '../media/importer';
import { applyBrand, shiftAfter, type BrandKit, type BrandOptions } from '../project/brand';
import { extractRange } from '../project/compound';
import { replaceMediaFile } from '../project/mediaUsage';
import { addMedia, addVideoTrack, createOverlayClip, createTransition, insertVideoClips, layoutProject, type MediaItem, uid } from '../project/model';
import { removeTimeRanges } from '../project/ripple';
import { removedRanges } from '../project/scriptAlign';
import { applySplitScreen, solidImage } from '../project/splitScreen';
import type { BrollPick } from '../ui/BrollDialog';
import type { SplitChoice } from '../ui/SplitScreenDialog';
import { t } from '../i18n';
import type { EditorContext } from './context';

/**
 * Ferramentas que montam coisas no projeto: gancho de abertura, montagem pelo roteiro, imagens de
 * apoio, tela dividida, kit da marca e troca do arquivo de uma mídia. Quem chama fecha a janela antes.
 */
export function creationTools({ history, setProject, setSelection, notify, setBusy, playerRef, currentTime }: EditorContext) {
  /** Copia o trecho [start, end] para o começo do vídeo, como prévia, com um flash na emenda. */
  const applyHook = (start: number, end: number) => {
    const extracted = extractRange(history.current(), start, end);
    if (!extracted) {
      notify(t('Esse trecho não tem vídeo na trilha principal.'), true);
      return;
    }
    const copies = extracted.sub.clips.map((c) => ({ ...c, id: uid() }));
    setProject((q) => {
      const before = layoutProject(q).videoDuration;
      let next = insertVideoClips(q, copies, 0);
      const transitions = [...next.transitions];
      extracted.sub.transitions.forEach((tr, i) => (transitions[i] = tr));
      transitions[copies.length - 1] = createTransition('transitions/flash', 0.4);
      next = { ...next, transitions };
      return shiftAfter(next, 0, layoutProject(next).videoDuration - before);
    });
    playerRef.current?.seek(0);
    notify(t('Gancho de {seconds}s no começo, com um flash antes do vídeo começar de verdade. Ouça e ajuste se quiser.', { seconds: (end - start).toFixed(0) }));
  };

  /** Fica só com as tentativas escolhidas do roteiro; o resto sai e tudo anda junto. */
  const assembleFromScript = (kept: [number, number][]) => {
    let removed = 0;
    setProject((p) => {
      const result = removeTimeRanges(p, removedRanges(kept, layoutProject(p).videoDuration), true);
      removed = result.removed;
      return result.project;
    });
    notify(t('Vídeo montado pelo roteiro: {n} frases, {seconds}s de erros e repetições a menos.', { n: kept.length, seconds: removed.toFixed(1) }));
  };

  /** Imagens de apoio: cada trecho escolhido entra numa trilha "Imagens de apoio", em tela cheia e mudo. */
  const applyBroll = (picks: BrollPick[]) => {
    setProject((p) => {
      let next = addVideoTrack(p);
      const index = next.videoTracks.length - 1;
      const clips = picks.map((pick) => {
        const fill = pick.media.width / pick.media.height < next.width / next.height ? next.width / next.height / (pick.media.width / pick.media.height) : (pick.media.width / pick.media.height) / (next.width / next.height);
        return {
          ...createOverlayClip(pick.media, pick.start, { x: 0.5, y: 0.5, scale: Math.max(1, fill), radius: 0 }),
          trimIn: pick.media.kind === 'image' ? 0 : pick.time,
          trimOut: pick.media.kind === 'image' ? pick.length : Math.min(pick.media.duration, pick.time + pick.length),
          volume: 0,
          fadeIn: 0.15,
          fadeOut: 0.15,
        };
      });
      next = { ...next, videoTracks: next.videoTracks.map((tr, i) => (i === index ? { ...tr, name: t('Imagens de apoio'), clips } : tr)) };
      return next;
    });
    notify(t('{n} imagem(ns) de apoio na trilha "Imagens de apoio". Mova, troque ou apague à vontade.', { n: picks.length }));
  };

  const importOne = async (file: File): Promise<MediaItem | null> => {
    if (!mediaKindOf(file)) {
      notify(t('"{name}" não é um vídeo, áudio ou imagem.', { name: file.name }), true);
      return null;
    }
    const media = await importMedia(file);
    void analyzeMedia(media);
    setProject((p) => addMedia(p, [media]));
    return media;
  };

  const applySplit = async (choice: SplitChoice) => {
    try {
      const background = choice.gap > 0 ? await importMedia(await solidImage(choice.color, 'Fundo da tela dividida.png')) : null;
      const start = currentTime();
      let ids: string[] = [];
      setProject((p) => {
        const result = applySplitScreen(background ? addMedia(p, [background]) : p, choice.layout, choice.media, { start, duration: choice.duration, gap: choice.gap, background });
        ids = result.ids;
        return result.project;
      });
      notify(
        t('Tela dividida montada ({n} quadros). Cada quadro é uma camada: clique nele para ajustar o enquadramento.', { n: choice.media.filter(Boolean).length }),
      );
      if (ids.length) setSelection({ kind: 'overlay', id: ids[ids.length - 1] });
    } catch (error) {
      notify(t('Não foi possível montar a tela dividida: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    }
  };

  const applyBrandKit = async (kit: BrandKit, options: BrandOptions) => {
    try {
      setBusy(t('Aplicando a marca…'));
      const load = async (file: File | null, wanted: boolean) => {
        if (!file || !wanted) return null;
        const media = await importMedia(file);
        void analyzeMedia(media);
        return media;
      };
      const media = { logo: await load(kit.logo, options.logo), intro: await load(kit.intro, options.intro), outro: await load(kit.outro, options.outro) };
      setProject((p) => applyBrand(p, kit, media, options));
      const done = [
        media.logo && t('logo'),
        media.intro && t('abertura'),
        media.outro && t('encerramento'),
        options.texts && t('textos'),
        options.captions && t('legendas'),
      ].filter(Boolean);
      notify(t('Marca "{name}" aplicada: {items}.', { name: kit.name, items: done.join(', ') }));
    } catch (error) {
      notify(t('Não foi possível aplicar a marca: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  const replaceMediaWithFile = (old: MediaItem) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = old.kind === 'audio' ? 'audio/*,video/*' : old.kind === 'image' ? 'image/*' : 'video/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        setBusy(t('Trocando o arquivo…'));
        const media = await importMedia(file);
        void analyzeMedia(media);
        setProject((p) => replaceMediaFile(p, old.id, media));
        notify(
          media.duration + 0.05 < old.duration && old.kind !== 'image'
            ? t('"{old}" trocado por "{name}". O arquivo novo é mais curto: os clipes que passavam do fim foram encurtados.', { old: old.name, name: media.name })
            : t('"{old}" trocado por "{name}" em todos os clipes.', { old: old.name, name: media.name }),
        );
      } catch (error) {
        notify(t('Não foi possível abrir "{name}": {error}', { name: file.name, error: error instanceof Error ? error.message : String(error) }), true);
      } finally {
        setBusy(null);
      }
    };
    input.click();
  };

  return { applyHook, assembleFromScript, applyBroll, importOne, applySplit, applyBrandKit, replaceMediaWithFile };
}
