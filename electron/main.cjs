// Lumiar como aplicativo de computador (Windows, Linux e macOS).
// O app compilado (pasta dist) é servido pelo endereço lumiar://app/, que se comporta como um site seguro:
// assim workers, WebAssembly, microfone, salvar arquivos e o banco local funcionam igual ao navegador.
const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, net, protocol, screen, session, shell } = require('electron');
const { execFile, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
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

// ---------------------------------------------------------------- Idioma
// O programa não tem acesso aos dicionários da página: os poucos textos dele (aviso ao fechar, menu do macOS,
// erros da atualização) ficam aqui. A página avisa qual idioma está usando; até lá vale o do sistema.

const TEXTS = {
  en: {
    'Sair sem salvar': 'Quit without saving',
    'Continuar editando': 'Keep editing',
    'Há mudanças que não foram salvas em arquivo.': "There are changes that haven't been saved to a file.",
    'O salvamento automático guarda o projeto: ao abrir o Lumiar de novo, ele oferece para recuperar.':
      'Autosave keeps the project: when you open Lumiar again, it offers to recover it.',
    Roteiro: 'Script',
    'Sobre o Lumiar': 'About Lumiar',
    Serviços: 'Services',
    'Ocultar o Lumiar': 'Hide Lumiar',
    'Ocultar os outros': 'Hide Others',
    'Mostrar tudo': 'Show All',
    'Sair do Lumiar': 'Quit Lumiar',
    Editar: 'Edit',
    Desfazer: 'Undo',
    Refazer: 'Redo',
    Recortar: 'Cut',
    Copiar: 'Copy',
    Colar: 'Paste',
    'Selecionar tudo': 'Select All',
    Janela: 'Window',
    Minimizar: 'Minimize',
    Zoom: 'Zoom',
    'Tela cheia': 'Full Screen',
    'Trazer tudo para a frente': 'Bring All to Front',
    'não deu para conferir o arquivo da versão nova. Baixe pela página do GitHub.':
      "couldn't verify the new version's file. Download it from the GitHub page.",
    'Download falhou ({status})': 'Download failed ({status})',
    'o download veio incompleto. Tente de novo.': 'the download was incomplete. Try again.',
    'o arquivo baixado não confere com o publicado. Tente de novo.': "the downloaded file doesn't match the published one. Try again.",
  },
  es: {
    'Sair sem salvar': 'Salir sin guardar',
    'Continuar editando': 'Seguir editando',
    'Há mudanças que não foram salvas em arquivo.': 'Hay cambios que no se guardaron en un archivo.',
    'O salvamento automático guarda o projeto: ao abrir o Lumiar de novo, ele oferece para recuperar.':
      'El guardado automático conserva el proyecto: al abrir Lumiar de nuevo, te ofrece recuperarlo.',
    Roteiro: 'Guion',
    'Sobre o Lumiar': 'Acerca de Lumiar',
    Serviços: 'Servicios',
    'Ocultar o Lumiar': 'Ocultar Lumiar',
    'Ocultar os outros': 'Ocultar otros',
    'Mostrar tudo': 'Mostrar todo',
    'Sair do Lumiar': 'Salir de Lumiar',
    Editar: 'Editar',
    Desfazer: 'Deshacer',
    Refazer: 'Rehacer',
    Recortar: 'Cortar',
    Copiar: 'Copiar',
    Colar: 'Pegar',
    'Selecionar tudo': 'Seleccionar todo',
    Janela: 'Ventana',
    Minimizar: 'Minimizar',
    Zoom: 'Zoom',
    'Tela cheia': 'Pantalla completa',
    'Trazer tudo para a frente': 'Traer todo al frente',
    'não deu para conferir o arquivo da versão nova. Baixe pela página do GitHub.':
      'no se pudo verificar el archivo de la nueva versión. Descárgala desde la página de GitHub.',
    'Download falhou ({status})': 'La descarga falló ({status})',
    'o download veio incompleto. Tente de novo.': 'la descarga llegó incompleta. Inténtalo de nuevo.',
    'o arquivo baixado não confere com o publicado. Tente de novo.': 'el archivo descargado no coincide con el publicado. Inténtalo de nuevo.',
  },
};

let language = null;

/** Idioma do sistema (só depois de o app ficar pronto: antes disso app.getLocale() vem vazio). */
function systemLanguage() {
  const locale = app.getLocale().toLowerCase();
  if (locale.startsWith('pt')) return 'pt';
  if (locale.startsWith('es')) return 'es';
  return 'en';
}

/** Traduz um texto do programa; `vars` preenche os {nomes}, como o t() da página. */
function t(text, vars) {
  language ??= systemLanguage();
  const translated = TEXTS[language]?.[text] ?? text;
  if (!vars) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

ipcMain.on('i18n:language', (_event, lang) => {
  if (lang !== 'pt' && lang !== 'en' && lang !== 'es') return;
  if (lang === language) return;
  language = lang;
  // O menu do macOS é montado ao abrir: com o idioma novo ele é montado de novo.
  if (process.platform === 'darwin' && app.isReady()) Menu.setApplicationMenu(applicationMenu());
});

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
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  // Links externos abrem no navegador do sistema.
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // O roteiro da gravação de tela abre numa janelinha que fica por cima de tudo.
    if (frameName === 'lumiar-roteiro') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 620, height: 300, alwaysOnTop: true, autoHideMenuBar: true, title: t('Roteiro'), backgroundColor: '#000000' },
      };
    }
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  // Projeto com mudanças não salvas: o editor pede confirmação antes de fechar. No navegador aparece o aviso
  // padrão; no Electron nada aparece e a janela simplesmente não fecha. Aqui a pergunta é feita de verdade.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: [t('Sair sem salvar'), t('Continuar editando')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: 'Lumiar',
      message: t('Há mudanças que não foram salvas em arquivo.'),
      detail: t('O salvamento automático guarda o projeto: ao abrir o Lumiar de novo, ele oferece para recuperar.'),
    });
    // preventDefault aqui ignora o pedido de confirmação da página e deixa fechar.
    if (choice === 0) event.preventDefault();
  });
  // F12 (ou Cmd+Option+I no Mac) abre as ferramentas de desenvolvedor; Ctrl+Shift+R (Cmd+Shift+R no Mac) recarrega.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (input.key === 'F12' || (input.meta && input.alt && input.code === 'KeyI')) win.webContents.toggleDevTools();
    else if (ctrl && input.key.toLowerCase() === 'r' && input.shift) win.webContents.reload();
  });
  // Nos testes de ponta a ponta cada teste começa sem nada guardado: "?e2e" pula as miniaturas na tela de carregamento.
  void win.loadURL(`${SCHEME}://app/index.html${process.env.LUMIAR_E2E_USER_DATA ? '?e2e' : ''}`);
  return win;
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith(DISK_PREFIX)) return serveDiskFile(decodeURIComponent(pathname.slice(DISK_PREFIX.length)));
    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.normalize(path.join(ROOT, relative));
    // Com o separador no fim: "dist-outra-coisa" não passa por "dist".
    if (!file.startsWith(ROOT + path.sep)) return new Response('Proibido', { status: 403 });
    const response = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(response.headers);
    const type = TYPES[path.extname(file).toLowerCase()];
    if (type) headers.set('Content-Type', type);
    return new Response(response.body, { status: response.status, headers });
  });

  // Microfone, área de transferência e tela cheia são liberados; o resto é negado.
  const allowed = new Set(['media', 'display-capture', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'fileSystem', 'speaker-selection']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // Gravar a tela: entrega a tela principal (e, no Windows, o som do computador).
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          if (!sources.length) return callback({});
          const audio = request.audioRequested && process.platform === 'win32' ? 'loopback' : undefined;
          capturedDisplay = sources[0].display_id;
          callback(audio ? { video: sources[0], audio } : { video: sources[0] });
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: true },
  );

  Menu.setApplicationMenu(applicationMenu());
  openMainWindow();
  app.on('second-instance', () => {
    if (!mainWindow) return openMainWindow();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  // macOS: fechar a janela não fecha o programa; clicar no ícone do Dock abre a janela de novo.
  app.on('activate', () => {
    if (!mainWindow) openMainWindow();
  });
});

