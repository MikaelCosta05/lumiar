import { useSyncExternalStore } from 'react';

/**
 * Pedidos das ferramentas de rastreamento (trocar a tela, máscara que acompanha, corte casado).
 * Fica fora do App, como a seleção de objeto: os menus e o painel abrem a ferramenta sem precisar
 * passar mais uma função por todo lado. Quem faz o trabalho é o TrackingTools, no preview.
 */
export type TrackingRequest =
  /** Marcar/ajustar os cantos da tela trocada de uma sobreposição */
  | { kind: 'corners'; id: string }
  /** Clicar no ponto que a forma da sobreposição vai acompanhar */
  | { kind: 'maskPoint'; id: string }
  /** Rastrear o centro da forma da sobreposição (sem clicar) */
  | { kind: 'maskCenter'; id: string }
  /** Corte casado entre o clipe `index` e o seguinte da trilha principal */
  | { kind: 'matchCut'; index: number };

let current: TrackingRequest | null = null;
const listeners = new Set<() => void>();

export function requestTracking(next: TrackingRequest | null): void {
  current = next;
  listeners.forEach((l) => l());
}

export function useTrackingRequest(): TrackingRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
