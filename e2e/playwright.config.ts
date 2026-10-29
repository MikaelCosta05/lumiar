import { defineConfig } from '@playwright/test';

// Testes de ponta a ponta: abrem o Lumiar de verdade (Electron) e clicam nele.
// npm run e2e monta uma cópia do app em .tmp-e2e/app (veja build-app.mjs) e roda tudo.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: '../.tmp-e2e/resultados',
  globalSetup: './global-setup.ts',
  // Uma janela do Electron por vez: a GPU e o codificador de vídeo são da máquina inteira.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: '../.tmp-e2e/relatorio', open: 'never' }]] : 'list',
  use: {
    actionTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
