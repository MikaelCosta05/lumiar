import { defineConfig } from 'vitest/config';

// Testes da lógica pura (projeto, timeline, legendas, comparação do teste visual…). Sem React nem Tailwind: roda no Node.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // O cache guardaria a lista de dicionários do import.meta.glob (src/i18n) e não veria arquivos novos.
    fsModuleCache: false,
  },
});
