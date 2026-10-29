import { restoreMediaAssets } from '../media/importer';
import { desktop } from '../media/screenRecorder';
import { DEFAULT_BRAND, type BrandKit } from './brand';
import { createProject, removeMedia, type MediaItem, type Project } from './model';
import { allMedia, packVersions, relinkMedia, unpackVersions, type SavedVersion } from './versions';
import { t } from '../i18n';

/**
 * Arquivo .lumiar = um pacote só, fácil de levar para outro computador:
 *   "LUMIAR01" | tamanho do JSON (uint32) | JSON do projeto | arquivos de mídia, um após o outro
 * Ao abrir, cada mídia vira um pedaço (slice) do próprio pacote: nada é copiado para a memória.
 */
const MAGIC = 'LUMIAR01';
const HEADER_SIZE = 12;

interface SavedMedia extends Omit<MediaItem, 'file' | 'url'> {
  type: string;
  size: number;
  /** Posição do arquivo dentro da área de dados do pacote */
  offset: number;
}

interface SavedProject {
  version: 1;
  project: Omit<Project, 'media' | 'versions'> & { media: SavedMedia[]; versions?: SavedVersion[] };
  /** Mídias que só as versões nomeadas usam (ausente em projetos antigos) */
  versionMedia?: SavedMedia[];
}

const FILE_TYPES: FilePickerAcceptType[] = [{ description: t('Projeto Lumiar'), accept: { 'application/x-lumiar': ['.lumiar'] } }];

function serialize(project: Project): SavedProject {
  let offset = 0;
  // As mídias que só as versões usam vão depois das do projeto, na mesma área de dados.
  const all = allMedia(project).map((m): SavedMedia => {
    const { file, url: _url, ...rest } = m;
    const saved = {
      ...rest,
      // URLs "blob:" não sobrevivem ao fechar a página; essas miniaturas são recriadas ao abrir.
      thumbnail: m.thumbnail?.startsWith('data:') ? m.thumbnail : null,
      type: file.type,
      size: file.size,
      offset,
    };
    offset += file.size;
    return saved;
  });
  const media = all.slice(0, project.media.length);
  const versionMedia = all.slice(project.media.length);
  return {
    version: 1,
    project: { ...project, media, versions: packVersions(project.versions) },
    ...(versionMedia.length ? { versionMedia } : {}),
  };
}

function header(json: string): Uint8Array<ArrayBuffer> {
  const body = new TextEncoder().encode(json);
  const bytes = new Uint8Array(HEADER_SIZE + body.length);
  bytes.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(bytes.buffer).setUint32(8, body.length, true);
  bytes.set(body, HEADER_SIZE);
  return bytes;
}

async function revive(saved: SavedProject, fileFor: (m: SavedMedia) => File | null): Promise<Project> {
  const media: MediaItem[] = [];
  const extra: MediaItem[] = [];
  for (const [list, into] of [[saved.project.media, media], [saved.versionMedia ?? [], extra]] as const) {
    for (const m of list) {
      const file = fileFor(m);
      if (!file) continue;
      const { type: _type, size: _size, offset: _offset, ...rest } = m;
      into.push(await restoreMediaAssets({ ...rest, file, url: URL.createObjectURL(file) }));
    }
  }
  const versions = unpackVersions(saved.project.versions, new Map([...media, ...extra].map((m) => [m.id, m])));
  // Campos novos de versões futuras ganham o valor padrão.
  let project: Project = { ...createProject(), ...saved.project, media, versions };
  // Mídia que não voltou: os clipes dela saem junto. Se ficassem, a timeline (que pula clipes sem mídia)
  // e as funções que usam a posição do clipe na trilha principal discordariam, e dividir ou colar mexeria
  // no clipe errado.
  const found = new Set(media.map((m) => m.id));
  for (const m of saved.project.media) if (!found.has(m.id)) project = removeMedia(project, m.id);
  return project;
}

export function suggestedFileName(project: Project): string {
  return `${project.name.trim().replace(/[\\/:*?"<>|]+/g, '-') || t('projeto')}.lumiar`;
}

export interface SaveResult {
  handle: FileSystemFileHandle | null;
  /** Projeto com as mídias apontando para o arquivo recém-salvo (null se foi baixado). */
  relinked: Project | null;
}

/**
 * Salva o pacote. Com `handle`, grava por cima do mesmo arquivo (Ctrl+S);
 * sem ele, pergunta onde salvar. Em navegadores sem essa API, baixa o arquivo.
 */
