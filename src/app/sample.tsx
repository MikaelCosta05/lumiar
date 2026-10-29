import { Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { analyzeMedia, importMedia } from '../media/importer';
import type { MediaItem, Project } from '../project/model';
import { buildSampleProject, loadSampleFiles, markSampleOffered, sampleOffered, SAMPLE_FILES, type SampleKey } from '../project/sampleProject';
import { hasContent } from '../project/storage';
import type { EditorContext } from './context';
import { shortcutLabel } from './shortcuts';

/**
 * Projeto de exemplo: o convite na primeira vez que o editor abre vazio (sem nada para recuperar)
 * e a função que monta e abre o projeto (também pelo menu Ferramentas).
 */
export function useSampleProject(
  { project, notify, setBusy }: Pick<EditorContext, 'project' | 'notify' | 'setBusy'>,
  files: { isDirty: boolean; recovery: unknown; recoveryChecked: boolean; openBuilt: (project: Project) => void },
) {
  const [pending, setPending] = useState(() => !sampleOffered());

  // Começou a editar (importou, recuperou, abriu um arquivo): o convite não volta mais.
  useEffect(() => {
    if (pending && hasContent(project)) {
      markSampleOffered();
      setPending(false);
    }
  }, [pending, project]);

  const dismiss = () => {
    markSampleOffered();
    setPending(false);
  };

  const openSample = async () => {
    if (files.isDirty && !confirm(t('Abrir o projeto de exemplo? O que não foi salvo neste será perdido.'))) return;
    dismiss();
    try {
      setBusy(t('Montando o projeto de exemplo…'));
      const loaded = await loadSampleFiles();
      const media = {} as Record<SampleKey, MediaItem>;
      for (const { key } of SAMPLE_FILES) media[key] = await importMedia(loaded[key]);
      files.openBuilt(buildSampleProject(media, shortcutLabel));
      Object.values(media).forEach((m) => void analyzeMedia(m));
      notify(t('Projeto de exemplo aberto. Os balões na régua da timeline têm dicas: clique num deles.'));
    } catch (error) {
      notify(t('Não foi possível abrir o projeto de exemplo: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** Mostra o convite: primeira vez, editor vazio e nada esperando para ser recuperado. */
  const offer = pending && files.recoveryChecked && !files.recovery && !hasContent(project);
  return { offer, openSample, dismiss };
}

/** O convite no editor vazio, embaixo da área de arrastar as mídias. */
export function SampleOffer({ onOpen, onDismiss }: { onOpen: () => void; onDismiss: () => void }) {
  return (
    <div className="absolute bottom-14 left-1/2 z-10 flex -translate-x-1/2 animate-pop-in items-center gap-1 rounded-full border border-line-strong bg-panel/95 p-1 pl-1 shadow-xl backdrop-blur">
      <button
        onClick={onOpen}
        title={t('Um vídeo curto já montado, com filtros, transições, um pacote e dicas nos comentários')}
        className="flex h-8 items-center gap-1.5 rounded-full bg-gradient-to-r from-accent to-accent-2 px-3.5 text-xs font-semibold text-white shadow-lg shadow-accent/20 transition hover:brightness-110"
      >
        <Sparkles size={14} />
        {t('Abrir projeto de exemplo')}
      </button>
      <button
        onClick={onDismiss}
        title={t('Agora não (fica em Ferramentas)')}
        aria-label={t('Agora não (fica em Ferramentas)')}
        className="flex size-7 items-center justify-center rounded-full text-faint transition-colors hover:bg-panel-3 hover:text-fg"
      >
        <X size={13} />
      </button>
    </div>
  );
}
