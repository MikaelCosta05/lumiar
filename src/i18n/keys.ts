import { lang } from '.';

/** No Mac os atalhos usam ⌘ no lugar do Ctrl (e ⌥ no lugar do Alt). */
export const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? globalThis.navigator?.userAgent ?? '');

const MAC: Record<string, string> = { Ctrl: '⌘', Alt: '⌥', Shift: '⇧', Delete: '⌫' };
const DELETE: Record<string, string> = { pt: 'Delete', en: 'Del', es: 'Supr' };

/** Nome do atalho como aparece no teclado da pessoa: keys('Ctrl+S') → "⌘S" no Mac, "Ctrl+S" no resto. */
export function keys(combo: string): string {
  if (isMac) return combo.replace(/\b(Ctrl|Alt|Shift|Delete)\b\+?/g, (_m, key: string) => MAC[key]);
  return combo.replace(/\bDelete\b/g, DELETE[lang]);
}
