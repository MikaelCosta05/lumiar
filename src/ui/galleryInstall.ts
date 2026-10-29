import { downloadItem, itemFileName, rememberInstalled, type GalleryItem } from '../project/gallery';
import { t } from '../i18n';
import { describeEffectImport, importUserEffects } from './effectFile';
import { importUserPacks } from './packStore';

/**
 * Instala um item da galeria: baixa, confere o tamanho e o SHA-256 e passa pela mesma importação do botão
 * de importar (mesma conferência, mesmos nomes "Nome (2)" nas colisões, mesmos avisos).
 */
export async function installGalleryItem(item: GalleryItem, indexUrl: string): Promise<{ text: string; error: boolean }> {
  const bytes = await downloadItem(item, indexUrl);
  const file = new File([bytes], itemFileName(item), { type: 'application/json' });
  if (item.kind === 'effect') {
    const result = await importUserEffects(file);
    // Só conta como instalado se algum efeito entrou (ou já estava aqui igualzinho).
    if (result.added.length || result.same) rememberInstalled(item, result.added.map((e) => e.id));
    return describeEffectImport(result);
  }
  const count = await importUserPacks(file);
  if (count) rememberInstalled(item, packIds(await file.text()));
  return {
    text: count ? t('{n} pacote(s) importado(s) para "Meus pacotes".', { n: count }) : t('O arquivo não tinha pacotes.'),
    error: count === 0,
  };
}

/** Ids dos pacotes do arquivo (a importação mantém o id; o de mesmo id é trocado). */
function packIds(text: string): string[] {
  try {
    const packs = (JSON.parse(text) as { packs?: unknown }).packs;
    return Array.isArray(packs) ? packs.map((p) => (p as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