let mainWindow = null;

function openMainWindow() {
  const win = createWindow();
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  // Procura atualização uns segundos depois de abrir (sem atrasar a abertura).
  win.webContents.once('did-finish-load', () => setTimeout(() => void checkForUpdate(win), 4000));
}

// No Windows e no Linux o Lumiar não tem menu. No macOS o menu do app é obrigatório: sem ele, Cmd+C/V/X/A/Z
// param de funcionar nos campos de texto. Os atalhos chegam primeiro na página; o menu só age se ela não usar.
function applicationMenu() {
  if (process.platform !== 'darwin') return null;
  return Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about', label: t('Sobre o Lumiar') },
        { type: 'separator' },
        { role: 'services', label: t('Serviços') },
        { type: 'separator' },
        { role: 'hide', label: t('Ocultar o Lumiar') },
        { role: 'hideOthers', label: t('Ocultar os outros') },
        { role: 'unhide', label: t('Mostrar tudo') },
        { type: 'separator' },
        { role: 'quit', label: t('Sair do Lumiar') },
      ],
    },
    {
      label: t('Editar'),
      submenu: [
        { role: 'undo', label: t('Desfazer') },
        { role: 'redo', label: t('Refazer') },
        { type: 'separator' },
        { role: 'cut', label: t('Recortar') },
        { role: 'copy', label: t('Copiar') },
        { role: 'paste', label: t('Colar') },
        { role: 'selectAll', label: t('Selecionar tudo') },
      ],
    },
    {
      role: 'window',
      label: t('Janela'),
      submenu: [
        { role: 'minimize', label: t('Minimizar') },
        { role: 'zoom', label: t('Zoom') },
        { role: 'togglefullscreen', label: t('Tela cheia') },
        { type: 'separator' },
        { role: 'front', label: t('Trazer tudo para a frente') },
      ],
    },
  ]);
}

