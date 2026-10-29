import { ArrowRightLeft, FileDown, FileUp, FolderDown, X } from 'lucide-react';
import { useState } from 'react';
import { importEdit, toEdl, toFcpXml } from '../project/interchange';
import type { Project } from '../project/model';
import { t } from '../i18n';
import { keys } from '../i18n/keys';
import { download } from './ExportDialog';
import { Button, IconButton } from './kit';

const base = (p: Project) => (p.name || 'lumiar').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'lumiar';

/** Levar a edição para o Premiere, o DaVinci ou o Final Cut, e trazer de volta. */
export function InterchangeDialog({
  project,
  onImport,
  onClose,
  notify,
}: {
  project: Project;
  onImport: (next: Project) => void;
  onClose: () => void;
  notify: (text: string, error?: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const save = (text: string, ext: string, type: string) => download(URL.createObjectURL(new Blob([text], { type })), `${base(project)}.${ext}`);

  /** Pasta com o XML, a EDL e uma cópia de cada mídia (os programas acham os arquivos pelo nome). */
  const saveFolder = async () => {
    if (!window.showDirectoryPicker) return;
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      setSaving(true);
      const write = async (name: string, data: Blob | string) => {
        const handle = await dir.getFileHandle(name, { create: true });
        const w = await handle.createWritable();
        await w.write(data);
        await w.close();
      };
      await write(`${base(project)}.xml`, toFcpXml(project));
      await write(`${base(project)}.edl`, toEdl(project));
      const used = new Set([...project.clips, ...project.videoTracks.flatMap((track) => track.clips), ...project.audioTracks.flatMap((track) => track.clips)].map((c) => c.mediaId));
      for (const m of project.media.filter((x) => used.has(x.id))) await write(m.name, m.file);
      notify(t('Pasta "{folder}" pronta: abra o {file} no Premiere ou no DaVinci (Arquivo → Importar).', { folder: dir.name, file: `${base(project)}.xml` }));
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') notify(t('Não foi possível salvar: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setSaving(false);
    }
  };

  const openFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml,.edl,.fcpxml';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!confirm(t('Trocar os clipes da timeline pelos da edição importada? ({keys} desfaz.)', { keys: keys('Ctrl+Z') }))) return;
      const result = importEdit(project, await file.text());
      if (!result.clips) {
        notify(
          result.missing.length
            ? t('Nenhum clipe montado: importe antes estas mídias: {list}', { list: `${result.missing.slice(0, 6).join(', ')}${result.missing.length > 6 ? '…' : ''}` })
            : t('Não encontrei clipes nesse arquivo.'),
          true,
        );
        return;
      }
      onImport(result.project);
      notify(
        t('{n} clipes montados a partir de "{file}".', { n: result.clips, file: file.name }) +
          (result.missing.length ? ` ${t('Faltam {n} mídia(s): {list}', { n: result.missing.length, list: result.missing.slice(0, 4).join(', ') })}` : ''),
        result.missing.length > 0,
      );
      onClose();
    };
    input.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[460px] animate-pop-in rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <ArrowRightLeft size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Premiere, DaVinci e Final Cut')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-dim">
          {t(
            'Leva os cortes e as posições de todas as trilhas para terminar em outro programa (ou traz de volta). Efeitos, filtros, textos e transições do Lumiar ficam de fora.',
          )}
        </p>
        <div className="space-y-2">
          {window.showDirectoryPicker && (
            <Button variant="primary" className="w-full" icon={<FolderDown size={14} />} disabled={saving} onClick={() => void saveFolder()}>
              {saving ? t('Salvando…') : t('Salvar numa pasta, com as mídias')}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button icon={<FileDown size={14} />} onClick={() => save(toFcpXml(project), 'xml', 'application/xml')} title={t('Formato do Final Cut 7: Premiere, DaVinci e Final Cut importam')}>
              {t('Só o XML')}
            </Button>
            <Button icon={<FileDown size={14} />} onClick={() => save(toEdl(project), 'edl', 'text/plain')} title={t('Lista de cortes CMX 3600 (só a trilha principal)')}>
              {t('Só a EDL')}
            </Button>
          </div>
          <Button className="w-full" icon={<FileUp size={14} />} onClick={openFile}>
            {t('Abrir um XML ou EDL de outro programa…')}
          </Button>
          <p className="text-[11px] leading-snug text-faint">
            {t('Para abrir de volta, importe antes no Lumiar os mesmos arquivos de vídeo: os clipes são achados pelo nome do arquivo.')}
          </p>
        </div>
      </div>
    </div>
  );
}
