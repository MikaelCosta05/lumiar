import { test as base, _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_DIR = path.join(ROOT, '.tmp-e2e', 'app');

type Fixtures = {
  /** Pasta de dados do usuário só deste teste (apagada no fim). */
  userData: string;
  electronApp: ElectronApplication;
  /** A janela do editor, já carregada. */
  page: Page;
  /** Erros de JavaScript da página durante o teste (o teste falha se sobrar algum). */
  pageErrors: string[];
};

export const test = base.extend<Fixtures>({
  userData: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumiar-e2e-'));
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  },
  electronApp: async ({ userData }, use) => {
    const env = { ...process.env, LUMIAR_E2E_USER_DATA: userData } as Record<string, string>;
    // Se o terminal veio de um processo do Electron, isso faria o Electron rodar como Node.
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ args: [APP_DIR, '--lang=pt-BR'], env, cwd: ROOT });
    await use(app);
    // destroy() fecha sem o aviso de mudanças não salvas (que travaria esperando um clique).
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
    await app.close().catch(() => {});
  },
  pageErrors: async ({}, use) => {
    await use([]);
  },
  page: async ({ electronApp, pageErrors }, use) => {
    const page = await electronApp.firstWindow();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.waitForLoadState('domcontentloaded');
    await use(page);
    expect(pageErrors, 'erros de JavaScript na página').toEqual([]);
  },
});

export { expect };
