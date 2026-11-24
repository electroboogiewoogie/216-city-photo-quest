import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' — относительные пути: сборка открывается и из корня сервера, и из вложенного пути (GitHub Pages /<repo>/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
