/**
 * Idiomas da interface. O texto em português é a própria chave: `t('Salvar projeto')` devolve a tradução do
 * idioma escolhido ou, se ela ainda não existir, o português. Assim nenhum texto some por falta de tradução.
 *
 * Os dicionários ficam em ./en e ./es, um arquivo por área (exportando `default` um objeto { português: tradução }).
 * Só o do idioma escolhido é baixado, antes de abrir o editor (loadLanguage, em main.tsx).
 */

export type Lang = 'pt' | 'en' | 'es';

export const LANGS: { id: Lang; name: string }[] = [
  { id: 'pt', name: 'Português' },
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
];

const STORAGE_KEY = 'lumiar:idioma';

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt' || saved === 'en' || saved === 'es') return saved;
  } catch {
    // Sem armazenamento (workers, modo privado): vale o idioma do sistema.
  }
  const system = (globalThis.navigator?.language ?? 'pt').toLowerCase();
  if (system.startsWith('pt')) return 'pt';
  if (system.startsWith('es')) return 'es';
  return 'en';
}

export const lang: Lang = detect();

/** Para datas e números: toLocaleString(locale()) */
export function locale(): string {
  return lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR';
}

let dictionary: Record<string, string> = {};

const files = {
  en: import.meta.glob<{ default: Record<string, string> }>('./en/*.ts'),
  es: import.meta.glob<{ default: Record<string, string> }>('./es/*.ts'),
};

/** Carrega os dicionários do idioma escolhido. Precisa terminar antes de importar o resto do editor. */
export async function loadLanguage(): Promise<void> {
  // Programa instalado: os avisos e o menu do Mac, que vêm do próprio programa, seguem o mesmo idioma.
  (globalThis as { lumiarDesktop?: { setLanguage?(lang: Lang): void } }).lumiarDesktop?.setLanguage?.(lang);
  if (lang === 'pt') return;
  const parts = await Promise.all(Object.values(files[lang]).map((load) => load().then((m) => m.default)));
  dictionary = Object.assign({}, ...parts);
}

/**
 * Traduz um texto. `vars` preenche os {nomes} do texto: t('{n} clipe(s)', { n: 3 }).
 * Na tradução os mesmos {nomes} aparecem, na ordem que o idioma pedir.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  return fill(dictionary[text] ?? text, vars);
}

/**
 * Para o mesmo texto com sentidos diferentes: "Recortar" um clipe × "Recortar" a pessoa do fundo.
 * No dicionário a chave é "contexto|texto"; em português (ou sem tradução) aparece só o texto.
 */
export function tc(context: string, text: string, vars?: Record<string, string | number>): string {
  return fill(dictionary[`${context}|${text}`] ?? text, vars);
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** Troca o idioma e recarrega a interface (o salvamento automático oferece o projeto de volta). */
export function setLang(next: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    return;
  }
  location.reload();
}
