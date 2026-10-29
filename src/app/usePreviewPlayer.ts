import { useEffect, useState, type RefObject } from 'react';
import { WebGL2Unavailable } from '../engine/gl';
import { Renderer } from '../engine/renderer';
import { t } from '../i18n';
import { Player } from '../preview/player';

/**
 * Situação da placa de vídeo no preview: 'lost' = o contexto do WebGL caiu e esperamos ele voltar,
 * 'failed' = voltou mas não deu para recriar o motor, 'unsupported' = não há WebGL2.
 */
export type GpuState = 'ok' | 'lost' | 'failed' | 'unsupported';

/** Cria o motor de renderização e o player uma única vez, no canvas do preview. */
export function usePreviewPlayer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  playerRef: RefObject<Player | null>,
  notify: (text: string, error?: boolean) => void,
) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [gpu, setGpu] = useState<GpuState>('ok');

  useEffect(() => {
    let renderer: Renderer;
    try {
      renderer = new Renderer(canvasRef.current!, 1280, 720);
    } catch (error) {
      if (error instanceof WebGL2Unavailable) setGpu('unsupported');
      else notify(String(error instanceof Error ? error.message : error), true);
      return;
    }
    renderer.onShaderError = (plugin, message) => notify(t('Erro no shader "{name}": {error}', { name: t(plugin.name), error: message }), true);
    const player = new Player(renderer);
    player.onTime = setTime;
    player.onPlayingChange = setPlaying;
    // Sem o contexto o quadro congela: pausa e avisa até a placa de vídeo devolver.
    renderer.onContextLost = () => {
      player.pause();
      setGpu('lost');
    };
    renderer.onContextRestored = (error) => {
      if (error) {
        console.error(error);
        setGpu('failed');
        return;
      }
      setGpu('ok');
      player.refresh();
      notify(t('A placa de vídeo voltou a responder e o preview foi recuperado.'));
    };
    playerRef.current = player;
    return () => {
      player.dispose();
      renderer.dispose();
      playerRef.current = null;
    };
  }, [notify]);

  return { time, playing, gpu };
}
