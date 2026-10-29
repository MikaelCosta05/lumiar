import { useRef, useState } from 'react';
import { t } from '../i18n';
import { exportProject } from '../media/exporter';
import { analyzeMedia, importMedia } from '../media/importer';
import { compoundSource, extractRange, openCompound, replaceWithCompound, updateCompound } from '../project/compound';
import { addMedia, getMedia, type MediaItem, type Project } from '../project/model';
import type { EditorContext } from './context';

export type Compounds = ReturnType<typeof useCompounds>;

/** Clipe composto: criar a partir de um trecho, entrar para editar por dentro e voltar. */
export function useCompounds({ history, setProject, setSelection, notify, setBusy, playerRef }: EditorContext) {
  /** Compostos abertos (do mais de fora para o mais de dentro): o projeto de fora fica guardado aqui. */
  const compoundStack = useRef<{ parent: Project; mediaId: string; original: Project; name: string }[]>([]);
  const [compoundPath, setCompoundPath] = useState<string[]>([]);
  const [compoundRange, setCompoundRange] = useState<{ from: number; to: number } | null>(null);
  /** O projeto inteiro, com o que está sendo editado dentro dos compostos já guardado neles. */
  const withOpenCompounds = (p: Project) => compoundStack.current.reduceRight((inner, level) => updateCompound(level.parent, level.mediaId, inner, null), p);

  const renderCompound = async (sub: Project, name: string): Promise<MediaItem> => {
    const blob = await exportProject(
      sub,
      { format: 'mp4', height: null, fps: null, quality: 'very-high', range: null },
      { onProgress: (pr) => setBusy(t('Montando o clipe composto… {n}%', { n: Math.round(pr.fraction * 100) })) },
    );
    const media = await importMedia(new File([blob], `${name}.mp4`, { type: 'video/mp4' }));
    void analyzeMedia(media);
    return media;
  };

  const createCompound = async (from: number, to: number) => {
    setCompoundRange(null);
    playerRef.current?.pause();
    const p = history.current();
    const extracted = extractRange(p, from, to);
    if (!extracted) {
      notify(t('Escolha um trecho com vídeo na trilha principal.'), true);
      return;
    }
    try {
      setBusy(t('Montando o clipe composto…'));
      const name = t('Clipe composto {n}', { n: p.media.filter((m) => m.compound).length + 1 });
      const rendered = await renderCompound(extracted.sub, name);
      const media: MediaItem = { ...rendered, name, compound: compoundSource(extracted.sub) };
      const result = replaceWithCompound(addMedia(history.current(), [media]), extracted, media);
      setProject(() => result.project);
      setSelection({ kind: 'clip', id: result.clipId });
      notify(t('"{name}" criado. Ponha efeitos ou filtro nele como num clipe comum; para mexer por dentro, clique direito → Abrir o clipe composto.', { name }));
    } catch (error) {
      notify(t('Não foi possível montar o clipe composto: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  const enterCompound = (mediaId: string) => {
    const p = history.current();
    const media = getMedia(p, mediaId);
    const sub = media && openCompound(p, media);
    if (!media || !sub) return;
    playerRef.current?.pause();
    compoundStack.current.push({ parent: p, mediaId, original: sub, name: media.name });
    setCompoundPath(compoundStack.current.map((l) => l.name));
    history.reset(sub);
    setSelection(null);
    playerRef.current?.seek(0);
    notify(t('Editando "{name}" por dentro. Quando terminar, clique em "Voltar ao projeto" no topo.', { name: media.name }));
  };

  const leaveCompound = async () => {
    const top = compoundStack.current[compoundStack.current.length - 1];
    if (!top) return;
    playerRef.current?.pause();
    const sub = history.current();
    let parent = top.parent;
    if (sub !== top.original) {
      try {
        setBusy(t('Montando o clipe composto…'));
        parent = updateCompound(parent, top.mediaId, sub, await renderCompound(sub, top.name));
      } catch (error) {
        notify(t('Não foi possível montar o clipe composto: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
        return;
      } finally {
        setBusy(null);
      }
    }
    compoundStack.current.pop();
    setCompoundPath(compoundStack.current.map((l) => l.name));
    history.reset(parent);
    setSelection(null);
    notify(sub !== top.original ? t('"{name}" atualizado.', { name: top.name }) : t('De volta ao projeto.'));
  };

  /** Abrir, criar ou recuperar outro projeto fecha os compostos abertos. */
  const forgetCompounds = () => {
    compoundStack.current = [];
    setCompoundPath([]);
  };

  /** Editando por dentro de um composto (salvar só vale do projeto de fora). */
  const insideCompound = () => compoundStack.current.length > 0;

  return { compoundPath, compoundRange, setCompoundRange, withOpenCompounds, createCompound, enterCompound, leaveCompound, forgetCompounds, insideCompound };
}
