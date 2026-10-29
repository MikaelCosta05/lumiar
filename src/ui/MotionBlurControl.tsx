import { Wind } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';
import { t } from '../i18n';
import type { Camera } from '../project/camera';
import type { Project } from '../project/model';
import { DEFAULT_MOTION_BLUR, MAX_BLUR_AMOUNT, motionBlurOf, type MotionBlurMode, type MotionBlurSettings } from '../project/motionBlur';
import { SectionTitle, Segmented, Slider } from './kit';

/** O ajuste do projeto todo, para o painel de câmera de qualquer clipe ou pacote mostrar e mudar. */
const ProjectBlur = createContext<{ settings: MotionBlurSettings; onChange: (settings: MotionBlurSettings) => void } | null>(null);

export function MotionBlurProvider({ project, onChange, children }: { project: Project; onChange: (update: (p: Project) => Project) => void; children: ReactNode }) {
  return (
    <ProjectBlur.Provider value={{ settings: motionBlurOf(project), onChange: (motionBlur) => onChange((p) => ({ ...p, motionBlur })) }}>
      {children}
    </ProjectBlur.Provider>
  );
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Desfoque de movimento no painel de câmera: o do projeto (desligado, só nos pacotes de câmera ou em tudo)
 * e o desta câmera (seguir o projeto, desligar ou uma intensidade própria).
 */
export function MotionBlurSection({ camera, onCamera, pack }: { camera: Camera; onCamera: (update: (camera: Camera) => Camera) => void; pack: boolean }) {
  const project = useContext(ProjectBlur);
  const own = camera.motionBlur;
  const choice: 'project' | 'off' | 'on' = own === undefined ? 'project' : own <= 0 ? 'off' : 'on';
  const settings = project?.settings ?? DEFAULT_MOTION_BLUR;
  const inherited = settings.mode === 'all' || (pack && settings.mode === 'packs') ? settings.amount : 0;
  const setOwn = (motionBlur: number | undefined) =>
    onCamera((c) => {
      const { motionBlur: _old, ...rest } = c;
      return motionBlur === undefined ? rest : { ...rest, motionBlur };
    });

  return (
    <>
      <SectionTitle extra={<Wind size={12} className="text-faint" />}>{t('Desfoque de movimento')}</SectionTitle>
      <p className="mb-2 text-[11px] leading-snug text-faint">
        {t('Movimentos rápidos da câmera ficam borrados na direção em que andam, como numa câmera de verdade. No preview é mais leve; o arquivo exportado sai completo.')}
      </p>
      {project && (
        <div className="mb-2 rounded-xl border border-line bg-panel-2 p-2.5">
          <p className="mb-1.5 text-[11px] font-medium text-dim">{t('No projeto todo')}</p>
          <Segmented<MotionBlurMode>
            value={settings.mode}
            onChange={(mode) => project.onChange({ ...settings, mode })}
            options={[
              { value: 'off', label: t('Desligado') },
              { value: 'packs', label: t('Pacotes'), title: t('Só os pacotes de edição com câmera (padrão)') },
              { value: 'all', label: t('Tudo'), title: t('Câmeras dos clipes, sobreposições, pacotes e textos animados') },
            ]}
          />
          {settings.mode !== 'off' && (
            <AmountRow label={t('Intensidade')} value={settings.amount} onChange={(amount) => project.onChange({ ...settings, amount })} />
          )}
        </div>
      )}
      <p className="mb-1.5 text-[11px] font-medium text-dim">{pack ? t('Neste pacote') : t('Neste clipe')}</p>
      <Segmented
        value={choice}
        onChange={(v) => setOwn(v === 'project' ? undefined : v === 'off' ? 0 : own && own > 0 ? own : inherited || DEFAULT_MOTION_BLUR.amount)}
        options={[
          { value: 'project', label: t('Do projeto'), title: inherited > 0 ? t('Agora: {n}', { n: percent(inherited) }) : t('Agora: desligado') },
          { value: 'off', label: t('Desligado') },
          { value: 'on', label: t('Próprio') },
        ]}
      />
      {choice === 'on' && <AmountRow label={t('Intensidade')} value={own ?? 0} onChange={(v) => setOwn(Math.max(0.05, v))} />}
    </>
  );
}

function AmountRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="pt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-dim">{label}</span>
        <span className="font-mono text-[11px]" title={t('Quanto tempo do quadro o "obturador" fica aberto (50% = o do cinema)')}>
          {percent(value)}
        </span>
      </div>
      <Slider label={label} value={value} min={0.05} max={MAX_BLUR_AMOUNT} step={0.05} onChange={onChange} />
    </div>
  );
}