// ---------------------------------------------------------------- Mídias no disco
// O salvamento automático do programa guarda só o caminho dos vídeos importados, e não uma cópia deles.
// Ao recuperar, a página lê o arquivo por lumiar://app/__disco/<caminho>, mas só os que ela mesma registrou.

const DISK_PREFIX = '/__disco/';
const KNOWN_FILES = 'arquivos-importados.json';
const MAX_KNOWN_FILES = 5000;
let knownFiles = null;

function known() {
  if (!knownFiles) {
    try {
      knownFiles = new Set(JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), KNOWN_FILES), 'utf8')));
    } catch {
      knownFiles = new Set();
    }
  }
  return knownFiles;
}

async function serveDiskFile(file) {
  if (!known().has(file)) return new Response('Proibido', { status: 403 });
  try {
    return await net.fetch(pathToFileURL(file).toString());
  } catch {
    return new Response('Não encontrado', { status: 404 });
  }
}

ipcMain.handle('media:remember', (_event, paths) => {
  const set = known();
  const added = (Array.isArray(paths) ? paths : []).filter((p) => typeof p === 'string' && path.isAbsolute(p) && !set.has(p));
  if (!added.length) return;
  knownFiles = new Set([...set, ...added].slice(-MAX_KNOWN_FILES));
  fs.writeFileSync(path.join(app.getPath('userData'), KNOWN_FILES), JSON.stringify([...knownFiles]));
});

// ---------------------------------------------------------------- Mouse durante a gravação da tela
// A página não sabe onde o mouse está fora da janela dela; aqui o programa anota a posição ~30 vezes
// por segundo e, no Windows, os cliques (com um pequeno ajudante do PowerShell, sem instalar nada).

let capturedDisplay = '';
let cursorJob = null;

function recordedDisplay() {
  const displays = screen.getAllDisplays();
  return displays.find((d) => String(d.id) === String(capturedDisplay)) ?? screen.getPrimaryDisplay();
}

const CLICK_WATCHER = `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class LumiarMouse { [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key); }'
$down = $false
while ($true) {
  $now = ([LumiarMouse]::GetAsyncKeyState(1) -band 0x8000) -ne 0
  if ($now -and -not $down) { [Console]::Out.WriteLine('c'); [Console]::Out.Flush() }
  $down = $now
  Start-Sleep -Milliseconds 12
}
`;

function stopCursor() {
  if (!cursorJob) return null;
  clearInterval(cursorJob.timer);
  cursorJob.clicker?.kill();
  const result = { points: cursorJob.points, clicks: cursorJob.clicks };
  cursorJob = null;
  return result;
}

ipcMain.handle('cursor:start', () => {
  stopCursor();
  const display = recordedDisplay();
  const started = Date.now();
  const job = { points: [], clicks: [], timer: null, clicker: null };
  const position = () => {
    const p = screen.getCursorScreenPoint();
    const b = display.bounds;
    return [(p.x - b.x) / b.width, (p.y - b.y) / b.height];
  };
  job.timer = setInterval(() => {
    const [x, y] = position();
    job.points.push(Math.round(Date.now() - started) / 1000, Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000);
  }, 33);
  if (process.platform === 'win32') {
    try {
      job.clicker = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', CLICK_WATCHER], { windowsHide: true });
      job.clicker.stdout.on('data', (chunk) => {
        for (const line of String(chunk).split(/\r?\n/)) if (line.trim() === 'c') job.clicks.push(Math.round(Date.now() - started) / 1000);
      });
      job.clicker.on('error', () => (job.clicker = null));
    } catch {
      job.clicker = null;
    }
  }
  cursorJob = job;
  return true;
});

ipcMain.handle('cursor:stop', () => stopCursor());

