import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  Blend,
  Captions,
  Film,
  Image as ImageIcon,
  Mic,
  Info,
  FileText,
  Music2,
  Package,
  Play,
  Smile,
  Square,
  Timer,
  Palette,
  Plus,
  Search,
  Sparkles,
  Store,
  Type,
  Upload,
  Download,
  X,
  MonitorUp,
  SquareDashed,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { effectPlugins, filterPlugins, pluginsVersion, subscribePlugins, transitionPlugins } from '../engine/registry';
import type { PluginKind, ShaderPlugin } from '../engine/types';
import type { MediaItem, MediaKind, Project } from '../project/model';
import { STICKER_CATEGORIES, STICKERS, TEXT_PRESETS, type TextPreset } from '../project/text';
import { SOUND_CATEGORIES, SOUNDS, soundUrl, type SoundEffect } from '../media/sfx';
import { MusicGenerator, type MusicGeneratorProps } from './MusicGenerator';
import { formatTime } from './format';
import { CaptionsPanel } from './CaptionsPanel';
import { TranscriptPanel } from './TranscriptPanel';
import { VoicePanel, type VoicePanelProps } from './VoicePanel';
import { cx } from './kit';
import { LivePreview } from './LivePreview';
import { sortCategories } from './PluginPicker';
import { Waveform } from './MediaVisuals';
import { getPackPreview, usePluginPreviews, usePreviewVersion } from './previews';
import { MEDIA_MIME, PACK_MIME, PLUGIN_MIME, SOUND_MIME, TEXT_PRESET_MIME } from './selection';
import { PACK_CATEGORIES, PACKS } from '../project/packLibrary';
import { ADJUSTMENT_TEMPLATE } from '../project/adjustmentBlock';
import type { PackTemplate } from '../project/packs';
import { exportUserPacks, importUserPacks, useUserPacks } from './packStore';
import { listUserEffects, USER_EFFECTS_CATEGORY } from '../engine/userPlugins';
import { exportUserEffects, pickEffectFile } from './effectFile';
import { TextPresetThumb } from './TextPresetThumb';
import { t } from '../i18n';

export type LibraryTab = 'media' | 'text' | 'stickers' | 'sounds' | 'captions' | 'transcript' | 'voice' | 'packs' | PluginKind;

const TABS: { id: LibraryTab; label: string; title?: string; icon: ReactNode }[] = [
  { id: 'media', label: t('Mídia'), icon: <Film size={19} /> },
  { id: 'filter', label: t('Filtros'), icon: <Palette size={19} /> },
  { id: 'effect', label: t('Efeitos'), icon: <Sparkles size={19} /> },
  { id: 'transition', label: t('Transições'), icon: <Blend size={19} /> },
  { id: 'packs', label: t('Pacotes'), icon: <Package size={19} /> },
  { id: 'text', label: t('Textos'), icon: <Type size={19} /> },
  { id: 'stickers', label: t('Stickers'), icon: <Smile size={19} /> },
  { id: 'sounds', label: t('Sons'), icon: <Music2 size={19} /> },
  { id: 'captions', label: t('Legendas'), icon: <Captions size={19} /> },
  { id: 'transcript', label: t('Transcrição'), title: t('Transcrição: editar o vídeo pelo texto da fala'), icon: <FileText size={19} /> },
  { id: 'voice', label: t('Voz'), icon: <Mic size={19} /> },
];

