import { restoreMediaAssets } from '../media/importer';
import { createProject, type MediaItem, type Project } from './model';

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
  project: Omit<Project, 'media'> & { media: SavedMedia[] };
}

const FILE_TYPES: FilePickerAcceptType[] = [{ description: 'Projeto Lumiar', accept: { 'application/x-lumiar': ['.lumiar'] } }];

function serialize(project: Project): SavedProject {
  let offset = 0;
  const media = project.media.map((m): SavedMedia => {
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
  return { version: 1, project: { ...project, media } };
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
  for (const m of saved.project.media) {
    const file = fileFor(m);
    if (!file) continue;
    const { type: _type, size: _size, offset: _offset, ...rest } = m;
    media.push(await restoreMediaAssets({ ...rest, file, url: URL.createObjectURL(file) }));
  }
  // Campos novos de versões futuras ganham o valor padrão.
  return { ...createProject(), ...saved.project, media };
}

export function suggestedFileName(project: Project): string {
  return `${project.name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'projeto'}.lumiar`;
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
    const blob = new Blob([head, ...project.media.map((m) => m.file)], { type: 'application/x-lumiar' });
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
    for (const m of project.media) await writable.write(m.file);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }

  // O arquivo antigo foi substituído: as mídias passam a ser lidas do pacote novo.
  const file = await target.getFile();
  const dataStart = head.length;
  const byId = new Map(saved.project.media.map((m) => [m.id, m]));
  const relinked: Project = {
    ...project,
    media: project.media.map((m) => {
      const s = byId.get(m.id)!;
      const slice = new File([file.slice(dataStart + s.offset, dataStart + s.offset + s.size)], m.name, { type: s.type });
      return { ...m, file: slice, url: URL.createObjectURL(slice) };
    }),
  };
  return { handle: target, relinked };
}

export async function openProjectFile(file: File): Promise<Project> {
  const head = new Uint8Array(await file.slice(0, HEADER_SIZE).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, 8)) !== MAGIC) throw new Error(`"${file.name}" não é um projeto do Lumiar.`);
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
/** Mídias já guardadas nesta sessão (cada arquivo é gravado uma vez só). */
const storedMedia = new Set<string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STATE_STORE);
      request.result.createObjectStore(MEDIA_STORE);
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

/** Guarda o projeto atual no navegador, para recuperar se a aba fechar. */
export async function autosave(project: Project): Promise<void> {
  const db = await openDb();
  try {
    const ids = new Set(project.media.map((m) => m.id));
    const tx = db.transaction([STATE_STORE, MEDIA_STORE], 'readwrite');
    const mediaStore = tx.objectStore(MEDIA_STORE);
    for (const m of project.media) {
      if (storedMedia.has(m.id)) continue;
      mediaStore.put(m.file, m.id);
      storedMedia.add(m.id);
    }
    for (const key of await request(mediaStore.getAllKeys())) {
      if (!ids.has(String(key))) {
        mediaStore.delete(key);
        storedMedia.delete(String(key));
      }
    }
    tx.objectStore(STATE_STORE).put({ json: JSON.stringify(serialize(project)), savedAt: Date.now() }, 'current');
    await done(tx);
  } finally {
    db.close();
  }
}

export async function loadAutosave(): Promise<{ project: Project; savedAt: number } | null> {
  const db = await openDb();
  try {
    const tx = db.transaction([STATE_STORE, MEDIA_STORE], 'readonly');
    const state = (await request(tx.objectStore(STATE_STORE).get('current'))) as { json: string; savedAt: number } | undefined;
    if (!state) return null;
    const saved = JSON.parse(state.json) as SavedProject;
    const files = new Map<string, File>();
    for (const m of saved.project.media) {
      const file = (await request(tx.objectStore(MEDIA_STORE).get(m.id))) as File | undefined;
      if (file) files.set(m.id, file);
    }
    const project = await revive(saved, (m) => files.get(m.id) ?? null);
    project.media.forEach((m) => storedMedia.add(m.id));
    return hasContent(project) ? { project, savedAt: state.savedAt } : null;
  } finally {
    db.close();
  }
}

export async function clearAutosave(): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([STATE_STORE, MEDIA_STORE], 'readwrite');
    tx.objectStore(STATE_STORE).clear();
    tx.objectStore(MEDIA_STORE).clear();
    storedMedia.clear();
    await done(tx);
  } finally {
    db.close();
  }
}
