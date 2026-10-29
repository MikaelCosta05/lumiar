// Gera o index.json da galeria da comunidade a partir das pastas de itens (formato em docs/GALERIA.md).
// Cada item é uma pasta em efeitos/ ou pacotes/ com o arquivo (.lumiarfx ou .lumiarpack), um item.json e,
// se quiser, uma prévia (preview.jpg, .png ou .webp). O tamanho e o SHA-256 são calculados aqui.
//
// Uso: node scripts/galeria-index.mjs <pasta-da-galeria>           (escreve <pasta>/index.json)
//      node scripts/galeria-index.mjs <pasta-da-galeria> --check   (só confere: falha se o index.json está desatualizado)
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FORMAT = 'lumiar-galeria';
const VERSION = 1;
// Os mesmos limites do Lumiar (src/project/gallery.ts e src/ui/effectFile.ts).
const MAX_ITEM_BYTES = 4 * 1024 * 1024;
const MAX_EFFECTS = 100;
const MAX_GLSL = 64 * 1024;
const MAX_TAGS = 12;
const MAX_PREVIEW_BYTES = 500 * 1024;

const KINDS = [
  { folder: 'efeitos', kind: 'effect', ext: '.lumiarfx', format: 'lumiar-efeitos', list: 'effects' },
  { folder: 'pacotes', kind: 'pack', ext: '.lumiarpack', format: 'lumiar-pacotes', list: 'packs' },
];

const args = process.argv.slice(2);
const check = args.includes('--check');
const root = args.find((a) => !a.startsWith('--'));
if (!root || !existsSync(root)) {
  console.error('Uso: node scripts/galeria-index.mjs <pasta-da-galeria> [--check]');
  process.exit(2);
}

const errors = [];
const warnings = [];
// AAAA-MM-DD no fuso de quem roda (o "sv-SE" escreve a data nesse formato).
const today = new Date().toLocaleDateString('sv-SE');
const indexPath = join(root, 'index.json');

/** Datas de entrada do índice anterior: regerar não muda o "added" de quem já estava. */
let previous = { items: [] };
if (existsSync(indexPath)) {
  try {
    previous = JSON.parse(readFileSync(indexPath, 'utf8'));
  } catch {
    warnings.push('o index.json atual não é um JSON válido; ele será refeito do zero.');
  }
}
const addedBefore = new Map((previous.items ?? []).map((i) => [`${i.kind}:${i.id}`, i.added]));

const isText = (v) => typeof v === 'string';
const dirs = (path) => (existsSync(path) ? readdirSync(path).filter((n) => statSync(join(path, n)).isDirectory()).sort() : []);

/** Confere o conteúdo do .lumiarfx / .lumiarpack (o Lumiar confere de novo, e compila os shaders, ao instalar). */
function readContents(kind, bytes, where) {
  let data;
  try {
    data = JSON.parse(bytes.toString('utf8'));
  } catch {
    errors.push(`${where}: o arquivo não é um JSON válido.`);
    return [];
  }
  if (data?.format !== kind.format || !Array.isArray(data[kind.list])) {
    errors.push(`${where}: não é um arquivo ${kind.ext} (o "format" precisa ser "${kind.format}").`);
    return [];
  }
  const list = data[kind.list];
  if (!list.length) errors.push(`${where}: o arquivo está vazio.`);
  if (kind.kind === 'effect') {
    if (list.length > MAX_EFFECTS) errors.push(`${where}: mais de ${MAX_EFFECTS} efeitos.`);
    for (const e of list) {
      if (!isText(e?.glsl) || !e.glsl.trim()) errors.push(`${where}: "${e?.name ?? '?'}" não tem código do shader.`);
      else if (e.glsl.length > MAX_GLSL) errors.push(`${where}: o shader de "${e.name}" passa de 64 KB.`);
    }
  } else {
    for (const p of list) {
      if (!isText(p?.id) || !isText(p?.name) || typeof p?.duration !== 'number' || !Array.isArray(p?.effects)) errors.push(`${where}: o pacote "${p?.name ?? '?'}" está incompleto.`);
    }
  }
  return list.map((x) => x?.id).filter(isText);
}

