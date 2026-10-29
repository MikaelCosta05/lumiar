import { Mic, MicOff, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceRecorder } from '../media/recorder';
import { Button, cx, IconButton } from './kit';
import { setVoicePrefs, useVoicePrefs } from './voicePrefs';
import { t } from '../i18n';

/**
 * Escolha do microfone: lista os aparelhos pelo nome (pede permissão se precisar),
 * acompanha quando um microfone é ligado/desligado e tem um teste com medidor ao vivo.
 */
export function MicPicker({ compact = false }: { compact?: boolean }) {
  const prefs = useVoicePrefs();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const tester = useRef<VoiceRecorder | null>(null);

  const refresh = useCallback(async () => {
    const list = await VoiceRecorder.devices();
    setDevices(list);
    // O escolhido sumiu (desconectado): volta para o padrão.
    if (prefs.deviceId && list.length && list.every((d) => d.deviceId !== prefs.deviceId) && list.some((d) => d.label)) {
      setVoicePrefs({ deviceId: '', deviceLabel: '' });
    }
  }, [prefs.deviceId]);

  useEffect(() => {
    void refresh();
    const media = navigator.mediaDevices;
    media?.addEventListener('devicechange', refresh);
    return () => media?.removeEventListener('devicechange', refresh);
  }, [refresh]);

  // Sem permissão o navegador esconde os nomes: pede o microfone uma vez e lista de novo.
  const allow = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await refresh();
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? t('Acesso ao microfone negado.') : t('Nenhum microfone encontrado.'));
    }
  };

  const stopTest = () => {
    tester.current?.cancel();
    tester.current = null;
    setTesting(false);
    setLevel(0);
  };

  const startTest = async (deviceId = prefs.deviceId) => {
    stopTest();
    try {
      setError(null);
      tester.current = await VoiceRecorder.open(deviceId || undefined);
      setTesting(true);
      void refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Medidor do teste.
  useEffect(() => {
    if (!testing) return;
    const timer = setInterval(() => setLevel(tester.current?.level() ?? 0), 70);
    return () => clearInterval(timer);
  }, [testing]);
  useEffect(() => () => tester.current?.cancel(), []);

  const named = devices.filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
  const hidden = devices.length > 0 && devices.every((d) => !d.label);

  const choose = (deviceId: string) => {
    const device = named.find((d) => d.deviceId === deviceId);
    setVoicePrefs({ deviceId, deviceLabel: device?.label ?? '' });
    if (testing) void startTest(deviceId);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Mic size={14} className="shrink-0 text-danger" />
        <select className={cx('field min-w-0 flex-1 text-xs', compact ? 'h-7' : 'h-8')} value={prefs.deviceId} onChange={(e) => choose(e.target.value)}>
          <option value="">{t('Padrão do sistema')}</option>
          {named.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || t('Microfone {n}', { n: i + 1 })}
            </option>
          ))}
          {/* Escolhido antes, mas ainda não listado (sem permissão nesta sessão). */}
          {prefs.deviceId && !named.some((d) => d.deviceId === prefs.deviceId) && (
            <option value={prefs.deviceId}>{prefs.deviceLabel || t('Microfone escolhido')}</option>
          )}
        </select>
        <IconButton label={t('Atualizar a lista')} onClick={() => void refresh()}>
          <RefreshCw size={13} />
        </IconButton>
      </div>

      {hidden && (
        <Button variant="secondary" className="h-7 w-full text-xs" icon={<Mic size={13} />} onClick={() => void allow()}>
          {t('Permitir e mostrar os nomes dos microfones')}
        </Button>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => (testing ? stopTest() : void startTest())}
          className={cx(
            'flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors',
            testing ? 'border-success/50 bg-success/10 text-success' : 'border-line text-dim hover:border-line-strong hover:text-fg',
          )}
        >
          {testing ? <MicOff size={12} /> : <Mic size={12} />}
          {testing ? t('Parar teste') : t('Testar')}
        </button>
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-panel-3" title={t('Volume do microfone')}>
          <div
            className={cx('h-full rounded-full transition-[width] duration-75', level > 0.85 ? 'bg-danger' : level > 0.6 ? 'bg-amber' : 'bg-success')}
            style={{ width: `${Math.round(level * 100)}%` }}
          />
        </div>
      </div>
      {testing && <p className="text-[10px] leading-snug text-faint">{t('Fale normalmente: o ideal é a barra ficar no verde e chegar perto do amarelo.')}</p>}
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
