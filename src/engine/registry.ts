import { hexToRgb } from './color';
import type { ParamDef, ParamValue, ParamValues, PluginKind, ShaderPlugin } from './types';

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
    list.push({
      id: `${folder}/${name}`,
      kind,
      name: manifest.name ?? name,
      description: manifest.description ?? '',
      category: manifest.category ?? 'Geral',
      params: manifest.params ?? [],
      previewParams: manifest.preview ?? {},
      glsl,
    });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export const plugins = loadPlugins();
export const effectPlugins = plugins.filter((p) => p.kind === 'effect');
export const transitionPlugins = plugins.filter((p) => p.kind === 'transition');
export const filterPlugins = plugins.filter((p) => p.kind === 'filter');

const byId = new Map(plugins.map((p) => [p.id, p]));

export function getPlugin(id: string): ShaderPlugin | undefined {
  return byId.get(id);
}

export function paramDefault(def: ParamDef): ParamValue {
  if (typeof def.default === 'string') return hexToRgb(def.default);
  return Array.isArray(def.default) ? [...def.default] : def.default;
}

export function defaultParams(plugin: ShaderPlugin): ParamValues {
  return Object.fromEntries(plugin.params.map((def) => [def.id, paramDefault(def)]));
}
