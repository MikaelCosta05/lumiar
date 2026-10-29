import { t } from '../i18n';
import { layoutProject, removeMedia, uid, type MediaItem, type Project } from './model';

/**
 * Versões nomeadas do projeto ("versão do cliente", "versão curta"…): ficam dentro do próprio arquivo
 * .lumiar, junto com o projeto, e dá para voltar a qualquer uma, duplicar e apagar. Diferente do
 * Histórico (desfazer/refazer, só nesta sessão) e das cópias de segurança automáticas (no navegador).
 *
 * As mídias são as mesmas do projeto (cada arquivo é guardado uma vez só no pacote); uma mídia que só
 * uma versão usa continua guardada mesmo depois de sair da biblioteca do projeto atual.
 */

/** O projeto como estava ao guardar a versão (sem as outras versões dentro). */
export type VersionSnapshot = Omit<Project, 'versions'>;

export interface ProjectVersion {
  id: string;
  name: string;
  /** Quando foi guardada (ms) */
  savedAt: number;
  /** Resumo para a lista: duração e quantidade de clipes */
  summary: string;
  project: VersionSnapshot;
}

/** Como a versão vai no arquivo: as mídias pelo id (os arquivos estão no pacote, com o resto). */
export interface SavedVersion extends Omit<ProjectVersion, 'project'> {
  project: Omit<VersionSnapshot, 'media'> & { media: string[] };
}

export function snapshotOf(project: Project): VersionSnapshot {
  const { versions: _versions, ...snapshot } = project;
  return snapshot;
}

/** "3 clipe(s) · 00:42" */
export function versionSummary(project: VersionSnapshot): string {
  const seconds = Math.round(layoutProject({ ...project }).duration);
  const duration = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return t('{n} clipe(s) · {duration}', { n: project.clips.length, duration });
}

/** Nome livre para uma versão nova: "Versão 1", "Versão 2"… */
export function nextVersionName(project: Pick<Project, 'versions'>): string {
  const names = new Set((project.versions ?? []).map((v) => v.name));
  let n = (project.versions?.length ?? 0) + 1;
  while (names.has(t('Versão {n}', { n }))) n++;
  return t('Versão {n}', { n });
}

/** Guarda o projeto como está agora numa versão com esse nome (a mais nova fica no fim da lista). */
export function addVersion(project: Project, name: string, now = Date.now(), id = uid()): Project {
  const snapshot = snapshotOf(project);
  const version: ProjectVersion = { id, name: name.trim() || nextVersionName(project), savedAt: now, summary: versionSummary(snapshot), project: snapshot };
  return { ...project, versions: [...(project.versions ?? []), version] };
}

export function renameVersion(project: Project, id: string, name: string): Project {
  const clean = name.trim();
  if (!clean) return project;
  return { ...project, versions: (project.versions ?? []).map((v) => (v.id === id ? { ...v, name: clean } : v)) };
}

export function deleteVersion(project: Project, id: string): Project {
  const versions = (project.versions ?? []).filter((v) => v.id !== id);
  return { ...project, versions: versions.length ? versions : undefined };
}

/** Uma cópia da versão, logo depois dela (para criar uma variação sem mexer na original). */
export function duplicateVersion(project: Project, id: string, now = Date.now(), newId = uid()): Project {
  const list = project.versions ?? [];
  const index = list.findIndex((v) => v.id === id);
  if (index < 0) return project;
  const source = list[index];
  const copy: ProjectVersion = { ...source, id: newId, name: t('{name} (cópia)', { name: source.name }), savedAt: now };
  return { ...project, versions: [...list.slice(0, index + 1), copy, ...list.slice(index + 1)] };
}

/** Troca a versão guardada pelo projeto como está agora (mantém o nome). */
export function overwriteVersion(project: Project, id: string, now = Date.now()): Project {
  const snapshot = snapshotOf(project);
  return {
    ...project,
    versions: (project.versions ?? []).map((v) => (v.id === id ? { ...v, savedAt: now, summary: versionSummary(snapshot), project: snapshot } : v)),
  };
}

/**
 * Volta para uma versão: o projeto passa a ser o que ela guardou. A lista de versões continua a mesma,
 * e as mídias do projeto atual continuam na biblioteca (nada importado some).
 */
export function openVersion(project: Project, id: string): Project | null {
  const version = project.versions?.find((v) => v.id === id);
  if (!version) return null;
  const ids = new Set(version.project.media.map((m) => m.id));
  return { ...version.project, media: [...version.project.media, ...project.media.filter((m) => !ids.has(m.id))], versions: project.versions };
}

/** Mídias que só as versões usam (não estão mais na biblioteca do projeto atual). */
export function versionOnlyMedia(project: Pick<Project, 'media' | 'versions'>): MediaItem[] {
  const seen = new Set(project.media.map((m) => m.id));
  const extra: MediaItem[] = [];
  for (const version of project.versions ?? []) {
    for (const m of version.project.media) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      extra.push(m);
    }
  }
  return extra;
}

/** Todas as mídias que o arquivo precisa guardar: as do projeto e as que só as versões usam. */
export function allMedia(project: Pick<Project, 'media' | 'versions'>): MediaItem[] {
  return [...project.media, ...versionOnlyMedia(project)];
}

export function packVersions(versions: ProjectVersion[] | undefined): SavedVersion[] | undefined {
  if (!versions?.length) return undefined;
  return versions.map((v) => ({ ...v, project: { ...v.project, media: v.project.media.map((m) => m.id) } }));
}

/**
 * Remonta as versões lidas do arquivo com as mídias já abertas. Mídia que não voltou: os clipes dela
 * saem da versão (igual ao projeto principal ao abrir).
 */
export function unpackVersions(saved: SavedVersion[] | undefined, media: Map<string, MediaItem>): ProjectVersion[] | undefined {
  if (!Array.isArray(saved) || !saved.length) return undefined;
  return saved.map((v) => {
    const ids = Array.isArray(v.project.media) ? v.project.media : [];
    const found = ids.map((id) => media.get(id)).filter((m): m is MediaItem => !!m);
    let snapshot: VersionSnapshot = { ...v.project, media: found };
    for (const id of ids) if (!media.has(id)) snapshot = snapshotOf(removeMedia(snapshot, id));
    return { ...v, project: snapshot };
  });
}

/** Depois de salvar, as mídias passam a ser lidas do arquivo novo: as versões também precisam apontar para elas. */
export function relinkMedia(project: Project, media: Map<string, MediaItem>): Project {
  const swap = (list: MediaItem[]) => list.map((m) => media.get(m.id) ?? m);
  return {
    ...project,
    media: swap(project.media),
    versions: project.versions?.map((v) => ({ ...v, project: { ...v.project, media: swap(v.project.media) } })),
  };
}
