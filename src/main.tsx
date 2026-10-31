import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { getSplash } from './app/splash';
import { loadLanguage, t } from './i18n';
import './styles.css';

const splash = getSplash();
if (typeof __APP_VERSION__ === 'string') splash.versao(`v${__APP_VERSION__}`);

// O dicionário do idioma vem antes de tudo: vários módulos montam nomes (pacotes, efeitos, formatos) ao carregar.
await loadLanguage();
splash.lema(t('Editor de vídeo'));
splash.step(t('Abrindo o editor'), 0.03);

const [{ default: App }, { NoWebGL2Screen }, { hasWebGL2 }, { loadUserEffects }, { prepareEditor }] = await Promise.all([
  import('./App'),
  import('./app/gpu'),
  import('./engine/gl'),
  import('./engine/userPlugins'),
  import('./app/startup'),
]);

// Efeitos criados no editor de efeitos (guardados neste computador).
loadUserEffects();

const root = createRoot(document.getElementById('root')!);
// Sem WebGL2 o editor não desenha nada: em vez de um preview preto, explica o que fazer.
if (!hasWebGL2()) root.render(<NoWebGL2Screen />);
else {
  // Tudo o que o editor usa logo de cara fica pronto antes de ele aparecer (a tela de carregamento mostra o quê).
  await prepareEditor(splash);
  root.render(<App />);
}
// Dois quadros: o editor já está desenhado por baixo quando a tela de carregamento some.
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
await splash.close();
