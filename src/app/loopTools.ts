import { t } from '../i18n';
import { analyzeMedia, importMedia } from '../media/importer';
import { reverseMedia } from '../media/reverse';
import { getMedia } from '../project/model';
import { makeBoomerang, makeSeamlessLoop } from '../project/loops';
import type { EditorContext } from './context';

/** Loop perfeito (o fim emenda no começo) e boomerang (vai e volta) de um clipe da trilha principal. */
export function loopTools({ history, setProject, setSelection, notify, setBusy }: EditorContext) {
  const seamlessLoop = (clipId: string) => {
    const result = makeSeamlessLoop(history.current(), clipId);
    if (!result) {
      notify(t('O loop perfeito precisa de um vídeo com pelo menos 0,3 s.'), true);
      return;
    }
    setProject(() => result.project);
    setSelection({ kind: 'clip', id: result.clipId });
    notify(
      t('Loop perfeito: o começo do clipe aparece aos poucos por cima do fim ({n} s), então o fim emenda no começo sem pulo. Exporte em GIF ou repita o clipe para ver.', {
        n: result.fade.toFixed(1),
      }),
    );
  };

  /** Cria a cópia invertida (como em "Inverter") e coloca logo depois do clipe. */
  const boomerang = async (clipId: string) => {
    const project = history.current();
    const clip = project.clips.find((c) => c.id === clipId);
    const media = clip && getMedia(project, clip.mediaId);
    if (!clip || !media || media.kind !== 'video') return;
    try {
      setBusy(t('Criando o boomerang… {n}%', { n: 0 }));
      const file = await reverseMedia(media, clip.trimIn, clip.trimOut, (f) => setBusy(t('Criando o boomerang… {n}%', { n: Math.round(f * 100) })));
      const reversed = await importMedia(file);
      void analyzeMedia(reversed);
      let id: string | null = null;
      setProject((p) => {
        const result = makeBoomerang(p, clipId, reversed);
        id = result?.id ?? null;
        return result?.project ?? p;
      });
      if (id) setSelection({ kind: 'clip', id });
      notify(t('Boomerang pronto: o clipe vai e logo depois volta de trás para frente.'));
    } catch (error) {
      notify(t('Não foi possível criar o boomerang: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  return { seamlessLoop, boomerang };
}
