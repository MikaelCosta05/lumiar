import { LifeBuoy, LoaderCircle, Upload } from 'lucide-react';
import { locale, t } from '../i18n';
import type { AutosaveFound } from '../project/storage';
import { Button } from '../ui/kit';

/** Projeto não salvo encontrado ao abrir o editor: recuperar ou descartar. */
export function RecoveryBanner({ recovery, onRecover, onDiscard }: { recovery: AutosaveFound; onRecover: () => void; onDiscard: () => void }) {
  return (
    <div className="fixed left-1/2 top-16 z-50 flex w-[min(560px,calc(100vw-32px))] -translate-x-1/2 animate-pop-in items-center gap-3 rounded-2xl border border-accent/40 bg-panel-2/95 px-4 py-3 shadow-2xl backdrop-blur">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <LifeBuoy size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t('Recuperar o projeto anterior?')}</p>
        <p className="truncate text-xs text-dim">
          “{recovery.name}” · {t('salvo automaticamente em {date}', { date: new Date(recovery.savedAt).toLocaleString(locale()) })}
        </p>
      </div>
      <Button onClick={onDiscard}>{t('Descartar')}</Button>
      <Button variant="primary" onClick={onRecover}>
        {t('Recuperar')}
      </Button>
    </div>
  );
}

/** "Trabalhando…" por cima de tudo (salvar, abrir, analisar). */
export function BusyOverlay({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-5 py-4 shadow-2xl">
        <LoaderCircle size={18} className="animate-spin text-accent" />
        {text}
      </div>
    </div>
  );
}

/** Arquivos do computador sendo arrastados para a janela. */
export function DropOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-bg/80 p-6 backdrop-blur-sm">
      <div className="flex size-full flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-accent bg-accent/5">
        <Upload size={40} className="text-accent" />
        <p className="text-xl font-semibold">{t('Solte para importar')}</p>
        <p className="text-sm text-dim">{t('Vídeos, músicas e imagens')}</p>
      </div>
    </div>
  );
}
