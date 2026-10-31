// Compara duas rodadas da bancada (scripts/bench/run.cjs), quadro a quadro:
//
//   npx electron scripts/bench/compare.cjs <pasta-antes> <pasta-depois> [--limite 2]
//
// Mostra a diferença média (0 a 255) e a maior diferença de cada quadro, do maior para o menor, e quantos passaram
// do limite. Serve para ver o que mudou de propósito e achar o que mudou sem querer.
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const [before, after] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const limitIndex = process.argv.indexOf('--limite');
const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : 2;

function walk(dir, base = dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, found);
    else if (entry.name.endsWith('.jpg') && entry.name !== 'faixa.jpg') found.push(path.relative(base, full));
  }
  return found;
}

app.whenReady().then(() => {
  const rows = [];
  for (const rel of walk(before)) {
    const other = path.join(after, rel);
    if (!fs.existsSync(other)) {
      rows.push({ rel, mean: Infinity, max: Infinity });
      continue;
    }
    const a = nativeImage.createFromPath(path.join(before, rel)).toBitmap();
    const b = nativeImage.createFromPath(other).toBitmap();
    if (a.length !== b.length) {
      rows.push({ rel, mean: Infinity, max: Infinity });
      continue;
    }
    let sum = 0;
    let max = 0;
    for (let i = 0; i < a.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(a[i + c] - b[i + c]);
        sum += d;
        if (d > max) max = d;
      }
    }
    rows.push({ rel, mean: sum / ((a.length / 4) * 3), max });
  }
  rows.sort((x, y) => y.mean - x.mean);
  for (const r of rows) if (r.mean > limit) console.log(`${r.mean.toFixed(2).padStart(7)}  max ${String(r.max).padStart(3)}  ${r.rel}`);
  console.log(`${rows.filter((r) => r.mean > limit).length} de ${rows.length} quadros com diferença média acima de ${limit}`);
  app.exit(0);
});
