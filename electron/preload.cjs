// Ponte mínima entre a página e o programa: só o que a página não consegue sozinha.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('lumiarDesktop', {
  /** Começa a anotar onde o mouse está (e os cliques) na tela que está sendo gravada. */
  startCursor: () => ipcRenderer.invoke('cursor:start'),
  /** Para e devolve { points: [t, x, y, …], clicks: [t, …] } com x/y de 0 a 1 na tela gravada. */
  stopCursor: () => ipcRenderer.invoke('cursor:stop'),
  /** Versão nova no GitHub: { version, notes, page, automatic } */
  onUpdate: (listener) => ipcRenderer.on('update:available', (_event, info) => listener(info)),
  onUpdateProgress: (listener) => ipcRenderer.on('update:progress', (_event, fraction) => listener(fraction)),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  /** Baixa e instala a versão nova (o programa fecha e abre de novo). */
  installUpdate: () => ipcRenderer.invoke('update:install'),
  /** Caminho do arquivo no disco ('' para arquivos que só existem na memória, como gravações e recortes). */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  /** Libera esses arquivos para serem lidos de volta em lumiar://app/__disco/ (recuperar o projeto). */
  rememberFiles: (paths) => ipcRenderer.invoke('media:remember', paths),
  /** Idioma da interface ('pt', 'en' ou 'es'): o programa usa nos diálogos e no menu do macOS. */
  setLanguage: (lang) => ipcRenderer.send('i18n:language', lang),
});
