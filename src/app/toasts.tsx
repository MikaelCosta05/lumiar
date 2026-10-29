import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useCallback, useState } from 'react';
import { cx } from '../ui/kit';

export interface Toast {
  id: number;
  text: string;
  error?: boolean;
}

/** Avisos no canto da tela: somem sozinhos (os de erro ficam mais tempo). */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, error }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), error ? 8000 : 3500);
  }, []);
  return { toasts, notify };
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'flex animate-toast-in items-start gap-2.5 rounded-xl border bg-panel-2/95 px-3.5 py-3 text-xs shadow-2xl backdrop-blur',
            t.error ? 'border-danger/40' : 'border-line',
          )}
        >
          {t.error ? (
            <TriangleAlert size={15} className="mt-px shrink-0 text-danger" />
          ) : (
            <CircleCheck size={15} className="mt-px shrink-0 text-success" />
          )}
          <span className="whitespace-pre-wrap leading-relaxed">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
