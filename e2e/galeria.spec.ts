import { expect, test } from './fixtures';

test('galeria da comunidade sem internet mostra o aviso e não trava', async ({ page }) => {
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Ferramentas' }).click();
  await page.getByRole('menuitem', { name: /^Galeria da comunidade/ }).click();
  await expect(page.getByText('Sem conexão com a galeria. Confira a internet e tente de novo.')).toBeVisible();
  await expect(page.getByText('A galeria precisa de internet só para abrir e baixar; o que já foi instalado continua funcionando sem ela.')).toBeVisible();
  // Tentar de novo continua sem internet: mesmo aviso, sem erro na página.
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByText('Sem conexão com a galeria. Confira a internet e tente de novo.')).toBeVisible();
  await page.getByRole('button', { name: 'Fechar' }).first().click();
  await expect(page.getByText('Sem conexão com a galeria.', { exact: false })).toBeHidden();
  // O editor continua respondendo.
  await page.getByRole('navigation').getByRole('button', { name: 'Filtros' }).click();
  await expect(page.getByRole('heading', { name: 'Filtros', level: 2 })).toBeVisible();
});

test('galeria pelo botão da aba Pacotes também abre sem internet', async ({ page }) => {
  await page.context().setOffline(true);
  await page.getByRole('navigation').getByRole('button', { name: 'Pacotes' }).click();
  await page.getByRole('button', { name: /^Galeria da comunidade/ }).click();
  await expect(page.getByText('Sem conexão com a galeria. Confira a internet e tente de novo.')).toBeVisible();
  await page.keyboard.press('Escape');
});
