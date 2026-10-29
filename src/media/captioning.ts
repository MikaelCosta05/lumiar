import { assetUrl } from '../assetUrl';
import { t } from '../i18n';
import { groupWords, type Caption } from '../project/captions';
import { layoutProject, type Project } from '../project/model';
import { mixAudio } from './exporter';
import type { TranscribeMessage, TranscribeRequest } from './transcribe.worker';

export const CAPTION_MODELS = [
  { id: 'Xenova/whisper-tiny', label: t('Rápida'), size: '~40 MB' },
  { id: 'Xenova/whisper-base', label: t('Equilibrada'), size: '~80 MB' },
  { id: 'Xenova/whisper-small', label: t('Precisa'), size: '~250 MB' },
];

export const CAPTION_LANGUAGES: { id: string | null; label: string }[] = [
  { id: 'portuguese', label: t('Português') },
  { id: 'english', label: t('Inglês') },
  { id: 'spanish', label: t('Espanhol') },
  { id: 'french', label: t('Francês') },
  { id: null, label: t('Detectar sozinho') },
];

export type CaptionProgress = (stage: string, fraction: number | null) => void;

let worker: Worker | null = null;

/**
 * Ouve todo o áudio do projeto (vídeos + trilhas de áudio, já mixados) e devolve as legendas
 * com o tempo de cada palavra. O modelo é baixado só na primeira vez (fica no cache do navegador).
 */
export async function transcribeProject(
  project: Project,
  options: { model: string; language: string | null; maxWords: number; translate?: boolean },
  onProgress: CaptionProgress,
): Promise<Caption[]> {
  onProgress(t('Preparando o áudio'), null);
  const mixed = await mixAudio(project, layoutProject(project));
  if (!mixed) throw new Error(t('Este projeto não tem áudio para legendar.'));

  // O Whisper trabalha com áudio mono a 16 kHz.
  const context = new OfflineAudioContext(1, Math.ceil(mixed.duration * 16000), 16000);
  const source = context.createBufferSource();
  source.buffer = mixed;
  source.connect(context.destination);
  source.start();
  const audio = new Float32Array((await context.startRendering()).getChannelData(0));

  worker ??= new Worker(new URL('./transcribe.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  return new Promise((resolve, reject) => {
    w.onmessage = (event: MessageEvent<TranscribeMessage>) => {
      const msg = event.data;
      if (msg.type === 'download') onProgress(t('Carregando o modelo de fala'), msg.fraction);
      else if (msg.type === 'transcribing') onProgress(msg.device === 'webgpu' ? t('Reconhecendo a fala (placa de vídeo)') : t('Reconhecendo a fala'), null);
      else if (msg.type === 'error') reject(new Error(msg.message));
      else {
        const words = msg.chunks
          .map((c) => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 0.3 }))
          .filter((word) => word.text && Number.isFinite(word.start));
        resolve(groupWords(words, options.maxWords));
      }
    };
    w.onerror = (event) => reject(new Error(event.message || t('Falha no reconhecimento de fala.')));
    const request: TranscribeRequest = { audio, model: options.model, language: options.language, baseUrl: assetUrl(''), translate: options.translate };
    w.postMessage(request, [audio.buffer]);
  });
}
