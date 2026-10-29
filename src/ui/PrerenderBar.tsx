import { useMemo, useSyncExternalStore } from 'react';
import { prerenderCache } from '../preview/prerenderCache';
import { mergeSpans } from '../project/prerender';

/**
 * Faixa fina no topo da régua: verde onde o trecho está pré-renderizado (toca liso), cinza onde
 * foi pré-renderizado mas o projeto mudou ali (não é usado até ser renderizado de novo).
 */
export function PrerenderBar({ pxPerSecond }: { pxPerSecond: number }) {
  const view = useSyncExternalStore(prerenderCache.subscribe, prerenderCache.getView);
  const { valid, stale } = useMemo(() => {
    const valid = mergeSpans(view.filter((v) => v.valid));
    // Onde há um trecho válido por cima, o desatualizado nem aparece.
    const stale = mergeSpans(view.filter((v) => !v.valid && !valid.some((s) => v.start >= s.start && v.end <= s.end)));
    return { valid, stale };
  }, [view]);
  return (
    <>
      {stale.map((s) => (
        <span
          key={`stale-${s.start}`}
          className="pointer-events-none absolute top-0 h-[3px] rounded-full bg-line-strong"
          style={{ left: s.start * pxPerSecond, width: (s.end - s.start) * pxPerSecond }}
        />
      ))}
      {valid.map((s) => (
        <span
          key={`ok-${s.start}`}
          className="pointer-events-none absolute top-0 h-[3px] rounded-full bg-success"
          style={{ left: s.start * pxPerSecond, width: (s.end - s.start) * pxPerSecond }}
        />
      ))}
    </>
  );
}
