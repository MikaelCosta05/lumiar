// Memória dos modelos de IA antes, durante e depois de liberados (só para quem desenvolve):
//
//   npx electron scripts/memoria-ia/run.cjs [--steps parado,voz,liberar,...]
//
// Roda a página no Electron escondido (com o Vite, como a bancada) e, depois de cada passo, lê a memória
// particular (private bytes) e o working set do processo da página, onde também rodam os workers.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const i = args.indexOf('--steps');
const steps = (i >= 0 ? args[i + 1] : 'parado,voz,liberar,olhar,liberar,rostos,liberar,musica,liberar,recorte,liberar').split(',');

// gc() na página: a medida depois de liberar não fica esperando o coletor de lixo.
app.commandLine.appendSwitch('js-flags', '--expose-gc');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'lumiar-memoria-')));
app.whenReady().then(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    logLevel: 'error',
    server: { port: 0, strictPort: false, open: false, hmr: false, watch: null },
  });
  await server.listen();
  const win = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 && !/Security Warning/.test(message)) console.log('[página]', message.slice(0, 300));
  });
  const memory = () => {
    const pid = win.webContents.getOSProcessId();
    const m = app.getAppMetrics().find((p) => p.pid === pid)?.memory;
    const gpu = app.getAppMetrics().find((p) => p.type === 'GPU')?.memory;
    return { privado: Math.round((m?.privateBytes ?? 0) / 1024), ws: Math.round((m?.workingSetSize ?? 0) / 1024), gpu: Math.round((gpu?.privateBytes ?? 0) / 1024) };
  };
  let code = 0;
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await win.loadURL(`${server.resolvedUrls.local[0]}scripts/memoria-ia/index.html`);
        await win.webContents.executeJavaScript('window.teste.then(() => true)');
        break;
      } catch (error) {
        if (attempt >= 4 || !/WebFrame was removed|ERR_ABORTED|destroyed|disposed/.test(String(error))) throw error;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    console.log('passo'.padEnd(10), 'privada MB'.padStart(11), 'working set MB'.padStart(15), 'GPU MB'.padStart(8), '  o que fez');
    for (const name of steps) {
      const done = await win.webContents.executeJavaScript(`window.teste.then((m) => m.step(${JSON.stringify(name)}))`);
      const m = memory();
      console.log(name.padEnd(10), String(m.privado).padStart(11), String(m.ws).padStart(15), String(m.gpu).padStart(8), ' ', done);
    }
  } catch (error) {
    console.error(error);
    code = 2;
  }
  await server.close();
  app.exit(code);
});
