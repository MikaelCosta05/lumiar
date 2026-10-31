// Teste da exportação com fundo transparente (WebM VP9 com alfa e sequência PNG), no Electron escondido, com o
// Vite servindo o código (como a bancada):
//
//   npx electron scripts/transparente/run.cjs [--out pasta]
//
// Exporta um projeto pequeno, lê os arquivos de volta e confere os pixels. Sai com código 1 se algo falhar e
// salva os arquivos gerados em --out (para abrir em outro editor).
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : null;

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'lumiar-transparente-')));
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
    if (level >= 2 || /Lumiar|rror/.test(message)) console.log('[página]', message.slice(0, 400));
  });
  let code = 0;
  try {
    let result;
    for (let attempt = 1; ; attempt++) {
      try {
        await win.loadURL(`${server.resolvedUrls.local[0]}scripts/transparente/index.html`);
        result = await win.webContents.executeJavaScript('window.teste.then((m) => m.run())');
        break;
      } catch (error) {
        // Na primeira vez o Vite otimiza as bibliotecas e recarrega a página: tenta de novo.
        if (attempt >= 4 || !/WebFrame was removed|ERR_ABORTED|destroyed|disposed/.test(String(error))) throw error;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    for (const c of result.checks) console.log(`${c.ok ? 'ok   ' : 'FALHA'} ${c.name} · ${c.detail}`);
    console.log('tamanhos:', JSON.stringify(result.sizes));
    if (out) {
      fs.mkdirSync(out, { recursive: true });
      for (const [name, data] of Object.entries(result.files)) fs.writeFileSync(path.join(out, name), Buffer.from(data, 'base64'));
      console.log(`arquivos em ${out}`);
    }
    if (result.checks.some((c) => !c.ok)) code = 1;
  } catch (error) {
    console.error(error);
    code = 2;
  }
  await server.close();
  app.exit(code);
});
