import { defineConfig, devices } from '@playwright/test';

// Real-browser e2e (S9-1). DEMO only: in-memory PGlite, seeded fictitious data, mock notifications.
// The web app is a PRODUCTION build served by `vite preview`, so the strict CSP headers, the service worker and the
// same-origin /api proxy are exercised exactly as shipped. Ports are fixed and off the dev defaults (3001/5173).
const API_PORT = 3101;
const WEB_PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev:api-e2e',
      url: `http://127.0.0.1:${API_PORT}/api/v1/public/config`,
      reuseExistingServer: false,
      timeout: 90_000,
      env: { PORT: String(API_PORT), DEMO_MODE: 'true', NODE_ENV: 'development', PGLITE_DATA_DIR: '' },
    },
    {
      command: 'npm run build -w @kalinga/web && npm exec -w @kalinga/web -- vite preview --port 4173 --strictPort',
      url: `http://localhost:${WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { API_PORT: String(API_PORT) },
    },
  ],
});
