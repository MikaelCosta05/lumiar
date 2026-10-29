import { Copy, FolderOpen, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { locale, t } from '../i18n';
import { keys } from '../i18n/keys';
import type { Project } from '../project/model';
import { addVersion, deleteVersion, duplicateVersion, nextVersionName, overwriteVersion, renameVersion, type ProjectVersion } from '../project/versions';
import { Button, IconButton } from './kit';

/**
 * Versões nomeadas, na janela do Histórico: guardar o projeto atual com um nome, voltar para uma versão,
 * atualizar, duplicar, renomear e apagar. Ficam dentro do arquivo .lumiar (salve para guardar no disco).
 */
export function ProjectVersions({
  project,
  onVersions,
  onOpen,
}: {
  project: Project;
  /** Troca a lista de versões (sem criar um passo no desfazer: a lista vale para todos os passos) */
  onVersions: (versions: ProjectVersion[] | undefined) => void;
  /** Volta o projeto para a versão (esse sim é um passo: Ctrl+Z desfaz) */
  onOpen: (version: ProjectVersion) => void;
}) {
  const [name, setName] = useState('');
  const versions = [...(project.versions ?? [])].reverse();
  const apply = (next: Project) => onVersions(next.versions);

  const save = () => {
    apply(addVersion(project, name || nextVersionName(project)));
    setName('');
  };

  return (
    <>
      <p className="my-2 text-[11px] leading-snug text-faint">
        {t('Guarde o projeto como está com um nome ("versão do cliente", "versão curta"…) e volte para ele quando quiser. As versões vão dentro do arquivo do projeto: salve com {keys} para guardar no disco.', { keys: keys('Ctrl+S') })}
      </p>
      <div className="mb-2 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={nextVersionName(project)}
          className="field h-8 min-w-0 flex-1 text-xs"
          aria-label={t('Nome da versão')}
        />
        <Button variant="primary" className="h-8 text-xs" icon={<Plus size={13} />} onClick={save}>
          {t('Guardar versão')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {versions.length === 0 ? (
          <p className="text-xs text-dim">{t('Nenhuma versão ainda. Dê um nome e clique em "Guardar versão".')}</p>
        ) : (
          versions.map((v) => (
            <div key={v.id} className="flex items-center gap-1 rounded-lg border border-line bg-panel-2 py-1.5 pl-3 pr-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={v.name}>
                  {v.name}
                </p>
                <p className="truncate text-[11px] text-faint" title={`${new Date(v.savedAt).toLocaleString(locale())} · ${v.summary}`}>
                  {new Date(v.savedAt).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {v.summary}
                </p>
              </div>
              <Button className="h-7 px-2 text-xs" icon={<FolderOpen size={12} />} onClick={() => onOpen(v)} title={t('Voltar para esta versão ({keys} desfaz)', { keys: keys('Ctrl+Z') })}>
                {t('Abrir')}
              </Button>
              <IconButton
                label={t('Atualizar com o projeto atual')}
                onClick={() => confirm(t('Trocar "{name}" pelo projeto como está agora?', { name: v.name })) && apply(overwriteVersion(project, v.id))}
              >
                <RefreshCw size={13} />
              </IconButton>
              <IconButton label={t('Duplicar')} onClick={() => apply(duplicateVersion(project, v.id))}>
                <Copy size={13} />
              </IconButton>
              <IconButton
                label={t('Renomear')}
                onClick={() => {
                  const next = prompt(t('Nome da versão'), v.name);
                  if (next) apply(renameVersion(project, v.id, next));
                }}
              >
                <Pencil size={13} />
              </IconButton>
              <IconButton
                label={t('Apagar')}
                className="hover:text-danger"
                onClick={() => confirm(t('Apagar a versão "{name}"?', { name: v.name })) && apply(deleteVersion(project, v.id))}
              >
                <Trash2 size={13} />
              </IconButton>
            </div>
          ))
        )}
      </div>
    </>
  );
}
