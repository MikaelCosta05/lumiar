import { resolveParams } from '../engine/keyframes';
import { t } from '../i18n';
import { estimateDepth, upscaleImage } from '../media/ai';
import { assets } from '../media/assets';
import { analyzeMedia, importMedia } from '../media/importer';
import { makeParallax, type ParallaxMotion } from '../media/parallax';
import { grabFrame, reverseMedia } from '../media/reverse';
import { detectScenes, trackPoint } from '../media/tracking';
import { colorStats, matchGrade } from '../project/colorMatch';
import { replaceMediaFile } from '../project/mediaUsage';
import {
  addMedia,
  createOverlayClip,
  createVideoClip,
  findOverlayClip,
  getMedia,
  insertFreezeFrame,
  insertVideoClips,
  layoutProject,
  type MediaItem,
  placeOverlayClip,
  speedOf,
  splitVideoClip,
  updateClip,
  updateOverlayClip,
  type VideoClip,
} from '../project/model';
import { reframeToVertical } from '../project/recipes';
import type { EditorContext } from './context';

/**
 * Ferramentas de imagem: congelar e inverter, dividir nas cenas, apagador que segue o objeto,
 * trechos da busca, foto 3D, aumentar a resolução, igualar a cor e reenquadrar para vertical.
 */
