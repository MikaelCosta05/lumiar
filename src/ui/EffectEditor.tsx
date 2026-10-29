import { Code, Download, Plus, Save, Share2, Trash, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ParamDef, ShaderPlugin } from '../engine/types';
import { deleteUserEffect, listUserEffects, saveUserEffect, STARTER_EFFECT, toPlugin, type UserEffect } from '../engine/userPlugins';
import { t } from '../i18n';
import { checkShader, exportUserEffects, newUserEffectId, paramProblem, pickEffectFile } from './effectFile';
import { Button, cx, IconButton } from './kit';
import { drawLivePreview, forgetPluginPreview, getPluginPreviews } from './previews';

/**
 * Editor de efeitos: escreva o shader (GLSL), veja o resultado na hora e guarde em "Meus efeitos".
 * Os parâmetros da lista viram controles no painel do clipe e podem ter keyframes.
 */
export function EffectEditor({ onClose, notify }: { onClose: () => void; notify: (text: string, error?: boolean) => void }) {
  const [list, setList] = useState<UserEffect[]>(listUserEffects);
  const [draft, setDraft] = useState<UserEffect>(() => list[0] ?? { id: '', ...STARTER_EFFECT });
  const plugin = useMemo(() => ({ ...toPlugin(draft), id: draft.id || 'user/__rascunho__' }), [draft]);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<ShaderPlugin | null>(null);
  const preview = useRef<HTMLCanvasElement>(null);

  // Confere o código um pouco depois de cada mudança; só o que compila vai para a prévia.
  useEffect(() => {
    const timer = setTimeout(() => {
      const problem = paramProblem(draft.params) ?? checkShader(plugin);
      setError(problem);
      if (!problem) setChecked(plugin);
    }, 350);
    return () => clearTimeout(timer);
  }, [plugin, draft.params]);

  useEffect(() => {
    const ctx = preview.current?.getContext('2d');
    if (!ctx || !checked) return;
    const start = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      drawLivePreview(checked, (now - start) / 1000, ctx);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [checked]);

  const setParam = (i: number, patch: Partial<ParamDef>) => setDraft((d) => ({ ...d, params: d.params.map((p, k) => (k === i ? ({ ...p, ...patch } as ParamDef) : p)) }));

  const save = () => {
    if (error) return notify(t('Corrija o erro antes de guardar.'), true);
    const effect = { ...draft, id: draft.id || newUserEffectId(draft.name) };
    saveUserEffect(effect);
    forgetPluginPreview(effect.id);
    getPluginPreviews();
    setDraft(effect);
    setList(listUserEffects());
    notify(t('"{name}" guardado em Efeitos → Meus efeitos.', { name: effect.name }));
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[min(720px,90vh)] w-[min(1100px,calc(100vw-48px))] animate-pop-in flex-col rounded-2xl border border-line bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <Code size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Editor de efeitos')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[170px_minmax(0,1fr)_300px] gap-4">
          {/* Meus efeitos */}
          <div className="flex min-h-0 flex-col gap-1">
            <Button className="h-8 text-xs" icon={<Plus size={13} />} onClick={() => setDraft({ id: '', ...STARTER_EFFECT, name: t('Novo efeito') })}>
              {t('Novo efeito')}
            </Button>
            {/* Compartilhar: arquivo .lumiarfx */}
            <div className="flex items-center gap-0.5 pl-2 pt-1">
              <span className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{t('Meus efeitos')}</span>
              <IconButton
                label={t('Importar efeitos (.lumiarfx)')}
                className="size-6"
                onClick={() =>
                  pickEffectFile(notify, (added) => {
                    setList(listUserEffects());
                    setDraft(added[0]);
                  })
                }
              >
                <Upload size={13} />
              </IconButton>
              <IconButton
                label={t('Exportar meus {n} efeito(s) para um arquivo', { n: list.length })}
                className="size-6"
                disabled={list.length === 0}
                onClick={() => {
                  exportUserEffects(list);
                  notify(t('Efeitos exportados. Abra o arquivo em outro Lumiar com o botão de importar.'));
                }}
              >
                <Download size={13} />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
              {list.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setDraft(e)}
                  className={cx('w-full truncate rounded-md px-2 py-1.5 text-left text-xs', e.id === draft.id ? 'bg-accent/20 text-fg' : 'text-dim hover:bg-panel-2')}
                >
                  {e.name}
                </button>
              ))}
              {list.length === 0 && <p className="px-2 py-3 text-[11px] text-faint">{t('Nenhum efeito guardado ainda.')}</p>}
            </div>
          </div>

          {/* Código */}
          <div className="flex min-h-0 flex-col gap-2">
            <input className="field h-8 text-sm" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder={t('Nome do efeito')} />
            <textarea
              spellCheck={false}
              value={draft.glsl}
              onChange={(e) => setDraft((d) => ({ ...d, glsl: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key !== 'Tab') return;
                e.preventDefault();
                const el = e.currentTarget;
                const at = el.selectionStart;
                const text = el.value.slice(0, at) + '  ' + el.value.slice(el.selectionEnd);
                setDraft((d) => ({ ...d, glsl: text }));
                requestAnimationFrame(() => el.setSelectionRange(at + 2, at + 2));
              }}
              className="field min-h-0 flex-1 resize-none py-2 font-mono text-[12px] leading-relaxed"
            />
            <p className={cx('min-h-8 whitespace-pre-wrap rounded-lg px-3 py-1.5 font-mono text-[11px]', error ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success')}>
              {error ?? t('Compilou. A prévia ao lado já é o efeito de verdade.')}
            </p>
          </div>

          {/* Prévia e parâmetros */}
          <div className="flex min-h-0 flex-col gap-2">
            <canvas ref={preview} width={288} height={162} className="w-full rounded-lg bg-black ring-1 ring-line" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">{t('Parâmetros')}</span>
              <Button
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                icon={<Plus size={11} />}
                onClick={() =>
                  setDraft((d) => ({ ...d, params: [...d.params, { id: `valor${d.params.length + 1}`, label: t('Novo valor'), type: 'float', default: 0.5, min: 0, max: 1 }] }))
                }
              >
                {t('Parâmetro')}
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {draft.params.map((p, i) => (
                <div key={i} className="space-y-1 rounded-lg border border-line bg-panel-2 p-2">
                  <div className="flex gap-1">
                    <input className="field h-7 w-24 font-mono text-[11px]" value={p.id} title={t('Nome da variável no código')} onChange={(e) => setParam(i, { id: e.target.value })} />
                    <input className="field h-7 min-w-0 flex-1 text-[11px]" value={p.label} title={t('Nome que aparece no painel')} onChange={(e) => setParam(i, { label: e.target.value })} />
                    <IconButton label={t('Tirar')} className="size-7 hover:!text-danger" onClick={() => setDraft((d) => ({ ...d, params: d.params.filter((_, k) => k !== i) }))}>
                      <Trash size={12} />
                    </IconButton>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-faint">
                    <select
                      className="field h-7 text-[11px]"
                      value={p.type}
                      onChange={(e) => {
                        const type = e.target.value as ParamDef['type'];
                        setParam(i, type === 'color' ? { type, default: '#ffffff', min: undefined, max: undefined } : type === 'vec2' ? { type, default: [0.5, 0.5], min: 0, max: 1 } : { type, default: 0.5, min: 0, max: 1 });
                      }}
                    >
                      <option value="float">{t('Número')}</option>
                      <option value="color">{t('Cor')}</option>
                      <option value="vec2">{t('Posição (x, y)')}</option>
                    </select>
                    {p.type === 'float' && (
                      <>
                        {t('de')}
                        <input type="number" step="any" className="field h-7 w-14 text-[11px]" value={p.min ?? 0} onChange={(e) => setParam(i, { min: Number(e.target.value) })} />
                        {t('a')}
                        <input type="number" step="any" className="field h-7 w-14 text-[11px]" value={p.max ?? 1} onChange={(e) => setParam(i, { max: Number(e.target.value) })} />
                        {t('início')}
                        <input type="number" step="any" className="field h-7 w-14 text-[11px]" value={Number(p.default)} onChange={(e) => setParam(i, { default: Number(e.target.value) })} />
                      </>
                    )}
                    {p.type === 'color' && (
                      <input type="color" className="h-7 w-10" value={typeof p.default === 'string' ? p.default : '#ffffff'} onChange={(e) => setParam(i, { default: e.target.value })} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <p className="flex-1 text-[11px] text-faint">
            {t('Os efeitos ficam neste computador, em Efeitos → Meus efeitos. Para mandar para alguém, use Exportar (arquivo .lumiarfx).')}{' '}
            {t('Para levar para o código do Lumiar, copie o shader para plugins/effects/<nome>/shader.glsl.')}
          </p>
          {draft.id && (
            <Button
              variant="danger"
              icon={<Trash size={13} />}
              onClick={() => {
                if (!confirm(t('Apagar "{name}"? Clipes que usam esse efeito deixam de mostrá-lo.', { name: draft.name }))) return;
                deleteUserEffect(draft.id);
                const rest = listUserEffects();
                setList(rest);
                setDraft(rest[0] ?? { id: '', ...STARTER_EFFECT });
              }}
            >
              {t('Apagar')}
            </Button>
          )}
          <Button
            icon={<Share2 size={13} />}
            disabled={!!error}
            title={t('Salva este efeito num arquivo .lumiarfx para mandar para alguém')}
            onClick={() => {
              exportUserEffects([draft]);
              notify(t('"{name}" exportado. Quem receber importa em Efeitos ou aqui no editor.', { name: draft.name || t('Meu efeito') }));
            }}
          >
            {t('Exportar')}
          </Button>
          <Button variant="primary" icon={<Save size={14} />} disabled={!!error} onClick={save}>
            {t('Guardar efeito')}
          </Button>
        </div>
      </div>
    </div>
  );
}
