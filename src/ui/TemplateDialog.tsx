import { LayoutTemplate, X } from 'lucide-react';
import { aspectLabel } from '../project/formats';
import { TEMPLATES, type ProjectTemplate } from '../project/templates';
import { t } from '../i18n';
import { IconButton } from './kit';

/** Escolher um modelo de projeto (estrutura pronta com espaços para os seus vídeos). */
export function TemplateDialog({ onPick, onClose }: { onPick: (template: ProjectTemplate) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[min(860px,calc(100vw-48px))] animate-pop-in rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <LayoutTemplate size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Começar de um modelo')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-dim">
          {t('O modelo vem com as cenas, os títulos, as transições e a cor. Cada cena é um espaço numerado: clique direito nele →')}{' '}
          <b>{t('Trocar a mídia')}</b>, {t('e o seu vídeo ocupa o mesmo tempo.')}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => onPick(template)}
              className="group flex flex-col overflow-hidden rounded-xl border border-line bg-panel-2 text-left transition-all hover:border-accent hover:shadow-lg hover:shadow-accent/10"
            >
              <div
                className="flex h-24 w-full shrink-0 items-center justify-center text-4xl transition-transform group-hover:scale-105"
                style={{ background: `linear-gradient(135deg, ${template.colors[0]}, ${template.colors[1]})` }}
              >
                {template.emoji}
              </div>
              <div className="p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {template.name}
                  <span className="rounded bg-panel-3 px-1 font-mono text-[10px] font-normal text-faint">{aspectLabel(template.width, template.height)}</span>
                </p>
                <p className="mt-1 text-[11px] leading-snug text-faint">{template.description}</p>
                <p className="mt-1.5 text-[11px] text-dim">
                  {t('{n} cenas', { n: template.slots.length })} · {Math.round(template.slots.reduce((s, x) => s + x.duration, 0))}s
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
