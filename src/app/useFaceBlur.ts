import { useState } from 'react';
import { t } from '../i18n';
import { trackAllFaces, type FaceTrack } from '../media/tracking';
import { faceBlurEffects } from '../project/faceBlur';
import { layoutProject, updateClip, updateOverlayClip, type VideoClip } from '../project/model';
import type { FaceBlurChoice } from '../ui/FaceBlurDialog';
import type { EditorContext } from './context';

/** Desfocar rostos: acha os rostos do clipe e espera a escolha de quais desfocar. */
export function useFaceBlur({ history, setProject, notify, setBusy }: EditorContext) {
  /** Rostos encontrados num clipe, esperando a escolha de quais desfocar */
  const [faceChoice, setFaceChoice] = useState<{ target: { kind: 'clip' | 'overlay'; id: string }; tracks: FaceTrack[] } | null>(null);

  /** Acha os rostos do clipe e abre a escolha de quais desfocar. */
  const findFaces = async (target: { kind: 'clip' | 'overlay'; id: string }) => {
    const p = history.current();
    const tl = layoutProject(p);
    const layout = target.kind === 'clip' ? tl.clips.find((l) => l.clip.id === target.id) : tl.overlays.find((l) => l.clip.id === target.id);
    if (!layout) return;
    try {
      setBusy(t('Procurando rostos…'));
      const tracks = await trackAllFaces(layout.media, layout.clip.trimIn, layout.clip.trimOut, (f) => setBusy(t('Procurando rostos… {n}%', { n: Math.round(f * 100) })));
      if (!tracks.length) notify(t('Não achei rostos nesse clipe.'), true);
      else setFaceChoice({ target, tracks });
    } catch (error) {
      notify(t('Não foi possível analisar o vídeo: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  const blurFaces = (choice: FaceBlurChoice) => {
    const pending = faceChoice;
    setFaceChoice(null);
    if (!pending) return;
    const { target } = pending;
    const add = <T extends VideoClip>(c: T): T => ({ ...c, effects: [...c.effects, ...faceBlurEffects(choice.tracks, c, choice)] });
    setProject((p) => (target.kind === 'clip' ? updateClip(p, target.id, add) : updateOverlayClip(p, target.id, add)));
    notify(t('{n} rosto(s) desfocado(s). Cada um é um efeito "Desfocar área" no clipe, que dá para ajustar.', { n: choice.tracks.length }));
  };

  return { faceChoice, findFaces, blurFaces, closeFaceChoice: () => setFaceChoice(null) };
}
