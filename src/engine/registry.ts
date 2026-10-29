import { locale, t } from '../i18n';
import { hexToRgb } from './color';
import type { ParamDef, ParamValue, ParamValues, PluginKind, PreviewMedia, ShaderPlugin } from './types';

/**
 * Plugins são pastas em /plugins/effects/<nome>/, /plugins/transitions/<nome>/ ou /plugins/filters/<nome>/
 * contendo plugin.json (nome e parâmetros) + shader.glsl (o efeito).
 * Basta criar a pasta: o Vite encontra os arquivos sozinho.
 */
interface Manifest {
  name?: string;
  description?: string;
  category?: string;
  params?: ParamDef[];
  /** Valores usados só na miniatura da biblioteca (quando o padrão não mostra o efeito). */
  preview?: ParamValues;
  /** Mídia de exemplo da miniatura: "pessoa", "movimento", "silhueta", "retrato", "paisagem", "cidade" ou "drone". */
  previewMedia?: PreviewMedia;
}

const manifests = import.meta.glob<Manifest>('/plugins/*/*/plugin.json', {
  eager: true,
  import: 'default',
});
const shaders = import.meta.glob<string>('/plugins/*/*/shader.glsl', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const KIND_BY_FOLDER: Record<string, PluginKind> = {
  effects: 'effect',
  transitions: 'transition',
  filters: 'filter',
};

/**
 * Nomes iguais a outro texto dos plugins mas com outro sentido: no dicionário, a chave ganha o contexto
 * ("Raio" é o nome da transição de relâmpago e também o controle "raio" do redemoinho).
 */
export const NAME_KEYS: Record<string, string> = {
  'transitions/raio': 'Raio (relâmpago)',
};

const byName = (a: ShaderPlugin, b: ShaderPlugin) => a.name.localeCompare(b.name, locale());

/** Traduz `text` pela chave `key`; sem tradução, fica o texto original (e não a chave). */
function translate(text: string, key = text): string {
  const out = t(key);
  return out === key ? text : out;
}

/**
 * Nome, descrição e controles aparecem no idioma da interface (o português do plugin.json é a chave).
 * A categoria fica em português: ela agrupa e é comparada; a tela traduz com t(categoria).
 */
function loadPlugins(): ShaderPlugin[] {
  const list: ShaderPlugin[] = [];
  for (const [path, manifest] of Object.entries(manifests)) {
    // "/plugins/effects/glitch/plugin.json" → ["", "plugins", "effects", "glitch", "plugin.json"]
    const [, , folder, name] = path.split('/');
    const kind = KIND_BY_FOLDER[folder];
    const glsl = shaders[path.replace(/plugin\.json$/, 'shader.glsl')];
    if (!kind || glsl === undefined) {
      console.warn(`[Lumiar] plugin ignorado (falta shader.glsl ou pasta inválida): ${path}`);
      continue;
    }
    const id = `${folder}/${name}`;
    list.push({
      id,
      kind,
      name: manifest.name ? translate(manifest.name, NAME_KEYS[id]) : name,
      description: manifest.description ? translate(manifest.description) : '',
      category: manifest.category ?? 'Geral',
      params: (manifest.params ?? []).map((def) => (def.label ? { ...def, label: translate(def.label) } : def)),
      previewParams: manifest.preview ?? {},
      previewMedia: manifest.previewMedia,
      glsl,
    });
  }
  return list.sort(byName);
}

export const plugins = loadPlugins();
export const effectPlugins = plugins.filter((p) => p.kind === 'effect');
export const transitionPlugins = plugins.filter((p) => p.kind === 'transition');
export const filterPlugins = plugins.filter((p) => p.kind === 'filter');

const byId = new Map(plugins.map((p) => [p.id, p]));

export function getPlugin(id: string): ShaderPlugin | undefined {
  return byId.get(id);
}

// ---------------------------------------------------------------- Efeitos criados no editor

const listeners = new Set<() => void>();
let version = 0;

/** Avisa quando a lista de plugins muda (efeito novo ou editado no editor de efeitos). */
export function subscribePlugins(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pluginsVersion(): number {
  return version;
}

function listOf(kind: ShaderPlugin['kind']): ShaderPlugin[] {
  return kind === 'effect' ? effectPlugins : kind === 'filter' ? filterPlugins : transitionPlugins;
}

/** Acrescenta (ou troca, se o id já existe) um plugin feito pela pessoa. */
export function registerPlugin(plugin: ShaderPlugin): void {
  unregisterPlugin(plugin.id, false);
  for (const list of [plugins, listOf(plugin.kind)]) {
    list.push(plugin);
    list.sort(byName);
  }
  byId.set(plugin.id, plugin);
  version++;
  listeners.forEach((l) => l());
}

export function unregisterPlugin(id: string, notify = true): void {
  for (const list of [plugins, effectPlugins, filterPlugins, transitionPlugins]) {
    const i = list.findIndex((p) => p.id === id);
    if (i >= 0) list.splice(i, 1);
  }
  byId.delete(id);
  if (!notify) return;
  version++;
  listeners.forEach((l) => l());
}

export function paramDefault(def: ParamDef): ParamValue {
  if (typeof def.default === 'string') return hexToRgb(def.default);
  return Array.isArray(def.default) ? [...def.default] : def.default;
}

export function defaultParams(plugin: ShaderPlugin): ParamValues {
  return Object.fromEntries(plugin.params.map((def) => [def.id, paramDefault(def)]));
}
