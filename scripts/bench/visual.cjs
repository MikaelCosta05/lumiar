// Teste visual dos plugins (só para quem desenvolve): desenha filtros, efeitos, transições e pacotes pequenos, em PNG,
// e compara com as imagens de referência gravadas antes de mexer. Aponta só o que mudou de verdade.
//
//   npm run visual:ref [-- --ids effects/brilho,transitions/]   grava a referência em .tmp-visual/referencia
//   npm run visual [-- --ids effects/brilho]                    desenha de novo, compara e monta .tmp-visual/relatorio.html
//
// A referência fica fora do git: cada placa de vídeo desenha um pouco diferente. Opções da referência: --size 480x270,
// --times 0.5,1.5,2.5, --progress 0.25,0.5,0.75, --sem-ia (sem pessoa e profundidade); a comparação usa as mesmas.
// --todos lista também os iguais (com os números). --param effects/desfoque:radius=9 troca um valor só nesta
// rodada (para conferir que a comparação acusa).
// Sai com 1 se algo mudou além do limite (scripts/bench/visualDiff.ts) e 2 se não deu para rodar.
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, prepare, open } = require('./session.cjs');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const list = (text) => text.split(',').map((s) => s.trim()).filter(Boolean);
const DIR = path.resolve(arg('pasta', path.join(ROOT, '.tmp-visual')));
const REF = path.join(DIR, 'referencia');
const INFO = path.join(REF, 'bancada.json');
const ALL = ['filters/', 'effects/', 'transitions/', 'packs/'];
// Partes pequenas: a página devolve as imagens de cada parte, sem juntar o catálogo inteiro na memória.
const CHUNK = 8;
// PNG (sem o ruído do JPEG), sem a faixa, e os quadros do vídeo decodificados um a um (a busca no <video> às vezes
// entrega o quadro vizinho e a mesma rodada daria imagens diferentes). No catálogo inteiro os quadros guardados
// (com pessoa e profundidade) passariam de 2 GB: fica nos 600 mais recentes.
const RENDER = { quality: 1, format: 'png', strip: false, exactFrames: true, maxFrames: 600 };

const matches = (id, wanted) => wanted.some((w) => (w.endsWith('/') ? id.startsWith(w) : id === w));
const decode = (image) => ({ data: image.toBitmap(), width: image.getSize().width, height: image.getSize().height });
const fromDataUrl = (url) => Buffer.from(url.split(',')[1], 'base64');

function params() {
  const out = {};
  for (const item of list(arg('param', ''))) {
    const m = /^(.+):([^=]+)=(.+)$/.exec(item);
    if (!m) throw new Error(`--param inválido: ${item} (use id:nome=valor)`);
    (out[m[1]] ??= {})[m[2]] = Number(m[3]);
  }
  return out;
}

