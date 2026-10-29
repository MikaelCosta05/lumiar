import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { keys } from '../i18n/keys';
import { importMedia } from '../media/importer';
import { createProject, layoutProject, type MediaItem, type Project } from '../project/model';
import {
  autosave,
  type AutosaveFound,
  clearAutosave,
  hasContent,
  loadAutosave,
  openProjectFile,
  pickProjectFile,
  saveProject,
  saveVersion,
} from '../project/storage';
import { buildTemplateProject, placeholderImage, type ProjectTemplate } from '../project/templates';
import { formatTime } from '../ui/format';
import type { EditorContext } from './context';
import type { Compounds } from './useCompounds';

/**
 * Salvar e abrir o arquivo do projeto, recuperar o salvamento automático, as cópias de segurança
 * e o aviso de alterações não salvas.
 */
export function useProjectFiles(ctx: EditorContext, compounds: Compounds, clearMulti: () => void) {
  const { history, project, notify, setBusy, playerRef, setSelection } = ctx;
  const { withOpenCompounds, forgetCompounds } = compounds;
  /** Projeto encontrado no salvamento automático, esperando o usuário decidir. */
  const [recovery, setRecovery] = useState<AutosaveFound | null>(null);
  /** Já procurou no salvamento automático (antes disso não dá para saber se é a primeira vez). */
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const fileHandle = useRef<FileSystemFileHandle | null>(null);
  const savedProject = useRef<Project | null>(null);
  /** O salvamento automático só começa depois de decidir sobre a recuperação. */
  const autosaveReady = useRef(false);
  const isDirty = hasContent(project) && project !== savedProject.current;

  // Ao abrir o editor, procura um projeto não salvo no salvamento automático.
  useEffect(() => {
    loadAutosave()
      .then((found) => {
        if (found) setRecovery(found);
        else autosaveReady.current = true;
      })
      .catch(() => {
        autosaveReady.current = true;
      })
      .finally(() => setRecoveryChecked(true));
  }, []);

  // O salvamento automático avisa uma vez quando para de funcionar (e de novo se voltar e parar outra vez).
  const autosaveFailed = useRef(false);
  const autosaveWorked = () => {
    autosaveFailed.current = false;
  };
  const autosaveFailedWith = (what: string, error: unknown) => {
    console.warn(`[Lumiar] ${what} falhou`, error);
    if (autosaveFailed.current) return;
    autosaveFailed.current = true;
    const full = error instanceof DOMException && error.name === 'QuotaExceededError';
    notify(
      full
        ? t('O salvamento automático não está funcionando (falta espaço no disco). Salve o projeto com {keys} para não perder o trabalho.', { keys: keys('Ctrl+S') })
        : t('O salvamento automático não está funcionando. Salve o projeto com {keys} para não perder o trabalho.', { keys: keys('Ctrl+S') }),
      true,
    );
  };

  // Salvamento automático no navegador, um pouco depois de cada mudança.
  useEffect(() => {
    if (!autosaveReady.current) return;
    const timer = setTimeout(() => {
      const whole = withOpenCompounds(project);
      const save = hasContent(whole) ? autosave(whole) : clearAutosave();
      save.then(autosaveWorked, (error) => autosaveFailedWith('salvamento automático', error));
    }, 1500);
    return () => clearTimeout(timer);
  }, [project]);

  // Cópia de segurança a cada 5 minutos, se o projeto mudou desde a última.
  const lastVersion = useRef<Project | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  useEffect(() => {
    const timer = setInterval(() => {
      const current = projectRef.current;
      if (!autosaveReady.current || !hasContent(current) || current === lastVersion.current) return;
      lastVersion.current = current;
      const p = withOpenCompounds(current);
      const tl = layoutProject(p);
      const summary = t('{n} clipe(s) · {duration}', { n: p.clips.length, duration: formatTime(tl.duration).replace(/\.\d+$/, '') });
      saveVersion(p, summary).catch((error) => autosaveFailedWith('cópia de segurança', error));
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Aviso do navegador ao fechar com alterações não salvas em arquivo.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  /** Novo projeto a partir de um modelo (cenas com espaços para trocar pelos vídeos). */
  const startTemplate = async (template: ProjectTemplate) => {
    if (isDirty && !confirm(t('Começar um projeto novo a partir do modelo? O que não foi salvo será perdido.'))) return;
    playerRef.current?.pause();
    try {
      setBusy(t('Montando o modelo…'));
      const slots: MediaItem[] = [];
      for (let i = 0; i < template.slots.length; i++) slots.push(await importMedia(await placeholderImage(template, i)));
      forgetCompounds();
      history.reset(buildTemplateProject(template, slots));
      fileHandle.current = null;
      savedProject.current = null;
      setSelection(null);
      playerRef.current?.seek(0);
      notify(t('Modelo "{name}" pronto. Clique direito em cada cena numerada → Trocar a mídia.', { name: t(template.name) }));
    } catch (error) {
      notify(t('Não foi possível montar o modelo: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  const newProject = () => {
    if (isDirty && !confirm(t('Começar um projeto novo? O que não foi salvo será perdido.'))) return;
    playerRef.current?.pause();
    forgetCompounds();
    clearMulti();
    history.reset(createProject());
    fileHandle.current = null;
    savedProject.current = null;
    setSelection(null);
    playerRef.current?.seek(0);
  };

  /** Troca por um projeto já montado (o de exemplo), sem marcar como "não salvo" (fechar não pergunta nada). */
  const openBuilt = (built: Project) => {
    playerRef.current?.pause();
    forgetCompounds();
    clearMulti();
    history.reset(built);
    fileHandle.current = null;
    savedProject.current = built;
    setSelection(null);
    playerRef.current?.seek(0);
  };

  const save = async (saveAs = false) => {
    if (compounds.insideCompound()) {
      notify(t('Você está dentro de um clipe composto. Clique em "Voltar ao projeto" no topo e salve de lá.'), true);
      return;
    }
    try {
      setBusy(t('Salvando projeto…'));
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
      notify(result.handle ? t('Projeto salvo em "{name}".', { name: result.handle.name }) : t('Projeto salvo.'));
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') notify(t('Não foi possível salvar: {error}', { error: String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  const open = async () => {
    if (isDirty && !confirm(t('Abrir outro projeto? O que não foi salvo neste será perdido.'))) return;
    try {
      const picked = await pickProjectFile();
      if (!picked) return;
      setBusy(t('Abrindo projeto…'));
      const opened = await openProjectFile(picked.file);
      playerRef.current?.pause();
      forgetCompounds();
      history.reset(opened);
      fileHandle.current = picked.handle;
      savedProject.current = opened;
      setSelection(null);
      playerRef.current?.seek(0);
      notify(t('"{name}" aberto.', { name: opened.name }));
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
    try {
      setBusy(t('Recuperando o projeto…'));
      const { project: recovered, missing } = await pending.load();
      forgetCompounds();
      history.reset(recovered);
      autosaveReady.current = true;
      notify(missing.length ? t('Projeto recuperado, mas sem {missing}.', { missing: missingMediaText(missing) }) : t('Projeto recuperado.'), missing.length > 0);
    } catch (error) {
      // O que foi guardado continua lá: o aviso volta para tentar de novo ou descartar.
      setRecovery(pending);
      notify(t('Não foi possível recuperar o projeto: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  const discardRecovery = async () => {
    setRecovery(null);
    autosaveReady.current = true;
    await clearAutosave().catch(() => {});
  };

  return { isDirty, recovery, recoveryChecked, startTemplate, newProject, openBuilt, save, open, recover, discardRecovery };
}

/** "o arquivo "a.mp4"" ou "3 arquivos (a.mp4, b.mp4…)": mídias que não deu para recuperar. */
export function missingMediaText(names: string[]): string {
  if (names.length === 1) return t('o arquivo "{name}" (foi apagado, movido ou trocado)', { name: names[0] });
  const shown = names.slice(0, 3).join(', ');
  return t('{n} arquivos ({names}), que foram apagados, movidos ou trocados', { n: names.length, names: `${shown}${names.length > 3 ? '…' : ''}` });
}
