import { compileProgram, ShaderError } from '../engine/gl';
import { getPlugin } from '../engine/registry';
import { buildPluginSource, formatShaderLog, VERTEX_SHADER } from '../engine/shaders';
import type { ParamDef, ShaderPlugin } from '../engine/types';
import { listUserEffects, saveUserEffect, toPlugin, type UserEffect } from '../engine/userPlugins';
import { uid } from '../project/model';
import { forgetPluginPreview, getPluginPreviews } from './previews';
import { t } from '../i18n';

// ---------------------------------------------------------------- Conferência (editor e importação)

const RESERVED = new Set(['time', 'duration', 'ratio', 'resolution', 'uInput', 'effect', 'getColor', 'uv']);

/** Compila o shader numa GPU de rascunho só para achar erros (sem mexer no editor). */
let checker: WebGL2RenderingContext | null = null;
export function checkShader(plugin: ShaderPlugin): string | null {
  checker ??= document.createElement('canvas').getContext('webgl2');
  if (!checker) return null;
  const { source, lineOffset } = buildPluginSource(plugin);
  try {
    const compiled = compileProgram(checker, VERTEX_SHADER, source);
    checker.deleteProgram(compiled.program);
    return null;
  } catch (error) {
    return error instanceof ShaderError ? formatShaderLog(error.message, lineOffset) : String(error);
  }
}

export function paramProblem(params: ParamDef[]): string | null {
  const seen = new Set<string>();
  for (const p of params) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.id)) return t('"{id}" não serve de nome de variável (use letras, números e _ , sem acento).', { id: p.id });
    if (RESERVED.has(p.id)) return t('"{id}" é um nome reservado do Lumiar.', { id: p.id });
    if (seen.has(p.id)) return t('Dois parâmetros com o nome "{id}".', { id: p.id });
    seen.add(p.id);
  }
  return null;
}

function slug(name: string): string {
  return (name || 'efeito')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'efeito';
}

/** Id novo para um efeito do usuário ("user/onda-colorida-1a2b3c"). */
export function newUserEffectId(name: string): string {
  return `user/${slug(name).slice(0, 40)}-${uid().slice(0, 6)}`;
}

// ---------------------------------------------------------------- Arquivo .lumiarfx

/** Formato do arquivo .lumiarfx (para mandar efeitos para alguém ou levar para outro computador). */
const FILE_FORMAT = 'lumiar-efeitos';
const FILE_VERSION = 1;

