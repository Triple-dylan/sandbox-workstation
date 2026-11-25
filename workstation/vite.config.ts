import { defineConfig } from 'vite';

const apiPort = Number(process.env.API_PORT ?? 4175);

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
        warn(warning);
      },
    },
  },
});
