import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { box, mainClips, openSample, timelineDuration } from './helpers';

// Slip, slide e roll pelos atalhos Y, U e N, arrastando os clipes do projeto de exemplo:
// paisagem.jpg · drone.webm · cidade.jpg · drone.webm

const edges = async (page: Page) => {
  const list = [];
  for (const clip of await mainClips(page).all()) {
    const b = await box(clip);
    list.push({ left: b.x, right: b.x + b.width, width: b.width });
  }
  return list;
};

/** Aperta o atalho com o foco fora dos campos de texto e confere a ferramenta escolhida. */
async function pickTool(page: Page, key: string, name: RegExp) {
  await page.locator('[data-ruler]').click({ position: { x: 5, y: 5 } }); // tira o foco de qualquer campo
  await page.keyboard.press(key);
  await expect(page.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
}

const undo = (page: Page) => page.getByRole('button', { name: /^Desfazer/ });

test('slip (Y): troca o trecho mostrado sem mudar lugar nem tamanho', async ({ page }) => {
  await openSample(page);
  await pickTool(page, 'y', /^Slip:/);
  const before = await edges(page);
  const drone = await box(mainClips(page).nth(1));
  const y = drone.y + drone.height / 2;
  await page.mouse.move(drone.x + drone.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(drone.x + drone.width / 2 - 90, y, { steps: 10 });
  // A dica perto do mouse mostra a ferramenta, quanto andou e as novas entrada e saída.
  await expect(page.getByText(/^Entrada \d\d:\d\d/)).toBeVisible();
  await expect(page.getByText(/^Saída \d\d:\d\d/)).toBeVisible();
  await expect(page.getByText(/^[+−]\d+\.\d\d s$/)).not.toHaveText(/^[+−]0\.00 s$/);
  await page.mouse.up();
  await expect(page.getByText(/^Entrada \d\d:\d\d/)).toHaveCount(0);
  const after = await edges(page);
  for (let i = 0; i < before.length; i++) {
    expect(after[i].left).toBeCloseTo(before[i].left, 0);
    expect(after[i].width).toBeCloseTo(before[i].width, 0);
  }
  await expect(undo(page)).toBeEnabled();
});

test('slip numa imagem avisa que não há o que deslizar', async ({ page }) => {
  await openSample(page);
  await pickTool(page, 'y', /^Slip:/);
  const photo = await box(mainClips(page).first());
  await page.mouse.move(photo.x + photo.width / 2, photo.y + photo.height / 2);
  await page.mouse.down();
  await expect(page.getByText('Este clipe não tem o que deslizar (imagens ficam iguais).')).toBeVisible();
  await page.mouse.move(photo.x + photo.width / 2 - 40, photo.y + photo.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(undo(page)).toBeDisabled();
});

test('slide (U): move o clipe entre os vizinhos e a duração total fica a mesma', async ({ page }) => {
  await openSample(page);
  const total = await timelineDuration(page);
  await pickTool(page, 'u', /^Slide:/);
  const before = await edges(page);
  const drone = await box(mainClips(page).nth(1));
  const y = drone.y + drone.height / 2;
  await page.mouse.move(drone.x + drone.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(drone.x + drone.width / 2 + 70, y, { steps: 10 });
  await expect(page.getByText(/^começa em \d\d:\d\d/)).toBeVisible();
  await page.mouse.up();
  const after = await edges(page);
  // O clipe andou para a direita; o da esquerda cresceu e o da direita diminuiu.
  expect(after[1].left).toBeGreaterThan(before[1].left + 5);
  expect(after[1].width).toBeCloseTo(before[1].width, 0);
  expect(after[0].width).toBeGreaterThan(before[0].width + 5);
  expect(after[2].width).toBeLessThan(before[2].width - 5);
  // O fim do último clipe (e a duração) não mudou.
  expect(after[3].right).toBeCloseTo(before[3].right, 0);
  expect(await timelineDuration(page)).toBeCloseTo(total, 3);
  await expect(undo(page)).toBeEnabled();
});

test('roll (N): move o corte entre dois clipes', async ({ page }) => {
  await openSample(page);
  await pickTool(page, 'n', /^Roll:/);
  const before = await edges(page);
  // Metade direita do drone: o corte com a cidade, que vem depois.
  const drone = await box(mainClips(page).nth(1));
  const y = drone.y + drone.height / 2;
  const x = drone.x + drone.width * 0.8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 80, y, { steps: 10 });
  await expect(page.getByText(/^corte em \d\d:\d\d/)).toBeVisible();
  await page.mouse.up();
  const after = await edges(page);
  // O drone diminuiu, a cidade começou antes e cresceu do mesmo tanto; o resto não mexeu.
  expect(after[1].left).toBeCloseTo(before[1].left, 0);
  expect(after[1].width).toBeLessThan(before[1].width - 5);
  expect(after[2].left).toBeLessThan(before[2].left - 5);
  expect(after[2].right).toBeCloseTo(before[2].right, 0);
  expect(after[3].right).toBeCloseTo(before[3].right, 0);
  // Desfazer volta o corte para onde estava.
  await undo(page).click();
  const undone = await edges(page);
  expect(undone[1].width).toBeCloseTo(before[1].width, 0);
  // V volta para a seleção.
  await pickTool(page, 'v', /^Seleção:/);
});
