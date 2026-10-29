import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { ROOT } from './fixtures';

/** Vídeo curto (com uma pessoa) que vem nas prévias: serve de mídia "importada" nos testes. */
export const PESSOA_WEBM = path.join(ROOT, 'public', 'previews', 'pessoa.webm');

/** Clipes da trilha principal, na ordem da tela. */
export const mainClips = (page: Page) => page.locator('[data-item^="clip:"]');

/** Abre o projeto de exemplo pelo convite do editor vazio e espera os 4 clipes. */
export async function openSample(page: Page) {
  await page.getByRole('button', { name: 'Abrir projeto de exemplo' }).click();
  await expect(mainClips(page)).toHaveCount(4, { timeout: 60_000 });
  await expect(page.getByText('Projeto de exemplo aberto.', { exact: false })).toBeVisible();
}

/** Posição do cursor (o controle "Posição" embaixo do preview), em segundos. */
export async function cursorTime(page: Page): Promise<number> {
  return Number(await page.getByRole('slider', { name: 'Posição' }).inputValue());
}

/** Caixa de um elemento na tela (falha se ele não estiver visível). */
export async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, 'elemento sem caixa na tela').not.toBeNull();
  return b!;
}

/** Arrasta com o mouse de verdade, em vários passos (como uma pessoa). */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Importa arquivos pelo botão "Importar mídia" da aba Mídia (o seletor de arquivos é respondido pelo teste). */
export async function importMedia(page: Page, files: string[]) {
  await page.getByRole('navigation').getByRole('button', { name: 'Mídia' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /^Importar mídia/ }).click();
  await (await chooser).setFiles(files);
}

/** Texto selecionado na página (arrastar coisas não deve selecionar nada). */
export const selectedText = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? '');

/** Duração da timeline em segundos (o máximo do controle "Posição"). */
export async function timelineDuration(page: Page): Promise<number> {
  return Number(await page.getByRole('slider', { name: 'Posição' }).getAttribute('max'));
}
