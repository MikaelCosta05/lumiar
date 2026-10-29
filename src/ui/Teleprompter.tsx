import { Square } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { VoiceSession } from './VoicePanel';
import { t } from '../i18n';

/** Volume do microfone acima do qual conta como "falando". */
const VOICE_LEVEL = 0.06;

/**
 * Relógio do roteiro. No modo "acompanhar a voz", ele só anda enquanto a pessoa fala (com uma folga
 * de meio segundo para as pausas entre as palavras): parou de falar, o texto espera.
 */
export class PrompterClock {
  private spoken = 0;
  private last = 0;
  private lastVoice = -Infinity;

  constructor(private readonly follow: boolean) {}

  /** Avança até `elapsed` (s desde o começo) com o volume atual; devolve o tempo "de leitura". */
  tick(elapsed: number, level: number): number {
    const dt = Math.max(0, Math.min(0.5, elapsed - this.last));
    this.last = elapsed;
    if (!this.follow) return elapsed;
    if (level > VOICE_LEVEL) this.lastVoice = elapsed;
    if (elapsed - this.lastVoice < 0.5) this.spoken += dt;
    return this.spoken;
  }
}

/** Fração do roteiro já lida, na velocidade de leitura escolhida. */
export function prompterProgress(script: string, wordsPerMinute: number, readSeconds: number): number {
  const words = script.trim() ? script.trim().split(/\s+/).length : 0;
  const readTime = Math.max(1, (words / wordsPerMinute) * 60);
  return Math.min(1, readSeconds / readTime);
}

/**
 * Por cima do preview durante a gravação: contagem regressiva grande e o roteiro
 * rolando na velocidade de leitura escolhida (a linha do meio é a que se lê agora).
 */
export function Teleprompter({
  session,
  script,
  wordsPerMinute,
  follow,
  onStop,
}: {
  session: VoiceSession;
  script: string;
  wordsPerMinute: number;
  /** Só rolar enquanto a pessoa fala */
  follow: boolean;
  onStop: () => void;
}) {
  const clock = useRef<PrompterClock | null>(null);
  if (session.phase !== 'recording') clock.current = null;
  else clock.current ??= new PrompterClock(follow);
  const read = clock.current ? clock.current.tick(session.elapsed, session.level) : 0;
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ box: 0, content: 0 });
  const text = script.trim();

  useLayoutEffect(() => {
    setSize({ box: box.current?.clientHeight ?? 0, content: content.current?.scrollHeight ?? 0 });
  }, [text]);

  const progress = session.phase === 'recording' ? prompterProgress(text, wordsPerMinute, read) : 0;
  // Começa com a primeira linha no meio da caixa e termina com a última no meio.
  const offset = size.box / 2 - progress * size.content;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-end p-6">
      {session.phase === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span key={session.countdown} className="animate-pop-in text-[120px] font-black text-white drop-shadow-[0_6px_30px_rgba(0,0,0,0.8)]">
            {session.countdown}
          </span>
        </div>
      )}

      {text && (
        <div ref={box} className="relative mb-3 h-[38%] w-full max-w-3xl overflow-hidden rounded-2xl bg-black/70 backdrop-blur-sm">
          {/* Faixa que marca a linha da vez */}
          <div className="absolute inset-x-0 top-1/2 h-12 -translate-y-1/2 border-y border-amber/40 bg-amber/10" />
          <div
            ref={content}
            className="whitespace-pre-wrap px-8 text-center text-2xl font-semibold leading-[48px] text-white transition-transform duration-100 ease-linear"
            style={{ transform: `translateY(${offset - 24}px)` }}
          >
            {text}
          </div>
          <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/80 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 to-transparent" />
        </div>
      )}

      <button
        onClick={onStop}
        className="pointer-events-auto flex items-center gap-2 rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white shadow-xl shadow-danger/30 transition hover:brightness-110"
      >
        <span className="size-2 animate-pulse rounded-full bg-white" />
        {session.phase === 'countdown' ? t('Cancelar') : `${session.mode === 'dub' ? t('Dublando') : t('Gravando')} ${Math.floor(session.elapsed)}s`}
        <Square size={12} fill="currentColor" />
      </button>
    </div>
  );
}
