import { expect, test } from './fixtures';
import { box, cursorTime, drag, importMedia, mainClips, openSample, PESSOA_WEBM, selectedText } from './helpers';

test('abre o editor vazio e o projeto de exemplo', async ({ page }) => {
  await expect(page).toHaveTitle(/Lumiar/);
  await expect(page.getByRole('heading', { name: 'Mídia do projeto' })).toBeVisible();
  // A tela de carregamento sai depois que o editor aparece (e não fica por cima, pegando os cliques).
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exportar' })).toBeDisabled();
  await openSample(page);
  await expect(page.getByRole('textbox', { name: 'Nome do projeto' })).toHaveValue('Projeto de exemplo');
  await expect(page.getByRole('button', { name: 'Exportar' })).toBeEnabled();
  // As três mídias do exemplo entram na biblioteca.
  for (const name of ['paisagem.jpg', 'drone.webm', 'cidade.jpg']) await expect(page.getByTitle(new RegExp(`^${name.replace('.', '\\.')}\\n`))).toBeVisible();
});

test('arrastar o cursor pela régua anda o tempo e não seleciona texto', async ({ page }) => {
  await openSample(page);
  const ruler = page.locator('[data-ruler] > div').nth(1);
  const r = await box(ruler);
  const y = r.y + r.height / 2;
  expect(await cursorTime(page)).toBe(0);
  // Do começo da régua para a direita e, no meio do caminho, descendo pelas trilhas e nomes (onde há texto).
  await page.mouse.move(r.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(r.x + 200, y + 120, { steps: 10 });
  await page.mouse.move(r.x + 420, y + 260, { steps: 10 });
  await page.mouse.move(r.x + 420, y, { steps: 6 });
  expect(await selectedText(page)).toBe('');
  await page.mouse.up();
  const time = await cursorTime(page);
  expect(time).toBeGreaterThan(1);
  expect(await selectedText(page)).toBe('');
  // Arrastar de volta para a esquerda faz o cursor voltar.
  await drag(page, { x: r.x + 420, y }, { x: r.x + 60, y });
  expect(await cursorTime(page)).toBeLessThan(time);
  expect(await selectedText(page)).toBe('');
});

test('importa um vídeo e põe na timeline', async ({ page }) => {
  await importMedia(page, [PESSOA_WEBM]);
  const card = page.getByTitle(/^pessoa\.webm\n/);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Mídia do projeto' }).locator('..')).toContainText('1');
  // Importar já põe no fim da timeline.
  await expect(mainClips(page)).toHaveCount(1);
  await expect(mainClips(page).first()).toHaveAttribute('title', 'pessoa.webm');
  // O + do cartão põe de novo.
  await card.hover();
  await card.getByRole('button', { name: 'Adicionar à timeline' }).click();
  await expect(mainClips(page)).toHaveCount(2);
  await expect(mainClips(page).nth(1)).toHaveAttribute('title', 'pessoa.webm');
  await expect(page.getByRole('button', { name: 'Exportar' })).toBeEnabled();
});

test('aplica um filtro num clipe e um pacote na timeline', async ({ page }) => {
  await importMedia(page, [PESSOA_WEBM]);
  const clip = mainClips(page).first();
  await expect(clip).toBeVisible({ timeout: 30_000 });
  await expect(clip.getByTitle('Filtro')).toHaveCount(0);

  // Filtro: seleciona o clipe e clica no filtro na aba Filtros.
  await clip.click();
  await page.getByRole('navigation').getByRole('button', { name: 'Filtros' }).click();
  await page.getByRole('button', { name: 'Brilho dourado', exact: true }).click();
  await expect(clip.getByTitle('Filtro')).toHaveCount(1);

  // Pacote: clicar num pacote põe ele na trilha de pacotes, no cursor.
  const packs = page.locator('[data-item^="pack:"]');
  await expect(packs).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Pacotes' }).click();
  await page.getByRole('button', { name: /Velocity$/ }).first().click();
  await expect(packs).toHaveCount(1);
  await expect(packs.first()).toContainText('Velocity');

  // Os dois entram no histórico: desfazer tira o pacote.
  await page.getByRole('button', { name: /^Desfazer/ }).click();
  await expect(packs).toHaveCount(0);
});

test('mixer de áudio: abre e muda o volume de uma trilha', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: /^Mixer de áudio/ }).click();
  const fader = page.getByRole('slider', { name: 'Volume de "Trilha principal"' });
  await expect(fader).toBeVisible();
  await expect(fader).toHaveAttribute('aria-valuenow', '0');
  // Pelo teclado (setas) e arrastando a alça com o mouse.
  await fader.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const afterKeys = Number(await fader.getAttribute('aria-valuenow'));
  expect(afterKeys).toBeLessThan(0);
  const f = await box(fader);
  await drag(page, { x: f.x + f.width / 2, y: f.y + f.height * 0.3 }, { x: f.x + f.width / 2, y: f.y + f.height * 0.8 });
  const afterDrag = Number(await fader.getAttribute('aria-valuenow'));
  expect(afterDrag).toBeLessThan(afterKeys);
  // O número embaixo do fader mostra o mesmo valor.
  const text = (await fader.getAttribute('aria-valuetext'))!;
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
});
