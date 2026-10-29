import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PrompterClock, prompterProgress } from './Teleprompter';
import { t } from '../i18n';

/**
 * Abre a janelinha do roteiro (no programa instalado ela fica por cima de tudo, até do que está
 * sendo gravado). Precisa ser chamada a partir de um clique. Devolve null se o navegador bloquear.
 */
export function openPrompterWindow(): Window | null {
  const win = window.open('', 'lumiar-roteiro', 'popup,width=620,height=300');
  if (!win) return null;
  win.document.title = t('Roteiro · Lumiar');
  win.document.body.style.cssText = 'margin:0;background:#000;overflow:hidden;font-family:system-ui,sans-serif';
  return win;
}

/**
 * Roteiro rolando numa janela separada durante a gravação da tela. No modo "acompanhar a voz",
 * só anda enquanto o microfone ouve a pessoa falando.
 */
export function FloatingPrompter({
  win,
  script,
  wordsPerMinute,
  follow,
  level,
  onClosed,
}: {
  win: Window;
  script: string;
  wordsPerMinute: number;
  follow: boolean;
  /** Volume do microfone agora (0 a 1) */
  level: () => number;
  onClosed: () => void;
}) {
  const [read, setRead] = useState(0);
  const [size, setSize] = useState({ box: 0, content: 0 });
  const content = useRef<HTMLDivElement>(null);
  const text = script.trim();

  useEffect(() => {
    const clock = new PrompterClock(follow);
    const started = performance.now();
    const timer = setInterval(() => {
      if (win.closed) {
        clearInterval(timer);
        onClosed();
        return;
      }
      setRead(clock.tick((performance.now() - started) / 1000, level()));
    }, 80);
    return () => clearInterval(timer);
  }, [win, follow]);

  useLayoutEffect(() => {
    const measure = () => setSize({ box: win.innerHeight, content: content.current?.scrollHeight ?? 0 });
    measure();
    win.addEventListener('resize', measure);
    return () => win.removeEventListener('resize', measure);
  }, [win, text]);

  const progress = prompterProgress(text, wordsPerMinute, read);
  const offset = size.box / 2 - progress * size.content;
  const fontPx = Math.max(18, Math.round(Math.min(win.innerWidth / 18, 40)));

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: '#000', color: '#fff', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: fontPx * 1.6,
          transform: 'translateY(-50%)',
          background: 'rgba(255,181,71,0.12)',
          borderTop: '1px solid rgba(255,181,71,0.4)',
          borderBottom: '1px solid rgba(255,181,71,0.4)',
        }}
      />
      <div
        ref={content}
        style={{
          whiteSpace: 'pre-wrap',
          textAlign: 'center',
          padding: '0 28px',
          fontSize: fontPx,
          fontWeight: 600,
          lineHeight: `${fontPx * 1.6}px`,
          transform: `translateY(${offset - (fontPx * 1.6) / 2}px)`,
          transition: 'transform 100ms linear',
        }}
      >
        {text}
      </div>
      <div style={{ position: 'absolute', left: 10, bottom: 8, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
        {follow ? t('Rola enquanto você fala · pare de falar e ele espera') : t('{n} palavras por minuto', { n: wordsPerMinute })}
      </div>
    </div>,
    win.document.body,
  );
}
