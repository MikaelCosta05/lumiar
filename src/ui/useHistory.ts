import { useCallback, useRef, useState } from 'react';

/** Mudanças mais próximas que isso viram um passo só (arrastar um slider, puxar uma borda...). */
const MERGE_WINDOW_MS = 600;
const LIMIT = 200;

/** Estado com desfazer/refazer. Cada estado é imutável, então guardar a referência basta. */
export function useHistory<T>(initial: () => T) {
  const [state, setState] = useState(initial);
  const current = useRef(state);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const lastChange = useRef(0);

  const update = useCallback((updater: (value: T) => T) => {
    const prev = current.current;
    const next = updater(prev);
    if (next === prev) return;
    const now = performance.now();
    if (now - lastChange.current > MERGE_WINDOW_MS) {
      past.current.push(prev);
      if (past.current.length > LIMIT) past.current.shift();
    }
    future.current = [];
    lastChange.current = now;
    current.current = next;
    setState(next);
  }, []);

  const getCurrent = useCallback(() => current.current, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current.push(current.current);
    current.current = prev;
    lastChange.current = 0;
    setState(prev);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(current.current);
    current.current = next;
    lastChange.current = 0;
    setState(next);
  }, []);

  /** Troca o estado e apaga o histórico (abrir ou criar projeto). */
  const reset = useCallback((value: T) => {
    past.current = [];
    future.current = [];
    lastChange.current = 0;
    current.current = value;
    setState(value);
  }, []);

  /** Aplica uma transformação em todos os estados guardados, sem criar passo novo. */
  const rewrite = useCallback((fn: (value: T) => T) => {
    past.current = past.current.map(fn);
    future.current = future.current.map(fn);
    current.current = fn(current.current);
    setState(current.current);
  }, []);

  return {
    /** Estado mais recente, mesmo dentro de funções antigas (depois de um await). */
    current: getCurrent,
    state,
    update,
    undo,
    redo,
    reset,
    rewrite,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
