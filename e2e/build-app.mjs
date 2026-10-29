// Monta uma cópia do Lumiar só para os testes de ponta a ponta, em .tmp-e2e/app:
//   dist/      o build do Vite (sem copiar a pasta public: os ~600 MB de modelos viram links para ela)
//   electron/  o main.cjs e o preload.cjs de verdade, copiados como estão
//   e2e-main.cjs  troca a pasta de dados do usuário por uma temporária e carrega o main.cjs
// Assim os testes não mexem no dist/ do projeto (nem no de quem estiver rodando o app ao mesmo tempo)
// nem nos dados do Lumiar instalado.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_DIR = path.join(ROOT, '.tmp-e2e', 'app');

export async function buildApp() {
  const dist = path.join(APP_DIR, 'dist');
  if (process.env.LUMIAR_E2E_SKIP_BUILD && fs.existsSync(path.join(dist, 'index.html'))) return;
  const { build } = await import('vite');
  await build({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    logLevel: 'warn',
    build: { outDir: dist, emptyOutDir: true, copyPublicDir: false },
  });
  // Os arquivos de public entram como links (junction no Windows: não precisa de administrador).
  for (const name of fs.readdirSync(path.join(ROOT, 'public'))) {
    const target = path.join(ROOT, 'public', name);
    const link = path.join(dist, name);
    if (fs.statSync(target).isDirectory()) fs.symlinkSync(target, link, 'junction');
    else fs.copyFileSync(target, link);
  }
  const electronDir = path.join(APP_DIR, 'electron');
  fs.mkdirSync(electronDir, { recursive: true });
  for (const file of ['main.cjs', 'preload.cjs', 'icon.png']) fs.copyFileSync(path.join(ROOT, 'electron', file), path.join(electronDir, file));
  fs.writeFileSync(
    path.join(APP_DIR, 'e2e-main.cjs'),
    [
      '// Gerado por e2e/build-app.mjs.',
      "const { app } = require('electron');",
      'if (process.env.LUMIAR_E2E_USER_DATA) app.setPath(\'userData\', process.env.LUMIAR_E2E_USER_DATA);',
      "require('./electron/main.cjs');",
      '',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(APP_DIR, 'package.json'), JSON.stringify({ name: 'lumiar-e2e', version: '0.0.0', main: 'e2e-main.cjs' }, null, 2));
}

// node e2e/build-app.mjs: só monta (para rodar os testes depois com LUMIAR_E2E_SKIP_BUILD=1).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildApp();
