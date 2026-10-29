import { expect, test } from './fixtures';
import { openSample } from './helpers';

test('troca o idioma para inglês e os textos aparecem traduzidos', async ({ page }) => {
  await openSample(page);
  await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'English' }) }).selectOption('en');
  // Trocar recarrega a interface.
  await expect(page.getByRole('heading', { name: 'Project media' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tools', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Filters' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
  const body = await page.locator('body').innerText();
  for (const pt of ['Mídia do projeto', 'Exportar', 'Ferramentas', 'Arraste vídeos']) expect(body, `"${pt}" sem tradução`).not.toContain(pt);
  await page.getByRole('button', { name: /^Keyboard shortcuts/ }).click();
  await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  // O salvamento automático oferece o projeto de volta (em inglês) ou o editor já volta com ele.
  const recover = page.getByRole('button', { name: /^Recover/ });
  if (await recover.isVisible().catch(() => false)) await recover.click();
  // Volta para o português.
  await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Português' }) }).selectOption('pt');
  await expect(page.getByRole('heading', { name: 'Mídia do projeto' })).toBeVisible({ timeout: 30_000 });
});
