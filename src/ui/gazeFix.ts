import { useSyncExternalStore } from 'react';

/**
 * Qual clipe está sendo analisado para corrigir o olhar. Fica fora do App (como a seleção de objeto)
 * para o menu abrir a análise sem passar mais uma função por todo lado.
 */
export type GazeFixTarget = { kind: 'clip' | 'overlay'; id: string };

let target: GazeFixTarget | null = null;
const listeners = new Set<() => void>();

const set = (next: GazeFixTarget | null) => {
  target = next;
  listeners.forEach((l) => l());
};

/** Começa a análise dos olhos do clipe (clique direito → Corrigir o olhar…). */
export function startGazeFix(next: GazeFixTarget): void {
  set(next);
}

export function stopGazeFix(): void {
  set(null);
}

export function useGazeFix(): GazeFixTarget | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => target,
  );
}
