import { MonitorUp, X } from 'lucide-react';
import { useState } from 'react';
import { desktop, type ScreenRecordOptions } from '../media/screenRecorder';
import { t } from '../i18n';
import { Button, IconButton, SwitchRow } from './kit';

const KEY = 'lumiar:screen-record';

const DEFAULTS: ScreenRecordOptions = { webcam: true, microphone: true, systemAudio: false, cursorZoom: true, cursorHighlight: true, prompter: false };

function saved(): ScreenRecordOptions {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

/** Antes de gravar a tela: webcam, microfone, som do computador, mouse e roteiro. */
export function ScreenRecordDialog({ hasScript, onStart, onClose }: { hasScript: boolean; onStart: (options: ScreenRecordOptions) => void; onClose: () => void }) {
  const installed = !!desktop();
  const [options, setOptions] = useState(saved);
  const set = (patch: Partial<ScreenRecordOptions>) => setOptions((o) => ({ ...o, ...patch }));
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[400px] animate-pop-in rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <MonitorUp size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Gravar a tela')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-dim">
          {t(
            'Para tutoriais e gameplay. A gravação entra no fim da trilha principal e a webcam vem junto, num cantinho (picture-in-picture), já sincronizada.',
          )}
        </p>
        <div className="space-y-2.5">
          <SwitchRow checked={options.webcam} onChange={(webcam) => set({ webcam })} label={t('Gravar a webcam junto')} />
          <SwitchRow checked={options.microphone} onChange={(microphone) => set({ microphone })} label={t('Gravar o microfone')} />
          <SwitchRow checked={options.systemAudio} onChange={(systemAudio) => set({ systemAudio })} label={t('Gravar o som do computador (Windows)')} />
          <div className={installed ? 'space-y-2.5' : 'pointer-events-none space-y-2.5 opacity-50'}>
            <SwitchRow checked={installed && options.cursorZoom} onChange={(cursorZoom) => set({ cursorZoom })} label={t('Zoom que segue o mouse (aproxima onde você clica)')} />
            <SwitchRow checked={installed && options.cursorHighlight} onChange={(cursorHighlight) => set({ cursorHighlight })} label={t('Destacar o cursor e os cliques')} />
          </div>
          {!installed && (
            <p className="text-[11px] leading-snug text-faint">
              {t('O zoom e o destaque do mouse precisam do programa instalado (no navegador a página não sabe onde o mouse está).')}
            </p>
          )}
          <SwitchRow
            checked={hasScript && options.prompter}
            onChange={(prompter) => set({ prompter })}
            label={hasScript ? t('Mostrar o roteiro numa janelinha por cima') : t('Mostrar o roteiro (escreva antes na aba Voz)')}
          />
        </div>
        <p className="mt-3 text-[11px] leading-snug text-faint">
          {t(
            'No navegador, ele pergunta qual tela ou janela gravar. No programa instalado, grava a tela principal. Para parar, use o botão "Parar" que aparece no topo.',
          )}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose}>{t('Cancelar')}</Button>
          <Button
            variant="primary"
            icon={<MonitorUp size={14} />}
            onClick={() => {
              try {
                localStorage.setItem(KEY, JSON.stringify(options));
              } catch {
                // Sem armazenamento: vale só agora.
              }
              onStart(options);
            }}
          >
            {t('Começar a gravar')}
          </Button>
        </div>
      </div>
    </div>
  );
}
