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
  Type,
  Upload,
  Download,
  X,
} from 'lucide-react';
import { useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { effectPlugins, filterPlugins, transitionPlugins } from '../engine/registry';
import type { PluginKind, ShaderPlugin } from '../engine/types';
import type { MediaItem, MediaKind, Project } from '../project/model';
import { STICKER_CATEGORIES, STICKERS, TEXT_PRESETS, type TextPreset } from '../project/text';
import { SOUND_CATEGORIES, SOUNDS, soundUrl, type SoundEffect } from '../media/sfx';
import { formatTime } from './format';
import { CaptionsPanel } from './CaptionsPanel';
import { VoicePanel, type VoicePanelProps } from './VoicePanel';
import { cx } from './kit';
import { LivePreview } from './LivePreview';
import { sortCategories } from './PluginPicker';
import { Waveform } from './MediaVisuals';
import { getPackPreview, usePluginPreviews, usePreviewVersion } from './previews';
import { MEDIA_MIME, PACK_MIME, PLUGIN_MIME, SOUND_MIME, TEXT_PRESET_MIME } from './selection';
import { PACK_CATEGORIES, PACKS } from '../project/packLibrary';
import type { PackTemplate } from '../project/packs';
import { exportUserPacks, importUserPacks, useUserPacks } from './packStore';
import { TextPresetThumb } from './TextPresetThumb';

export type LibraryTab = 'media' | 'text' | 'stickers' | 'sounds' | 'captions' | 'voice' | 'packs' | PluginKind;

const TABS: { id: LibraryTab; label: string; icon: ReactNode }[] = [
  { id: 'media', label: 'Mídia', icon: <Film size={19} /> },
  { id: 'filter', label: 'Filtros', icon: <Palette size={19} /> },
  { id: 'effect', label: 'Efeitos', icon: <Sparkles size={19} /> },
  { id: 'transition', label: 'Transições', icon: <Blend size={19} /> },
  { id: 'packs', label: 'Pacotes', icon: <Package size={19} /> },
  { id: 'text', label: 'Textos', icon: <Type size={19} /> },
  { id: 'stickers', label: 'Stickers', icon: <Smile size={19} /> },
  { id: 'sounds', label: 'Sons', icon: <Music2 size={19} /> },
  { id: 'captions', label: 'Legendas', icon: <Captions size={19} /> },
  { id: 'voice', label: 'Voz', icon: <Mic size={19} /> },
];

/** Barra de ícones na lateral esquerda. */
export function Rail({ tab, onTab }: { tab: LibraryTab; onTab: (tab: LibraryTab) => void }) {
  return (
    <nav className="flex flex-col items-center gap-1 border-r border-line bg-panel py-3">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onTab(t.id)}
          className={cx(
            'group relative flex w-14 flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium transition-colors',
            tab === t.id ? 'bg-panel-3 text-fg' : 'text-faint hover:bg-panel-2 hover:text-dim',
          )}
        >
          {tab === t.id && (
            <span className="absolute -left-[5px] top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-gradient-to-b from-accent to-accent-2" />
          )}
          <span className={cx(tab === t.id && 'text-accent')}>{t.icon}</span>
          {t.label}
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
  onLoadSamples: () => void;
  /** Para o painel de legendas */
  time: number;
  onChange: (update: (project: Project) => Project) => void;
  onSeek: (time: number) => void;
  notify: (text: string, error?: boolean) => void;
}

export function Library(props: LibraryProps) {
  const { tab, project, onApply, onImport, onAddMedia, onRemoveMedia, onAddText, onLoadSamples } = props;
  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel">
      {tab === 'media' ? (
        <MediaList
          project={project}
          onImport={onImport}
          onAdd={onAddMedia}
          onRemove={onRemoveMedia}
          onLoadSamples={onLoadSamples}
          onMenu={props.onMediaMenu}
        />
      ) : tab === 'packs' ? (
        <PackList onAdd={props.onAddPack} onMenu={props.onPackMenu} notify={props.notify} />
      ) : tab === 'text' ? (
        <TextList onAdd={onAddText} />
      ) : tab === 'stickers' ? (
        <StickerList onAdd={onAddText} />
      ) : tab === 'sounds' ? (
        <SoundList onAdd={props.onAddSound} />
      ) : tab === 'voice' ? (
        <VoicePanel {...props.voice} project={project} />
      ) : tab === 'captions' ? (
        <CaptionsPanel project={project} time={props.time} onChange={props.onChange} onSeek={props.onSeek} notify={props.notify} />
      ) : (
        <PluginList key={tab} kind={tab} onApply={onApply} onMenu={props.onPluginMenu} />
      )}
    </aside>
  );
}