// Limites para não travar o Lumiar com um arquivo estranho.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_EFFECTS = 100;
const MAX_PARAMS = 32;
const MAX_GLSL = 64 * 1024;
const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Salva os efeitos num arquivo .lumiarfx (um só fica com o nome dele; vários, "meus-efeitos"). */
export function exportUserEffects(effects: UserEffect[]): void {
  const data = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    effects: effects.map(({ id, name, description, params, glsl }) => ({ id, name, description, params, glsl })),
  };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  download(blob, `${effects.length === 1 ? slug(effects[0].name) : 'meus-efeitos'}.lumiarfx`);
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Confere um parâmetro vindo do arquivo e devolve só os campos que o Lumiar usa. */
function readParam(raw: unknown): ParamDef | string {
  const p = raw as Partial<Record<keyof ParamDef, unknown>> | null;
  if (!p || typeof p !== 'object') return t('parâmetro inválido.');
  if (typeof p.id !== 'string' || p.id.length > 64) return t('parâmetro sem nome.');
  const label = typeof p.label === 'string' && p.label.trim() ? p.label.trim().slice(0, MAX_NAME) : p.id;
  const extra = (['min', 'max', 'step'] as const).filter((k) => p[k] !== undefined);
  if (extra.some((k) => !isNumber(p[k]))) return t('limites do parâmetro "{id}" não são números.', { id: p.id });
  const limits = Object.fromEntries(extra.map((k) => [k, p[k] as number])) as Pick<ParamDef, 'min' | 'max' | 'step'>;
  if (p.type === 'float') {
    if (!isNumber(p.default)) return t('o valor inicial de "{id}" não é um número.', { id: p.id });
    return { id: p.id, label, type: 'float', default: p.default, ...limits };
  }
  if (p.type === 'vec2') {
    if (!Array.isArray(p.default) || p.default.length !== 2 || !p.default.every(isNumber)) return t('o valor inicial de "{id}" não é uma posição (x, y).', { id: p.id });
    return { id: p.id, label, type: 'vec2', default: [p.default[0], p.default[1]], ...limits };
  }
  if (p.type === 'color') {
    if (typeof p.default !== 'string' || !/^#[0-9a-f]{6}$/i.test(p.default)) return t('a cor inicial de "{id}" não está no formato #rrggbb.', { id: p.id });
    return { id: p.id, label, type: 'color', default: p.default.toLowerCase() };
  }
  return t('o parâmetro "{id}" tem um tipo que o Lumiar não conhece.', { id: p.id });
}

/** Confere um efeito vindo do arquivo (campos, tipos, tamanhos e o próprio shader). */
function readEffect(raw: unknown): Omit<UserEffect, 'id'> & { id?: string } | string {
  const e = raw as Partial<Record<keyof UserEffect, unknown>> | null;
  if (!e || typeof e !== 'object') return t('efeito inválido.');
  const name = typeof e.name === 'string' && e.name.trim() ? e.name.trim().slice(0, MAX_NAME) : t('Meu efeito');
  const fail = (why: string) => `"${name}": ${why}`;
  if (typeof e.glsl !== 'string' || !e.glsl.trim()) return fail(t('não tem código do shader.'));
  if (e.glsl.length > MAX_GLSL) return fail(t('o shader é grande demais.'));
  if (e.description !== undefined && typeof e.description !== 'string') return fail(t('a descrição não é um texto.'));
  if (e.params !== undefined && !Array.isArray(e.params)) return fail(t('a lista de parâmetros está errada.'));
  const rawParams = (e.params as unknown[] | undefined) ?? [];
  if (rawParams.length > MAX_PARAMS) return fail(t('tem parâmetros demais.'));
  const params: ParamDef[] = [];
  for (const p of rawParams) {
    const read = readParam(p);
    if (typeof read === 'string') return fail(read);
    params.push(read);
  }
  const effect = {
    id: typeof e.id === 'string' ? e.id : undefined,
    name,
    description: ((e.description as string | undefined) ?? '').trim().slice(0, MAX_DESCRIPTION),
    params,
    glsl: e.glsl,
  };
  // Mesma conferência do editor de efeitos. Sem WebGL2 aqui, sobra o aviso de erro de shader do próprio motor.
  const problem = paramProblem(params) ?? checkShader(toPlugin({ ...effect, id: 'user/__importando__' }));
  return problem ? fail(t('não compila ({problem})', { problem: problem.split('\n')[0] })) : effect;
}

const sameContent = (a: Pick<UserEffect, 'glsl' | 'params'>, b: Pick<UserEffect, 'glsl' | 'params'>) =>
  a.glsl.trim() === b.glsl.trim() &&
  JSON.stringify(a.params.map((p) => [p.id, p.label, p.type, p.default, p.min, p.max, p.step])) ===
    JSON.stringify(b.params.map((p) => [p.id, p.label, p.type, p.default, p.min, p.max, p.step]));

export interface EffectImport {
  /** Os que entraram em "Meus efeitos" (já guardados e na biblioteca). */
  added: UserEffect[];
  /** Iguais a um efeito que já estava lá (não duplicados). */
  same: number;
  /** Motivo de cada um que ficou de fora. */
  rejected: string[];
}

/**
 * Junta os efeitos do arquivo aos "Meus efeitos". Nada é trocado: se o id ou o nome já existem,
 * o efeito entra com id novo e nome "Nome (2)"; se é igualzinho a um que já está lá, é pulado.
 */
export async function importUserEffects(file: File): Promise<EffectImport> {
  const notOurs = t('"{name}" não é um arquivo de efeitos do Lumiar.', { name: file.name });
  if (file.size > MAX_FILE_BYTES) throw new Error(t('"{name}" é grande demais para um arquivo de efeitos.', { name: file.name }));
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(notOurs);
  }
  const { format, version, effects } = (data ?? {}) as { format?: unknown; version?: unknown; effects?: unknown };
  if (format !== FILE_FORMAT || !Array.isArray(effects)) throw new Error(notOurs);
  if (!isNumber(version) || version > FILE_VERSION) throw new Error(t('"{name}" foi feito numa versão mais nova do Lumiar. Atualize para importar.', { name: file.name }));
  if (effects.length > MAX_EFFECTS) throw new Error(t('"{name}" tem efeitos demais (o máximo é {max} por arquivo).', { name: file.name, max: MAX_EFFECTS }));

  const existing = listUserEffects();
  const names = new Set(existing.map((e) => e.name.trim().toLowerCase()));
  const ids = new Set(existing.map((e) => e.id));
  const result: EffectImport = { added: [], same: 0, rejected: [] };
  for (const raw of effects) {
    const read = readEffect(raw);
    if (typeof read === 'string') {
      result.rejected.push(read);
      continue;
    }
    if ([...existing, ...result.added].some((e) => sameContent(e, read))) {
      result.same++;
      continue;
    }
    // Mantém o id do arquivo quando dá (projetos que usam o efeito continuam achando); nunca o de um efeito pronto.
    const keepId = read.id && /^user\/[a-z0-9][a-z0-9-]{0,80}$/.test(read.id) && !ids.has(read.id) && !getPlugin(read.id);
    const id = keepId ? read.id! : newUserEffectId(read.name);
    let name = read.name;
    if (names.has(name.toLowerCase())) {
      const base = name.replace(/ \(\d+\)$/, '');
      let n = 2;
      while (names.has(`${base} (${n})`.toLowerCase())) n++;
      name = `${base} (${n})`;
    }
    const effect: UserEffect = { id, name, description: read.description, params: read.params, glsl: read.glsl };
    saveUserEffect(effect);
    forgetPluginPreview(id);
    ids.add(id);
    names.add(name.toLowerCase());
    result.added.push(effect);
  }
  if (result.added.length) getPluginPreviews();
  return result;
}

/** O aviso de sempre sobre uma importação (também usado pela galeria da comunidade). */
export function describeEffectImport({ added, same, rejected }: EffectImport): { text: string; error: boolean } {
  const parts = [
    added.length ? t('{n} efeito(s) importado(s) para Efeitos → Meus efeitos.', { n: added.length }) : t('Nenhum efeito novo no arquivo.'),
    same ? t('{n} já estava(m) lá.', { n: same }) : '',
    rejected.length ? t('{n} ficou(aram) de fora: {reason}', { n: rejected.length, reason: rejected[0] }) : '',
  ];
  return { text: parts.filter(Boolean).join(' '), error: added.length === 0 && (rejected.length > 0 || same === 0) };
}

/** Escolhe um .lumiarfx, importa e avisa o resultado do jeito de sempre. */
export function pickEffectFile(notify: (text: string, error?: boolean) => void, onImported?: (added: UserEffect[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.lumiarfx,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = await importUserEffects(file);
      const { text, error } = describeEffectImport(result);
      notify(text, error);
      if (result.added.length) onImported?.(result.added);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    }
  };
  input.click();
}
