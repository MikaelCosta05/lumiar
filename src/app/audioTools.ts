import { separateVoice } from '../media/ai';
import { assets, PEAKS_PER_SECOND } from '../media/assets';
import { findOffset, loudness } from '../media/audioSync';
import { detectBeats, rememberBeats } from '../media/beats';
import { denoiseMedia, type CleanExtra } from '../media/denoise';
import { generateMusic } from '../media/generatedMusic';
import { analyzeMedia, importMedia } from '../media/importer';
import type { MusicOptions } from '../media/musicGen';
import { getSound, soundFile, type SoundEffect } from '../media/sfx';
import { findSpeech } from '../media/silence';
import { spectrumFor } from '../media/spectrum';
import { encodeWav } from '../media/wav';
import {
  addAudioTrack,
  addMedia,
  type AudioClip,
  clipLength,
  createAudioClip,
  detachAudio,
  findAudioClip,
  fitToBeats,
  getMedia,
  layoutProject,
  type MediaItem,
  placeSfxClip,
  placeVoiceClip,
  type Project,
  removeAudioClip,
  speedOf,
  uid,
  updateAudioClip,
  updateAudioTrack,
  updateClip,
} from '../project/model';
import { beatFeatures, planMusicFit } from '../project/musicFit';
import { placeGeneratedMusic } from '../project/musicPlace';
import { findTextClip } from '../project/text';
import { removeSilences } from '../project/recipes';
import { t } from '../i18n';
import type { EditorContext } from './context';

/**
 * Ferramentas de áudio: volume, encaixar a música, sincronizar pelo som, limpar o ruído, cortar as
 * pausas, separar a voz, batidas e efeitos sonoros. Recriadas a cada render (veem o projeto atual).
 */