function readItem(kind, id) {
  const folder = join(root, kind.folder, id);
  const where = `${kind.folder}/${id}`;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return errors.push(`${where}: o nome da pasta vira o id (só letras minúsculas, números e -).`);
  const files = readdirSync(folder);
  const main = files.filter((n) => n.toLowerCase().endsWith(kind.ext));
  if (main.length !== 1) return errors.push(`${where}: precisa ter exatamente um arquivo ${kind.ext} (tem ${main.length}).`);
  if (!files.includes('item.json')) return errors.push(`${where}: falta o item.json.`);
  let meta;
  try {
    meta = JSON.parse(readFileSync(join(folder, 'item.json'), 'utf8'));
  } catch {
    return errors.push(`${where}/item.json: não é um JSON válido.`);
  }
  if (!isText(meta.name) || !meta.name.trim()) errors.push(`${where}/item.json: falta o "name".`);
  if (!isText(meta.author) || !meta.author.trim()) errors.push(`${where}/item.json: falta o "author".`);
  if (meta.description !== undefined && !isText(meta.description)) errors.push(`${where}/item.json: "description" precisa ser um texto.`);
  if (meta.tags !== undefined && !(Array.isArray(meta.tags) && meta.tags.every(isText))) errors.push(`${where}/item.json: "tags" precisa ser uma lista de textos.`);
  if (Array.isArray(meta.tags) && meta.tags.length > MAX_TAGS) warnings.push(`${where}: só as ${MAX_TAGS} primeiras etiquetas aparecem.`);
  if (meta.language !== undefined && !isText(meta.language)) errors.push(`${where}/item.json: "language" precisa ser um texto ("pt", "en", "es"…).`);
  if (meta.version !== undefined && !isText(meta.version)) errors.push(`${where}/item.json: "version" precisa ser um texto ("1.0.0").`);
  if (!meta.description) warnings.push(`${where}: sem descrição.`);

  const bytes = readFileSync(join(folder, main[0]));
  if (bytes.length > MAX_ITEM_BYTES) errors.push(`${where}: ${main[0]} passa de 4 MB.`);
  const contents = readContents(kind, bytes, `${where}/${main[0]}`);

  // A prévia é a do item.json ("preview": "capa.png") ou a primeira preview.* da pasta.
  const preview = isText(meta.preview) ? meta.preview : files.find((n) => /^preview\.(jpe?g|png|webp|gif)$/i.test(n));
  if (preview) {
    if (!files.includes(preview)) errors.push(`${where}: a prévia "${preview}" não está na pasta.`);
    else if (statSync(join(folder, preview)).size > MAX_PREVIEW_BYTES) warnings.push(`${where}: a prévia passa de 500 KB (a galeria abre mais devagar).`);
  } else warnings.push(`${where}: sem prévia (preview.jpg).`);

  const path = (name) => `${kind.folder}/${id}/${encodeURIComponent(name)}`;
  return {
    id,
    kind: kind.kind,
    name: meta.name?.trim(),
    description: (meta.description ?? '').trim(),
    author: meta.author?.trim(),
    tags: meta.tags ?? [],
    language: meta.language ?? '',
    file: path(main[0]),
    ...(preview ? { preview: path(preview) } : {}),
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    version: meta.version ?? '1.0.0',
    added: addedBefore.get(`${kind.kind}:${id}`) ?? (isText(meta.added) ? meta.added : today),
    contents,
  };
}

const items = [];
for (const kind of KINDS) {
  for (const id of dirs(join(root, kind.folder))) {
    const item = readItem(kind, id);
    if (item && typeof item === 'object') items.push(item);
  }
}
// Os mais novos primeiro (é a ordem em que aparecem na galeria).
items.sort((a, b) => b.added.localeCompare(a.added) || a.name.localeCompare(b.name));

for (const w of warnings) console.warn(`aviso: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`erro: ${e}`);
  console.error(`\n${errors.length} erro(s): o index.json não foi gerado.`);
  process.exit(1);
}

const name = isText(previous.name) ? previous.name : 'Galeria da comunidade do Lumiar';
const strip = (index) => JSON.stringify({ ...index, updated: undefined });
const next = { format: FORMAT, version: VERSION, name, updated: today, items };

if (check) {
  if (strip(next) !== strip(previous)) {
    console.error('O index.json está desatualizado: rode "node scripts/galeria-index.mjs <pasta>" e mande junto.');
    process.exit(1);
  }
  console.log(`index.json em dia (${items.length} itens).`);
} else {
  writeFileSync(indexPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`index.json gerado: ${items.filter((i) => i.kind === 'effect').length} efeito(s), ${items.filter((i) => i.kind === 'pack').length} pacote(s).`);
}