export async function saveProject(project: Project, handle: FileSystemFileHandle | null): Promise<SaveResult> {
  const saved = serialize(project);
  const head = header(JSON.stringify(saved));

  if (!window.showSaveFilePicker) {
    const blob = new Blob([head, ...allMedia(project).map((m) => m.file)], { type: 'application/x-lumiar' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = suggestedFileName(project);
    link.click();
    return { handle: null, relinked: null };
  }

  const target = handle ?? (await window.showSaveFilePicker({ suggestedName: suggestedFileName(project), types: FILE_TYPES }));
  const writable = await target.createWritable();
  try {
    await writable.write(head);
    for (const m of allMedia(project)) await writable.write(m.file);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }

  // O arquivo antigo foi substituído: as mídias passam a ser lidas do pacote novo.
  const file = await target.getFile();
  const dataStart = head.length;
  const byId = new Map([...saved.project.media, ...(saved.versionMedia ?? [])].map((m) => [m.id, m]));
  const fresh = new Map(
    allMedia(project).map((m) => {
      const s = byId.get(m.id)!;
      const slice = new File([file.slice(dataStart + s.offset, dataStart + s.offset + s.size)], m.name, { type: s.type });
      return [m.id, { ...m, file: slice, url: URL.createObjectURL(slice) }];
    }),
  );
  const relinked = relinkMedia(project, fresh);
  return { handle: target, relinked };
}

export async function openProjectFile(file: File): Promise<Project> {
  const head = new Uint8Array(await file.slice(0, HEADER_SIZE).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, 8)) !== MAGIC) throw new Error(t('"{name}" não é um projeto do Lumiar.', { name: file.name }));
  const length = new DataView(head.buffer).getUint32(8, true);
  const saved = JSON.parse(await file.slice(HEADER_SIZE, HEADER_SIZE + length).text()) as SavedProject;
  const dataStart = HEADER_SIZE + length;
  return revive(saved, (m) =>
    new File([file.slice(dataStart + m.offset, dataStart + m.offset + m.size)], m.name, { type: m.type }),
  );
}

/** Pede o arquivo .lumiar ao usuário. Devolve também o "handle" para salvar por cima depois. */
export async function pickProjectFile(): Promise<{ file: File; handle: FileSystemFileHandle | null } | null> {
  if (window.showOpenFilePicker) {
    const [handle] = await window.showOpenFilePicker({ types: FILE_TYPES });
    return { file: await handle.getFile(), handle };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.lumiar';
    input.onchange = () => resolve(input.files?.[0] ? { file: input.files[0], handle: null } : null);
    input.click();
  });
}

// ---------------------------------------------------------------- Salvamento automático (IndexedDB)

const DB_NAME = 'lumiar';
const STATE_STORE = 'state';
const MEDIA_STORE = 'media';
/** Quais mídias cada cópia de segurança usa, separado das cópias (que são grandes) para ler rápido. */
const VERSION_MEDIA_STORE = 'versionMedia';
/** Mídias já guardadas nesta sessão (cada arquivo é gravado uma vez só). */
const storedMedia = new Set<string>();

/**
 * Programa instalado: no lugar de uma cópia do vídeo (que dobraria o espaço usado no disco), o salvamento
 * automático guarda onde ele está. Mídias sem arquivo no disco (gravações, recortes, abertas de um .lumiar)
 * continuam sendo copiadas.
 */
interface DiskRef {
  path: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
}

function diskRef(file: File): DiskRef | null {
  const path = desktop()?.pathForFile?.(file);
  return path ? { path, name: file.name, type: file.type, size: file.size, lastModified: file.lastModified } : null;
}

