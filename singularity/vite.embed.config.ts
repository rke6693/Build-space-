/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Single-file build for embedding (e.g. a chat artifact): one JS bundle with the simulation
 * worker inlined as a blob, CSS in one file, no public assets. scripts/inline-html.mjs then
 * folds everything into a single HTML page.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __EMBED__: 'true' },
  resolve: {
    alias: [{ find: /^\.\/spawn$/, replacement: fileURLToPath(new URL('./src/worker/spawn.inline.ts', import.meta.url)) }],
  },
  worker: { format: 'es' },
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist-embed',
    emptyOutDir: true,
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
