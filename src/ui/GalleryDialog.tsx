import { Check, Download, ExternalLink, LoaderCircle, Package, RefreshCw, Search, Settings, Sparkles, Store, TriangleAlert, WifiOff, X } from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { pluginsVersion, subscribePlugins } from '../engine/registry';
import { listUserEffects } from '../engine/userPlugins';
import {
  checkIndexUrl,
  DEFAULT_INDEX_URL,
  fetchIndex,
  filterItems,
  GALLERY_DOCS_URL,
  galleryTags,
  getIndexUrl,
  GalleryError,
  installedKey,
  installState,
  readInstalled,
  setIndexUrl,
  type GalleryIndex,
  type GalleryItem,
  type GalleryKind,
} from '../project/gallery';
import { locale, t } from '../i18n';
import { installGalleryItem } from './galleryInstall';
import { Button, cx, IconButton, Pill, Segmented } from './kit';
import { useUserPacks } from './packStore';

type Load = { state: 'loading' } | { state: 'ready'; index: GalleryIndex } | { state: 'error'; error: GalleryError };

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toLocaleString(locale(), { maximumFractionDigits: 1 })} MB`);

/** Galeria da comunidade: procurar e instalar efeitos e pacotes que outras pessoas compartilharam. */
export function GalleryDialog({
  initialKind = null,
  notify,
  onClose,
}: {
  /** Aberta pela aba Efeitos ou Pacotes: já começa filtrada. */
  initialKind?: GalleryKind | null;
  notify: (text: string, error?: boolean) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(getIndexUrl);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<GalleryKind | null>(initialKind);
  const [tag, setTag] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [installed, setInstalled] = useState(readInstalled);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    let current = true;
    setLoad({ state: 'loading' });
    fetchIndex(url)
      .then((index) => current && setLoad({ state: 'ready', index }))
      .catch((error: unknown) => {
        if (!current) return;
        setLoad({ state: 'error', error: error instanceof GalleryError ? error : new GalleryError('invalid', error instanceof Error ? error.message : String(error)) });
      });
    return () => {
      current = false;
    };
  }, [url, attempt]);

  // O que já está neste computador (muda quando um efeito ou pacote entra ou sai).
  const plugins = useSyncExternalStore(subscribePlugins, pluginsVersion);
  const packs = useUserPacks();
  const local = useMemo(
    // Os efeitos não avisam quando mudam; o registro de plugins avisa (por isso o `plugins` nas dependências).
    () => ({ effect: new Set(listUserEffects().map((e) => e.id)), pack: new Set(packs.map((p) => p.id)) }),
    [plugins, packs],
  );

  const items = load.state === 'ready' ? load.index.items : [];
  const tags = useMemo(() => galleryTags(kind ? items.filter((i) => i.kind === kind) : items).slice(0, 16), [items, kind]);
  const list = useMemo(() => filterItems(items, query, kind, tag), [items, query, kind, tag]);

  const install = async (item: GalleryItem) => {
    setBusy(installedKey(item));
    try {
      const { text, error } = await installGalleryItem(item, url);
      notify(text, error);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    } finally {
      setInstalled(readInstalled());
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[min(720px,calc(100vh-48px))] w-[min(940px,calc(100vw-48px))] animate-pop-in flex-col rounded-2xl border border-line bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2">
          <Store size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">
            {t('Galeria da comunidade')}
            {load.state === 'ready' && load.index.name && <span className="ml-2 text-xs font-normal text-faint">{load.index.name}</span>}
          </h2>
          <IconButton label={t('Recarregar a galeria')} onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw size={14} />
          </IconButton>
          <IconButton label={t('Endereço da galeria')} active={settings} onClick={() => setSettings((s) => !s)}>
            <Settings size={14} />
          </IconButton>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-dim">
          {t('Efeitos e pacotes que outras pessoas compartilharam. Ao instalar, o arquivo é conferido (tamanho e SHA-256) e entra em "Meus efeitos" ou "Meus pacotes", como no botão de importar.')}
        </p>

        {settings && (
          <UrlSettings
            url={url}
            onSave={(next) => {
              setIndexUrl(next);
              setUrl(next);
              setAttempt((n) => n + 1);
              setSettings(false);
            }}
          />
        )}

        {load.state === 'loading' ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-xs text-faint">
            <LoaderCircle size={16} className="animate-spin" /> {t('Abrindo a galeria…')}
          </div>
        ) : load.state === 'error' ? (
          <Problem error={load.error} url={url} onRetry={() => setAttempt((n) => n + 1)} onSettings={() => setSettings(true)} />
        ) : (
          <>
            <div className="mb-2.5 flex items-center gap-2">
              <label className="relative block flex-1">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                <input className="field w-full pl-8" placeholder={t('Buscar por nome, autor ou etiqueta…')} value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <div className="w-64">
                <Segmented<'all' | GalleryKind>
                  value={kind ?? 'all'}
                  onChange={(v) => {
                    setKind(v === 'all' ? null : v);
                    setTag(null);
                  }}
                  options={[
                    { value: 'all', label: t('Todos') },
                    { value: 'effect', label: t('Efeitos') },
                    { value: 'pack', label: t('Pacotes') },
                  ]}
                />
              </div>
            </div>
            {tags.length > 0 && (
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
                <Pill active={tag === null} onClick={() => setTag(null)}>
                  {t('Todas as etiquetas')}
                </Pill>
                {tags.map((x) => (
                  <Pill key={x} active={tag === x} onClick={() => setTag(tag === x ? null : x)}>
                    #{x}
                  </Pill>
                ))}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {list.length ? (
                <div className="grid grid-cols-3 gap-3">
                  {list.map((item) => (
                    <Card
                      key={installedKey(item)}
                      item={item}
                      state={installState(item, installed[installedKey(item)], local[item.kind])}
                      busy={busy === installedKey(item)}
                      disabled={busy !== null}
                      onInstall={() => void install(item)}
                      onTag={(x) => setTag(x)}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-16 text-center text-xs text-faint">{items.length ? t('Nada encontrado com esses filtros.') : t('A galeria ainda está vazia.')}</p>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-snug text-faint" title={load.index.skipped.join('\n') || undefined}>
              {t('Os efeitos são código que roda na placa de vídeo: os da galeria são revisados antes de entrar, e o Lumiar compila cada shader antes de instalar.')}
              {load.index.skipped.length > 0 && ` ${t('{n} item(ns) do índice ficaram de fora por estarem no formato errado.', { n: load.index.skipped.length })}`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Card({
  item,
  state,
  busy,
  disabled,
  onInstall,
  onTag,
}: {
  item: GalleryItem;
  state: ReturnType<typeof installState>;
  busy: boolean;
  disabled: boolean;
  onInstall: () => void;
  onTag: (tag: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-panel-2">
      <div className="relative aspect-video bg-gradient-to-br from-panel-3 to-panel">
        {item.preview && !broken ? (
          <img src={item.preview} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-faint">{item.kind === 'effect' ? <Sparkles size={26} /> : <Package size={26} />}</div>
        )}
        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-px text-[10px] text-white/90">
          {item.kind === 'effect' ? <Sparkles size={10} /> : <Package size={10} />}
          {item.kind === 'effect' ? t('Efeito') : t('Pacote')}
        </span>
        {item.language && <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1 py-px font-mono text-[9px] uppercase text-white/80">{item.language}</span>}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className="truncate text-sm font-semibold" title={item.name}>
          {item.name}
        </p>
        <p className="truncate text-[11px] text-dim">{t('por {author}', { author: item.author })}</p>
        {item.description && <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-faint">{item.description}</p>}
        {item.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.tags.slice(0, 5).map((x) => (
              <button key={x} onClick={() => onTag(x)} className="rounded bg-panel-3 px-1 text-[10px] text-faint transition-colors hover:text-accent">
                #{x}
              </button>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-2 pt-2.5">
          <span className="flex-1 truncate font-mono text-[10px] text-faint">
            v{item.version} · {size(item.size)}
          </span>
          {state === 'installed' ? (
            <span className="inline-flex h-7 items-center gap-1 px-2 text-[12px] text-dim">
              <Check size={13} className="text-accent" /> {t('Instalado')}
            </span>
          ) : (
            <Button
              variant={state === 'update' ? 'secondary' : 'primary'}
              className="h-7 px-2.5 text-[12px]"
              icon={busy ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
              disabled={disabled}
              onClick={onInstall}
            >
              {busy ? t('Instalando…') : state === 'update' ? t('Atualizar') : t('Instalar')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** O que mostrar quando a galeria não abre: fora do ar (o caso de hoje), sem internet ou índice errado. */
function Problem({ error, url, onRetry, onSettings }: { error: GalleryError; url: string; onRetry: () => void; onSettings: () => void }) {
  const custom = url !== DEFAULT_INDEX_URL;
  const notYet = error.problem === 'not-found';
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-panel-3 text-faint">
        {error.problem === 'offline' ? <WifiOff size={22} /> : notYet ? <Store size={22} /> : <TriangleAlert size={22} />}
      </span>
      <p className="text-sm font-semibold">{notYet ? t('A galeria ainda não está no ar') : error.message}</p>
      <p className="max-w-md text-xs leading-relaxed text-dim">
        {notYet
          ? custom
            ? t('Não há um índice da galeria neste endereço. Confira o endereço nas configurações ou volte para o padrão.')
            : t('O repositório da comunidade ainda vai ser publicado. Quando estiver no ar, os efeitos e pacotes aparecem aqui. Enquanto isso, dá para ver como ele funciona e como enviar o seu.')
          : error.problem === 'offline'
            ? t('A galeria precisa de internet só para abrir e baixar; o que já foi instalado continua funcionando sem ela.')
            : t('Tente de novo daqui a pouco. Se estiver usando outro endereço, confira nas configurações.')}
      </p>
      {custom && <p className="max-w-md break-all font-mono text-[10px] text-faint">{url}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <Button icon={<RefreshCw size={13} />} onClick={onRetry}>
          {t('Tentar de novo')}
        </Button>
        {(custom || !notYet) && (
          <Button icon={<Settings size={13} />} onClick={onSettings}>
            {t('Endereço da galeria')}
          </Button>
        )}
        <a
          href={GALLERY_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] text-accent transition-colors hover:bg-panel-3"
        >
          <ExternalLink size={13} /> {t('Como funciona a galeria')}
        </a>
      </div>
    </div>
  );
}

/** Trocar o endereço do índice (para testar uma galeria ou usar um espelho). Fica guardado neste computador. */
function UrlSettings({ url, onSave }: { url: string; onSave: (url: string) => void }) {
  const [draft, setDraft] = useState(url);
  const checked = checkIndexUrl(draft);
  const problem = typeof checked === 'string' ? checked : null;
  return (
    <div className="mb-3 space-y-1.5 rounded-xl border border-line bg-panel-2 p-3">
      <p className="text-[11px] font-medium text-dim">{t('Endereço do índice (index.json)')}</p>
      <div className="flex gap-2">
        <input className={cx('field flex-1 font-mono text-[11px]', problem && 'ring-1 ring-danger')} value={draft} spellCheck={false} onChange={(e) => setDraft(e.target.value)} />
        <Button variant="primary" disabled={!!problem} onClick={() => onSave(draft.trim())}>
          {t('Usar este')}
        </Button>
        <Button disabled={draft === DEFAULT_INDEX_URL && url === DEFAULT_INDEX_URL} onClick={() => onSave(DEFAULT_INDEX_URL)}>
          {t('Voltar ao padrão')}
        </Button>
      </div>
      <p className={cx('text-[11px] leading-snug', problem ? 'text-danger' : 'text-faint')}>
        {problem ?? t('Só endereços https. Os arquivos e as prévias precisam estar no mesmo servidor (e, no GitHub, no mesmo repositório) do índice.')}
      </p>
    </div>
  );
}
