import { expect, test } from './fixtures';
import { importMedia, mainClips, PESSOA_WEBM } from './helpers';

// Estabilizar e pré-renderizar num clipe curto (o vídeo da pessoa das prévias): os dois começam, mostram o
// andamento e terminam com o aviso de pronto, sem erro.

test.beforeEach(async ({ page }) => {
  await importMedia(page, [PESSOA_WEBM]);
  await expect(mainClips(page)).toHaveCount(1, { timeout: 30_000 });
});

test('estabilizar vídeo pelo menu do clipe', async ({ page }) => {
  await mainClips(page).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Estabilizar vídeo (tirar o tremido)' }).hover();
  await page.getByRole('menuitem', { name: 'Suave' }).click();
  // Analisa os quadros (aviso de andamento) e termina com o zoom usado.
  await expect(page.getByText(/^Vídeo estabilizado/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/^Medindo o tremido da câmera/)).toHaveCount(0);
  // O menu passa a mostrar a força marcada e a opção de tirar.
  await mainClips(page).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Estabilizar vídeo (tirar o tremido)' }).hover();
  await page.getByRole('menuitem', { name: 'Remover estabilização' }).click();
  await expect(page.getByText('Estabilização removida.')).toBeVisible();
});

test('pré-renderizar o trecho de um clipe', async ({ page }) => {
  await mainClips(page).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Pré-renderizar este trecho/ }).click();
  await expect(page.getByText(/^Pré-renderização pronta: .* agora toca sem engasgos/)).toBeVisible({ timeout: 90_000 });
  // Com algo pré-renderizado, o menu oferece apagar.
  await mainClips(page).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Apagar pré-renderizações/ }).click();
  await expect(page.getByText('Pré-renderizações apagadas: o preview volta a renderizar ao vivo.')).toBeVisible();
});
