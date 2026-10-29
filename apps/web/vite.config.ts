import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const apiPort = process.env.API_PORT ?? process.env.PORT ?? '3001';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Web consumes shared source (Zod schemas) so tests and dev do not depend on a prior build.
      '@kalinga/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Dev only: same-origin /api -> API dev server, so the browser never needs CORS.
    proxy: { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: false } },
  },
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
});
