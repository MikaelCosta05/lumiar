import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './fixtures';
import { openSample } from './helpers';

test('exporta um trecho curto em MP4 e o arquivo sai', async ({ page, electronApp, userData }) => {
  // O "salvar como" do download é respondido pelo teste: o arquivo vai para a pasta temporária.
  const folder = path.join(userData, 'exportados');
  fs.mkdirSync(folder);
  await electronApp.evaluate(({ session }, dir) => {
    const done: { file: string; state: string }[] = [];
    (globalThis as { __downloads?: typeof done }).__downloads = done;
    session.defaultSession.on('will-download', (_event, item) => {
      const file = `${dir}/${item.getFilename()}`;
      item.setSavePath(file);
      item.once('done', (_e, state) => done.push({ file, state }));
    });
  }, folder);

  await openSample(page);
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Exportar' })).toBeVisible();
  await page.getByRole('button', { name: /^MP4/ }).click();
  // Trecho: do começo até 1 s.
  await page.getByRole('button', { name: 'Escolher trecho' }).click();
  await page.getByRole('slider', { name: 'Fim' }).fill('1');
  await expect(page.getByText(/· 00:01\.00$/)).toBeVisible();
  await page.getByRole('button', { name: /^Exportar MP4/ }).click();
  await expect(page.getByRole('heading', { name: 'Arquivo pronto!' })).toBeVisible({ timeout: 90_000 });

  await expect
    .poll(() => electronApp.evaluate(() => (globalThis as { __downloads?: { file: string; state: string }[] }).__downloads ?? []), { timeout: 30_000 })
    .toHaveLength(1);
  const [download] = await electronApp.evaluate(() => (globalThis as { __downloads?: { file: string; state: string }[] }).__downloads!);
  expect(download.state).toBe('completed');
  expect(download.file).toMatch(/\.mp4$/);
  const bytes = fs.readFileSync(download.file);
  expect(bytes.length).toBeGreaterThan(10_000);
  // Um MP4 de verdade: a caixa "ftyp" logo no começo.
  expect(bytes.subarray(4, 8).toString('latin1')).toBe('ftyp');
});
