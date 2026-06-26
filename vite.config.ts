import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