async function readStored(value: File | DiskRef): Promise<File | null> {
  if (value instanceof Blob) return value;
  try {
    const response = await fetch(`/__disco/${encodeURIComponent(value.path)}`);
    if (!response.ok) return null;
    const blob = await response.blob();
    // Outro tamanho: o arquivo foi trocado depois de importado.
    if (blob.size !== value.size) return null;
    return new File([blob], value.name, { type: value.type, lastModified: value.lastModified });
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) {
        db.createObjectStore(STATE_STORE);
        db.createObjectStore(MEDIA_STORE);
      }
      if (event.oldVersion < 2) {
        const versionMedia = db.createObjectStore(VERSION_MEDIA_STORE);
        // Cópias guardadas antes: a lista de mídias sai de dentro de cada uma.
        const cursor = request.transaction!.objectStore(STATE_STORE).openCursor(VERSION_RANGE);
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return;
          versionMedia.put((c.value as VersionRecord).mediaIds ?? [], c.key);
          c.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function hasContent(project: Project): boolean {
  return (
    project.media.length > 0 ||
    project.textTracks.some((t) => t.clips.length > 0) ||
    project.videoTracks.some((t) => t.clips.length > 0) ||
    (project.packTracks ?? []).some((t) => t.clips.length > 0) ||
    (project.captions?.captions.length ?? 0) > 0
  );
}

/** Mídias usadas pelas cópias de segurança (essas ficam guardadas). */
async function versionMediaIds(tx: IDBTransaction): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const list of (await request(tx.objectStore(VERSION_MEDIA_STORE).getAll())) as string[][]) list.forEach((id) => ids.add(id));
  return ids;
}

/** Guarda o projeto atual no navegador, para recuperar se a aba fechar. */
export async function autosave(project: Project): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([STATE_STORE, MEDIA_STORE, VERSION_MEDIA_STORE], 'readwrite');
    const mediaStore = tx.objectStore(MEDIA_STORE);
    const added: string[] = [];
    const onDisk: string[] = [];
    for (const m of allMedia(project)) {
      if (storedMedia.has(m.id)) continue;
      const ref = diskRef(m.file);
      if (ref) onDisk.push(ref.path);
      mediaStore.put(ref ?? m.file, m.id);
      added.push(m.id);
    }
    const ids = await versionMediaIds(tx);
    allMedia(project).forEach((m) => ids.add(m.id));
    for (const key of await request(mediaStore.getAllKeys())) {
      if (!ids.has(String(key))) {
        mediaStore.delete(key);
        storedMedia.delete(String(key));
      }
    }
    tx.objectStore(STATE_STORE).put({ json: JSON.stringify(serialize(project)), savedAt: Date.now() }, 'current');
    await done(tx);
    // Só depois de gravado: se a gravação falhar (disco cheio), a próxima tentativa grava essas mídias de novo.
    added.forEach((id) => storedMedia.add(id));
    if (onDisk.length) await desktop()?.rememberFiles?.(onDisk);
  } finally {
    db.close();
  }
}

export interface RevivedProject {
  project: Project;
  /** Mídias que não deu para recuperar (arquivo apagado, movido ou trocado) */
  missing: string[];
}

/** Monta o projeto guardado, buscando cada mídia (cópia no banco ou arquivo no disco). */
async function reviveStored(saved: SavedProject): Promise<RevivedProject> {
  const stored = new Map<string, File | DiskRef>();
  const db = await openDb();
  try {
    const store = db.transaction([MEDIA_STORE], 'readonly').objectStore(MEDIA_STORE);
    for (const m of [...saved.project.media, ...(saved.versionMedia ?? [])]) {
      const value = (await request(store.get(m.id))) as File | DiskRef | undefined;
      if (value) stored.set(m.id, value);
    }
  } finally {
    db.close();
  }
  // Ler do disco fica fora da transação (ela fecharia sozinha enquanto espera).
  const files = new Map<string, File>();
  for (const [id, value] of stored) {
    const file = await readStored(value);
    if (file) files.set(id, file);
  }
  const project = await revive(saved, (m) => files.get(m.id) ?? null);
  return { project, missing: saved.project.media.filter((m) => !files.has(m.id)).map((m) => m.name) };
}

export interface AutosaveFound {
  name: string;
  savedAt: number;
  /** Lê as mídias e monta o projeto (pode demorar com vídeos grandes, por isso só quando o usuário aceita). */
  load(): Promise<RevivedProject>;
}

export async function loadAutosave(): Promise<AutosaveFound | null> {
  const db = await openDb();
  let saved: SavedProject;
  let savedAt: number;
  try {
    const tx = db.transaction([STATE_STORE], 'readonly');
    const state = (await request(tx.objectStore(STATE_STORE).get('current'))) as { json: string; savedAt: number } | undefined;
    if (!state) return null;
    saved = JSON.parse(state.json) as SavedProject;
    savedAt = state.savedAt;
  } finally {
    db.close();
  }
  if (!hasContent({ ...createProject(), ...saved.project } as unknown as Project)) return null;
  return {
    name: saved.project.name,
    savedAt,
    load: async () => {
      const revived = await reviveStored(saved);
      revived.project.media.forEach((m) => storedMedia.add(m.id));
      return revived;
    },
  };
}

