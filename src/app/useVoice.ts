import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { DEFAULT_CAPTION_MODEL, transcribeProject } from '../media/captioning';
import { analyzeMedia, importMedia } from '../media/importer';
import { VoiceRecorder } from '../media/recorder';
import { speak } from '../media/speech';
import { addMedia, createAudioClip, layoutProject, placeVoiceClip, uid, updateClip, updateOverlayClip } from '../project/model';
import { savedRecordOptions, type RecordOptions, type VoiceSession } from '../ui/VoicePanel';
import type { EditorContext } from './context';

/** Voz: narração, dublagem e voz sintética. */
export function useVoice({ history, project, timeline, setProject, setSelection, notify, setBusy, playerRef, currentTime }: EditorContext) {
  /** Gravação de voz em andamento (o que a interface mostra) e os dados dela */
  const [session, setSession] = useState<VoiceSession | null>(null);
  const voiceRef = useRef<{
    recorder: VoiceRecorder;
    start: number;
    until: number | null;
    options: RecordOptions;
    startedAt: number;
    recording: boolean;
  } | null>(null);
  const [speaking, setSpeaking] = useState<string | null>(null);

  /** Começa a gravar (narração no cursor ou dublagem no trecho de um clipe). */
  const startRecording = async (options: RecordOptions) => {
    const player = playerRef.current;
    if (!player || voiceRef.current) return;
    player.pause();
    let from = currentTime();
    let until: number | null = null;
    if (options.dub) {
      const target = options.dub;
      const layout =
        target.kind === 'clip'
          ? timeline.clips.find((l) => l.clip.id === target.id)
          : timeline.overlays.find((l) => l.clip.id === target.id);
      if (!layout) return;
      from = layout.start;
      until = layout.start + layout.length;
      if (options.muteOriginal && layout.media.hasAudio && !layout.clip.audioDetached) {
        if (target.kind === 'clip') setProject((p) => updateClip(p, target.id, (c) => ({ ...c, volume: 0 })));
        else setProject((p) => updateOverlayClip(p, target.id, (c) => ({ ...c, volume: 0 })));
      }
    }
    let recorder: VoiceRecorder;
    try {
      recorder = await VoiceRecorder.open(options.deviceId);
    } catch (error) {
      notify(t('Não foi possível usar o microfone: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
      return;
    }
    const mode = options.dub ? 'dub' : 'narration';
    const state = { recorder, start: from, until, options, startedAt: 0, recording: false };
    voiceRef.current = state;
    player.seek(from);
    if (options.muteProject) player.setMuted(true);
    if (options.countdown) {
      for (let n = 3; n > 0; n--) {
        if (voiceRef.current !== state) return;
        setSession({ mode, phase: 'countdown', countdown: n, elapsed: 0, level: recorder.level() });
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (voiceRef.current !== state) return;
    }
    recorder.begin();
    player.play();
    state.startedAt = performance.now();
    state.recording = true;
    setSession({ mode, phase: 'recording', countdown: 0, elapsed: 0, level: 0 });
  };

  /** Para a gravação e coloca a voz numa trilha de narração, no ponto onde começou. */
  const stopRecording = async () => {
    const state = voiceRef.current;
    if (!state) return;
    voiceRef.current = null;
    setSession(null);
    playerRef.current?.pause();
    playerRef.current?.setMuted(false);
    if (!state.recording) {
      state.recorder.cancel();
      return;
    }
    try {
      setBusy(t('Salvando a gravação…'));
      const kind = state.options.dub ? 'Dublagem' : 'Narração';
      const count = project.media.filter((m) => m.name.startsWith(kind)).length + 1;
      const media = await importMedia(await state.recorder.stop(`${kind} ${count}`));
      void analyzeMedia(media);
      const clip = createAudioClip(media, state.start);
      // Na dublagem, a voz não passa do fim do clipe.
      if (state.until !== null) clip.trimOut = Math.min(media.duration, state.until - state.start);
      setProject((p) => placeVoiceClip(addMedia(p, [media]), clip));
      setSelection({ kind: 'audio', id: clip.id });
      notify(state.options.dub ? t('Dublagem adicionada na trilha "Narração".') : t('Narração adicionada na trilha "Narração".'));
    } catch (error) {
      notify(t('Não foi possível salvar a gravação: {error}', { error: String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  /** R: começa a narração com as opções salvas, ou para a gravação em andamento. */
  const toggleVoice = () => void (voiceRef.current ? stopRecording() : startRecording(savedRecordOptions()));

  // Relógio, medidor de nível e fim automático da dublagem.
  useEffect(() => {
    if (session?.phase !== 'recording') return;
    const timer = setInterval(() => {
      const state = voiceRef.current;
      if (!state?.recording) return;
      setSession((s) => s && { ...s, elapsed: (performance.now() - state.startedAt) / 1000, level: state.recorder.level() });
      if (state.until !== null && (playerRef.current?.currentTime ?? 0) >= state.until - 0.02) void stopRecording();
    }, 80);
    return () => clearInterval(timer);
  }, [session?.phase]);

  /** Gera voz sintética e coloca na trilha de narração (textos longos viram vários clipes em sequência). */
  const speakText = async (text: string, voice: string, at = currentTime()) => {
    const parts = splitSentences(text);
    if (parts.length === 0) return;
    let pos = at;
    let lastId: string | null = null;
    try {
      for (let i = 0; i < parts.length; i++) {
        setSpeaking(parts.length > 1 ? t('Gerando a voz… {n} de {total}', { n: i + 1, total: parts.length }) : t('Gerando a voz…'));
        const file = await speak(parts[i], voice, (f) => setSpeaking(t('Carregando a voz… {n}%', { n: Math.round(f * 100) })));
        const media = await importMedia(file);
        void analyzeMedia(media);
        const clip = createAudioClip(media, pos);
        pos += media.duration;
        lastId = clip.id;
        setProject((p) => placeVoiceClip(addMedia(p, [media]), clip));
      }
      if (lastId) setSelection({ kind: 'audio', id: lastId });
      notify(parts.length > 1 ? t('{n} trechos de voz adicionados.', { n: parts.length }) : t('Voz adicionada na trilha "Narração".'));
    } catch (error) {
      notify(t('Não foi possível gerar a voz: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setSpeaking(null);
    }
  };

  /** Dublagem automática: cada legenda vira uma fala sintética no tempo dela. */
  const speakCaptions = async (voice: string) => {
    const captions = project.captions?.captions ?? [];
    try {
      for (let i = 0; i < captions.length; i++) {
        setSpeaking(t('Dublando as legendas… {n} de {total}', { n: i + 1, total: captions.length }));
        const media = await importMedia(await speak(captions[i].text, voice));
        void analyzeMedia(media);
        const clip = createAudioClip(media, Math.max(0, captions[i].start - 0.15));
        setProject((p) => placeVoiceClip(addMedia(p, [media]), clip));
      }
      notify(t('{n} falas criadas a partir das legendas.', { n: captions.length }));
    } catch (error) {
      notify(t('Não foi possível dublar: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setSpeaking(null);
    }
  };

  /**
   * Dublagem traduzida: o Whisper ouve o vídeo e escreve a fala em inglês; cada frase vira uma fala
   * sintética em inglês no mesmo instante (acelerada se não couber) e o som original fica bem baixo.
   */
  const dubInEnglish = async () => {
    const p = history.current();
    if (layoutProject(p).duration === 0) return notify(t('Coloque um vídeo com fala na timeline primeiro.'), true);
    try {
      setSpeaking(t('Ouvindo e traduzindo a fala…'));
      const phrases = await transcribeProject(p, { model: DEFAULT_CAPTION_MODEL, language: null, maxWords: 14, translate: true }, (stage, fraction) =>
        setSpeaking(`${stage}${fraction === null ? '' : ` · ${Math.round(fraction * 100)}%`}`),
      );
      if (phrases.length === 0) return notify(t('Não encontrei fala para traduzir.'), true);
      const trackId = uid();
      setProject((q) => ({
        ...q,
        audioTracks: [...q.audioTracks, { id: trackId, name: t('Dublagem (inglês)'), muted: false, kind: 'voice' as const, clips: [] }],
        // O som original fica baixinho por baixo (como nas dublagens de verdade).
        clips: q.clips.map((c) => ({ ...c, volume: Math.min(c.volume, 0.15) })),
      }));
      for (let i = 0; i < phrases.length; i++) {
        setSpeaking(t('Dublando em inglês… {n} de {total}', { n: i + 1, total: phrases.length }));
        const media = await importMedia(await speak(phrases[i].text, 'Xenova/mms-tts-eng'));
        void analyzeMedia(media);
        // Se a fala não cabe até a próxima frase, ela é acelerada um pouco (até 1,5×).
        const room = (phrases[i + 1]?.start ?? Infinity) - phrases[i].start;
        const speed = Math.min(1.5, Math.max(1, media.duration / Math.max(0.3, room)));
        const clip = { ...createAudioClip(media, phrases[i].start), speed: speed > 1.02 ? Math.round(speed * 100) / 100 : undefined };
        setProject((q) => ({
          ...addMedia(q, [media]),
          audioTracks: q.audioTracks.map((tr) => (tr.id === trackId ? { ...tr, clips: [...tr.clips, clip] } : tr)),
        }));
      }
      notify(t('Vídeo dublado em inglês: {n} falas na trilha "Dublagem (inglês)". O som original ficou a 15%.', { n: phrases.length }));
    } catch (error) {
      notify(t('Não foi possível dublar: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setSpeaking(null);
    }
  };

  return { session, voiceRef, speaking, startRecording, stopRecording, toggleVoice, speakText, speakCaptions, dubInEnglish };
}

/** Divide um texto longo em frases (a voz sintética funciona melhor com trechos curtos). */
function splitSentences(text: string): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?…;:])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Junta frases curtas até ~180 letras.
  const parts: string[] = [];
  for (const sentence of sentences) {
    const last = parts[parts.length - 1];
    if (last && last.length + sentence.length < 180) parts[parts.length - 1] = `${last} ${sentence}`;
    else parts.push(sentence);
  }
  return parts;
}
