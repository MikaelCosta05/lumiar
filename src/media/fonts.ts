import '@fontsource/bebas-neue';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/pacifico';
import '@fontsource/permanent-marker';
import '@fontsource/press-start-2p';
import '@fontsource-variable/montserrat';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/monoton';
import '@fontsource/great-vibes';
import { FONTS } from '../project/text';

let loading: Promise<void> | null = null;

/**
 * O navegador só baixa uma fonte quando ela é usada; o canvas não espera.
 * Por isso carregamos todas antes de desenhar textos.
 */
export function loadFonts(): Promise<void> {
  loading ??= Promise.all(
    FONTS.flatMap((f) => f.weights.map((w) => document.fonts.load(`${w} 32px "${f.family}"`, 'Aáãç'))),
  )
    .then(() => undefined)
    .catch(() => undefined);
  return loading;
}