export function visualTools({ history, project, timeline, setProject, setSelection, notify, setBusy, applyEdit, currentTime }: EditorContext) {
  /** Congela o quadro do cursor: o clipe é dividido e uma imagem parada de 2s entra no meio. */
  const freeze = async (clipId: string) => {
    const layout = timeline.clips.find((l) => l.clip.id === clipId);
    if (!layout || layout.media.kind !== 'video') return;
    const now = Math.min(Math.max(currentTime(), layout.start), layout.start + layout.length - 0.01);
    const sourceTime = layout.clip.trimIn + (now - layout.start) * speedOf(layout.clip);
    try {
      setBusy(t('Congelando o quadro…'));
      const still = { ...(await importMedia(await grabFrame(layout.media, sourceTime))), name: t('Quadro congelado · {name}', { name: layout.media.name }) };
      const result = insertFreezeFrame(project, clipId, now, still);
      applyEdit(result && { project: result.project, selection: { kind: 'clip', id: result.id } });
      if (result) notify(t('Quadro congelado por 2s. Ajuste o tempo puxando a borda do clipe.'));
    } catch (error) {
      notify(t('Não foi possível congelar: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** Cria uma cópia do trecho tocando de trás para frente e troca a mídia do clipe por ela. */
  const reverse = async (target: { kind: 'clip' | 'overlay'; id: string }) => {
    const clip = target.kind === 'clip' ? project.clips.find((c) => c.id === target.id) : findOverlayClip(project, target.id)?.clip;
    const media = clip && getMedia(project, clip.mediaId);
    if (!clip || !media || media.kind !== 'video') return;
    try {
      setBusy(t('Invertendo o clipe… {n}%', { n: 0 }));
      const file = await reverseMedia(media, clip.trimIn, clip.trimOut, (f) => setBusy(t('Invertendo o clipe… {n}%', { n: Math.round(f * 100) })));
      const reversed = await importMedia(file);
      void analyzeMedia(reversed);
      const swap = <T extends VideoClip>(c: T): T => ({ ...c, mediaId: reversed.id, trimIn: 0, trimOut: reversed.duration });
      setProject((p) => {
        const withMedia = addMedia(p, [reversed]);
        return target.kind === 'clip' ? updateClip(withMedia, target.id, swap) : updateOverlayClip(withMedia, target.id, swap);
      });
      notify(t('Clipe invertido: agora ele toca de trás para frente.'));
    } catch (error) {
      notify(t('Não foi possível inverter: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** Divide o clipe em cada mudança de cena (troca de plano, corte de câmera). */
  const splitScenes = async (clipId: string) => {
    const layout = layoutProject(history.current()).clips.find((l) => l.clip.id === clipId);
    if (!layout || layout.media.kind !== 'video') return;
    let cuts: number[];
    try {
      setBusy(t('Procurando as mudanças de cena…'));
      cuts = await detectScenes(layout.media, layout.clip.trimIn, layout.clip.trimOut, (f) => setBusy(t('Procurando as mudanças de cena… {n}%', { n: Math.round(f * 100) })));
    } catch (error) {
      notify(t('Não foi possível analisar o vídeo: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
      return;
    } finally {
      setBusy(null);
    }
    if (!cuts.length) {
      notify(t('Não achei mudanças de cena nesse clipe.'), true);
      return;
    }
    let made = 0;
    setProject((p) => {
      let next = p;
      const current = layoutProject(next).clips.find((l) => l.clip.id === clipId);
      if (!current) return p;
      // Do fim para o começo: a primeira parte continua sendo o clipe original.
      for (const cut of [...cuts].reverse()) {
        const result = splitVideoClip(next, clipId, current.start + (cut - current.clip.trimIn) / speedOf(current.clip));
        if (result) {
          next = { ...result.project, transitions: result.project.transitions.map((tr, i) => (i === result.project.clips.findIndex((c) => c.id === clipId) ? null : tr)) };
          made++;
        }
      }
      return next;
    });
    notify(t('Clipe dividido em {n} cenas.', { n: made + 1 }));
  };

  /** O "Apagar objeto" do clipe passa a seguir o objeto, a partir de onde ele está no cursor. */
  const followEraser = async (target: { kind: 'clip' | 'overlay'; id: string }, effectUid: string) => {
    const p = history.current();
    const tl = layoutProject(p);
    const layout = target.kind === 'clip' ? tl.clips.find((l) => l.clip.id === target.id) : tl.overlays.find((l) => l.clip.id === target.id);
    const effect = layout?.clip.effects.find((e) => e.uid === effectUid);
    if (!layout || !effect || layout.media.kind !== 'video') return;
    const speed = speedOf(layout.clip);
    const clipTime = Math.min(layout.length, Math.max(0, currentTime() - layout.start));
    const center = resolveParams(effect.params, effect.keyframes, clipTime).center as number[];
    try {
      setBusy(t('Seguindo o objeto…'));
      const points = await trackPoint(layout.media, layout.clip.trimIn + clipTime * speed, { x: center[0], y: center[1] }, layout.clip.trimIn, layout.clip.trimOut, (f) =>
        setBusy(t('Seguindo o objeto… {n}%', { n: Math.round(f * 100) })),
      );
      const keys = points
        .filter((_, i) => i % 3 === 0)
        .map((pt) => ({ time: Math.round(((pt.t - layout.clip.trimIn) / speed) * 1000) / 1000, value: [pt.x, pt.y], easing: 'linear' as const }));
      const apply = <T extends VideoClip>(c: T): T => ({
        ...c,
        effects: c.effects.map((e) => (e.uid === effectUid ? { ...e, keyframes: { ...e.keyframes, center: keys } } : e)),
      });
      setProject((q) => (target.kind === 'clip' ? updateClip(q, target.id, apply) : updateOverlayClip(q, target.id, apply)));
      notify(t('O apagador agora segue o objeto ({n} pontos). Ajuste o tamanho se ele crescer ou diminuir.', { n: keys.length }));
    } catch (error) {
      notify(t('Não foi possível seguir o objeto: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** Põe um trecho achado na busca: por cima no cursor, ou no fim da trilha principal (4 s). */
  const insertHit = (media: MediaItem, time: number, where: 'cursor' | 'end') => {
    const from = Math.max(0, time - 0.5);
    const length = media.kind === 'image' ? 4 : Math.min(4, media.duration - from);
    if (where === 'end') {
      const clip = { ...createVideoClip(media), trimIn: media.kind === 'image' ? 0 : from, trimOut: media.kind === 'image' ? length : from + length };
      setProject((p) => insertVideoClips(p, [clip]));
      notify(t('Trecho de "{name}" no fim da trilha principal.', { name: media.name }));
    } else {
      const clip = { ...createOverlayClip(media, currentTime(), { x: 0.5, y: 0.5, scale: 1, radius: 0 }), trimIn: media.kind === 'image' ? 0 : from, trimOut: media.kind === 'image' ? length : from + length, volume: 0 };
      setProject((p) => placeOverlayClip(p, clip));
      setSelection({ kind: 'overlay', id: clip.id });
      notify(t('Trecho de "{name}" por cima do vídeo, no cursor.', { name: media.name }));
    }
  };

  /** Uma foto do projeto (até 1024 px) como ImageData, para os modelos de IA. */
  const photoData = (media: MediaItem, max = 1024): ImageData | null => {
    const bitmap = assets.bitmaps.get(media.id);
    if (!bitmap) return null;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bitmap.width * scale);
    c.height = Math.round(bitmap.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    return ctx.getImageData(0, 0, c.width, c.height);
  };

  /** Foto 3D: a IA estima a profundidade e a câmera "entra" na foto; o clipe passa a usar o vídeo gerado. */
  const photo3d = async (target: { kind: 'clip' | 'overlay'; id: string }, motion: ParallaxMotion) => {
    const p = history.current();
    const tl = layoutProject(p);
    const layout = target.kind === 'clip' ? tl.clips.find((l) => l.clip.id === target.id) : tl.overlays.find((l) => l.clip.id === target.id);
    const bitmap = layout && assets.bitmaps.get(layout.media.id);
    const data = layout && photoData(layout.media, 768);
    if (!layout || !bitmap || !data) return;
    try {
      setBusy(t('Calculando a profundidade da foto…'));
      const depth = await estimateDepth(data, (stage, f) => setBusy(`${stage}${f === null ? '…' : ` ${Math.round(f * 100)}%`}`));
      setBusy(t('Criando a foto 3D…'));
      const file = await makeParallax(bitmap, depth, { duration: Math.max(1, layout.length), motion, strength: 1, name: `${layout.media.name.replace(/\.[^.]+$/, '')} 3D` }, (f) =>
        setBusy(t('Criando a foto 3D… {n}%', { n: Math.round(f * 100) })),
      );
      const media = await importMedia(file);
      void analyzeMedia(media);
      const swap = <T extends VideoClip>(c: T): T => ({ ...c, mediaId: media.id, trimIn: 0, trimOut: media.duration });
      setProject((q) => {
        const next = addMedia(q, [media]);
        return target.kind === 'clip' ? updateClip(next, target.id, swap) : updateOverlayClip(next, target.id, swap);
      });
      notify(t('Foto 3D pronta: o clipe agora é um vídeo com a câmera passando pela cena. A foto original continua nas mídias.'));
    } catch (error) {
      notify(t('Não foi possível criar a foto 3D: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** Dobra a resolução de uma foto com IA e troca em todos os clipes que a usam. */
  const upscalePhoto = async (mediaId: string) => {
    const media = getMedia(history.current(), mediaId);
    const data = media && photoData(media, 1024);
    if (!media || !data) return;
    try {
      setBusy(t('Aumentando a resolução…'));
      const result = await upscaleImage(data, (stage, f) => setBusy(`${stage}${f === null ? '…' : ` ${Math.round(f * 100)}%`}`));
      const c = document.createElement('canvas');
      c.width = result.width;
      c.height = result.height;
      c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(result.data), result.width, result.height), 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
      const next = await importMedia(new File([blob], `${media.name.replace(/\.[^.]+$/, '')} (2x).png`, { type: 'image/png' }));
      void analyzeMedia(next);
      setProject((p) => replaceMediaFile(p, mediaId, next));
      notify(t('"{name}" agora tem {width}×{height}.', { name: media.name, width: result.width, height: result.height }));
    } catch (error) {
      notify(t('Não foi possível aumentar a resolução: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** Um quadro do meio do clipe, como imagem (para comparar cores). */
  const clipFrame = async (clipId: string): Promise<ImageBitmap | null> => {
    const layout = layoutProject(history.current()).clips.find((l) => l.clip.id === clipId);
    if (!layout) return null;
    if (layout.media.kind === 'image') return assets.bitmaps.get(layout.media.id) ?? null;
    const file = await grabFrame(layout.media, (layout.clip.trimIn + layout.clip.trimOut) / 2);
    return createImageBitmap(file);
  };

  /** Igualar a cor: o clipe passa a ter a mesma cor média e o mesmo contraste do clipe de referência. */
  const matchColor = async (clipId: string, referenceId: string) => {
    try {
      setBusy(t('Comparando as cores…'));
      const [target, reference] = await Promise.all([clipFrame(clipId), clipFrame(referenceId)]);
      if (!target || !reference) return;
      const grade = matchGrade(
        history.current().clips.find((c) => c.id === clipId)?.grade,
        colorStats(target, target.width, target.height),
        colorStats(reference, reference.width, reference.height),
      );
      setProject((p) => updateClip(p, clipId, (c) => ({ ...c, grade })));
      notify(t('Cor igualada. O ajuste está na aba Cor → Correção manual (curvas R, G e B).'));
    } catch (error) {
      notify(t('Não foi possível comparar as cores: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** Deixa o projeto vertical (9:16) e cada clipe acompanha o rosto de quem aparece. */
  const reframeVertical = async () => {
    let result: Awaited<ReturnType<typeof reframeToVertical>>;
    try {
      setBusy(t('Reenquadrando para vertical…'));
      result = await reframeToVertical(history.current(), (f) => setBusy(t('Reenquadrando para vertical… {n}%', { n: Math.round(f * 100) })));
    } catch (error) {
      notify(t('Não foi possível analisar o vídeo: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
      return;
    } finally {
      setBusy(null);
    }
    const { width, height, clips } = result.project;
    // Só o formato e as câmeras mudam (o resto pode ter sido editado enquanto analisava).
    const cameras = new Map(clips.map((c) => [c.id, c.camera]));
    setProject((q) => ({ ...q, width, height, clips: q.clips.map((c) => (cameras.has(c.id) ? { ...c, camera: cameras.get(c.id) } : c)) }));
    notify(t('Projeto agora em {width}×{height} (vertical). {n} clipe(s) acompanham o rosto; os outros ficam centralizados.', { width, height, n: result.followed }));
  };

  return { freeze, reverse, splitScenes, followEraser, insertHit, photo3d, upscalePhoto, matchColor, reframeVertical };
}
