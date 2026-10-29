import { trackFace, trackPoint } from '../media/tracking';
import { createCamera, evaluateCamera, screenToSource, sourceToScreen, type CameraFollow } from '../project/camera';
import { speedOf, updateClip } from '../project/model';
import { updateTextClip } from '../project/text';
import { t } from '../i18n';
import type { EditorContext } from './context';

/** Câmera que segue rosto / ponto, e texto que gruda num ponto do vídeo. */
export function cameraFollowTools({ project, timeline, setProject, notify, setBusy, currentTime }: EditorContext, setPicking: (picking: string | null) => void) {
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
      setBusy(t('Procurando rostos… {n}%', { n: 0 }));
      const points = await trackFace(layout.media, layout.clip.trimIn, layout.clip.trimOut, (f) =>
        setBusy(t('Procurando rostos… {n}%', { n: Math.round(f * 100) })),
      );
      if (points.length === 0) {
        notify(t('Nenhum rosto encontrado neste clipe.'), true);
        return;
      }
      // Zoom para o rosto ocupar ~22% da largura da tela (entre 1,2× e 3×).
      const size = points.reduce((s, p) => s + p.size, 0) / points.length;
      const zoom = Math.min(3, Math.max(1.2, 0.22 / Math.max(0.01, size)));
      setFollow(clipId, { kind: 'face', points, zoom, smoothness: 0.6, mode: 'center', anchorTime: layout.clip.trimIn }, true);
      notify(t('Rosto encontrado em {n} momentos. A câmera vai acompanhar.', { n: points.length }));
    } catch (error) {
      console.error(error);
      notify(t('Não foi possível analisar o vídeo: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  const followPoint = async (clipId: string, screen: { x: number; y: number }) => {
    setPicking(null);
    const layout = timeline.clips.find((l) => l.clip.id === clipId);
    if (!layout) return;
    const now = Math.min(Math.max(currentTime(), layout.start), layout.start + layout.length);
    const clipTime = now - layout.start;
    const sourceTime = layout.clip.trimIn + clipTime * speedOf(layout.clip);
    // Converte o clique na tela para a posição na imagem, desfazendo a câmera atual.
    const view = { ...evaluateCamera(layout.clip.camera, clipTime, sourceTime), fill: layout.clip.camera?.fill ?? false };
    const point = screenToSource(screen, view, project, layout.media);
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
      notify(t('Clique dentro da imagem do clipe.'), true);
      return;
    }
    try {
      setBusy(t('Acompanhando o ponto… {n}%', { n: 0 }));
      const points = await trackPoint(layout.media, sourceTime, point, layout.clip.trimIn, layout.clip.trimOut, (f) =>
        setBusy(t('Acompanhando o ponto… {n}%', { n: Math.round(f * 100) })),
      );
      setFollow(clipId, { kind: 'point', points, zoom: 1.4, smoothness: 0.25, mode: 'center', anchorTime: sourceTime }, false);
      notify(t('Ponto rastreado. A câmera vai acompanhar.'));
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setBusy(null);
    }
  };

  /** O texto (ou sticker) gruda num ponto do vídeo e anda junto com ele. */
  const followTextPoint = async (textId: string, screen: { x: number; y: number }) => {
    setPicking(null);
    const now = currentTime();
    const layout = timeline.clips.find((l) => now >= l.start && now < l.start + l.length && l.media.kind === 'video');
    if (!layout) {
      notify(t('Pare o cursor num trecho com vídeo na trilha principal e tente de novo.'), true);
      return;
    }
    const speed = speedOf(layout.clip);
    const sourceTime = layout.clip.trimIn + (now - layout.start) * speed;
    const viewAt = (clipTime: number, source: number) => ({ ...evaluateCamera(layout.clip.camera, clipTime, source), fill: layout.clip.camera?.fill ?? false });
    const point = screenToSource(screen, viewAt(now - layout.start, sourceTime), project, layout.media);
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
      notify(t('Clique dentro da imagem do vídeo.'), true);
      return;
    }
    try {
      setBusy(t('Acompanhando o ponto… {n}%', { n: 0 }));
      const found = await trackPoint(layout.media, sourceTime, point, layout.clip.trimIn, layout.clip.trimOut, (f) =>
        setBusy(t('Acompanhando o ponto… {n}%', { n: Math.round(f * 100) })),
      );
      // Do vídeo para a tela, no tempo da timeline (levando em conta a câmera do clipe).
      const points = found.map((p) => {
        const clipTime = (p.t - layout.clip.trimIn) / speed;
        return { t: layout.start + clipTime, ...sourceToScreen(p, viewAt(clipTime, p.t), project, layout.media) };
      });
      setProject((p) => updateTextClip(p, textId, (c) => ({ ...c, follow: { points, anchor: screen } })));
      notify(t('Pronto: o texto vai acompanhar o ponto.'));
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setBusy(null);
    }
  };

  return { followFace, followPoint, followTextPoint };
}
