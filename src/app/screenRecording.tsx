import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { analyzeMedia, importMedia } from '../media/importer';
import { ScreenRecorder, type ScreenRecordOptions } from '../media/screenRecorder';
import { createCamera } from '../project/camera';
import { cursorZoomKeyframes, DEFAULT_CURSOR_FX } from '../project/cursorFx';
import { addMedia, createOverlayClip, createVideoClip, insertVideoClips, layoutProject, placeOverlayClip } from '../project/model';
import { FloatingPrompter, openPrompterWindow } from '../ui/FloatingPrompter';
import { formatTime } from '../ui/format';
import { Button } from '../ui/kit';
import { getVoicePrefs } from '../ui/voicePrefs';
import type { EditorContext } from './context';

export type ScreenRecording = ReturnType<typeof useScreenRecording>;

/** Gravação da tela: a janela de opções, a gravação em andamento e a janelinha do roteiro. */
export function useScreenRecording({ project, setProject, setSelection, notify, setBusy, playerRef }: EditorContext) {
  const [screenDialog, setScreenDialog] = useState(false);
  const [screenRec, setScreenRec] = useState<ScreenRecorder | null>(null);
  const [screenElapsed, setScreenElapsed] = useState(0);
  const screenOptions = useRef<ScreenRecordOptions | null>(null);
  /** Janelinha do roteiro durante a gravação da tela */
  const [prompterWin, setPrompterWin] = useState<Window | null>(null);
  const openPrompter = () => {
    const win = openPrompterWindow();
    if (win) setPrompterWin(win);
    else notify(t('O navegador bloqueou a janela do roteiro. Clique em "Roteiro" na barra de gravação.'), true);
  };
  const closePrompter = () => {
    setPrompterWin((win) => {
      if (win && !win.closed) win.close();
      return null;
    });
  };
  useEffect(() => {
    if (!screenRec) return;
    const timer = setInterval(() => setScreenElapsed(screenRec.elapsed), 250);
    return () => clearInterval(timer);
  }, [screenRec]);

  const startScreenRecording = async (options: ScreenRecordOptions) => {
    setScreenDialog(false);
    playerRef.current?.pause();
    try {
      screenOptions.current = options;
      const recorder = await ScreenRecorder.start(options);
      setScreenRec(recorder);
      setScreenElapsed(0);
      if (options.prompter && project.script.trim()) openPrompter();
      if (recorder.missing.length) notify(t('Gravando só a tela: não deu para usar {items}.', { items: recorder.missing.join(t(' nem ')) }), true);
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      notify(
        denied
          ? t('A gravação da tela foi cancelada ou não foi permitida.')
          : t('Não foi possível gravar a tela: {error}', { error: error instanceof Error ? error.message : String(error) }),
        true,
      );
    }
  };

  /** Para a gravação: a tela vai para o fim da trilha principal e a webcam por cima, num canto. */
  const stopScreenRecording = async () => {
    const recorder = screenRec;
    if (!recorder) return;
    setScreenRec(null);
    closePrompter();
    const options = screenOptions.current;
    try {
      setBusy(t('Preparando a gravação…'));
      const files = await recorder.stop();
      const screen = await importMedia(files.screen);
      if (files.cursor) screen.cursor = files.cursor;
      const webcam = files.webcam ? await importMedia(files.webcam) : null;
      const items = webcam ? [screen, webcam] : [screen];
      items.forEach((m) => void analyzeMedia(m));
      const clip = createVideoClip(screen);
      // Mouse: câmera que se aproxima dos cliques e destaque do cursor.
      let zooms = 0;
      if (files.cursor && options?.cursorHighlight) clip.cursorFx = { ...DEFAULT_CURSOR_FX };
      if (files.cursor && options?.cursorZoom) {
        const zoom = cursorZoomKeyframes(files.cursor, clip);
        zooms = zoom.zooms;
        if (zooms) clip.camera = { ...createCamera(), keyframes: zoom.keyframes };
      }
      setProject((p) => {
        let next = insertVideoClips(addMedia(p, items), [clip]);
        if (webcam) {
          const start = layoutProject(next).clips.find((l) => l.clip.id === clip.id)?.start ?? 0;
          // Webcam em pílula no canto de baixo, sem o som (o som já está na gravação da tela).
          const cam = { ...createOverlayClip(webcam, start, { x: 0.83, y: 0.78, scale: 0.3, radius: 0.5 }), volume: 0 };
          next = placeOverlayClip(next, cam);
        }
        return next;
      });
      setSelection({ kind: 'clip', id: clip.id });
      notify(
        (webcam ? t('Gravação adicionada, com a webcam no canto.') : t('Gravação da tela adicionada à timeline.')) +
          (zooms ? ` ${t('{n} zoom(s) onde você clicou (clique direito no clipe → Gravação de tela para ajustar).', { n: zooms })}` : ''),
      );
    } catch (error) {
      notify(t('Não foi possível salvar a gravação: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setBusy(null);
    }
  };

  return {
    screenDialog,
    setScreenDialog,
    screenRec,
    screenElapsed,
    prompterWin,
    setPrompterWin,
    openPrompter,
    startScreenRecording,
    stopScreenRecording,
  };
}

/** Barra "Gravando a tela" no topo e a janelinha do roteiro, enquanto grava. */
export function ScreenRecordingBar({ screen, script }: { screen: ScreenRecording; script: string }) {
  const { screenRec, prompterWin } = screen;
  if (!screenRec) return null;
  return (
    <>
      {prompterWin && (
        <FloatingPrompter
          win={prompterWin}
          script={script}
          wordsPerMinute={getVoicePrefs().prompterSpeed}
          follow={getVoicePrefs().prompterFollow && screenRec.hasMicrophone}
          level={() => screenRec.level()}
          onClosed={() => screen.setPrompterWin(null)}
        />
      )}
      <div className="fixed left-1/2 top-3 z-50 flex -translate-x-1/2 animate-pop-in items-center gap-3 rounded-full border border-danger/50 bg-panel-2/95 py-1.5 pl-4 pr-1.5 shadow-2xl backdrop-blur">
        <span className="size-2.5 animate-pulse rounded-full bg-danger" />
        <span className="text-xs font-medium">{t('Gravando a tela')}</span>
        <span className="font-mono text-xs tabular-nums text-dim">{formatTime(screen.screenElapsed).replace(/\.\d+$/, '')}</span>
        {script.trim() && !prompterWin && (
          <Button className="h-7 px-3 text-xs" onClick={screen.openPrompter}>
            {t('Roteiro')}
          </Button>
        )}
        <Button variant="primary" className="h-7 px-3 text-xs" onClick={() => void screen.stopScreenRecording()}>
          {t('Parar')}
        </Button>
      </div>
    </>
  );
}
