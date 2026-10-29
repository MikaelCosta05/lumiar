import { locale, t } from '../i18n';
import { analyzeCameraMotion, type CameraMotion } from '../media/stabilize';
import { createCamera } from '../project/camera';
import { findOverlayClip, updateClip, updateOverlayClip, type VideoClip } from '../project/model';
import { buildStabilization, type StabilizeStrength } from '../project/stabilize';
import type { EditorContext } from './context';

export type StabilizeTarget = { kind: 'clip' | 'overlay'; id: string };

/**
 * Análises já feitas nesta sessão (mídia + trecho): trocar a força não precisa ler o vídeo de novo.
 * Só o resultado final vai para o projeto.
 */
const analyses = new Map<string, CameraMotion>();
const MAX_CACHED = 8;

/** Estabilizar vídeo tremido (clipe da trilha principal ou sobreposto). */
export function stabilizeTools({ project, timeline, setProject, notify, setBusy }: EditorContext) {
  const find = (target: StabilizeTarget) => {
    if (target.kind === 'clip') {
      const layout = timeline.clips.find((l) => l.clip.id === target.id);
      return layout && { clip: layout.clip, media: layout.media };
    }
    const clip = findOverlayClip(project, target.id)?.clip;
    const media = clip && project.media.find((m) => m.id === clip.mediaId);
    return clip && media && { clip, media };
  };

  const update = (target: StabilizeTarget, fn: (clip: VideoClip) => VideoClip) =>
    setProject((p) => (target.kind === 'clip' ? updateClip(p, target.id, fn) : updateOverlayClip(p, target.id, (c) => ({ ...c, ...fn(c) }))));

  /** `null` = tirar a estabilização. Um passo só no desfazer. */
  const stabilize = async (target: StabilizeTarget, strength: StabilizeStrength | null) => {
    const found = find(target);
    if (!found) return;
    const { clip, media } = found;
    if (!strength) {
      update(target, (c) => ({ ...c, camera: c.camera && { ...c.camera, stabilize: undefined } }));
      notify(t('Estabilização removida.'));
      return;
    }
    if (media.kind !== 'video') return;
    const key = `${media.id}:${clip.trimIn}:${clip.trimOut}`;
    try {
      let analysis = analyses.get(key);
      if (!analysis) {
        setBusy(t('Medindo o tremido da câmera… {n}%', { n: 0 }));
        let shown = 0;
        // Só atualiza a mensagem quando o número muda (a análise passa por todos os quadros).
        analysis = await analyzeCameraMotion(media, clip.trimIn, clip.trimOut, (f) => {
          const n = Math.round(f * 100);
          if (n !== shown) setBusy(t('Medindo o tremido da câmera… {n}%', { n: (shown = n) }));
        });
        if (analysis.motions.length < 3) {
          notify(t('Não foi possível ler os quadros deste vídeo.'), true);
          return;
        }
        if (analysis.unreliable > analysis.motions.length * 0.5) {
          notify(t('A imagem tem poucos detalhes para medir o movimento (muito escura, lisa ou mudando de cena). A estabilização não foi aplicada.'), true);
          return;
        }
        analyses.set(key, analysis);
        if (analyses.size > MAX_CACHED) analyses.delete(analyses.keys().next().value!);
      }
      const { stabilization, capped } = buildStabilization(analysis.motions, {
        strength,
        width: analysis.width,
        height: analysis.height,
        turn: clip.turn,
        flipX: clip.flipX,
        flipY: clip.flipY,
      });
      // Soma com o que a câmera já tinha (keyframes, seguir rosto): nada é apagado.
      update(target, (c) => ({ ...c, camera: { ...(c.camera ?? createCamera()), stabilize: stabilization } }));
      const zoom = stabilization.zoom.toLocaleString(locale(), { maximumFractionDigits: 2 });
      notify(
        capped
          ? t('Vídeo estabilizado. O tremido é forte: o zoom ficou no máximo ({zoom}×) e parte dele continua.', { zoom })
          : t('Vídeo estabilizado, com zoom de {zoom}× para esconder as bordas.', { zoom }),
      );
    } catch (error) {
      console.error(error);
      notify(t('Não foi possível analisar o vídeo: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  return { stabilize };
}
