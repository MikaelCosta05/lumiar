import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { loadLanguage } from './i18n';
import './styles.css';

// O dicionário do idioma vem antes de tudo: vários módulos montam nomes (pacotes, efeitos, formatos) ao carregar.
await loadLanguage();

const [{ default: App }, { NoWebGL2Screen }, { hasWebGL2 }, { loadUserEffects }] = await Promise.all([
  import('./App'),
  import('./app/gpu'),
  import('./engine/gl'),
  import('./engine/userPlugins'),
]);

// Efeitos criados no editor de efeitos (guardados neste computador).
loadUserEffects();

// Sem WebGL2 o editor não desenha nada: em vez de um preview preto, explica o que fazer.
createRoot(document.getElementById('root')!).render(hasWebGL2() ? <App /> : <NoWebGL2Screen />);
