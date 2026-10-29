import { expect, test } from './fixtures';
import { openSample } from './helpers';

test('muda um atalho na janela "Atalhos do teclado" e o novo funciona (e fica guardado)', async ({ page }) => {
  await openSample(page);
  const slip = page.getByRole('radio', { name: /^Slip:/ });
  await page.getByRole('button', { name: /^Atalhos do teclado/ }).click();
  const dialog = page.getByRole('heading', { name: 'Atalhos do teclado' }).locator('xpath=ancestor::div[contains(@class,"rounded")][1]');
  await page.getByPlaceholder('Buscar pela ação ou pela tecla…').fill('slip');
  const row = page.getByRole('listitem').filter({ hasText: 'Ferramenta slip' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Y');
  await row.getByRole('button', { name: 'Mudar' }).click();
  await expect(row).toContainText('Aperte a combinação');
  await page.keyboard.press('g');
  await expect(row).toContainText('G');
  await expect(row).toContainText('mudado');
  await expect(row).not.toContainText(/\bY\b/);
  await page.getByRole('button', { name: 'Pronto' }).click();
  await expect(dialog).toBeHidden();

  // A dica do botão mostra o atalho novo; G escolhe o slip e Y não faz mais nada.
  await expect(slip).toHaveAccessibleName(/\(G\)$/);
  await page.locator('[data-ruler]').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('y');
  await expect(slip).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('g');
  await expect(slip).toHaveAttribute('aria-checked', 'true');

  // Fica guardado neste computador: depois de recarregar, continua G.
  await page.reload();
  await expect(page.getByRole('radio', { name: /^Slip:.*\(G\)$/ })).toBeVisible({ timeout: 30_000 });
});

test('atalho já usado avisa do conflito', async ({ page }) => {
  await page.getByRole('button', { name: /^Atalhos do teclado/ }).click();
  await page.getByPlaceholder('Buscar pela ação ou pela tecla…').fill('slip');
  const row = page.getByRole('listitem').filter({ hasText: 'Ferramenta slip' });
  await row.getByRole('button', { name: 'Mudar' }).click();
  await page.keyboard.press('s'); // S já é "Dividir"
  await expect(page.getByText(/^S já é usado em/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row).toContainText('Y');
});
