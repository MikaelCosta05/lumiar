import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Caminhos relativos: o app compilado funciona aberto de qualquer pasta (Electron/Tauri).
  base: './',
  plugins: [react(), tailwindcss()],
  // O reconhecimento de fala roda num worker que usa import dinâmico.
  worker: { format: 'es' },
  server: { port: 5173, open: true },
});
