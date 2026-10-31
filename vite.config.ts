import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Versão do que desenha as miniaturas da biblioteca (motor, mídias de exemplo, pacotes): as miniaturas guardadas no
 * disco só valem enquanto ela não muda. O código de cada plugin entra na conta dele, na hora (src/ui/previewCache.ts).
 */
function previewEngine(): string {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const at = (...parts: string[]) => path.join(root, ...parts);
  const hash = createHash('sha1');
  const files = [
    ...fs.readdirSync(at('src/engine')).filter((f) => f.endsWith('.ts') && !f.includes('.test.')).map((f) => at('src/engine', f)),
    at('src/ui/previews.ts'),
    at('src/ui/previewMedia.ts'),
    at('src/project/packs.ts'),
    at('src/project/model.ts'),
  ];
  for (const file of files.sort()) hash.update(fs.readFileSync(file));
  const previews = at('public/previews');
  for (const file of fs.readdirSync(previews).sort()) hash.update(`${file}:${fs.statSync(path.join(previews, file)).size}`);
  return hash.digest('hex').slice(0, 12);
}

export default defineConfig({
  // Caminhos relativos: o app compilado funciona aberto de qualquer pasta (Electron/Tauri).
  base: './',
  plugins: [react(), tailwindcss()],
  define: {
    __PREVIEW_ENGINE__: JSON.stringify(previewEngine()),
    __APP_VERSION__: JSON.stringify(JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8')).version),
  },
  // O reconhecimento de fala roda num worker que usa import dinâmico.
  worker: { format: 'es' },
  server: { port: 5173, open: true },
});
