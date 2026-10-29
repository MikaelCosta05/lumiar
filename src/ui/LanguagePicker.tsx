import { Languages } from 'lucide-react';
import { LANGS, lang, setLang, t, type Lang } from '../i18n';

/** Idioma da interface. Trocar recarrega o editor (o salvamento automático oferece o projeto de volta). */
export function LanguagePicker() {
  return (
    <label
      title={t('Idioma da interface')}
      className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-2 text-xs transition-colors hover:border-line-strong hover:bg-panel-3"
    >
      <Languages size={14} className="text-faint" />
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="cursor-pointer bg-transparent text-fg outline-none">
        {LANGS.map((l) => (
          <option key={l.id} value={l.id} className="bg-panel-2">
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
