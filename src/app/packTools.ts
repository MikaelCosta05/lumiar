import { trackFace } from '../media/tracking';
import type { TrackPoint } from '../project/camera';
import { ADJUSTMENT_ID } from '../project/adjustmentBlock';
import { layoutProject, speedOf } from '../project/model';
import { applyPack, findPackClip, setPackFace, type PackTemplate } from '../project/packs';
import { findPackTemplate } from '../ui/packStore';
import { t } from '../i18n';
import type { audioTools } from './audioTools';
import type { EditorContext } from './context';

/** Pacotes de edição: aplicar no cursor ou no clipe selecionado (com batidas e rosto, se o pacote pede). */
export function packTools(
  { history, timeline, selection, setProject, setSelection, notify, setBusy, currentTime }: EditorContext,
  { musicAt, markBeats }: Pick<ReturnType<typeof audioTools>, 'musicAt' | 'markBeats'>,
) {
  /** Trecho do clipe selecionado (pacotes de visual cobrem ele inteiro). */
  const selectedSpan = () => {
    if (selection?.kind === 'clip') {
      const layout = timeline.clips.find((l) => l.clip.id === selection.id);
      return layout ? { start: layout.start, length: layout.length } : null;
    }
    if (selection?.kind === 'overlay') {
      const layout = timeline.overlays.find((l) => l.clip.id === selection.id);
      return layout ? { start: layout.start, length: layout.length } : null;
    }
    return null;
  };

  /** Procura o rosto no vídeo embaixo do bloco e liga o "seguir rosto" na câmera do pacote. */
  const faceForPack = async (packId: string, face: NonNullable<PackTemplate['face']>) => {
    const p = history.current();
    const found = findPackClip(p, packId);
    if (!found) return;
    const { start: s, duration } = found.clip;
    const e = s + duration;
    const points: TrackPoint[] = [];
    const under = layoutProject(p).clips.filter((l) => l.start < e && l.start + l.length > s);
    setBusy(t('Procurando rostos… {n}%', { n: 0 }));
    try {
      for (const [n, l] of under.entries()) {
        const speed = speedOf(l.clip);
        const a = Math.max(s, l.start);
        const b = Math.min(e, l.start + l.length);
        const from = l.clip.trimIn + (a - l.start) * speed;
        const to = l.clip.trimIn + (b - l.start) * speed;
        const found = await trackFace(l.media, from, to, (f) => setBusy(t('Procurando rostos… {n}%', { n: Math.round(((n + f) / under.length) * 100) })));
        // Posição na imagem do clipe → posição na tela (a mídia pode ter barras em volta).
        const ratio = p.width / p.height;
        const mediaRatio = l.media.width / l.media.height || ratio;
        const [fw, fh] = mediaRatio > ratio ? [1, ratio / mediaRatio] : [mediaRatio / ratio, 1];
        for (const pt of found) {
          points.push({
            t: l.start + (pt.t - l.clip.trimIn) / speed - s,
            x: 0.5 + (pt.x - 0.5) * fw,
            y: 0.5 + (pt.y - 0.5) * fh,
            size: pt.size * fw,
          });
        }
      }
    } catch (error) {
      notify(t('Não foi possível analisar o vídeo: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
      return;
    } finally {
      setBusy(null);
    }
    if (points.length === 0) {
      notify(t('Nenhum rosto encontrado embaixo do pacote: ele ficou com a câmera no centro.'), true);
      return;
    }
    setProject((q) => setPackFace(q, packId, points, face));
    notify(t('Rosto encontrado: a câmera do pacote vai acompanhar.'));
  };

  const addPack = async (template: PackTemplate, at = currentTime(), track = 0, cover = selectedSpan()) => {
    let beats: number[] | undefined;
    let music: { start: number; length: number } | null = null;
    if (template.beat) {
      // Usa as batidas já marcadas no trecho; se não houver, ouve a música agora.
      const p = history.current();
      const source = musicAt(p, at);
      const span = cover ?? (source ? { start: source.start, length: (source.trimOut - source.trimIn) / source.speed } : null);
      const known = span ? (p.beats ?? []).filter((b) => b >= span.start && b < span.start + span.length) : [];
      if (span && known.length >= 4) {
        beats = known;
        music = span;
      } else {
        const detected = await markBeats(at);
        if (!detected) return;
        beats = detected.beats;
        music = detected.span;
      }
    }
    let id = '';
    let speedApplied = false;
    setProject((p) => {
      const result = applyPack(p, layoutProject(p), template, at, { cover, music, beats, track });
      id = result.id;
      speedApplied = result.speedApplied;
      return result.project;
    });
    setSelection({ kind: 'pack', id });
    const name = t(template.name);
    if (template.speed && !speedApplied) notify(t('"{name}" aplicado, mas a velocidade só muda em vídeos da trilha principal.', { name }), true);
    else if (template.id === ADJUSTMENT_ID) notify(t('Bloco de ajuste na timeline. Escolha no painel da direita o filtro, os efeitos, a cor e a câmera.'));
    else if (template.beat) notify(t('"{name}" aplicado em {n} batidas.', { name, n: beats?.length ?? 0 }));
    else notify(t('"{name}" aplicado. Puxe as bordas do bloco para encaixar.', { name }));
    if (template.face) await faceForPack(id, template.face);
  };

  const dropPack = (packId: string, track: number, t: number) => {
    const template = findPackTemplate(packId);
    if (template) void addPack(template, t, track, null);
  };

  return { addPack, dropPack };
}
