import { BadgeCheck, ImageUp, LoaderCircle, Trash, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_BRAND, type BrandKit, type BrandOptions } from '../project/brand';
import { loadBrandKit, saveBrandKit } from '../project/storage';
import { FONTS } from '../project/text';
import { t } from '../i18n';
import { Button, IconButton, Segmented, Slider, SwitchRow } from './kit';

const CORNERS: { value: BrandKit['watermark']['corner']; label: string }[] = [
  { value: 'top-left', label: '↖' },
  { value: 'top-right', label: '↗' },
  { value: 'bottom-left', label: '↙' },
  { value: 'bottom-right', label: '↘' },
];

/** Escolher um arquivo (imagem ou vídeo). */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/**
 * Kit da marca: configurado uma vez (fica guardado neste computador) e aplicado em qualquer
 * projeto com um clique — e também no processamento de vários vídeos.
 */
export function BrandKitDialog({ onApply, onClose }: { onApply: (kit: BrandKit, options: BrandOptions) => void; onClose: () => void }) {
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [options, setOptions] = useState<BrandOptions>({ logo: true, intro: true, outro: true, texts: true, captions: true });
  const loaded = useRef(false);

  useEffect(() => {
    void loadBrandKit()
      .then((k) => setKit(k ?? DEFAULT_BRAND))
      .catch(() => setKit(DEFAULT_BRAND))
      .finally(() => (loaded.current = true));
  }, []);
  // Guarda sozinho, um pouco depois de cada mudança.
  useEffect(() => {
    if (!kit || !loaded.current) return;
    const timer = setTimeout(() => void saveBrandKit(kit).catch(() => {}), 400);
    return () => clearTimeout(timer);
  }, [kit]);

  const logoUrl = useMemo(() => (kit?.logo ? URL.createObjectURL(kit.logo) : null), [kit?.logo]);
  useEffect(() => () => void (logoUrl && URL.revokeObjectURL(logoUrl)), [logoUrl]);

  if (!kit) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <LoaderCircle className="animate-spin text-accent" />
      </div>
    );
  }
  const set = (patch: Partial<BrandKit>) => setKit((k) => k && { ...k, ...patch });
  const setMark = (patch: Partial<BrandKit['watermark']>) => setKit((k) => k && { ...k, watermark: { ...k.watermark, ...patch } });
  const fileRow = (label: string, file: File | null, accept: string, key: 'logo' | 'intro' | 'outro') => (
    <div className="flex items-center gap-2">
      <span className="w-24 text-xs text-dim">{label}</span>
      <button
        className="field h-8 min-w-0 flex-1 truncate text-left text-xs"
        onClick={() => void pickFile(accept).then((f) => f && set({ [key]: f } as Partial<BrandKit>))}
        title={t('Escolher arquivo')}
      >
        {file ? file.name : <span className="text-faint">{t('Escolher…')}</span>}
      </button>
      {file && (
        <IconButton label={t('Tirar')} className="size-7 hover:!text-danger" onClick={() => set({ [key]: null } as Partial<BrandKit>)}>
          <Trash size={13} />
        </IconButton>
      )}
    </div>
  );
  const anything = (options.logo && kit.logo) || (options.intro && kit.intro) || (options.outro && kit.outro) || options.texts || options.captions;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[min(720px,calc(100vw-48px))] animate-pop-in rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <BadgeCheck size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Kit da marca')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-dim">
          {t('Configure uma vez: fica guardado neste computador e serve para qualquer projeto (e para o processamento de vários vídeos).')}
        </p>

        <div className="grid grid-cols-[minmax(0,1fr)_240px] gap-5">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => void pickFile('image/*').then((f) => f && set({ logo: f }))}
                className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-[repeating-conic-gradient(#ffffff10_0_25%,transparent_0_50%)] bg-[length:12px_12px] text-faint hover:border-accent"
                title={t('Escolher a logo (PNG com fundo transparente fica melhor)')}
              >
                {logoUrl ? <img src={logoUrl} className="max-h-full max-w-full object-contain" alt="Logo" /> : <ImageUp size={22} />}
              </button>
              <div className="min-w-0 flex-1 space-y-1.5">
                <input className="field h-8 w-full text-sm" value={kit.name} onChange={(e) => set({ name: e.target.value })} />
                <div className="flex items-center gap-2">
                  {(['Principal', 'Secundária', 'Destaque'] as const).map((label, i) => (
                    <label key={label} className="flex items-center gap-1.5 text-[11px] text-dim" title={t('Cor {name}', { name: t(label).toLowerCase() })}>
                      <span className="relative size-6 cursor-pointer rounded-md ring-1 ring-white/20" style={{ background: kit.colors[i] }}>
                        <input
                          type="color"
                          className="sr-only"
                          value={kit.colors[i]}
                          onChange={(e) => set({ colors: kit.colors.map((c, j) => (j === i ? e.target.value : c)) as BrandKit['colors'] })}
                        />
                      </span>
                      {t(label)}
                    </label>
                  ))}
                </div>
                {kit.logo && (
                  <button className="text-[11px] text-faint hover:text-danger" onClick={() => set({ logo: null })}>
                    {t('Tirar a logo')}
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-[11px] text-dim">
                {t('Fonte dos títulos')}
                <select className="field h-8 w-full text-xs" value={kit.titleFont} onChange={(e) => set({ titleFont: e.target.value })} style={{ fontFamily: `"${kit.titleFont}"` }}>
                  {FONTS.map((f) => (
                    <option key={f.family} value={f.family}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-[11px] text-dim">
                {t('Fonte das legendas')}
                <select className="field h-8 w-full text-xs" value={kit.bodyFont} onChange={(e) => set({ bodyFont: e.target.value })} style={{ fontFamily: `"${kit.bodyFont}"` }}>
                  {FONTS.map((f) => (
                    <option key={f.family} value={f.family}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {fileRow(t('Abertura'), kit.intro, 'video/*,image/*', 'intro')}
            {fileRow(t('Encerramento'), kit.outro, 'video/*,image/*', 'outro')}
            <div className="space-y-2 rounded-lg border border-line bg-panel-2 p-2.5">
              <p className="text-xs font-medium">{t("Marca d'água (logo no canto)")}</p>
              <Segmented options={CORNERS} value={kit.watermark.corner} onChange={(corner) => setMark({ corner })} />
              <div className="flex items-center justify-between text-[11px] text-dim">
                <span>{t('Tamanho')}</span>
                <span className="font-mono">{Math.round(kit.watermark.size * 100)}%</span>
              </div>
              <Slider label={t('Tamanho da logo')} value={kit.watermark.size} min={0.05} max={0.3} step={0.01} onChange={(size) => setMark({ size })} />
              <div className="flex items-center justify-between text-[11px] text-dim">
                <span>{t('Opacidade')}</span>
                <span className="font-mono">{Math.round(kit.watermark.opacity * 100)}%</span>
              </div>
              <Slider label={t('Opacidade da logo')} value={kit.watermark.opacity} min={0.2} max={1} step={0.05} onChange={(opacity) => setMark({ opacity })} />
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-accent/30 bg-accent/5 p-3">
            <p className="mb-2 text-xs font-semibold">{t('Aplicar neste projeto')}</p>
            <div className="space-y-2">
              <SwitchRow checked={options.logo && !!kit.logo} onChange={(logo) => setOptions((o) => ({ ...o, logo }))} label={t('Logo no canto')} />
              <SwitchRow checked={options.intro && !!kit.intro} onChange={(intro) => setOptions((o) => ({ ...o, intro }))} label={t('Abertura no começo')} />
              <SwitchRow checked={options.outro && !!kit.outro} onChange={(outro) => setOptions((o) => ({ ...o, outro }))} label={t('Encerramento no fim')} />
              <SwitchRow checked={options.texts} onChange={(texts) => setOptions((o) => ({ ...o, texts }))} label={t('Cores e fonte nos textos')} />
              <SwitchRow checked={options.captions} onChange={(captions) => setOptions((o) => ({ ...o, captions }))} label={t('Cores e fonte nas legendas')} />
            </div>
            <span className="flex-1" />
            <Button
              variant="primary"
              icon={<BadgeCheck size={14} />}
              className="mt-4 w-full"
              disabled={!anything}
              onClick={() => onApply(kit, { ...options, logo: options.logo && !!kit.logo, intro: options.intro && !!kit.intro, outro: options.outro && !!kit.outro })}
            >
              {t('Aplicar a marca')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