/** Ids da referência (pastas <tipo>/<nome>) com os quadros de cada um. */
function referenceIds() {
  const ids = new Map();
  if (!fs.existsSync(REF)) return ids;
  for (const kind of fs.readdirSync(REF, { withFileTypes: true })) {
    if (!kind.isDirectory()) continue;
    for (const name of fs.readdirSync(path.join(REF, kind.name), { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      const files = fs.readdirSync(path.join(REF, kind.name, name.name)).filter((f) => f.endsWith('.png'));
      ids.set(`${kind.name}/${name.name}`, files);
    }
  }
  return ids;
}

/** Desenha os ids em partes; `each(shot)` recebe cada quadro. Devolve os erros de compilação/desenho. */
async function render(bench, ids, options, each) {
  const errors = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const result = await bench.call('run', { ...options, ids: ids.slice(i, i + CHUNK) });
    for (const shot of result.shots) each(shot);
    errors.push(...result.errors);
    console.log(`[visual] ${Math.min(i + CHUNK, ids.length)}/${ids.length}`);
  }
  return errors;
}

async function makeReference(bench) {
  const wanted = arg('ids') ? list(arg('ids')) : ALL;
  const [width, height] = arg('size', '480x270').split('x').map(Number);
  const options = {
    width,
    height,
    times: list(arg('times', '0.5,1.5,2.5')).map(Number),
    progress: list(arg('progress', '0.25,0.5,0.75')).map(Number),
    ai: !flag('sem-ia'),
  };
  // Com --ids, só troca esses na referência (se ela foi feita com as mesmas opções); sem, recomeça do zero.
  const old = fs.existsSync(INFO) ? JSON.parse(fs.readFileSync(INFO, 'utf8')) : null;
  const merge = arg('ids') && old && JSON.stringify(old.options) === JSON.stringify(options);
  if (!merge) fs.rmSync(REF, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  const ids = await bench.call('list', wanted);
  for (const id of ids) fs.rmSync(path.join(REF, id), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  const { shotFile } = await diffModule();
  let count = 0;
  const errors = await render(bench, ids, { ...options, ...RENDER, params: params() }, (shot) => {
    fs.mkdirSync(path.join(REF, shot.id), { recursive: true });
    fs.writeFileSync(path.join(REF, shot.id, shotFile(shot.label)), fromDataUrl(shot.image));
    count++;
  });
  const info = { options, full: merge ? old.full : !arg('ids'), date: new Date().toISOString(), electron: process.versions.electron };
  fs.writeFileSync(INFO, JSON.stringify(info, null, 2));
  console.log(`Referência: ${ids.length} plugins, ${count} imagens em ${REF}`);
  for (const e of errors) console.log(`ERRO ${e.id}: ${e.message.slice(0, 500)}`);
  return errors.length ? 1 : 0;
}

async function compare(bench) {
  const info = JSON.parse(fs.readFileSync(INFO, 'utf8'));
  const diff = await diffModule();
  const refs = referenceIds();
  const wanted = arg('ids') ? list(arg('ids')) : info.full ? ALL : [...refs.keys()];
  const ids = await bench.call('list', wanted);
  const missing = [...refs.keys()].filter((id) => matches(id, wanted) && !ids.includes(id));
  for (const dir of ['atual', 'diferenca']) fs.rmSync(path.join(DIR, dir), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  const shots = [];
  const save = (dir, id, label, png) => {
    fs.mkdirSync(path.join(DIR, dir, id), { recursive: true });
    fs.writeFileSync(path.join(DIR, dir, id, diff.shotFile(label)), png);
  };
  const started = Date.now();
  const errors = await render(bench, ids, { ...info.options, ...RENDER, params: params() }, (shot) => {
    const file = path.join(REF, shot.id, diff.shotFile(shot.label));
    const png = fromDataUrl(shot.image);
    const cur = decode(nativeImage.createFromBuffer(png));
    const ref = fs.existsSync(file) ? decode(nativeImage.createFromPath(file)) : null;
    const map = ref && ref.data.length === cur.data.length ? Buffer.alloc(cur.data.length) : undefined;
    const result = diff.compareShot(ref, cur, diff.LIMITS, map);
    shots.push({ id: shot.id, label: shot.label, ...result });
    if (result.status === 'igual') return;
    save('atual', shot.id, shot.label, png);
    if (map) save('diferenca', shot.id, shot.label, nativeImage.createFromBitmap(map, { width: cur.width, height: cur.height }).toPNG());
  });
  // Quadros da referência que não vieram (outros instantes, ou o plugin parou no meio).
  for (const id of ids) {
    const made = new Set(shots.filter((s) => s.id === id).map((s) => diff.shotFile(s.label)));
    for (const file of refs.get(id) ?? []) if (!made.has(file)) shots.push({ id, label: file.replace(/\.png$/, ''), status: 'faltou', diff: null });
  }
  const results = diff.summarize(shots, errors, missing);
  for (const r of results) if (r.status !== 'igual' || flag('todos')) console.log(diff.describe(r));
  const changed = results.filter((r) => ['erro', 'sumiu', 'mudou'].includes(r.status)).length;
  const fresh = results.filter((r) => r.status === 'novo').length;
  const o = info.options;
  fs.writeFileSync(
    path.join(DIR, 'relatorio.html'),
    diff.reportHtml(results, {
      reference: new Date(info.date).toLocaleString('pt-BR'),
      now: new Date().toLocaleString('pt-BR'),
      size: `${o.width}x${o.height}${o.ai ? ', com IA' : ''}`,
      limits: diff.LIMITS,
    }),
  );
  console.log(
    `${changed} de ${results.length} plugins com diferença${fresh ? `, ${fresh} sem referência` : ''} (${((Date.now() - started) / 1000).toFixed(0)} s). ` +
      `Relatório: ${path.join(DIR, 'relatorio.html')}`,
  );
  return diff.failed(results) ? 1 : 0;
}

const diffModule = () => import(pathToFileURL(path.join(__dirname, 'visualDiff.ts')).href);

prepare();
app.whenReady().then(async () => {
  let code = 2;
  let bench;
  try {
    if (!flag('ref') && !fs.existsSync(INFO)) throw new Error(`Sem referência em ${REF}. Antes de mexer, rode: npm run visual:ref`);
    bench = await open();
    code = flag('ref') ? await makeReference(bench) : await compare(bench);
  } catch (error) {
    console.error(error instanceof Error && !bench ? error.message : error);
  }
  await bench?.close();
  app.exit(code);
});
