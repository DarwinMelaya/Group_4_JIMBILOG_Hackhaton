import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // PGlite (WASM Postgres) startup can exceed the 5s default on cold runs.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      // Tests run against shared source so they do not depend on a prior build.
      '@kalinga/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
});
