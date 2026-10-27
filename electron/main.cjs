// Lumiar como aplicativo de computador (Windows e Linux).
// O app compilado (pasta dist) é servido pelo endereço lumiar://app/, que se comporta como um site seguro:
// assim workers, WebAssembly, microfone, salvar arquivos e o banco local funcionam igual ao navegador.
const { app, BrowserWindow, Menu, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'lumiar';
const ROOT = path.join(__dirname, '..', 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.onnx': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, codeCache: true },
  },
]);

// O editor precisa de WebGL2: alguns drivers (máquinas virtuais, placas antigas no Linux) estão na
// lista de bloqueio do Chromium, que desligaria a GPU. Aqui ela é usada mesmo assim.
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// Uma janela só: abrir de novo traz a que já está aberta.
if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#0c0d11',
    title: 'Lumiar',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  // Links externos abrem no navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // F12 abre as ferramentas de desenvolvedor; Ctrl+R recarrega.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') win.webContents.toggleDevTools();
    else if (input.control && input.key.toLowerCase() === 'r' && input.shift) win.webContents.reload();
  });
  void win.loadURL(`${SCHEME}://app/index.html`);
  return win;
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.normalize(path.join(ROOT, relative));
    if (!file.startsWith(ROOT)) return new Response('Proibido', { status: 403 });
    const response = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(response.headers);
    const type = TYPES[path.extname(file).toLowerCase()];
    if (type) headers.set('Content-Type', type);
    return new Response(response.body, { status: response.status, headers });
  });

  // Microfone, área de transferência e tela cheia são liberados; o resto é negado.
  const allowed = new Set(['media', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'fileSystem', 'speaker-selection']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  Menu.setApplicationMenu(null);
  const win = createWindow();
  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
});

app.on('window-all-closed', () => app.quit());
