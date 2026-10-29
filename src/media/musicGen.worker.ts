/// <reference lib="webworker" />
import { renderMusic, type MusicOptions } from './musicGen';

/** Compõe a música fora da tela principal: alguns minutos de música levam alguns segundos. */
self.onmessage = async (event: MessageEvent<{ id: number; options: MusicOptions }>) => {
  const { id, options } = event.data;
  try {
    let last = 0;
    const music = await renderMusic(options, (fraction) => {
      if (fraction - last < 0.02 && fraction < 1) return;
      last = fraction;
      self.postMessage({ id, progress: fraction });
    });
    self.postMessage({ id, music }, [music.channels[0].buffer, music.channels[1].buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
