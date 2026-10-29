import { useSyncExternalStore } from 'react';

/**
 * Qual clipe está com a seleção de objeto aberta no preview. Fica fora do App para os menus e o
 * painel abrirem a seleção sem precisar passar mais uma função por todo lado.
 */
export type ObjectPickTarget = { kind: 'clip' | 'overlay'; id: string };

let target: ObjectPickTarget | null = null;
const listeners = new Set<() => void>();

const set = (next: ObjectPickTarget | null) => {
  target = next;
  listeners.forEach((l) => l());
};

/** Abre a seleção de objeto no preview para o clipe. */
export function startObjectPick(next: ObjectPickTarget): void {
  set(next);
}

export function stopObjectPick(): void {
  set(null);
}

export function useObjectPick(): ObjectPickTarget | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => target,
  );
}
