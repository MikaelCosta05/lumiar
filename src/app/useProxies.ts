import { useEffect, useRef, useState, type RefObject } from 'react';
import { t } from '../i18n';
import { assets } from '../media/assets';
import { makeProxy, needsProxy } from '../media/proxy';
import type { Player } from '../preview/player';
import type { MediaItem } from '../project/model';

/** Prévia leve: cópias em 540p para editar vídeos pesados (a preferência fica lembrada). */
export function useProxies(media: MediaItem[], playerRef: RefObject<Player | null>, notify: (text: string, error?: boolean) => void) {
  const [proxyMode, setProxyMode] = useState(() => {
    try {
      return localStorage.getItem('lumiar:proxies') === '1';
    } catch {
      return false;
    }
  });
  const [proxyJob, setProxyJob] = useState<string | null>(null);
  const proxyQueue = useRef<Set<string>>(new Set());
  useEffect(() => {
    try {
      localStorage.setItem('lumiar:proxies', proxyMode ? '1' : '0');
    } catch {
      // Sem armazenamento: vale só nesta sessão.
    }
    if (!proxyMode) return;
    const pending = media.filter((m) => needsProxy(m) && !assets.proxies.has(m.id) && !proxyQueue.current.has(m.id));
    if (pending.length === 0) return;
    pending.forEach((m) => proxyQueue.current.add(m.id));
    void (async () => {
      for (const media of pending) {
        try {
          setProxyJob(t('Prévia leve: {name} {n}%', { name: media.name, n: 0 }));
          const url = await makeProxy(media, (f) => setProxyJob(t('Prévia leve: {name} {n}%', { name: media.name, n: Math.round(f * 100) })));
          assets.proxies.set(media.id, url);
          playerRef.current?.refreshSources();
        } catch (error) {
          notify(
            t('Não foi possível criar a prévia leve de "{name}": {error}', { name: media.name, error: error instanceof Error ? error.message : String(error) }),
            true,
          );
        } finally {
          proxyQueue.current.delete(media.id);
        }
      }
      setProxyJob(null);
    })();
  }, [proxyMode, media, notify]);
  return { proxyMode, setProxyMode, proxyJob };
}
