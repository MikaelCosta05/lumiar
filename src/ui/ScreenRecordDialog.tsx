import { AudioLines, MonitorUp, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { desktop, type AudioApp, type ScreenRecordOptions } from '../media/screenRecorder';
import { t } from '../i18n';
import { Button, IconButton, SwitchRow } from './kit';

const KEY = 'lumiar:screen-record';

const DEFAULTS: ScreenRecordOptions = {
  webcam: true,
  microphone: true,
  systemAudio: false,
  cursorZoom: true,
  cursorHighlight: true,
  prompter: false,
  separateApp: null,
};

/** Nome que aparece na lista: o do programa, e o título da janela quando ajuda a reconhecer. */
function appLabel(app: AudioApp): string {
  const title = app.title.trim();
  return title && !title.toLowerCase().includes(app.name.toLowerCase()) ? `${app.name} — ${title}` : app.name;
}

/**
 * Programas abertos cujo som dá para gravar à parte (só no programa instalado, no Windows). null = não dá.
 * O processo muda a cada vez que o programa abre: a escolha salva é reencontrada pelo nome.
 */
function useAudioApps(wanted: string | undefined, choose: (app: AudioApp | null) => void) {
  const [apps, setApps] = useState<AudioApp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const load = () => {
    const list = desktop()?.listAppAudio;
    if (!list) return;
    setLoading(true);
    void list()
      .then((found) => {
        setApps(found);
        if (!found) return choose(null);
        const same = wanted ? found.find((a) => a.name === wanted) : undefined;
        choose(same ?? null);
      })
      .catch(() => setApps(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  return { apps, loading, reload: load };
}

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
  const audio = useAudioApps(options.separateApp?.name, (separateApp) => set({ separateApp }));
  const separate = options.separateApp;
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
          {audio.apps && (
            <div className="rounded-xl border border-line bg-panel-2/60 p-3">
              <div className="mb-2 flex items-center gap-2">
                <AudioLines size={14} className="text-accent" />
                <span className="flex-1 text-xs font-medium">{t('Som de um programa numa trilha separada')}</span>
                <IconButton label={t('Atualizar a lista de programas')} onClick={audio.reload} disabled={audio.loading}>
                  <RefreshCw size={13} className={audio.loading ? 'animate-spin' : undefined} />
                </IconButton>
              </div>
              <select
                className="field w-full text-xs"
                value={separate ? String(separate.pid) : ''}
                onChange={(e) => set({ separateApp: audio.apps!.find((a) => String(a.pid) === e.target.value) ?? null })}
              >
                <option value="">{t('Não separar (tudo junto com a tela)')}</option>
                {audio.apps.map((app) => (
                  <option key={app.pid} value={String(app.pid)}>
                    {appLabel(app)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] leading-snug text-faint">
                {separate
                  ? options.systemAudio
                    ? t('{app}, o microfone e o resto do computador vão cada um na sua trilha, para ajustar o volume, cortar ou limpar um sem mexer nos outros.', { app: separate.name })
                    : t('{app} e o microfone vão cada um na sua trilha. Ligue "som do computador" para gravar também o jogo ou a música, em outra trilha.', { app: separate.name })
                  : t('Ex.: escolha o Discord para a voz da chamada ficar numa trilha só dela.')}
              </p>
            </div>
          )}
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