export function audioTools({ history, project, selection, setProject, setSelection, notify, setBusy, currentTime, ripple }: EditorContext) {
  /** Deixa o pico do clipe de áudio em -1 dB. */
  const normalizeAudio = (clipId: string) => {
    const found = findAudioClip(project, clipId);
    const peaks = found && assets.peaks.get(found.clip.mediaId);
    if (!found || !peaks) {
      notify(t('A forma de onda ainda está sendo analisada. Tente de novo em instantes.'), true);
      return;
    }
    let peak = 0;
    const from = Math.floor(found.clip.trimIn * PEAKS_PER_SECOND);
    const to = Math.ceil(found.clip.trimOut * PEAKS_PER_SECOND);
    for (let i = from; i < Math.min(to, peaks.length); i++) peak = Math.max(peak, peaks[i]);
    if (peak < 0.005) {
      notify(t('Esse trecho está praticamente em silêncio.'), true);
      return;
    }
    const volume = Math.min(2, Math.max(0.05, 0.89 / peak));
    setProject((p) => updateAudioClip(p, clipId, (c) => ({ ...c, volume })));
    notify(t('Volume ajustado para {n}%.', { n: Math.round(volume * 100) }));
  };

  /**
   * Encaixa a música numa duração (por padrão, até o fim do vídeo): tira ou repete um pedaço do meio,
   * emendando em cima das batidas, e mantém o começo e o final de verdade.
   */
  const fitMusic = async (audioId: string, seconds?: number) => {
    const p = history.current();
    const found = findAudioClip(p, audioId);
    const media = found && getMedia(p, found.clip.mediaId);
    if (!found || !media) return;
    const { clip, track } = found;
    const tl = layoutProject(p);
    const target = seconds ?? Math.max(1, (tl.videoDuration || tl.duration) - clip.start);
    const speed = speedOf(clip);
    try {
      setBusy(t('Ouvindo a música…'));
      const from = clip.trimIn;
      const to = media.duration;
      const [{ beats }, spectrum] = await Promise.all([detectBeats(media.file, from, to), spectrumFor(media)]);
      const plan = planMusicFit(beatFeatures(beats, spectrum), from, to, target * speed);
      const group = uid();
      let start = clip.start;
      const last = plan.segments.length - 1;
      const pieces = plan.segments.map(([a, b], k) => {
        const piece: AudioClip = {
          ...clip,
          id: k === 0 ? clip.id : uid(),
          start,
          trimIn: a,
          trimOut: b,
          // Emendas com um fade curtinho (sem estalo); as pontas mantêm os fades da música.
          fadeIn: k === 0 ? clip.fadeIn : 0.03,
          fadeOut: k === last ? clip.fadeOut : 0.03,
          volumeKeys: undefined,
          group: plan.segments.length > 1 ? group : clip.group,
        };
        start += (b - a) / speed;
        return piece;
      });
      // Passou um pouquinho do fim: corta o excesso e some aos poucos.
      const excess = start - (clip.start + target);
      if (excess > 0.01) {
        const tail = pieces[last];
        tail.trimOut = Math.max(tail.trimIn + 0.2, tail.trimOut - excess * speed);
        tail.fadeOut = Math.max(tail.fadeOut, Math.min(2, (tail.trimOut - tail.trimIn) / speed / 2));
      }
      const end = clip.start + target;
      setProject((q) => {
        const current = findAudioClip(q, audioId);
        if (!current) return q;
        const others = current.track.clips.filter((c) => c.id !== audioId);
        // Se a música mais longa for bater em outro som da trilha, vai para uma trilha nova.
        const blocked = others.some((c) => c.start < end && c.start + clipLength(c) > clip.start);
        if (!blocked) return updateAudioTrack(q, track.id, (tr) => ({ ...tr, clips: [...others, ...pieces] }));
        const withTrack = addAudioTrack(updateAudioTrack(q, track.id, (tr) => ({ ...tr, clips: others })));
        const added = withTrack.audioTracks[withTrack.audioTracks.length - 1];
        return updateAudioTrack(withTrack, added.id, (tr) => ({ ...tr, kind: track.kind, name: t('{name} (encaixada)', { name: track.name }), clips: pieces }));
      });
      notify(
        plan.joins
          ? t('Música encaixada em {seconds}s: {joins} emenda(s) em cima das batidas, com o começo e o final originais.', { seconds: target.toFixed(1), joins: plan.joins })
          : t('Não achei uma emenda boa nas batidas: a música foi cortada em {seconds}s e some aos poucos no fim.', { seconds: target.toFixed(1) }),
        !plan.joins,
      );
    } catch (error) {
      notify(t('Não foi possível ouvir a música: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** Separa a voz da música (ou do ruído): a voz fica no lugar e o resto vai para uma trilha de música. */
  const splitVoice = async (target: { kind: 'clip' | 'audio'; id: string }) => {
    const p = history.current();
    const tl = layoutProject(p);
    const audioClip = target.kind === 'audio' ? findAudioClip(p, target.id) : null;
    const layout = target.kind === 'clip' ? tl.clips.find((l) => l.clip.id === target.id) : null;
    const media = getMedia(p, audioClip?.clip.mediaId ?? layout?.media.id ?? '');
    const range = audioClip ? audioClip.clip : layout?.clip;
    if (!media || !range) return;
    const start = audioClip ? audioClip.clip.start : layout!.start;
    try {
      setBusy(t('Lendo o áudio…'));
      const decoded = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(await media.file.arrayBuffer());
      const a = Math.floor(range.trimIn * 44100);
      const b = Math.min(decoded.length, Math.ceil(range.trimOut * 44100));
      const left = decoded.getChannelData(0).slice(a, b);
      const right = (decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : decoded.getChannelData(0)).slice(a, b);
      const result = await separateVoice(left, right, (stage, f) => setBusy(`${stage}${f === null ? '…' : ` ${Math.round(f * 100)}%`}`));
      setBusy(t('Guardando as duas partes…'));
      const base = media.name.replace(/\.[^.]+$/, '');
      const voice = await importMedia(encodeWav(result.voice, 44100, `${base} (voz).wav`));
      const rest = await importMedia(encodeWav(result.rest, 44100, `${base} (sem voz).wav`));
      void analyzeMedia(voice);
      void analyzeMedia(rest);
      const speed = range.speed;
      const voiceClip = { ...createAudioClip(voice, start), speed };
      const restClip = { ...createAudioClip(rest, start), speed };
      setProject((q) => {
        let next = addMedia(q, [voice, rest]);
        if (audioClip) next = removeAudioClip(next, target.id);
        else next = updateClip(next, target.id, (c) => ({ ...c, volume: 0 }));
        next = placeVoiceClip(next, voiceClip);
        next = addAudioTrack(next);
        const track = next.audioTracks[next.audioTracks.length - 1];
        return updateAudioTrack(next, track.id, (tr) => ({ ...tr, name: t('Sem voz (música e fundo)'), kind: 'music', clips: [restClip] }));
      });
      notify(t('Voz separada: a voz está na trilha "Narração" e o resto (música, fundo) numa trilha de música. Baixe ou silencie cada parte à vontade.'));
    } catch (error) {
      notify(t('Não foi possível separar a voz: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** Encaixa o áudio de um microfone separado no vídeo, comparando a forma de onda dos dois. */
  const syncAudioClip = async (audioId: string) => {
    const p = history.current();
    const found = findAudioClip(p, audioId);
    const media = found && getMedia(p, found.clip.mediaId);
    const tl = layoutProject(p);
    // O vídeo de referência: o que está embaixo do áudio, ou o primeiro com som.
    const reference =
      tl.clips.find((l) => found && l.media.hasAudio && l.start < found.clip.start + clipLength(found.clip) && l.start + l.length > found.clip.start) ??
      tl.clips.find((l) => l.media.hasAudio);
    if (!found || !media || !reference) {
      notify(t('Coloque na trilha principal o vídeo gravado junto (com o som da câmera).'), true);
      return;
    }
    try {
      setBusy(t('Comparando os sons…'));
      const limit = (from: number, to: number) => Math.min(to, from + 600);
      const a = await loudness(reference.media.file, reference.clip.trimIn, limit(reference.clip.trimIn, reference.clip.trimOut));
      const b = await loudness(media.file, found.clip.trimIn, limit(found.clip.trimIn, found.clip.trimOut));
      const { offset, confidence } = findOffset(a, b);
      const start = reference.start + offset / speedOf(reference.clip);
      setProject((q) => {
        const moved = updateAudioClip(q, audioId, (c) => ({ ...c, start: Math.max(0, start) }));
        // O som da câmera fica mudo: vale o do microfone.
        return updateClip(moved, reference.clip.id, (c) => ({ ...c, volume: 0 }));
      });
      notify(
        confidence < 4
          ? t('Encaixei onde os sons mais combinam ({offset}s), mas sem muita certeza. Confira ouvindo.', { offset: offset.toFixed(2) })
          : t('Áudio sincronizado com "{name}" ({offset}s). O som da câmera foi silenciado.', {
              name: reference.media.name,
              offset: `${offset >= 0 ? '+' : ''}${offset.toFixed(2)}`,
            }),
        confidence < 4,
      );
    } catch (error) {
      notify(t('Não foi possível comparar os sons: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /**
   * Tira o ruído de fundo: gera um áudio limpo e troca no clipe (vídeos: o áudio é separado antes).
   * `extra` também tira o vento e/ou os estalos de boca (com strength 0, só eles).
   */
  const cleanAudio = async (target: { kind: 'audio' | 'clip'; id: string }, strength: number, extra?: CleanExtra) => {
    let p = history.current();
    let audioId = target.id;
    if (target.kind === 'clip') {
      const result = detachAudio(p, target.id);
      if (!result) {
        notify(t('Esse clipe não tem som (ou o áudio já foi separado: limpe o clipe na trilha de áudio).'), true);
        return;
      }
      setProject(() => result.project);
      p = result.project;
      audioId = result.audioId;
    }
    const found = findAudioClip(p, audioId);
    const media = found && getMedia(p, found.clip.mediaId);
    if (!found || !media) return;
    try {
      setBusy(t('Limpando o áudio… {n}%', { n: 0 }));
      const file = await denoiseMedia(media, found.clip.trimIn, found.clip.trimOut, strength, (f) => setBusy(t('Limpando o áudio… {n}%', { n: Math.round(f * 100) })), extra);
      const cleaned = await importMedia(file);
      void analyzeMedia(cleaned);
      setProject((q) =>
        updateAudioClip(addMedia(q, [cleaned]), audioId, (c) => ({ ...c, mediaId: cleaned.id, trimIn: 0, trimOut: cleaned.duration })),
      );
      setSelection({ kind: 'audio', id: audioId });
      notify(target.kind === 'clip' ? t('Áudio separado e limpo. O original continua na mídia do projeto.') : t('Áudio limpo. O original continua na mídia do projeto.'));
    } catch (error) {
      notify(t('Não foi possível limpar o áudio: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** Corta as pausas (silêncios) dos clipes da trilha principal. */
  const cutSilences = async (clipIds: string[]) => {
    const p = history.current();
    const layouts = layoutProject(p).clips.filter((l) => clipIds.includes(l.clip.id) && l.media.hasAudio && !l.clip.audioDetached);
    if (layouts.length === 0) {
      notify(t('Esse clipe não tem som para encontrar as pausas.'), true);
      return;
    }
    const found = new Map<string, [number, number][]>();
    try {
      for (const [n, l] of layouts.entries()) {
        setBusy(t('Procurando as pausas… {n}%', { n: Math.round((n / layouts.length) * 100) }));
        found.set(l.clip.id, await findSpeech(l.media.file, l.clip.trimIn, l.clip.trimOut));
      }
    } catch (error) {
      notify(t('Não foi possível ouvir o áudio: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
      return;
    } finally {
      setBusy(null);
    }
    let removed = 0;
    let cuts = 0;
    setProject((q) => {
      const result = removeSilences(q, found, ripple);
      cuts = result.cuts;
      removed = result.removed;
      return result.project;
    });
    notify(
      removed > 0 ? t('{n} pausa(s) cortada(s): o vídeo ficou {seconds}s mais curto.', { n: cuts, seconds: removed.toFixed(1) }) : t('Não encontrei pausas para cortar.'),
      removed === 0,
    );
  };

  /**
   * Música de onde tirar as batidas: o áudio selecionado, a música no cursor, qualquer áudio no cursor,
   * a primeira música do projeto ou o som do próprio vídeo.
   */
  const musicAt = (p: Project, t: number) => {
    const tl = layoutProject(p);
    const covers = (start: number, length: number) => t >= start && t < start + length;
    const audio = p.audioTracks.flatMap((track) => track.clips.map((clip) => ({ track, clip })));
    const pick =
      (selection?.kind === 'audio' && audio.find((a) => a.clip.id === selection.id)) ||
      audio.find((a) => a.track.kind === 'music' && !a.track.muted && covers(a.clip.start, clipLength(a.clip))) ||
      audio.find((a) => a.track.kind !== 'voice' && !a.track.muted && covers(a.clip.start, clipLength(a.clip))) ||
      audio.find((a) => a.track.kind === 'music' && !a.track.muted);
    if (pick) {
      const media = getMedia(p, pick.clip.mediaId);
      if (media) return { media, trimIn: pick.clip.trimIn, trimOut: pick.clip.trimOut, start: pick.clip.start, speed: speedOf(pick.clip) };
    }
    const video = tl.clips.find((l) => covers(l.start, l.length) && l.media.hasAudio && !l.clip.audioDetached);
    return video ? { media: video.media, trimIn: video.clip.trimIn, trimOut: video.clip.trimOut, start: video.start, speed: speedOf(video.clip) } : null;
  };

  /** Detecta as batidas da música no cursor e guarda no projeto (aparecem na régua e servem de ímã). */
  const markBeats = async (at = currentTime()) => {
    const music = musicAt(history.current(), at);
    if (!music) {
      notify(t('Coloque uma música (ou um vídeo com som) na timeline para detectar as batidas.'), true);
      return null;
    }
    setBusy(t('Ouvindo a música…'));
    try {
      const result = await detectBeats(music.media.file, music.trimIn, music.trimOut);
      const beats = result.beats.map((b) => music.start + (b - music.trimIn) / music.speed);
      const length = (music.trimOut - music.trimIn) / music.speed;
      const span = { start: music.start, length };
      if (beats.length < 2) {
        notify(t('Não encontrei um ritmo claro nesse áudio.'), true);
        return null;
      }
      setProject((p) => ({
        ...p,
        beats: [...(p.beats ?? []).filter((b) => b < span.start || b > span.start + span.length), ...beats].sort((a, b) => a - b),
      }));
      notify(t('{n} batidas marcadas · {bpm} BPM', { n: beats.length, bpm: Math.round(result.bpm) }));
      return { beats, span };
    } catch (error) {
      notify(t('Não foi possível ouvir o áudio: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
      return null;
    } finally {
      setBusy(null);
    }
  };

  /** Corta os clipes da trilha principal nas batidas da música. */
  const beatMontage = async (every: number, fill: boolean, at = currentTime()) => {
    let beats = history.current().beats ?? [];
    if (beats.length < 4) {
      const detected = await markBeats(at);
      if (!detected) return;
      beats = detected.beats;
    }
    let cuts = 0;
    setProject((p) => {
      const result = fitToBeats(p, beats, every, fill);
      cuts = result?.cuts ?? 0;
      return result?.project ?? p;
    });
    notify(
      cuts ? t('Montagem no ritmo: {n} clipes, cada um trocando em cima de uma batida.', { n: cuts }) : t('Coloque vídeos ou imagens na trilha principal para montar no ritmo.'),
      cuts === 0,
    );
  };

  /** Gera (ou reaproveita) a mídia de cada efeito sonoro. */
  const soundMedia = async (ids: string[]): Promise<Map<string, MediaItem>> => {
    const result = new Map<string, MediaItem>();
    for (const id of new Set(ids)) {
      const existing = history.current().media.find((m) => m.sfx === id);
      const sound = getSound(id);
      if (existing) result.set(id, existing);
      else if (sound) {
        const media: MediaItem = { ...(await importMedia(await soundFile(id))), name: sound.name, sfx: id };
        void analyzeMedia(media);
        result.set(id, media);
      }
    }
    return result;
  };

  const addSound = async (sound: SoundEffect, at = currentTime(), track?: number) => {
    try {
      const media = (await soundMedia([sound.id])).get(sound.id);
      if (!media) return;
      const clip = createAudioClip(media, at);
      setProject((p) => {
        const next = p.media.some((m) => m.id === media.id) ? p : addMedia(p, [media]);
        // Solto numa trilha livre: fica nela; senão vai para a trilha de efeitos sonoros.
        const target = track === undefined ? undefined : next.audioTracks[track];
        const free = target && !target.clips.some((c) => clip.start < c.start + clipLength(c) && clip.start + clipLength(clip) > c.start);
        if (target && free) return { ...next, audioTracks: next.audioTracks.map((tr, i) => (i === track ? { ...tr, clips: [...tr.clips, clip] } : tr)) };
        return placeSfxClip(next, clip);
      });
      setSelection({ kind: 'audio', id: clip.id });
    } catch (error) {
      notify(t('Não foi possível gerar o som: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    }
  };

  /** Trecho da música gerada: o item selecionado na timeline (se tiver 2 s ou mais) ou o vídeo inteiro. */
  const musicRange = (): { start: number; duration: number; selected: boolean } => {
    const tl = layoutProject(project);
    let span: { start: number; length: number } | null = null;
    if (selection?.kind === 'clip') {
      const l = tl.clips.find((c) => c.clip.id === selection.id);
      if (l) span = { start: l.start, length: l.length };
    } else if (selection?.kind === 'audio') {
      const found = findAudioClip(project, selection.id);
      if (found) span = { start: found.clip.start, length: clipLength(found.clip) };
    } else if (selection?.kind === 'text') {
      const found = findTextClip(project, selection.id);
      if (found) span = { start: found.clip.start, length: found.clip.duration };
    }
    if (span && span.length >= 2) return { start: span.start, duration: span.length, selected: true };
    const total = tl.videoDuration || tl.duration;
    return { start: 0, duration: total >= 2 ? total : 30, selected: false };
  };

  /** Compõe a música (sem direitos autorais) e põe na trilha de música, com as batidas já marcadas. */
  const addGeneratedMusic = async (options: MusicOptions, start: number) => {
    try {
      setBusy(t('Compondo a música… {n}%', { n: 0 }));
      const music = await generateMusic(options, (f) => setBusy(t('Compondo a música… {n}%', { n: Math.round(f * 100) })));
      const media = await importMedia(music.file);
      void analyzeMedia(media);
      // O Lumiar compôs a música: "Marcar as batidas" e "Encaixar a música" usam as batidas exatas.
      rememberBeats(media.file, { beats: music.plan.beats, bpm: music.plan.bpm });
      const clip = createAudioClip(media, start);
      setProject((p) => placeGeneratedMusic(p, media, start, music.plan.beats, clip));
      setSelection({ kind: 'audio', id: clip.id });
      notify(
        t('Música de {seconds}s ({bpm} BPM) na trilha de música, com as batidas marcadas. Foi composta pelo Lumiar: é sua, sem direitos autorais.', {
          seconds: options.duration.toFixed(1),
          bpm: Math.round(music.plan.bpm),
        }),
      );
    } catch (error) {
      notify(t('Não foi possível gerar a música: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  return { normalizeAudio, fitMusic, splitVoice, syncAudioClip, cleanAudio, cutSilences, musicAt, markBeats, beatMontage, addSound, musicRange, addGeneratedMusic };
}
