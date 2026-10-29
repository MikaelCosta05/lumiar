import { LoaderCircle, MonitorX, RotateCw, TriangleAlert } from 'lucide-react';
import { t } from '../i18n';
import { Button } from '../ui/kit';

const reload = () => location.reload();

/** Tela inteira: sem WebGL2 o editor não tem como desenhar nada (preview e exportação usam a GPU). */
export function NoWebGL2Screen() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-bg p-6 text-fg">
      <div className="flex w-full max-w-xl flex-col gap-5 rounded-2xl border border-line bg-panel p-7 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
            <MonitorX size={22} />
          </span>
          <div>
            <h1 className="text-lg font-semibold">{t('O Lumiar precisa da placa de vídeo')}</h1>
            <p className="text-sm text-dim">{t('Este navegador (ou computador) não ofereceu o WebGL2, a aceleração por hardware que o editor usa.')}</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-dim">
          {t('O preview, os efeitos, as transições e a exportação são todos desenhados na GPU. Sem ela, o vídeo ficaria preto. Algumas coisas que costumam resolver:')}
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
          <li>
            <b>{t('Atualize o driver da placa de vídeo')}</b> {t('pelo site da NVIDIA, AMD ou Intel (drivers antigos costumam ser bloqueados pelo navegador).')}
          </li>
          <li>
            <b>{t('Ative a aceleração por hardware no navegador')}</b>:{' '}
            {t('no Chrome ou no Edge, Configurações → Sistema → “Usar aceleração de hardware quando disponível”, e reabra o navegador.')}
          </li>
          <li>
            <b>{t('Use o Chrome ou o Edge no modo navegador')}</b> {t('se o programa instalado não conseguir usar a placa de vídeo (ou o contrário).')}
          </li>
          <li>
            <b>{t('Em máquina virtual ou área de trabalho remota')}</b>{' '}
            {t('a placa de vídeo quase nunca está disponível: abra o Lumiar direto no computador.')}
          </li>
        </ul>
        <p className="text-xs text-faint">
          {t('Para conferir, abra')} <span className="font-mono">chrome://gpu</span> ({t('ou')} <span className="font-mono">edge://gpu</span>){' '}
          {t('e veja se “WebGL2” aparece como “Hardware accelerated”.')}
        </p>
        <div className="flex justify-end">
          <Button variant="primary" icon={<RotateCw size={14} />} onClick={reload}>
            {t('Tentar de novo')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Por cima do preview: a placa de vídeo parou de responder (ou voltou, mas sem dar para recriar o motor). */
export function GpuLostOverlay({ failed }: { failed: boolean }) {
  return (
    <div className="absolute inset-5 z-20 flex animate-fade-in flex-col items-center justify-center gap-3 rounded-xl bg-black/85 p-6 text-center backdrop-blur-sm">
      {failed ? <TriangleAlert size={28} className="text-danger" /> : <LoaderCircle size={28} className="animate-spin text-accent" />}
      <p className="font-semibold">{failed ? t('Não foi possível recuperar o preview') : t('A placa de vídeo parou de responder')}</p>
      <p className="max-w-md text-xs leading-relaxed text-dim">
        {failed
          ? t('A placa de vídeo voltou, mas o editor não conseguiu se reconectar a ela. Recarregue o Lumiar: o salvamento automático guarda o projeto e oferece para recuperar ao abrir.')
          : t('Isso acontece quando o driver reinicia ou falta memória de vídeo. Estamos esperando ela voltar para continuar; se demorar, recarregue (o salvamento automático guarda o projeto e oferece para recuperar ao abrir).')}
      </p>
      <Button variant={failed ? 'primary' : 'secondary'} icon={<RotateCw size={14} />} onClick={reload}>
        {t('Recarregar')}
      </Button>
    </div>
  );
}
