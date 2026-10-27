import { useSyncExternalStore } from 'react';
import { VOICES } from '../media/speech';

/** Preferências de gravação de voz, compartilhadas entre o painel Voz e o botão da timeline. */
export interface VoicePrefs {
  deviceId: string;
  /** Nome do microfone escolhido (para mostrar mesmo antes de o navegador listar os aparelhos) */
  deviceLabel: string;
  countdown: boolean;
  muteProject: boolean;
  prompter: boolean;
  prompterSpeed: number;
  muteOriginal: boolean;
  voice: string;
}

const KEY = 'lumiar:voice';

const DEFAULTS: VoicePrefs = {
  deviceId: '',
  deviceLabel: '',
  countdown: true,
  muteProject: false,
  prompter: true,
  prompterSpeed: 140,
  muteOriginal: true,
  voice: VOICES[0].id,
};

function read(): VoicePrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<VoicePrefs>) };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function getVoicePrefs(): VoicePrefs {
  return current;
}

export function setVoicePrefs(patch: Partial<VoicePrefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Sem armazenamento: vale só até fechar.
  }
  listeners.forEach((l) => l());
}

export function useVoicePrefs(): VoicePrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVoicePrefs,
  );
}
