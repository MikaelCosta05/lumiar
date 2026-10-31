// Bancada de qualidade dos plugins (só para quem desenvolve). Roda no Electron, com o Vite servindo o código:
//
//   npx electron scripts/bench/run.cjs --ids effects/brilho,transitions/ --out pasta [--size 1280x720]
//       [--times 0.5,1.5,2.5] [--progress 0.25,0.5,0.75] [--ai] [--timing]
//
// Para cada plugin salva os quadros (JPEG) e uma faixa com eles lado a lado em <out>/<tipo>/<nome>/, e um
// relatorio.json com os erros de compilação e o tempo gasto. --timing mede quantos ms leva um quadro.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, prepare, open } = require('./session.cjs');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const list = (text) => text.split(',').map((s) => s.trim()).filter((s, i, all) => s || all.length === 1);
const [width, height] = arg('size', '1280x720').split('x').map(Number);
const options = {
  ids: list(arg('ids', '')),
  width,
  height,
  times: list(arg('times', '0.5,1.5,2.5')).map(Number),
  progress: list(arg('progress', '0.25,0.5,0.75')).map(Number),
  ai: flag('ai'),
  quality: 0.92,
};
const out = path.resolve(arg('out', path.join(ROOT, '.tmp-bench')));

prepare();
app.whenReady().then(async () => {
  const bench = await open();
  let code = 0;
  try {
    const result = flag('timing')
      ? await bench.call('timing', { ...options, repeat: Number(arg('repeat', '30')) })
      : await bench.call('run', options);
    fs.mkdirSync(out, { recursive: true });
    if (flag('timing')) {
      fs.writeFileSync(path.join(out, 'tempos.json'), JSON.stringify(result, null, 2));
      for (const [id, ms] of Object.entries(result).sort((a, b) => b[1] - a[1])) console.log(`${ms.toFixed(2).padStart(8)} ms  ${id}`);
    } else {
      const count = new Map();
      for (const shot of result.shots) {
        const dir = path.join(out, shot.id);
        fs.mkdirSync(dir, { recursive: true });
        const name = shot.label === 'faixa' ? 'faixa.jpg' : `${shot.label.replace(/[^a-z0-9.=]/gi, '_')}.jpg`;
        fs.writeFileSync(path.join(dir, name), Buffer.from(shot.image.split(',')[1], 'base64'));
        count.set(shot.id, (count.get(shot.id) ?? 0) + 1);
      }
      fs.writeFileSync(path.join(out, 'relatorio.json'), JSON.stringify({ errors: result.errors, millis: result.millis }, null, 2));
      console.log(`${count.size} plugins, ${result.shots.length} imagens em ${out}`);
      for (const e of result.errors) console.log(`ERRO ${e.id}: ${e.message.slice(0, 500)}`);
      if (result.errors.length) code = 1;
    }
  } catch (error) {
    console.error(error);
    code = 2;
  }
  await bench.close();
  app.exit(code);
});
