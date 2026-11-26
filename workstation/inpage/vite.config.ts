import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const node = fileURLToPath(new URL('./shims/node.ts', import.meta.url));
const sqlite = fileURLToPath(new URL('./shims/sqlite.ts', import.meta.url));
const serverOnly = fileURLToPath(new URL('./shims/server-only.ts', import.meta.url));

/** Bundles the client and the real server into one self-contained page. */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: {
      'node:sqlite': sqlite,
      'node:crypto': node,
      'node:fs/promises': node,
      'node:fs': node,
      'node:path': node,
      'node:url': node,
      'node:http': node,
      // Hosted-only: Google sign-in, the shared browser and its address guard.
      'google-auth-library': serverOnly,
      'playwright-core': serverOnly,
      'node:net': serverOnly,
      'node:dns/promises': serverOnly,
    },
  },
  build: {
    outDir: '../dist-inpage',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' || warning.code === 'EVAL') return;
        warn(warning);
      },
    },
  },
});