// ---------------------------------------------------------------- Pacotes de edição

const ANCHOR_HINT: Record<PackTemplate['anchor'], string> = {
  clip: 'Cobre o clipe selecionado (ou o que está no cursor)',
  cursor: 'Começa no cursor: ponha o cursor na batida',
  cut: 'Fica centralizado no corte mais perto do cursor',
  'clip-start': 'Entra no começo do clipe do cursor',
  'clip-end': 'Termina no fim do clipe do cursor',
  beats: 'Cobre a música (ou o clipe selecionado) e pulsa em cada batida',
};

function PackList({
  onAdd,
  onMenu,
  notify,
}: {
  onAdd: (pack: PackTemplate) => void;
  onMenu: (e: ReactMouseEvent, pack: PackTemplate) => void;
  notify: (text: string, error?: boolean) => void;
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
        title="Pacotes de edição"
        count={all.length}
        actions={
          <>
            <button
              title="Importar pacotes (.lumiarpack)"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.lumiarpack,application/json';
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  try {
                    const count = await importUserPacks(file);
                    notify(count ? `${count} pacote(s) importado(s) para "Meus pacotes".` : 'O arquivo não tinha pacotes.', count === 0);
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
                title={`Exportar meus ${mine.length} pacote(s) para um arquivo`}
                onClick={() => {
                  const url = URL.createObjectURL(exportUserPacks());
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'meus-pacotes.lumiarpack';
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 10_000);
                  notify('Pacotes exportados. Abra o arquivo em outro Lumiar com o botão de importar.');
                }}
                className="text-faint transition-colors hover:text-accent"
              >
                <Download size={14} />
              </button>
            )}
          </>
        }
        hint={'Edições prontas: filtro, efeitos, câmera, velocidade e até batidas da música de uma vez.\nCada pacote vira um bloco na timeline que vale para tudo o que está embaixo dele.\n\nClique para aplicar no cursor, arraste até a trilha de pacotes ou use o botão direito para fixar direto num clipe.'}
      />
      <div className="space-y-2.5 px-4 pb-3">
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="field w-full pl-8" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Chips
          value={category}
          onChange={setCategory}
          options={[{ value: null, label: 'Todos' }, ...rows.map((r) => ({ value: r.title, label: r.title }))]}
        />
      </div>

      {showRows ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
          {rows.map((row) => (
            <section key={row.title}>
              <div className="mb-2 flex items-center justify-between px-4">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                  {row.items[0] && <span className="size-2 rounded-full" style={{ background: row.items[0].color }} />}
                  {row.title} <span className="font-normal text-faint">{row.items.length}</span>
                </h3>
                <button
                  onClick={() => setCategory(row.title)}
                  className="flex items-center text-[11px] text-faint transition-colors hover:text-accent"
                >
                  Ver todos
                  <ChevronRight size={13} />
                </button>
              </div>
              <div className="flex snap-x gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-1">{row.items.map((p) => card(p, true))}</div>
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
              {category}
              <span className="font-normal text-faint">{list.length}</span>
            </button>
          )}
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto px-4 pb-4">
            {list.map((p) => card(p, false))}
            {list.length === 0 && <p className="col-span-2 py-8 text-center text-xs text-faint">Nada encontrado.</p>}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Textos

function TextList({ onAdd }: { onAdd: (preset: TextPreset) => void }) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <>
      <PanelHeader
        title="Textos"
        count={TEXT_PRESETS.length}
        hint="Clique para pôr no cursor, ou arraste até uma trilha de texto. Passe o mouse para ver a animação."
      />
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto px-4 pb-4">
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
        title="Stickers"
        count={STICKERS.length}
        hint={'Emojis grandes e animados. Clique para pôr no cursor ou arraste até uma trilha de texto.\nDepois, arraste no vídeo para posicionar; no painel da direita dá para mudar o tamanho, girar e trocar a animação.'}
      />
      <div className="px-4 pb-3">
        <Chips
          value={category}
          onChange={setCategory}
          options={[{ value: null, label: 'Todos' }, ...STICKER_CATEGORIES.map((c) => ({ value: c, label: c }))]}
        />
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-2 overflow-y-auto px-4 pb-4">
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
            <span className="transition-transform group-hover:scale-125 group-hover:animate-bounce">{sticker.sample}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Efeitos sonoros

/** Um só player para ouvir os sons da biblioteca. */
let listening: HTMLAudioElement | null = null;

function SoundList({ onAdd }: { onAdd: (sound: SoundEffect) => void }) {
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
        title="Efeitos sonoros"
        count={SOUNDS.length}
        hint={'Sons criados pelo próprio Lumiar, sem internet. ▶ ouve, clique no nome para pôr no cursor ou arraste até uma trilha de áudio.\nOs sons vão para a trilha "Efeitos sonoros".'}
      />
      <div className="space-y-2.5 px-4 pb-3">
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="field w-full pl-8" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Chips
          value={category}
          onChange={setCategory}
          options={[{ value: null, label: 'Todos' }, ...SOUND_CATEGORIES.map((c) => ({ value: c, label: c }))]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {SOUND_CATEGORIES.map((c) => {
          const items = list.filter((s) => s.category === c);
          if (items.length === 0) return null;
          return (
            <section key={c} className="mb-3">
              <h3 className="mb-1 px-1 text-xs font-semibold text-fg">
                {c} <span className="font-normal text-faint">{items.length}</span>
              </h3>
              {items.map((sound) => (
                <div
                  key={sound.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(SOUND_MIME, sound.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title={`${sound.description}\nClique para pôr no cursor · arraste até uma trilha de áudio`}
                  className="group flex animate-fade-in cursor-grab items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-panel-2 active:cursor-grabbing"
                >
                  <button
                    title={playing === sound.id ? 'Parar' : 'Ouvir'}
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
                    title="Pôr no cursor"
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
        {list.length === 0 && <p className="py-8 text-center text-xs text-faint">Nada encontrado.</p>}
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
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
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
  onLoadSamples,
  onMenu,
}: {
  project: Project;
  onImport: () => void;
  onAdd: (media: MediaItem) => void;
  onRemove: (media: MediaItem) => void;
  onLoadSamples: () => void;
  onMenu: (e: ReactMouseEvent, media: MediaItem) => void;
}) {
  const [kind, setKind] = useState<MediaKind | null>(null);
  const list = project.media.filter((m) => !kind || m.kind === kind);

  return (
    <>
      <PanelHeader title="Mídia do projeto" count={project.media.length} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <button
          onClick={onImport}
          className="group mb-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-line-strong bg-panel-2/50 px-4 py-3.5 text-left text-dim transition-colors hover:border-accent hover:bg-accent/5 hover:text-fg"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/30 transition-transform group-hover:scale-110">
            <Upload size={18} />
          </span>
          <span>
            <span className="block font-medium text-fg">Importar mídia</span>
            <span className="text-[11px] text-faint">Vídeos, músicas e imagens</span>
          </span>
        </button>
        <button
          onClick={onLoadSamples}
          title="Vídeos e fotos reais de domínio público, para experimentar o editor"
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-line px-2 py-1.5 text-xs text-dim transition-colors hover:border-line-strong hover:bg-panel-2 hover:text-fg"
        >
          <Sparkles size={13} className="text-accent" />
          Usar mídias de exemplo
        </button>

        <Chips
          value={kind}
          onChange={setKind}
          options={[
            { value: null, label: 'Tudo' },
            { value: 'video', label: 'Vídeos' },
            { value: 'audio', label: 'Áudios' },
            { value: 'image', label: 'Imagens' },
          ]}
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
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
              title={`${media.name}\nArraste para a timeline, clique em + ou use o botão direito`}
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
                    title="Adicionar à timeline"
                    onClick={() => onAdd(media)}
                    className="flex size-7 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-110"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    title="Remover do projeto"
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
        {project.media.length > 0 && list.length === 0 && <p className="py-8 text-center text-xs text-faint">Nada aqui.</p>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Efeitos, transições e filtros

const PLUGIN_INFO: Record<PluginKind, { title: string; list: ShaderPlugin[]; hint: string }> = {
  effect: {
    title: 'Efeitos',
    list: effectPlugins,
    hint: 'Clique para aplicar no clipe selecionado, ou arraste até um clipe na timeline.',
  },
  transition: {
    title: 'Transições',
    list: transitionPlugins,
    hint: 'Clique para aplicar na transição selecionada, ou arraste até um ◆ na timeline.',
  },
  filter: {
    title: 'Filtros',
    list: filterPlugins,
    hint: 'Um filtro por clipe, com intensidade ajustável. Clique ou arraste até um clipe.',
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
}: {
  kind: PluginKind;
  onApply: (plugin: ShaderPlugin) => void;
  onMenu: (e: ReactMouseEvent, plugin: ShaderPlugin) => void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const previews = usePluginPreviews();
  const { title, list: all, hint } = PLUGIN_INFO[kind];

  const categories = useMemo(() => sortCategories(kind, [...new Set(all.map((p) => p.category))]), [kind, all]);
  const rows = useMemo(() => {
    const featured = FEATURED[kind];
    const byCategory = categories.map((c) => ({ title: c, items: all.filter((p) => p.category === c) }));
    if (!featured) return byCategory;
    const items = featured.ids.map((id) => all.find((p) => p.id === id)).filter((p): p is ShaderPlugin => !!p);
    return [{ title: featured.title, items }, ...byCategory];
  }, [kind, all, categories]);

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
      <PanelHeader title={title} count={all.length} hint={hint} />
      <div className="space-y-2.5 px-4 pb-3">
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input className="field w-full pl-8" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <Chips
          value={category}
          onChange={setCategory}
          options={[{ value: null, label: 'Todos' }, ...rows.map((r) => ({ value: r.title, label: r.title }))]}
        />
      </div>

      {showRows ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
          {rows.map((row) => (
            <section key={row.title}>
              <div className="mb-2 flex items-center justify-between px-4">
                <h3 className="text-xs font-semibold text-fg">
                  {row.title} <span className="font-normal text-faint">{row.items.length}</span>
                </h3>
                <button
                  onClick={() => setCategory(row.title)}
                  className="flex items-center text-[11px] text-faint transition-colors hover:text-accent"
                >
                  Ver todos
                  <ChevronRight size={13} />
                </button>
              </div>
              <div className="flex snap-x gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-1">
                {row.items.map((plugin) => card(plugin, true))}
              </div>
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
              {category}
              <span className="font-normal text-faint">{list.length}</span>
            </button>
          )}
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto px-4 pb-4">
            {list.map((plugin) => card(plugin, false))}
            {list.length === 0 && <p className="col-span-2 py-8 text-center text-xs text-faint">Nada encontrado.</p>}
          </div>
        </div>
      )}
    </>
  );
}
