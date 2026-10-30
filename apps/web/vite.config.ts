import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { devHeaders, globalHeaders, parseHeadersFile } from './security-headers';

// Single source of truth: public/_headers (production). Dev gets a relaxed CSP (see security-headers.ts);
// preview serves the built site, so it gets the production headers unchanged.
const prodHeaders = globalHeaders(parseHeadersFile(readFileSync(new URL('./public/_headers', import.meta.url), 'utf8')));
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
    headers: devHeaders(prodHeaders),
    // Dev only: same-origin /api -> API dev server, so the browser never needs CORS.
    proxy: { '/api': { // 127.0.0.1, not localhost: the DEMO API binds IPv4 loopback only and localhost may resolve to ::1 first (S9-3).
    target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
  preview: { headers: prodHeaders },
  build: {
    // CSP font-src 'self' blocks data: URIs. Vite inlines small assets as data: URIs by default, which
    // included the smallest font subsets in the CSS, so fonts are always emitted as same-origin files.
    // Images may still inline (CSP img-src allows data:).
    assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf|eot)$/i.test(file) ? false : undefined),
  },
  // Generous timeouts (S1-14): jsdom + axe suites are slow on cold or idle machines; same values as apps/api.
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], testTimeout: 20000, hookTimeout: 20000 },
});
