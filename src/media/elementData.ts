/**
 * Alguns elementos animados precisam de dados que chegam depois (o mapa-múndi, a análise do som).
 * Quando chegam, o preview é redesenhado.
 */
const listeners = new Set<() => void>();

export function onElementData(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function elementDataReady(): void {
  listeners.forEach((l) => l());
}
