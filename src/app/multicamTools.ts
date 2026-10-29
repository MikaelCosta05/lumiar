import { ENVELOPE_RATE, findOffset, loudness } from '../media/audioSync';
import { cutsFromLoudness, cutsFromSpeakers, matchSpeakersToCameras } from '../project/autoMulticam';
import { layoutProject, speedOf } from '../project/model';
import { addPunchIns, asCamera, cameraCount, emphasisMoments, hasMulticam, switchCamera } from '../project/multicam';
import { t } from '../i18n';
import type { EditorContext } from './context';

/** Multicâmera (sincronizar pelo som, cortar entre as câmeras) e zoom na fala. */
export function multicamTools({ history, setProject, notify, setBusy, currentTime }: EditorContext) {
  /** Multicâmera: as câmeras das trilhas de cima são sincronizadas com a principal pelo som. */
  const syncCameras = async () => {
    const p = history.current();
    const tl = layoutProject(p);
    const reference = tl.clips.find((l) => currentTime() >= l.start && currentTime() < l.start + l.length && l.media.hasAudio) ?? tl.clips.find((l) => l.media.hasAudio);
    const cameras = tl.overlays.filter((l) => l.media.kind === 'video' && l.media.hasAudio);
    if (!reference || cameras.length === 0) {
      notify(t('Ponha a câmera principal na trilha principal e as outras câmeras nas trilhas de vídeo de cima (todas com som).'), true);
      return;
    }
    try {
      const limit = (from: number, to: number) => Math.min(to, from + 600);
      setBusy(t('Sincronizando as câmeras…'));
      const a = await loudness(reference.media.file, reference.clip.trimIn, limit(reference.clip.trimIn, reference.clip.trimOut));
      const starts = new Map<string, number>();
      let doubtful = 0;
      for (const [i, cam] of cameras.entries()) {
        setBusy(t('Sincronizando as câmeras… {n} de {total}', { n: i + 1, total: cameras.length }));
        const b = await loudness(cam.media.file, cam.clip.trimIn, limit(cam.clip.trimIn, cam.clip.trimOut));
        const { offset, confidence } = findOffset(a, b);
        if (confidence < 4) doubtful++;
        starts.set(cam.clip.id, reference.start + offset / speedOf(reference.clip));
      }
      setProject((q) => [...starts].reduce((acc, [id, start]) => asCamera(acc, id, start), q));
      notify(
        t('{n} câmeras sincronizadas. Toque o vídeo e aperte 1, 2, 3… para cortar entre elas (1 = trilha principal).', { n: cameras.length + 1 }) +
          (doubtful ? ` ${t('{n} encaixe(s) com pouca certeza: confira.', { n: doubtful })}` : ''),
      );
    } catch (error) {
      notify(t('Não foi possível sincronizar: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  const cutToCamera = (camera: number) => {
    const p = history.current();
    if (!hasMulticam(p) || camera > cameraCount(p)) return false;
    setProject((q) => switchCamera(q, currentTime(), camera));
    return true;
  };

  /**
   * Multicâmera automática: corta para a câmera de quem está falando. Usa as vozes separadas nas
   * legendas (se houver) ou o volume de cada câmera (cada uma ouve mais alto quem está perto dela).
   */
  const autoMulticam = async () => {
    const p = history.current();
    if (!hasMulticam(p)) {
      notify(t('Primeiro sincronize as câmeras: clique direito numa câmera → "Multicâmera: sincronizar as câmeras pelo som".'), true);
      return;
    }
    const tl = layoutProject(p);
    const cams = tl.overlays.filter((l) => l.clip.multicam);
    const t0 = Math.min(...cams.map((l) => l.start));
    const t1 = Math.max(...cams.map((l) => l.start + l.length));
    const tracks = [...new Set(cams.map((l) => l.track))].sort((a, b) => a - b);
    const groups = [tl.clips.filter((l) => l.start < t1 && l.start + l.length > t0), ...tracks.map((tr) => cams.filter((l) => l.track === tr))];
    const rate = 20;
    const n = Math.ceil((t1 - t0) * rate);
    try {
      const envelopes: (Float32Array | null)[] = [];
      for (const [i, layouts] of groups.entries()) {
        setBusy(t('Ouvindo as câmeras… {n} de {total}', { n: i + 1, total: groups.length }));
        const withSound = layouts.filter((l) => l.media.hasAudio);
        if (!withSound.length) {
          envelopes.push(null);
          continue;
        }
        const env = new Float32Array(n);
        for (const l of withSound) {
          const from = l.clip.trimIn + Math.max(0, t0 - l.start) * speedOf(l.clip);
          const to = l.clip.trimIn + (Math.min(t1, l.start + l.length) - l.start) * speedOf(l.clip);
          const source = await loudness(l.media.file, from, to);
          for (let j = 0; j < n; j++) {
            const at = t0 + j / rate;
            if (at < l.start || at >= l.start + l.length) continue;
            const k = Math.floor((l.clip.trimIn + (at - l.start) * speedOf(l.clip) - from) * ENVELOPE_RATE);
            if (k >= 0 && k < source.length) env[j] = source[k];
          }
        }
        envelopes.push(env);
      }
      const captions = (p.captions?.captions ?? []).filter((c) => c.start < t1 && c.end > t0);
      const people = p.captions?.speakers?.length ?? 0;
      const bySpeakers = people > 1 && captions.some((c) => c.speaker !== undefined);
      const cuts = bySpeakers
        ? cutsFromSpeakers(captions, matchSpeakersToCameras(captions, envelopes, rate, t0, people))
        : cutsFromLoudness(envelopes, rate, t0);
      if (cuts.length === 0) {
        notify(t('Não deu para saber quem fala pelo som das câmeras. Separe as vozes na aba Legendas e tente de novo.'), true);
        return;
      }
      setProject((q) => cuts.reduce((acc, c) => switchCamera(acc, Math.max(t0, Math.min(t1 - 0.05, c.time)), c.camera), q));
      notify(
        bySpeakers
          ? t('{n} corte(s) automáticos entre {cameras} câmeras, pelas vozes das legendas. Ajuste à mão com 1, 2, 3… tocando o vídeo.', { n: cuts.length, cameras: groups.length })
          : t('{n} corte(s) automáticos entre {cameras} câmeras, pelo som de cada câmera. Ajuste à mão com 1, 2, 3… tocando o vídeo.', { n: cuts.length, cameras: groups.length }),
      );
    } catch (error) {
      notify(t('Não foi possível ouvir as câmeras: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** Zooms rápidos nos momentos de ênfase da fala (picos de volume). */
  const autoPunchIn = async (clipId?: string) => {
    const p = history.current();
    const tl = layoutProject(p);
    const layouts = clipId ? tl.clips.filter((l) => l.clip.id === clipId) : tl.clips;
    const targets = layouts.filter((l) => l.media.hasAudio && !l.clip.audioDetached);
    if (targets.length === 0) {
      notify(t('Precisa de um vídeo com som na trilha principal.'), true);
      return;
    }
    try {
      const moments: number[] = [];
      for (const [i, l] of targets.entries()) {
        setBusy(t('Ouvindo a fala… {n} de {total}', { n: i + 1, total: targets.length }));
        const env = await loudness(l.media.file, l.clip.trimIn, l.clip.trimOut);
        moments.push(...emphasisMoments(env, ENVELOPE_RATE).map((m) => l.start + m / speedOf(l.clip)));
      }
      let count = 0;
      setProject((q) => {
        const result = addPunchIns(q, moments.slice(0, 60));
        count = result.count;
        return result.project;
      });
      notify(
        count ? t('{n} zoom(s) na fala. Cada um é um bloco na trilha de pacotes: mova, apague ou ajuste a força.', { n: count }) : t('Não achei momentos de ênfase nesse trecho.'),
        count === 0,
      );
    } catch (error) {
      notify(t('Não foi possível ouvir o áudio: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  return { syncCameras, cutToCamera, autoMulticam, autoPunchIn };
}
