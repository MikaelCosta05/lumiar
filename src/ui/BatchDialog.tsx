import { CircleCheck, FilePlus2, Layers, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { CAPTION_LANGUAGES, DEFAULT_CAPTION_MODEL, transcribeProject } from '../media/captioning';
import { exportProject } from '../media/exporter';
import { importMedia } from '../media/importer';
import { applyBrand } from '../project/brand';
import { CAPTION_PRESETS, captionStyle, updateCaptions } from '../project/captions';
import { addMedia, createProject, createVideoClip, insertVideoClips, type MediaItem, type Project } from '../project/model';
import { cutSilencesIn, reframeToVertical } from '../project/recipes';
import { loadBrandKit } from '../project/storage';
import { t } from '../i18n';
import { download } from './ExportDialog';
import { Button, cx, IconButton, Segmented, SwitchRow } from './kit';

interface Recipe {
  silences: boolean;
  captions: boolean;
  language: string | null;
  captionPreset: string;
  brand: boolean;
  vertical: boolean;
  height: number;
}

type Status = { state: 'waiting' } | { state: 'working'; stage: string; fraction: number } | { state: 'done'; size: number } | { state: 'error'; message: string };

const even = (v: number) => Math.max(2, Math.round(v / 2) * 2);

/** Um projeto novo com o vídeo inteiro na trilha principal, no tamanho do próprio vídeo. */
function projectFor(media: MediaItem): Project {
  const base = createProject();
  const sized = media.kind === 'audio' ? base : { ...base, width: even(media.width), height: even(media.height) };
  return insertVideoClips(addMedia({ ...sized, name: media.name.replace(/\.[^.]+$/, '') }, [media]), [createVideoClip(media)]);
}

/**
 * Processar vários vídeos de uma vez com a mesma receita (cortar pausas, legendar, aplicar a marca,
 * deixar vertical) e exportar cada um para uma pasta.
 */
export function BatchDialog({ onClose, notify }: { onClose: () => void; notify: (text: string, error?: boolean) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status[]>([]);
  const [recipe, setRecipe] = useState<Recipe>({
    silences: true,
    captions: true,
    language: 'portuguese',
    captionPreset: 'destaque',
    brand: false,
    vertical: false,
    height: 1080,
  });
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const set = (patch: Partial<Recipe>) => setRecipe((r) => ({ ...r, ...patch }));
  const setOne = (i: number, s: Status) => setStatus((all) => all.map((x, j) => (j === i ? s : x)));

  const addFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'video/*';
    input.onchange = () => {
      const picked = [...(input.files ?? [])];
      setFiles((f) => [...f, ...picked]);
      setStatus((s) => [...s, ...picked.map((): Status => ({ state: 'waiting' }))]);
    };
    input.click();
  };

  const run = async () => {
    // Onde salvar: uma pasta (programa instalado, Chrome/Edge) ou, sem isso, um download por vídeo.
    let folder: FileSystemDirectoryHandle | null = null;
    if (window.showDirectoryPicker) {
      try {
        folder = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch {
        return;
      }
    }
    const kit = recipe.brand ? await loadBrandKit().catch(() => null) : null;
    if (recipe.brand && !kit) {
      notify(t('Configure o kit da marca primeiro (Ferramentas → Kit da marca).'), true);
      return;
    }
    setRunning(true);
    const controller = new AbortController();
    abort.current = controller;
    // As mídias da marca são importadas uma vez e usadas em todos os vídeos.
    const brandMedia = {
      logo: kit?.logo ? await importMedia(kit.logo) : null,
      intro: kit?.intro ? await importMedia(kit.intro) : null,
      outro: kit?.outro ? await importMedia(kit.outro) : null,
    };
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      if (controller.signal.aborted) break;
      if (status[i]?.state === 'done') continue;
      const step = (stage: string, fraction = 0) => setOne(i, { state: 'working', stage, fraction });
      try {
        step(t('Abrindo'));
        const media = await importMedia(files[i]);
        let p = projectFor(media);
        if (recipe.silences && media.hasAudio) {
          step(t('Cortando as pausas'));
          p = (await cutSilencesIn(p, p.clips.map((c) => c.id), true, (f) => step(t('Cortando as pausas'), f))).project;
        }
        if (recipe.vertical && p.width > p.height) {
          step(t('Deixando vertical (seguindo rostos)'));
          p = (await reframeToVertical(p, (f) => step(t('Deixando vertical (seguindo rostos)'), f))).project;
        }
        if (recipe.captions && media.hasAudio) {
          step(t('Criando as legendas'));
          const captions = await transcribeProject(p, { model: DEFAULT_CAPTION_MODEL, language: recipe.language, maxWords: 6 }, (stage, f) => step(stage, f ?? 0));
          p = updateCaptions(p, (track) => ({ ...track, enabled: true, captions, style: captionStyle(recipe.captionPreset) }));
        }
        if (kit) p = applyBrand(p, kit, brandMedia, { logo: !!kit.logo, intro: !!kit.intro, outro: !!kit.outro, texts: true, captions: true });
        step(t('Exportando'));
        const blob = await exportProject(
          p,
          { format: 'mp4', height: recipe.height, fps: null, quality: 'high', range: null },
          { signal: controller.signal, onProgress: (pr) => step(pr.stage || t('Exportando'), pr.fraction) },
        );
        const name = `${p.name} (Lumiar).mp4`;
        if (folder) {
          const handle = await folder.getFileHandle(name, { create: true });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        } else {
          download(URL.createObjectURL(blob), name);
        }
        setOne(i, { state: 'done', size: blob.size });
        ok++;
      } catch (error) {
        if (controller.signal.aborted) {
          setOne(i, { state: 'waiting' });
          break;
        }
        setOne(i, { state: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    }
    setRunning(false);
    abort.current = null;
    notify(
      ok
        ? folder
          ? t('{n} vídeo(s) prontos na pasta "{folder}".', { n: ok, folder: folder.name })
          : t('{n} vídeo(s) prontos.', { n: ok })
        : t('Nenhum vídeo foi processado.'),
      ok === 0,
    );
  };

  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !running && onClose()}>
      <div className="flex max-h-[86vh] w-[min(720px,calc(100vw-48px))] animate-pop-in flex-col rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <Layers size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Processar vários vídeos')}</h2>
          <IconButton label={t('Fechar')} disabled={running} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-dim">
          {t('A mesma receita para todos: cada vídeo vira um projeto, passa pelos passos escolhidos e é exportado em MP4. O projeto aberto não muda.')}
        </p>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_250px] gap-4">
          <div className="flex min-h-0 flex-col">
            <div className="min-h-32 flex-1 space-y-1 overflow-y-auto rounded-lg border border-line bg-panel-2 p-1.5">
              {files.length === 0 && <p className="p-4 text-center text-xs text-faint">{t('Nenhum vídeo ainda.')}</p>}
              {files.map((file, i) => {
                const st = status[i] ?? { state: 'waiting' };
                return (
                  <div key={i} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
                    {st.state === 'done' ? (
                      <CircleCheck size={14} className="shrink-0 text-success" />
                    ) : st.state === 'error' ? (
                      <TriangleAlert size={14} className="shrink-0 text-danger" />
                    ) : st.state === 'working' ? (
                      <LoaderCircle size={14} className="shrink-0 animate-spin text-accent" />
                    ) : (
                      <span className="size-3.5 shrink-0 rounded-full border border-line-strong" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className={cx('shrink-0 text-[11px]', st.state === 'error' ? 'text-danger' : 'text-faint')} title={st.state === 'error' ? st.message : undefined}>
                      {st.state === 'working'
                        ? `${st.stage}${st.fraction ? ` ${Math.round(st.fraction * 100)}%` : '…'}`
                        : st.state === 'done'
                          ? mb(st.size)
                          : st.state === 'error'
                            ? t('erro')
                            : mb(file.size)}
                    </span>
                    {!running && st.state !== 'working' && (
                      <IconButton
                        label={t('Tirar da lista')}
                        className="size-5"
                        onClick={() => {
                          setFiles((f) => f.filter((_, j) => j !== i));
                          setStatus((s) => s.filter((_, j) => j !== i));
                        }}
                      >
                        <X size={11} />
                      </IconButton>
                    )}
                  </div>
                );
              })}
            </div>
            <Button className="mt-2" icon={<FilePlus2 size={14} />} disabled={running} onClick={addFiles}>
              {t('Adicionar vídeos…')}
            </Button>
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-panel-2 p-3">
            <p className="text-xs font-semibold">{t('Receita')}</p>
            <SwitchRow checked={recipe.silences} onChange={(silences) => set({ silences })} label={t('Cortar as pausas')} />
            <SwitchRow checked={recipe.captions} onChange={(captions) => set({ captions })} label={t('Legendas automáticas')} />
            {recipe.captions && (
              <div className="grid grid-cols-2 gap-1.5">
                <select className="field h-7 text-[11px]" value={recipe.language ?? ''} onChange={(e) => set({ language: e.target.value || null })}>
                  {CAPTION_LANGUAGES.map((l) => (
                    <option key={l.label} value={l.id ?? ''}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <select className="field h-7 text-[11px]" value={recipe.captionPreset} onChange={(e) => set({ captionPreset: e.target.value })}>
                  {CAPTION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <SwitchRow checked={recipe.brand} onChange={(brand) => set({ brand })} label={t('Aplicar o kit da marca')} />
            <SwitchRow checked={recipe.vertical} onChange={(vertical) => set({ vertical })} label={t('Vertical 9:16 (seguindo rostos)')} />
            <p className="pt-1 text-[11px] text-dim">{t('Qualidade')}</p>
            <Segmented
              options={[
                { value: 720, label: '720p' },
                { value: 1080, label: '1080p' },
                { value: 1440, label: '1440p' },
              ]}
              value={recipe.height}
              onChange={(height) => set({ height })}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          {running ? (
            <Button variant="danger" onClick={() => abort.current?.abort()}>
              {t('Parar depois deste')}
            </Button>
          ) : (
            <Button onClick={onClose}>{t('Fechar')}</Button>
          )}
          <Button
            variant="primary"
            icon={running ? <LoaderCircle size={14} className="animate-spin" /> : <Layers size={14} />}
            disabled={running || files.length === 0 || status.every((s) => s.state === 'done')}
            onClick={() => void run()}
          >
            {running ? t('Processando…') : t('Processar {n} vídeo(s)', { n: files.length })}
          </Button>
        </div>
      </div>
    </div>
  );
}