// ---------------------------------------------------------------- Som de um programa separado (Windows)
// O lumiar-audio.exe (electron/app-audio) grava o som de um programa, como o Discord, num WAV só dele, ou o som de
// tudo menos esse programa. Assim a voz da chamada, o jogo e o microfone viram trilhas separadas na timeline.

let appAudioExe;
function findAppAudio() {
  if (appAudioExe !== undefined) return appAudioExe;
  appAudioExe = null;
  if (process.platform !== 'win32') return null;
  const candidates = [path.join(process.resourcesPath, 'bin', 'lumiar-audio.exe'), path.join(__dirname, 'bin', 'lumiar-audio.exe')];
  appAudioExe = candidates.find((file) => fs.existsSync(file)) ?? null;
  if (!appAudioExe && !app.isPackaged) {
    // Rodando do código: compila na hora (o csc.exe vem com o Windows).
    try {
      appAudioExe = require(path.join(__dirname, '..', 'scripts', 'build-app-audio.cjs')).buildAppAudio({ quiet: true });
    } catch {
      appAudioExe = null;
    }
  }
  return appAudioExe;
}

const appAudioJobs = new Map();
let appAudioNext = 1;

/** Programas abertos que dá para gravar separado: [{ pid, name, title }], ou null quando não dá (fora do Windows). */
ipcMain.handle('appAudio:list', async () => {
  const exe = findAppAudio();
  if (!exe) return null;
  const out = await new Promise((resolve) =>
    execFile(exe, ['list'], { windowsHide: true, timeout: 15000, encoding: 'utf8' }, (error, stdout) => resolve(error ? '[]' : stdout)),
  );
  let apps = [];
  try {
    apps = JSON.parse(out);
  } catch {
    apps = [];
  }
  // O próprio Lumiar não entra na lista, e cada programa aparece uma vez (o que tem janela com título ganha).
  const byName = new Map();
  for (const a of apps) if (a.pid !== process.pid && (!byName.has(a.name) || (!byName.get(a.name).title && a.title))) byName.set(a.name, a);
  return [...byName.values()];
});

/** Começa a gravar: mode 'include' = só esse programa; 'exclude' = tudo menos ele. Devolve { id, startedAt }. */
ipcMain.handle('appAudio:start', async (_event, pid, mode) => {
  const exe = findAppAudio();
  if (!exe) throw new Error('unsupported');
  const id = appAudioNext++;
  const file = path.join(os.tmpdir(), `lumiar-som-${process.pid}-${id}.wav`);
  const child = spawn(exe, ['capture', String(Number(pid)), mode === 'exclude' ? 'exclude' : 'include', file], { windowsHide: true });
  let errors = '';
  child.stderr.on('data', (chunk) => (errors += chunk));
  const startedAt = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('timeout'));
    }, 15000);
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const match = /started (\d+)/.exec(out);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', () => {
      clearTimeout(timer);
      reject(new Error(errors.trim() || 'exit'));
    });
  });
  appAudioJobs.set(id, { child, file });
  return { id, startedAt };
});

/** Para e devolve o WAV (bytes), ou null se a gravação se perdeu. */
ipcMain.handle('appAudio:stop', async (_event, id) => {
  const job = appAudioJobs.get(id);
  if (!job) return null;
  appAudioJobs.delete(id);
  const exited = job.child.exitCode !== null ? Promise.resolve() : once(job.child, 'exit');
  job.child.stdin.end('stop\n');
  const timer = setTimeout(() => job.child.kill(), 10000);
  await exited;
  clearTimeout(timer);
  try {
    return fs.readFileSync(job.file);
  } catch {
    return null;
  } finally {
    fs.rm(job.file, { force: true }, () => {});
  }
});

/** Fecha os gravadores que ficaram abertos (o programa fechou no meio de uma gravação). */
function stopAppAudio() {
  for (const job of appAudioJobs.values()) {
    job.child.kill();
    fs.rm(job.file, { force: true }, () => {});
  }
  appAudioJobs.clear();
}

// ---------------------------------------------------------------- Atualização automática
// Ao abrir, olha a última versão publicada no GitHub. Se for mais nova, a página mostra um aviso;
// "Atualizar" baixa o instalador certo e instala (Windows), troca o AppImage (Linux) ou abre a página
// (.deb e macOS).

const REPO = 'MikaelCosta05/lumiar';
let latest = null;

