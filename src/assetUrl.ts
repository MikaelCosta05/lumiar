/**
 * Endereço completo de um arquivo da pasta public/ (modelos, mídias de exemplo...).
 * Funciona no navegador e no app compilado (onde a página pode ser um arquivo local).
 */
export function assetUrl(path: string): string {
  return new URL(import.meta.env.BASE_URL + path.replace(/^\//, ''), document.baseURI).href;
}