export async function clearAutosave(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([STATE_STORE, MEDIA_STORE, VERSION_MEDIA_STORE], 'readwrite');
    const state = tx.objectStore(STATE_STORE);
    state.delete('current');
    // As versões guardadas continuam (e as mídias delas também).
    const keep = await versionMediaIds(tx);
    const media = tx.objectStore(MEDIA_STORE);
    for (const key of await request(media.getAllKeys())) {
      if (!keep.has(String(key))) {
        media.delete(key);
        storedMedia.delete(String(key));
      }
    }
    await done(tx);
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------- Versões (cópias de segurança)

const VERSION_RANGE = IDBKeyRange.bound('version:', 'version:\uffff');
/** Quantas versões ficam guardadas (as mais antigas saem). */
const MAX_VERSIONS = 15;

interface VersionRecord {
  json: string;
  savedAt: number;
  name: string;
  /** Resumo para a lista: duração e quantidade de clipes */
  summary: string;
  /** Só nas cópias antigas: hoje a lista fica em VERSION_MEDIA_STORE */
  mediaIds?: string[];
}

export interface VersionInfo {
  key: string;
  savedAt: number;
  name: string;
  summary: string;
}

/** Guarda uma cópia do projeto como está agora (o salvamento automático já guarda as mídias). */
export async function saveVersion(project: Project, summary: string): Promise<void> {
  await autosave(project);
  const db = await openDb();
  try {
    const tx = db.transaction([STATE_STORE, VERSION_MEDIA_STORE], 'readwrite');
    const state = tx.objectStore(STATE_STORE);
    const versionMedia = tx.objectStore(VERSION_MEDIA_STORE);
    const savedAt = Date.now();
    const record: VersionRecord = { json: JSON.stringify(serialize(project)), savedAt, name: project.name, summary };
    const keys = (await request(state.getAllKeys(VERSION_RANGE))).map(String).sort();
    for (const key of keys.slice(0, Math.max(0, keys.length + 1 - MAX_VERSIONS))) {
      state.delete(key);
      versionMedia.delete(key);
    }
    const key = `version:${String(savedAt).padStart(15, '0')}`;
    state.put(record, key);
    versionMedia.put(allMedia(project).map((m) => m.id), key);
    await done(tx);
  } finally {
    db.close();
  }
}

export async function listVersions(): Promise<VersionInfo[]> {
  const db = await openDb();
  try {
    const tx = db.transaction([STATE_STORE], 'readonly');
    const state = tx.objectStore(STATE_STORE);
    const keys = (await request(state.getAllKeys(VERSION_RANGE))).map(String);
    const records = (await request(state.getAll(VERSION_RANGE))) as VersionRecord[];
    return records.map((r, i) => ({ key: keys[i], savedAt: r.savedAt, name: r.name, summary: r.summary })).sort((a, b) => b.savedAt - a.savedAt);
  } finally {
    db.close();
  }
}

export async function loadVersion(key: string): Promise<RevivedProject | null> {
  const db = await openDb();
  let record: VersionRecord | undefined;
  try {
    const tx = db.transaction([STATE_STORE], 'readonly');
    record = (await request(tx.objectStore(STATE_STORE).get(key))) as VersionRecord | undefined;
  } finally {
    db.close();
  }
  return record ? reviveStored(JSON.parse(record.json) as SavedProject) : null;
}

// ---------------------------------------------------------------- Kit da marca

/** Guarda o kit da marca (os arquivos vão junto, no próprio registro). */
export async function saveBrandKit(kit: BrandKit): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([STATE_STORE], 'readwrite');
    tx.objectStore(STATE_STORE).put(kit, 'brand');
    await done(tx);
  } finally {
    db.close();
  }
}

export async function loadBrandKit(): Promise<BrandKit | null> {
  const db = await openDb();
  try {
    const tx = db.transaction([STATE_STORE], 'readonly');
    const kit = (await request(tx.objectStore(STATE_STORE).get('brand'))) as BrandKit | undefined;
    return kit ? { ...DEFAULT_BRAND, ...kit, watermark: { ...DEFAULT_BRAND.watermark, ...kit.watermark } } : null;
  } finally {
    db.close();
  }
}