const newer = (a, b) => {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

function pickAsset(release) {
  const assets = release.assets || [];
  if (process.platform === 'win32') return assets.find((a) => /Windows-Setup\.exe$/i.test(a.name));
  if (process.platform === 'linux' && process.env.APPIMAGE) return assets.find((a) => /\.AppImage$/i.test(a.name));
  // macOS: o app não tem assinatura da Apple, então trocar o programa sozinho não é seguro (e o Gatekeeper
  // bloquearia a versão nova). Sem arquivo aqui, "automatic" fica falso e "Baixar" só abre a página.
  return null;
}

/** O latest.yml que o electron-builder gera junto com o instalador (tem o SHA-512 de cada arquivo). */
function manifestAsset(release) {
  const name = process.platform === 'win32' ? 'latest.yml' : 'latest-linux.yml';
  return (release.assets || []).find((a) => a.name === name) || null;
}

/** Só instala sozinho o que dá para conferir: o SHA-256 que o GitHub calcula ou o SHA-512 do latest.yml. */
const canVerify = (release, asset) => /^sha256:[0-9a-f]{64}$/i.test(asset.digest || '') || !!manifestAsset(release);

async function expectedHash(release, asset) {
  if (/^sha256:[0-9a-f]{64}$/i.test(asset.digest || '')) return { algorithm: 'sha256', encoding: 'hex', value: asset.digest.slice(7).toLowerCase() };
  const manifest = manifestAsset(release);
  if (!manifest) return null;
  const response = await net.fetch(manifest.browser_download_url, { headers: { 'User-Agent': 'Lumiar' } });
  if (!response.ok) return null;
  const text = await response.text();
  for (const match of text.matchAll(/-\s+url:\s*(\S+)\s+sha512:\s*(\S+)/g)) {
    if (match[1] === asset.name) return { algorithm: 'sha512', encoding: 'base64', value: match[2] };
  }
  return null;
}

async function checkForUpdate(win) {
  if (!app.isPackaged) return null;
  try {
    const response = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'Lumiar', Accept: 'application/vnd.github+json' } });
    if (!response.ok) return null;
    const release = await response.json();
    if (!release.tag_name || !newer(release.tag_name, app.getVersion())) return null;
    latest = release;
    const asset = pickAsset(release);
    const info = { version: release.tag_name.replace(/^v/, ''), notes: release.body || '', page: release.html_url, automatic: !!asset && canVerify(release, asset) };
    win.webContents.send('update:available', info);
    return info;
  } catch {
    return null;
  }
}

ipcMain.handle('update:check', (event) => checkForUpdate(BrowserWindow.fromWebContents(event.sender)));

ipcMain.handle('update:install', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!latest) return false;
  const asset = pickAsset(latest);
  if (!asset || !canVerify(latest, asset)) {
    await shell.openExternal(latest.html_url);
    return false;
  }
  const expected = await expectedHash(latest, asset);
  if (!expected) throw new Error(t('não deu para conferir o arquivo da versão nova. Baixe pela página do GitHub.'));
  const response = await net.fetch(asset.browser_download_url, { headers: { 'User-Agent': 'Lumiar' } });
  if (!response.ok || !response.body) throw new Error(t('Download falhou ({status})', { status: response.status }));
  const total = Number(response.headers.get('content-length')) || asset.size || 0;
  const target = path.join(app.getPath('temp'), asset.name);
  const file = fs.createWriteStream(target);
  const hash = crypto.createHash(expected.algorithm);
  try {
    let received = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      const chunk = Buffer.from(value);
      hash.update(chunk);
      if (!file.write(chunk)) await once(file, 'drain');
      if (total) win?.webContents.send('update:progress', received / total);
    }
    await new Promise((resolve, reject) => file.end((error) => (error ? reject(error) : resolve())));
    if (asset.size && received !== asset.size) throw new Error(t('o download veio incompleto. Tente de novo.'));
    if (hash.digest(expected.encoding) !== expected.value) throw new Error(t('o arquivo baixado não confere com o publicado. Tente de novo.'));
  } catch (error) {
    file.destroy();
    fs.rmSync(target, { force: true });
    throw error;
  }
  if (process.platform === 'win32') {
    // Instalação silenciosa por cima da atual; o instalador abre o Lumiar de novo no fim.
    spawn(target, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 500);
    return true;
  }
  // AppImage: troca o arquivo e reabre.
  const appImage = process.env.APPIMAGE;
  fs.chmodSync(target, 0o755);
  fs.copyFileSync(target, appImage + '.novo');
  fs.renameSync(appImage + '.novo', appImage);
  app.relaunch({ execPath: appImage });
  app.quit();
  return true;
});

// No macOS o programa continua aberto no Dock (o costume de lá); Cmd+Q sai de verdade.
app.on('will-quit', stopAppAudio);

app.on('window-all-closed', () => {
  stopCursor();
  if (process.platform !== 'darwin') app.quit();
});