/** Barra de ícones na lateral esquerda. */
export function Rail({ tab, onTab }: { tab: LibraryTab; onTab: (tab: LibraryTab) => void }) {
  return (
    // Rola quando a janela é baixa: senão as últimas abas (Legendas, Transcrição, Voz) ficam escondidas atrás da timeline.
    <nav className="flex min-h-0 flex-col items-center gap-1 overflow-y-auto overscroll-contain py-1.5 [scrollbar-width:none]">
      {TABS.map((item) => (
        <button
          key={item.id}
          title={item.title}
          onClick={() => onTab(item.id)}
          className={cx(
            'group relative flex w-[58px] shrink-0 flex-col items-center gap-1 rounded-xl py-1.5 text-[10.5px] font-medium tracking-[-0.01em] transition-colors',
            tab === item.id ? 'bg-panel-2 text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ring-1 ring-white/[0.06]' : 'text-faint hover:bg-panel/70 hover:text-dim',
          )}
        >
          {tab === item.id && (
            <span className="absolute -left-[5px] top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-gradient-to-b from-accent to-accent-2" />
          )}
          <span className={cx(tab === item.id && 'text-accent')}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}

interface LibraryProps {
  tab: LibraryTab;
  project: Project;
  onApply: (plugin: ShaderPlugin) => void;
  onImport: () => void;
  onAddMedia: (media: MediaItem) => void;
  /** Clique direito numa mídia ou num filtro/efeito/transição */
  onMediaMenu: (e: ReactMouseEvent, media: MediaItem) => void;
  onPluginMenu: (e: ReactMouseEvent, plugin: ShaderPlugin) => void;
  /** Pacotes de edição: clique aplica no cursor */
  onAddPack: (pack: PackTemplate) => void;
  onPackMenu: (e: ReactMouseEvent, pack: PackTemplate) => void;
  /** Painel de voz (narração, dublagem, voz sintética) */
  voice: VoicePanelProps;
  onRemoveMedia: (media: MediaItem) => void;
  onAddText: (preset: TextPreset) => void;
  /** Efeito sonoro: clique põe no cursor */
  onAddSound: (sound: SoundEffect) => void;
  /** Gerar música (no topo da aba Sons) */
  music?: MusicGeneratorProps;
  /** Gravar a tela (e a webcam) */
  onRecordScreen: () => void;
  /** Montar o vídeo pelo roteiro (aba Transcrição) */
  onScriptAssembly: () => void;
  /** Para o painel de legendas */
  time: number;
  onChange: (update: (project: Project) => Project) => void;
  onSeek: (time: number) => void;
  notify: (text: string, error?: boolean) => void;
  /** Legenda para editar (dois cliques nela na timeline); `n` muda a cada pedido */
  captionFocus?: { id: string; n: number } | null;
  /** Abrir a galeria da comunidade (botão no topo das abas Efeitos e Pacotes) */
  onGallery?: (kind: 'effect' | 'pack') => void;
}

export function Library(props: LibraryProps) {
  const { tab, project, onApply, onImport, onAddMedia, onRemoveMedia, onAddText } = props;
  return (
    <aside className="surface flex min-h-0 flex-col overflow-hidden">
      {tab === 'media' ? (
        <MediaList
          project={project}
          onRecordScreen={props.onRecordScreen}
          onImport={onImport}
          onAdd={onAddMedia}
          onRemove={onRemoveMedia}
          onMenu={props.onMediaMenu}
        />
      ) : tab === 'packs' ? (
        <PackList onAdd={props.onAddPack} onMenu={props.onPackMenu} notify={props.notify} onGallery={props.onGallery} />
      ) : tab === 'text' ? (
        <TextList onAdd={onAddText} />
      ) : tab === 'stickers' ? (
        <StickerList onAdd={onAddText} />
      ) : tab === 'sounds' ? (
        <SoundList onAdd={props.onAddSound} music={props.music} />
      ) : tab === 'voice' ? (
        <VoicePanel {...props.voice} project={project} />
      ) : tab === 'transcript' ? (
        <TranscriptPanel
          project={project}
          time={props.time}
          onChange={props.onChange}
          onSeek={props.onSeek}
          notify={props.notify}
          onScriptAssembly={props.onScriptAssembly}
        />
      ) : tab === 'captions' ? (
        <CaptionsPanel
          project={project}
          time={props.time}
          onChange={props.onChange}
          onSeek={props.onSeek}
          notify={props.notify}
          focus={props.captionFocus}
        />
      ) : (
        <PluginList key={tab} kind={tab} onApply={onApply} onMenu={props.onPluginMenu} notify={props.notify} onGallery={props.onGallery} />
      )}
    </aside>
  );
}

// ---------------------------------------------------------------- Pacotes de edição

const ANCHOR_HINT: Record<PackTemplate['anchor'], string> = {
  clip: t('Cobre o clipe selecionado (ou o que está no cursor)'),
  cursor: t('Começa no cursor: ponha o cursor na batida'),
  cut: t('Fica centralizado no corte mais perto do cursor'),
  'clip-start': t('Entra no começo do clipe do cursor'),
  'clip-end': t('Termina no fim do clipe do cursor'),
  beats: t('Cobre a música (ou o clipe selecionado) e pulsa em cada batida'),
};

function PackList({
  onAdd,
  onMenu,
  notify,
  onGallery,
}: {
  onAdd: (pack: PackTemplate) => void;
  onMenu: (e: ReactMouseEvent, pack: PackTemplate) => void;
  notify: (text: string, error?: boolean) => void;
  onGallery?: (kind: 'effect' | 'pack') => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const mine = useUserPacks();
  // Muda quando as fotos de exemplo chegam: as miniaturas são refeitas com elas.
  const version = usePreviewVersion();
  const rows = useMemo(
    () => [
      ...(mine.length ? [{ title: 'Meus pacotes', items: mine }] : []),
      ...PACK_CATEGORIES.map((c) => ({ title: c, items: PACKS.filter((p) => p.category === c) })),
    ],
    [mine],
  );
  const all = rows.flatMap((r) => r.items);
  const query = search.trim().toLowerCase();
  const inCategory = rows.find((r) => r.title === category)?.items;
  const list = (inCategory ?? all).filter((p) => `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(query));
  const showRows = !query && !category;

  const card = (pack: PackTemplate, inRow: boolean) => {
    const thumb = version >= 0 ? getPackPreview(pack) : null;
    return (
      <button
        key={pack.id}
        title={`${pack.description}\n${ANCHOR_HINT[pack.anchor]}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(PACK_MIME, pack.id);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        onClick={() => onAdd(pack)}
        onContextMenu={(e) => onMenu(e, pack)}
        onMouseEnter={() => setHovered(pack.id)}
        onMouseLeave={() => setHovered((h) => (h === pack.id ? null : h))}
        className={cx('group animate-fade-in text-left', inRow && 'w-28 shrink-0 snap-start')}
      >
        <div className="relative aspect-video overflow-hidden rounded-lg bg-panel-3 ring-1 ring-line transition-all group-hover:ring-2 group-hover:ring-accent">
          {thumb && <img src={thumb} alt="" draggable={false} className="size-full object-cover" />}
          {hovered === pack.id && <LivePreview pack={pack} className="absolute inset-0" />}
          <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: pack.color }} />
          <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-black/70 px-1 py-px font-mono text-[9px] text-white/90">
            {pack.timing === 'stretch' ? <Timer size={9} /> : <Package size={9} />}
            {pack.duration < 10 ? `${pack.duration.toFixed(1)}s` : `${Math.round(pack.duration)}s`}
          </span>
          <span className="absolute bottom-1.5 right-1 flex size-6 scale-75 items-center justify-center rounded-full bg-accent text-white opacity-0 shadow-lg transition-all group-hover:scale-100 group-hover:opacity-100">
            <Plus size={14} />
          </span>
        </div>
        <p className="mt-1.5 truncate text-xs font-medium text-dim group-hover:text-fg">{pack.name}</p>
      </button>
    );
  };

  return (
    <>
      <PanelHeader
        title={t('Pacotes de edição')}
        count={all.length}
        actions={
          <>
            {onGallery && (
              <button title={t('Galeria da comunidade: pacotes de outras pessoas')} onClick={() => onGallery('pack')} className="text-faint transition-colors hover:text-accent">
                <Store size={14} />
              </button>
            )}
            <button
              title={t('Importar pacotes (.lumiarpack)')}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.lumiarpack,application/json';
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    const count = await importUserPacks(file);
                    notify(count ? t('{n} pacote(s) importado(s) para "Meus pacotes".', { n: count }) : t('O arquivo não tinha pacotes.'), count === 0);
                  } catch (error) {
                    notify(error instanceof Error ? error.message : String(error), true);
                  }
                };
                input.click();
              }}
              className="text-faint transition-colors hover:text-accent"
            >
              <Upload size={14} />
            </button>
            {mine.length > 0 && (
              <button
                title={t('Exportar meus {n} pacote(s) para um arquivo', { n: mine.length })}
                onClick={() => {
                  const url = URL.createObjectURL(exportUserPacks());
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'meus-pacotes.lumiarpack';
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 10_000);
                  notify(t('Pacotes exportados. Abra o arquivo em outro Lumiar com o botão de importar.'));
                }}
                className="text-faint transition-colors hover:text-accent"
              >
                <Download size={14} />
              </button>
            )}
          </>
        }
        hint={t('Edições prontas: filtro, efeitos, câmera, velocidade e até batidas da música de uma vez.\nCada pacote vira um bloco na timeline que vale para tudo o que está embaixo dele.\n\nClique para aplicar no cursor, arraste até a trilha de pacotes ou use o botão direito para fixar direto num clipe.')}
      />
      <div className="space-y-2.5 px-4 pb-3">
        <AdjustmentCard onAdd={onAdd} onMenu={onMenu} />
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="field w-full pl-8" placeholder={t('Buscar…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Chips
          value={category}
          onChange={setCategory}
          options={[{ value: null, label: t('Todos') }, ...rows.map((r) => ({ value: r.title, label: t(r.title) }))]}
        />
      </div>

      {showRows ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
          {rows.map((row) => (
            <section key={row.title}>
              <div className="mb-2 flex items-center justify-between px-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                  {row.items[0] && <span className="size-2 rounded-full" style={{ background: row.items[0].color }} />}
                  {t(row.title)} <span className="font-normal text-faint">{row.items.length}</span>
                </h3>
                <button
                  onClick={() => setCategory(row.title)}
                  className="flex items-center text-[11px] text-faint transition-colors hover:text-accent"
                >
                  {t('Ver todos')}
                  <ChevronRight size={13} />
                </button>
              </div>
              <Carousel>{row.items.map((p) => card(p, true))}</Carousel>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {category && (
            <button
              onClick={() => setCategory(null)}
              className="mx-4 mb-2 flex items-center gap-1 self-start text-xs font-semibold text-fg transition-colors hover:text-accent"
            >
              <ChevronLeft size={15} />
              {t(category)}
              <span className="font-normal text-faint">{list.length}</span>
            </button>
          )}
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-3 overflow-y-auto px-4 pb-4">
            {list.map((p) => card(p, false))}
            {list.length === 0 && <p className="col-span-2 py-8 text-center text-xs text-faint">{t('Nada encontrado.')}</p>}
          </div>
        </div>
      )}
    </>
  );
}

/** Bloco de ajuste: um pacote vazio, no topo da aba (clique põe no clipe selecionado ou no cursor; dá para arrastar). */
function AdjustmentCard({ onAdd, onMenu }: { onAdd: (pack: PackTemplate) => void; onMenu: (e: ReactMouseEvent, pack: PackTemplate) => void }) {
  return (
    <button
      title={`${ADJUSTMENT_TEMPLATE.description}\n${ANCHOR_HINT[ADJUSTMENT_TEMPLATE.anchor]}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PACK_MIME, ADJUSTMENT_TEMPLATE.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onAdd(ADJUSTMENT_TEMPLATE)}
      onContextMenu={(e) => onMenu(e, ADJUSTMENT_TEMPLATE)}
      className="group flex w-full items-center gap-2.5 rounded-lg border border-dashed border-line-strong bg-panel-2 px-2.5 py-2 text-left transition-colors hover:border-accent"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-panel-3 text-dim group-hover:text-accent">
        <SquareDashed size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-fg">{ADJUSTMENT_TEMPLATE.name}</span>
        <span className="block truncate text-[11px] text-faint">{t('Vazio: você escolhe o filtro, os efeitos, a cor e a câmera')}</span>
      </span>
      <Plus size={14} className="shrink-0 text-faint group-hover:text-accent" />
    </button>
  );
}

// ---------------------------------------------------------------- Textos

function TextList({ onAdd }: { onAdd: (preset: TextPreset) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <>
      <PanelHeader
        title={t('Textos')}
        count={TEXT_PRESETS.length}
        hint={t('Clique para pôr no cursor, ou arraste até uma trilha de texto. Passe o mouse para ver a animação.')}
      />
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-3 overflow-y-auto px-4 pb-4">
        {TEXT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TEXT_PRESET_MIME, preset.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onAdd(preset)}
            onMouseEnter={() => setHovered(preset.id)}
            onMouseLeave={() => setHovered((h) => (h === preset.id ? null : h))}
            className="group animate-fade-in text-left"
          >
            <div className="relative aspect-video overflow-hidden rounded-lg bg-panel-3 ring-1 ring-line transition-all group-hover:ring-2 group-hover:ring-accent">
              <TextPresetThumb preset={preset} live={hovered === preset.id} />
              <span className="absolute bottom-1 right-1 flex size-6 scale-75 items-center justify-center rounded-full bg-accent text-white opacity-0 shadow-lg transition-all group-hover:scale-100 group-hover:opacity-100">
                <Plus size={14} />
              </span>
            </div>
            <p className="mt-1.5 truncate text-xs font-medium text-dim group-hover:text-fg">{preset.name}</p>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Stickers

function StickerList({ onAdd }: { onAdd: (preset: TextPreset) => void }) {
  const [category, setCategory] = useState<string | null>(null);
  const list = STICKERS.filter((s) => !category || s.category === category);
  return (
    <>
      <PanelHeader
        title={t('Stickers')}
        count={STICKERS.length}
        hint={t('Emojis grandes e animados. Clique para pôr no cursor ou arraste até uma trilha de texto.\nDepois, arraste no vídeo para posicionar; no painel da direita dá para mudar o tamanho, girar e trocar a animação.')}
      />
      <div className="px-4 pb-3">
        <Chips
          value={category}
          onChange={setCategory}
          options={[{ value: null, label: t('Todos') }, ...STICKER_CATEGORIES.map((c) => ({ value: c, label: t(c) }))]}
        />
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(54px,1fr))] gap-2 overflow-y-auto px-4 pb-4">
        {list.map((sticker) => (
          <button
            key={sticker.id}
            title={sticker.name}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TEXT_PRESET_MIME, sticker.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onAdd(sticker)}
            className="group flex aspect-square animate-fade-in items-center justify-center rounded-lg bg-panel-3 text-3xl ring-1 ring-line transition-all hover:bg-panel-2 hover:ring-2 hover:ring-accent"
          >
            <span className="transition-transform group-hover:scale-125 group-hover:animate-bounce">{sticker.icon ?? sticker.sample}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Efeitos sonoros

/** Um só player para ouvir os sons da biblioteca. */
let listening: HTMLAudioElement | null = null;

function SoundList({ onAdd, music }: { onAdd: (sound: SoundEffect) => void; music?: MusicGeneratorProps }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const query = search.trim().toLowerCase();
  const list = SOUNDS.filter(
    (s) => (!category || s.category === category) && `${s.name} ${s.description} ${s.category}`.toLowerCase().includes(query),
  );

  const listen = async (sound: SoundEffect) => {
    listening?.pause();
    if (playing === sound.id) {
      setPlaying(null);
      return;
    }
    setPlaying(sound.id);
    const audio = new Audio(await soundUrl(sound.id));
    listening = audio;
    audio.onended = () => setPlaying((p) => (p === sound.id ? null : p));
    void audio.play().catch(() => setPlaying(null));
  };

  return (
    <>
      <PanelHeader
        title={t('Efeitos sonoros')}
        count={SOUNDS.length}
        hint={t('Sons criados pelo próprio Lumiar, sem internet. ▶ ouve, clique no nome para pôr no cursor ou arraste até uma trilha de áudio.\nOs sons vão para a trilha "Efeitos sonoros".')}
      />
      <div className="space-y-2.5 px-4 pb-3">
        {music && <MusicGenerator {...music} />}
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="field w-full pl-8" placeholder={t('Buscar…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Chips
          value={category}
          onChange={setCategory}
          options={[{ value: null, label: t('Todos') }, ...SOUND_CATEGORIES.map((c) => ({ value: c, label: t(c) }))]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {SOUND_CATEGORIES.map((c) => {
          const items = list.filter((s) => s.category === c);
          if (items.length === 0) return null;
          return (
            <section key={c} className="mb-3">
              <h3 className="mb-1 px-1 text-xs font-semibold text-fg">
                {t(c)} <span className="font-normal text-faint">{items.length}</span>
              </h3>
              {items.map((sound) => (
                <div
                  key={sound.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(SOUND_MIME, sound.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title={`${sound.description}\n${t('Clique para pôr no cursor · arraste até uma trilha de áudio')}`}
                  className="group flex animate-fade-in cursor-grab items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-panel-2 active:cursor-grabbing"
                >
                  <button
                    title={playing === sound.id ? t('Parar') : t('Ouvir')}
                    onClick={() => void listen(sound)}
                    className={cx(
                      'flex size-7 shrink-0 items-center justify-center rounded-full transition-colors',
                      playing === sound.id ? 'bg-accent text-white' : 'bg-panel-3 text-dim hover:bg-accent/30 hover:text-fg',
                    )}
                  >
                    {playing === sound.id ? <Square size={10} fill="currentColor" /> : <Play size={11} fill="currentColor" className="ml-px" />}
                  </button>
                  <button onClick={() => onAdd(sound)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-xs font-medium text-dim group-hover:text-fg">{sound.name}</p>
                  </button>
                  <span className="font-mono text-[10px] text-faint">{sound.duration.toFixed(1)}s</span>
                  <button
                    title={t('Pôr no cursor')}
                    onClick={() => onAdd(sound)}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              ))}
            </section>
          );
        })}
        {list.length === 0 && <p className="py-8 text-center text-xs text-faint">{t('Nada encontrado.')}</p>}
      </div>
    </>
  );
}

function PanelHeader({ title, count, hint, actions }: { title: string; count: number; hint?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-3 pt-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <span className="text-xs text-faint">{count}</span>
      <span className="ml-auto flex items-center gap-2.5">
        {actions}
        {hint && (
          <span title={hint} className="cursor-help text-faint transition-colors hover:text-accent">
            <Info size={14} />
          </span>
        )}
      </span>
    </div>
  );
}

function Chips<T extends string | null>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { ref, onScroll, mask } = useEdgeFade<HTMLDivElement>();
  return (
    <div ref={ref} onScroll={onScroll} style={mask} className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {options.map((o) => (
        <button
          key={o.value ?? 'all'}
          onClick={() => onChange(o.value)}
          className={cx(
            'shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
            value === o.value ? 'border-accent bg-accent/15 text-fg' : 'border-line text-dim hover:border-line-strong hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Onde ainda há conteúdo para rolar nas bordas: esmaece só esse lado (o cartão cortado vira um convite para rolar). */
function useEdgeFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    onScroll();
    const observer = new ResizeObserver(onScroll);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const image = `linear-gradient(to right, ${edges.left ? 'transparent, #000 28px' : '#000, #000'}, ${edges.right ? '#000 calc(100% - 40px), transparent' : '#000'})`;
  return { ref, onScroll, edges, mask: { maskImage: image, WebkitMaskImage: image } };
}

/** Linha de cartões que rola para o lado: sem barra, bordas esmaecidas e setas ao passar o mouse. */
function Carousel({ children }: { children: ReactNode }) {
  const { ref, onScroll, edges, mask } = useEdgeFade<HTMLDivElement>();
  const page = (direction: number) => ref.current?.scrollBy({ left: direction * (ref.current.clientWidth - 56), behavior: 'smooth' });
  return (
    <div className="group/row relative">
      <div ref={ref} onScroll={onScroll} style={mask} className="no-scrollbar flex snap-x gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-1">
        {children}
      </div>
      {(['left', 'right'] as const).map(
        (side) =>
          edges[side] && (
            <button
              key={side}
              tabIndex={-1}
              aria-label={side === 'left' ? t('Anteriores') : t('Mais')}
              onClick={() => page(side === 'left' ? -1 : 1)}
              className={cx(
                'absolute top-[29px] z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-panel-3/95 text-fg opacity-0 shadow-lg shadow-black/40 transition-opacity hover:bg-panel-2 group-hover/row:opacity-100',
                side === 'left' ? 'left-1.5' : 'right-1.5',
              )}
            >
              {side === 'left' ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
            </button>
          ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Mídia

const KIND_ICON: Record<MediaKind, ReactNode> = {
  video: <Film size={10} />,
  audio: <AudioLines size={10} />,
  image: <ImageIcon size={10} />,
};

function MediaList({
  project,
  onImport,
  onAdd,
  onRemove,
  onMenu,
  onRecordScreen,
}: {
  project: Project;
  onRecordScreen: () => void;
  onImport: () => void;
  onAdd: (media: MediaItem) => void;
  onRemove: (media: MediaItem) => void;
  onMenu: (e: ReactMouseEvent, media: MediaItem) => void;
}) {
  const [kind, setKind] = useState<MediaKind | null>(null);
  const list = project.media.filter((m) => !kind || m.kind === kind);

  return (
    <>
      <PanelHeader title={t('Mídia do projeto')} count={project.media.length} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <button
          onClick={onImport}
          className="group mb-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-line-strong bg-panel-2/50 px-4 py-3.5 text-left text-dim transition-colors hover:border-accent hover:bg-accent/5 hover:text-fg"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/30 transition-transform group-hover:scale-110">
            <Upload size={18} />
          </span>
          <span>
            <span className="block font-medium text-fg">{t('Importar mídia')}</span>
            <span className="text-[11px] text-faint">{t('Vídeos, músicas e imagens')}</span>
          </span>
        </button>
        <button
          onClick={onRecordScreen}
          title={t('Grava a tela (e a webcam junto) para tutoriais e gameplay')}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-line px-2 py-1.5 text-xs text-dim transition-colors hover:border-line-strong hover:bg-panel-2 hover:text-fg"
        >
          <MonitorUp size={13} className="text-accent" />
          {t('Gravar a tela')}
        </button>

        <Chips
          value={kind}
          onChange={setKind}
          options={[
            { value: null, label: t('Tudo') },
            { value: 'video', label: t('Vídeos') },
            { value: 'audio', label: t('Áudios') },
            { value: 'image', label: t('Imagens') },
          ]}
        />

        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-3">
          {list.map((media) => (
            <div
              key={media.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(MEDIA_MIME, media.id);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onDoubleClick={() => onAdd(media)}
              onContextMenu={(e) => onMenu(e, media)}
              title={`${media.name}\n${t('Arraste para a timeline, clique em + ou use o botão direito')}`}
              className="group cursor-grab animate-fade-in active:cursor-grabbing"
            >
              <div className="relative aspect-video overflow-hidden rounded-lg bg-panel-3 ring-1 ring-line transition-all group-hover:ring-2 group-hover:ring-accent">
                {media.kind === 'audio' ? (
                  <div className="flex size-full items-center bg-gradient-to-br from-[#115e59] to-[#0b2f3a] px-1.5">
                    <Waveform mediaId={media.id} trimIn={0} trimOut={media.duration} width={118} height={40} color="rgba(153,246,228,0.8)" />
                  </div>
                ) : (
                  media.thumbnail && <img src={media.thumbnail} alt="" draggable={false} className="size-full object-cover" />
                )}
                <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-black/70 px-1 py-px text-[9px] uppercase text-white/90">
                  {KIND_ICON[media.kind]}
                </span>
                {media.kind !== 'image' && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 font-mono text-[10px]">
                    {formatTime(media.duration).replace(/\.\d+$/, '')}
                  </span>
                )}
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    title={t('Adicionar à timeline')}
                    onClick={() => onAdd(media)}
                    className="flex size-7 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-110"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    title={t('Remover do projeto')}
                    onClick={() => onRemove(media)}
                    className="flex size-6 items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-danger hover:text-white"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
              <p className="mt-1.5 truncate text-xs text-dim group-hover:text-fg">{media.name}</p>
            </div>
          ))}
        </div>
        {project.media.length > 0 && list.length === 0 && <p className="py-8 text-center text-xs text-faint">{t('Nada aqui.')}</p>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Efeitos, transições e filtros

const PLUGIN_INFO: Record<PluginKind, { title: string; list: ShaderPlugin[]; hint: string }> = {
  effect: {
    title: t('Efeitos'),
    list: effectPlugins,
    hint: t('Clique para aplicar no clipe selecionado, ou arraste até um clipe na timeline.'),
  },
  transition: {
    title: t('Transições'),
    list: transitionPlugins,
    hint: t('Clique para aplicar na transição selecionada, ou arraste até um ◆ na timeline.'),
  },
  filter: {
    title: t('Filtros'),
    list: filterPlugins,
    hint: t('Um filtro por clipe, com intensidade ajustável. Clique ou arraste até um clipe.'),
  },
};

/** Primeira linha das transições, como os "mais usados" dos editores de celular. */
const FEATURED: Partial<Record<PluginKind, { title: string; ids: string[] }>> = {
  transition: {
    title: 'Em alta',
    ids: [
      'onda-de-choque', 'terremoto', 'vidro-quebrado', 'zoom-de-tensao', 'batimento', 'camera-de-video',
      'borboleta', 'empilhar', 'pilha-brilhante', 'loop-cromatico', 'explosao-de-luz', 'teleobjetiva',
    ].map((id) => `transitions/${id}`),
  },
};

function PluginList({
  kind,
  onApply,
  onMenu,
  notify,
  onGallery,
}: {
  kind: PluginKind;
  onApply: (plugin: ShaderPlugin) => void;
  onMenu: (e: ReactMouseEvent, plugin: ShaderPlugin) => void;
  notify: (text: string, error?: boolean) => void;
  onGallery?: (kind: 'effect' | 'pack') => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const pluginVersion = useSyncExternalStore(subscribePlugins, pluginsVersion);
  const previews = usePluginPreviews();
  const { title, list: all, hint } = PLUGIN_INFO[kind];
  // Quantos efeitos são do editor de efeitos (os que dá para exportar).
  const mine = kind === 'effect' ? all.filter((p) => p.category === USER_EFFECTS_CATEGORY).length : 0;

  const categories = useMemo(() => sortCategories(kind, [...new Set(all.map((p) => p.category))]), [kind, all, pluginVersion]);
  const rows = useMemo(() => {
    const featured = FEATURED[kind];
    const byCategory = categories.map((c) => ({ title: c, items: all.filter((p) => p.category === c) }));
    if (!featured) return byCategory;
    const items = featured.ids.map((id) => all.find((p) => p.id === id)).filter((p): p is ShaderPlugin => !!p);
    return [{ title: featured.title, items }, ...byCategory];
  }, [kind, all, categories, pluginVersion]);

  const query = search.trim().toLowerCase();
  const featuredOpen = category === FEATURED[kind]?.title;
  const list = (featuredOpen ? rows[0].items : all.filter((p) => !category || p.category === category)).filter((p) =>
    `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(query),
  );
  // Sem busca e sem categoria escolhida: uma linha por categoria, como nos editores de celular.
  const showRows = !query && !category;

  const card = (plugin: ShaderPlugin, inRow: boolean) => (
    <button
      key={plugin.id}
      title={plugin.description}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PLUGIN_MIME, plugin.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onApply(plugin)}
      onContextMenu={(e) => onMenu(e, plugin)}
      onMouseEnter={() => setHovered(plugin.id)}
      onMouseLeave={() => setHovered((h) => (h === plugin.id ? null : h))}
      className={cx('group animate-fade-in text-left', inRow && 'w-28 shrink-0 snap-start')}
    >
      <div className="relative aspect-video overflow-hidden rounded-lg bg-panel-3 ring-1 ring-line transition-all group-hover:ring-2 group-hover:ring-accent">
        {previews.get(plugin.id) && (
          <img src={previews.get(plugin.id)} alt="" draggable={false} className="size-full object-cover" />
        )}
        {/* Ao passar o mouse, a miniatura ganha vida. */}
        {hovered === plugin.id && <LivePreview plugin={plugin} className="absolute inset-0" />}
        <span className="absolute bottom-1 right-1 flex size-6 scale-75 items-center justify-center rounded-full bg-accent text-white opacity-0 shadow-lg transition-all group-hover:scale-100 group-hover:opacity-100">
          <Plus size={14} />
        </span>
        {kind === 'transition' && (
          <span className="absolute left-1 top-1 rounded bg-amber px-1 text-[9px] font-bold text-black/80">◆</span>
        )}
        {kind === 'filter' && (
          <span className="absolute left-1 top-1 flex items-center rounded bg-pink px-1 py-px text-white">
            <Palette size={9} />
          </span>
        )}
      </div>
      <p className="mt-1.5 truncate text-xs font-medium text-dim group-hover:text-fg">{plugin.name}</p>
    </button>
  );

  return (
    <>
      <PanelHeader
        title={title}
        count={all.length}
        hint={kind === 'effect' ? `${hint}\n\n${t('Os efeitos do editor de efeitos ficam em "Meus efeitos"; use os botões ao lado para importar ou exportar (.lumiarfx).')}` : hint}
        actions={
          kind === 'effect' && (
            <>
              {onGallery && (
                <button title={t('Galeria da comunidade: efeitos de outras pessoas')} onClick={() => onGallery('effect')} className="text-faint transition-colors hover:text-accent">
                  <Store size={14} />
                </button>
              )}
              <button
                title={t('Importar efeitos (.lumiarfx)')}
                onClick={() => pickEffectFile(notify)}
                className="text-faint transition-colors hover:text-accent"
              >
                <Upload size={14} />
              </button>
              {mine > 0 && (
                <button
                  title={t('Exportar meus {n} efeito(s) para um arquivo', { n: mine })}
                  onClick={() => {
                    exportUserEffects(listUserEffects());
                    notify(t('Efeitos exportados. Abra o arquivo em outro Lumiar com o botão de importar.'));
                  }}
                  className="text-faint transition-colors hover:text-accent"
                >
                  <Download size={14} />
                </button>
              )}
            </>
          )
        }
      />
      <div className="space-y-2.5 px-4 pb-3">
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="field w-full pl-8" placeholder={t('Buscar…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Chips
          value={category}
          onChange={setCategory}
          options={[{ value: null, label: t('Todos') }, ...rows.map((r) => ({ value: r.title, label: t(r.title) }))]}
        />
      </div>

      {showRows ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
          {rows.map((row) => (
            <section key={row.title}>
              <div className="mb-2 flex items-center justify-between px-4">
                <h3 className="text-xs font-semibold text-fg">
                  {t(row.title)} <span className="font-normal text-faint">{row.items.length}</span>
                </h3>
                <button
                  onClick={() => setCategory(row.title)}
                  className="flex items-center text-[11px] text-faint transition-colors hover:text-accent"
                >
                  {t('Ver todos')}
                  <ChevronRight size={13} />
                </button>
              </div>
              <Carousel>{row.items.map((plugin) => card(plugin, true))}</Carousel>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {category && (
            <button
              onClick={() => setCategory(null)}
              className="mx-4 mb-2 flex items-center gap-1 self-start text-xs font-semibold text-fg transition-colors hover:text-accent"
            >
              <ChevronLeft size={15} />
              {t(category)}
              <span className="font-normal text-faint">{list.length}</span>
            </button>
          )}
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-3 overflow-y-auto px-4 pb-4">
            {list.map((plugin) => card(plugin, false))}
            {list.length === 0 && <p className="col-span-2 py-8 text-center text-xs text-faint">{t('Nada encontrado.')}</p>}
          </div>
        </div>
      )}
    </>
  );
}
