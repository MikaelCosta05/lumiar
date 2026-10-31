// Miniaturas da biblioteca guardadas no disco (IndexedDB, na pasta de dados do programa): só a primeira abertura
// gera as ~660 imagens; nas seguintes elas voltam prontas, e só é refeito o que mudou.

export interface StoredThumb {
  /** "p:<id do plugin>" ou "k:<id do pacote>" */
  id: string;
  /** Impressão digital do que desenhou a miniatura: mudou, refaz. */
  hash: string;
  url: string;
}

const DB = 'lumiar-miniaturas';
const STORE = 'miniaturas';

/** Versão do motor que desenha as miniaturas (vem do build; nos testes, um valor fixo). */
export const PREVIEW_ENGINE = typeof __PREVIEW_ENGINE__ === 'string' ? __PREVIEW_ENGINE__ : 'dev';

/** Impressão digital curta de um texto (FNV-1a de 32 bits + tamanho): igual para o mesmo texto, sempre. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}.${text.length.toString(36)}`;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Todas as miniaturas guardadas (vazio se o disco não responder: elas são só geradas de novo). */
export async function readThumbs(): Promise<Map<string, StoredThumb>> {
  try {
    const db = await open();
    const all = await new Promise<StoredThumb[]>((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result as StoredThumb[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return new Map(all.map((t) => [t.id, t]));
  } catch {
    return new Map();
  }
}

/** Guarda (ou troca) estas miniaturas de uma vez. */
export async function writeThumbs(thumbs: StoredThumb[]): Promise<void> {
  if (!thumbs.length) return;
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const thumb of thumbs) store.put(thumb);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Sem disco, a próxima abertura só gera de novo.
  }
}
