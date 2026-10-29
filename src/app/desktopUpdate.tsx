import { useEffect, useState } from 'react';
import { desktop, type UpdateInfo } from '../media/screenRecorder';
import { t, tc } from '../i18n';
import { Button } from '../ui/kit';

type UpdateState = UpdateInfo & { progress: number | null };

/** Programa instalado: aviso de versão nova (e o progresso do download). */
export function useDesktopUpdate(notify: (text: string, error?: boolean) => void, isDirty: boolean) {
  const [update, setUpdate] = useState<UpdateState | null>(null);
  useEffect(() => {
    const bridge = desktop();
    if (!bridge?.onUpdate) return;
    bridge.onUpdate((info) => setUpdate({ ...info, progress: null }));
    bridge.onUpdateProgress((fraction) => setUpdate((u) => u && { ...u, progress: fraction }));
  }, []);
  const installUpdate = async () => {
    const bridge = desktop();
    if (!bridge || !update) return;
    if (isDirty && !confirm(t('O Lumiar vai fechar para atualizar. O salvamento automático guarda o projeto e oferece para recuperar ao abrir. Continuar?'))) return;
    setUpdate((u) => u && { ...u, progress: 0 });
    try {
      await bridge.installUpdate();
    } catch (error) {
      setUpdate((u) => u && { ...u, progress: null });
      notify(t('Não foi possível atualizar: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    }
  };
  return { update, installUpdate, dismissUpdate: () => setUpdate(null) };
}

export function UpdateBanner({ update, onInstall, onDismiss }: { update: UpdateState; onInstall: () => void; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 animate-pop-in items-center gap-3 rounded-full border border-accent/50 bg-panel-2/95 py-1.5 pl-4 pr-1.5 text-xs shadow-2xl backdrop-blur">
      <span className="size-2 rounded-full bg-accent" />
      <span title={update.notes || undefined}>
        Lumiar <b>{update.version}</b> {t('disponível')}
        {update.progress !== null && ` · ${t('baixando {n}%', { n: Math.round(update.progress * 100) })}`}
      </span>
      {update.progress === null && (
        <>
          <Button variant="primary" className="h-7 px-3 text-xs" onClick={onInstall}>
            {update.automatic ? t('Atualizar agora') : t('Baixar')}
          </Button>
          <Button className="h-7 px-3 text-xs" onClick={onDismiss}>
            {tc('aviso', 'Depois')}
          </Button>
        </>
      )}
    </div>
  );
}
