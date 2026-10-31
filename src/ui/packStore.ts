import { useSyncExternalStore } from 'react';
import { ADJUSTMENT_TEMPLATE } from '../project/adjustmentBlock';
import { PACKS } from '../project/packLibrary';
import type { PackTemplate } from '../project/packs';
import { t } from '../i18n';

/** Pacotes salvos pelo usuário ("Meus pacotes"), guardados neste computador. */
const KEY = 'lumiar:packs';

function read(): PackTemplate[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as PackTemplate[];
    return Array.isArray(list) ? list.map((p) => ({ ...p, custom: true })) : [];
  } catch {
    return [];
  }
}

let current = read();
const listeners = new Set<() => void>();

function write(list: PackTemplate[]): void {
  current = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Sem armazenamento: vale só até fechar.
  }
  listeners.forEach((l) => l());
}

export function getUserPacks(): PackTemplate[] {
  return current;
}

export function saveUserPack(pack: PackTemplate): void {
  write([pack, ...current.filter((p) => p.id !== pack.id)]);
}

export function removeUserPack(id: string): void {
  write(current.filter((p) => p.id !== id));
}

export function useUserPacks(): PackTemplate[] {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getUserPacks);
}

/** Formato do arquivo .lumiarpack (para levar os pacotes para outro computador ou mandar para alguém). */
const FILE_FORMAT = 'lumiar-pacotes';

export function exportUserPacks(): Blob {
  const data = { format: FILE_FORMAT, version: 1, packs: current.map(({ custom: _custom, ...p }) => p) };
  return new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
}

/** Junta os pacotes do arquivo aos "Meus pacotes" (os de mesmo id são trocados). Devolve quantos entraram. */
export async function importUserPacks(file: File): Promise<number> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(t('"{name}" não é um arquivo de pacotes do Lumiar.', { name: file.name }));
  }
  const packs = (data as { format?: string; packs?: unknown }).format === FILE_FORMAT ? (data as { packs: unknown }).packs : null;
  if (!Array.isArray(packs)) throw new Error(t('"{name}" não é um arquivo de pacotes do Lumiar.', { name: file.name }));
  const valid = packs.filter(
    (p): p is PackTemplate => !!p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.duration === 'number' && Array.isArray(p.effects),
  );
  const incoming = valid.map((p) => ({ ...p, category: 'Meus pacotes', custom: true }));
  const ids = new Set(incoming.map((p) => p.id));
  write([...incoming, ...current.filter((p) => !ids.has(p.id))]);
  return incoming.length;
}

/** Procura um pacote pelo id (prontos, do usuário e o bloco de ajuste). */
export function findPackTemplate(id: string): PackTemplate | undefined {
  if (id === ADJUSTMENT_TEMPLATE.id) return ADJUSTMENT_TEMPLATE;
  return current.find((p) => p.id === id) ?? PACKS.find((p) => p.id === id);
}
