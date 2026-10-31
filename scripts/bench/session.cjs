// Parte comum da bancada (run.cjs e visual.cjs): um Electron escondido com o Vite servindo o código, e a página
// scripts/bench/page.ts carregada nele. prepare() vem antes do app ficar pronto; open() depois.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function prepare() {
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
  // Uma pasta de dados por execução: várias bancadas ao mesmo tempo não brigam pelo cache.
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'lumiar-bancada-')));
}

async function open() {
  const { createServer } = await import('vite');
  // open: false: o vite.config abre o navegador no npm run dev; aqui seria uma aba nova a cada bancada.
  // Sem hmr nem watch: salvar um arquivo durante a bancada não recarrega a página no meio das imagens.
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    logLevel: 'error',
    server: { port: 0, strictPort: false, open: false, hmr: false, watch: null },
  });
  await server.listen();
  const url = `${server.resolvedUrls.local[0]}scripts/bench/index.html`;
  const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 || /Lumiar|rror/.test(message)) console.log('[página]', message.slice(0, 400));
  });
  let loaded = false;
  return {
    /** Chama uma função exportada por page.ts e devolve o resultado. */
    async call(name, options) {
      // Na primeira vez que a IA aparece, o Vite otimiza as bibliotecas e recarrega a página: tenta de novo.
      for (let attempt = 1; ; attempt++) {
        try {
          if (!loaded) await win.loadURL(url);
          loaded = true;
          return await win.webContents.executeJavaScript(`window.bench.then((m) => m.${name}(${JSON.stringify(options)}))`);
        } catch (error) {
          if (attempt >= 4 || !/WebFrame was removed|ERR_ABORTED|destroyed|disposed/.test(String(error))) throw error;
          console.log(`[bancada] a página recarregou (${attempt}); de novo…`);
          loaded = false;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    },
    async close() {
      await server.close();
    },
  };
}

module.exports = { ROOT, prepare, open };
