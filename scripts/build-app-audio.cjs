// Compila o gravador de som por programa (electron/app-audio/LumiarAudio.cs) em electron/bin/lumiar-audio.exe.
// Usa o csc.exe que vem com o .NET Framework 4 em todo Windows: não precisa instalar nada. Fora do Windows não faz nada.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'electron', 'app-audio', 'LumiarAudio.cs');
const OUTPUT = path.join(ROOT, 'electron', 'bin', 'lumiar-audio.exe');

/** Compila se o .exe não existe ou é mais velho que o código. Devolve o caminho, ou null fora do Windows. */
function buildAppAudio({ quiet = false } = {}) {
  if (process.platform !== 'win32') return null;
  if (fs.existsSync(OUTPUT) && fs.statSync(OUTPUT).mtimeMs >= fs.statSync(SOURCE).mtimeMs) return OUTPUT;
  const windir = process.env.WINDIR || 'C:\\Windows';
  const csc = path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  if (!fs.existsSync(csc)) throw new Error(`csc.exe não encontrado em ${csc}`);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  execFileSync(csc, ['/nologo', '/optimize+', '/platform:x64', '/target:exe', '/r:System.Management.dll', `/out:${OUTPUT}`, SOURCE], {
    stdio: quiet ? 'pipe' : 'inherit',
    windowsHide: true,
  });
  return OUTPUT;
}

module.exports = { buildAppAudio, OUTPUT };

if (require.main === module) {
  const out = buildAppAudio();
  console.log(out ? `ok: ${path.relative(ROOT, out)}` : 'só no Windows: nada a fazer');
}
