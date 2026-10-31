// O que a tela de carregamento deixa pronto antes de abrir o editor: o que é usado logo de cara e demoraria na
// primeira vez (janelas, fontes, mídias de exemplo, recorte da pessoa, miniaturas da biblioteca). A IA pesada e de
// uso pontual (legendas, voz, música) fica de fora: ocuparia centenas de MB à toa e sai da memória quando parada.
import { t } from '../i18n';
import { loadFonts } from '../media/fonts';
import { loadSegmenter } from '../media/segment';
import { PACKS } from '../project/packLibrary';
import { getUserPacks } from '../ui/packStore';
import { loadPreviewMedia, warmPreviews } from '../ui/previews';
import { preloadDialogs } from './lazyDialogs';
import type { Splash } from './splash';

/** Testes de ponta a ponta: cada um começa sem nada guardado, e gerar as miniaturas tomaria ~30 s de cada teste. */
const quick = new URLSearchParams(location.search).has('e2e');

/** Espera no máximo `ms`: uma etapa que travar (disco, placa de vídeo) não prende o programa fechado. */
const within = (work: Promise<unknown>, ms: number) =>
  Promise.race([work.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, ms))]);

export async function prepareEditor(splash: Splash): Promise<void> {
  splash.step(t('Abrindo as janelas e as fontes'), 0.08);
  await within(Promise.all([preloadDialogs(), loadFonts()]), 15000);

  splash.step(t('Preparando as mídias de exemplo'), 0.16);
  await within(loadPreviewMedia(), 20000);

  splash.step(t('Preparando o recorte da pessoa'), 0.24);
  await within(loadSegmenter(), 20000);

  if (quick) return splash.step(t('Pronto'), 1);

  // As miniaturas: a parte maior (só na primeira vez; depois voltam do disco).
  const from = 0.3;
  let entered = false;
  const templates = [...PACKS, ...getUserPacks()];
  const warming = warmPreviews(templates, (done, total, stored) => {
    if (entered) return;
    const plugins = done <= total - templates.length;
    splash.step(plugins ? t('Preparando os filtros, efeitos e transições') : t('Preparando os pacotes de edição'), from + (1 - from) * (done / total), t('{n} de {total}', { n: done, total }));
    // Quase nada guardado: é a primeira vez (ou o programa foi atualizado).
    if (done === 40 && stored < 20) splash.dica(t('Na primeira vez demora um pouco: as miniaturas ficam guardadas e as próximas aberturas são rápidas.'));
  });
  // Quem não quiser esperar entra; o resto termina por trás, sem travar a tela.
  const skip = new Promise<void>((resolve) => {
    const timer = setTimeout(() => splash.skip(t('Entrar agora'), () => ((entered = true), resolve())), 5000);
    void warming.finally(() => clearTimeout(timer));
  });
  await Promise.race([within(warming, 180000), skip]);
  if (!entered) splash.step(t('Pronto'), 1);
}
