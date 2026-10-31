import { expect, test } from './fixtures';
import { box, drag } from './helpers';

// Legendas automáticas de ponta a ponta: a voz sintética do próprio Lumiar fala uma frase, o Whisper
// transcreve, e as legendas se editam pela lista, por dois cliques na timeline e arrastando a borda.

const captionBlocks = (page: import('@playwright/test').Page) => page.locator('[data-item^="caption:"]');

test('gerar legendas da fala e editar', async ({ page }) => {
  test.setTimeout(240_000);
  const nav = page.getByRole('navigation');

  // Uma fala no projeto, feita pela voz sintética (sem microfone, sem arquivo de fora).
  await nav.getByRole('button', { name: 'Voz' }).click();
  await page.getByPlaceholder('Digite o texto que a voz vai falar…').fill('Bom dia a todos. Hoje vamos aprender a editar vídeos.');
  await page.getByRole('button', { name: 'Gerar e pôr no cursor' }).click();
  await expect(page.locator('[data-item^="audio:"]')).toHaveCount(1, { timeout: 120_000 });

  // A aba Legendas fica ao alcance mesmo com a janela baixa (a barra da esquerda rola).
  await nav.getByRole('button', { name: 'Legendas' }).click();
  await page.getByRole('button', { name: 'Rápida', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar legendas' }).click();
  await expect(page.getByText(/legendas criadas/)).toBeVisible({ timeout: 180_000 });
  const areas = page.locator('[data-caption] textarea');
  expect(await areas.count()).toBeGreaterThan(0);
  expect((await areas.evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value))).join(' ').toLowerCase()).toMatch(/dia|vídeo|editar|hoje/);
  await expect(captionBlocks(page)).toHaveCount(await areas.count());

  // Corrigir o texto na lista: a timeline mostra o novo texto.
  const first = areas.first();
  await first.fill('Bom dia, pessoal!');
  await expect(captionBlocks(page).first()).toContainText('Bom dia, pessoal!');

  // Dois cliques no bloco da timeline: o texto daquela legenda fica pronto para digitar.
  const last = captionBlocks(page).last();
  const lastId = (await last.getAttribute('data-item'))!.replace('caption:', '');
  await last.dblclick();
  await expect(page.locator(`[data-caption="${lastId}"] textarea`)).toBeFocused();

  // Puxar a borda do fim da primeira legenda para a direita deixa ela mais longa.
  const block = captionBlocks(page).first();
  const before = await box(block);
  await block.hover();
  await drag(page, { x: before.x + before.width - 3, y: before.y + before.height / 2 }, { x: before.x + before.width + 40, y: before.y + before.height / 2 });
  await expect.poll(async () => (await box(captionBlocks(page).first())).width).toBeGreaterThan(before.width + 20);
});
