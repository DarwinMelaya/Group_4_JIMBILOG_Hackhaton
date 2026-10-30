import { test, expect, signIn, PROVINCIAL } from './fixtures';

test('(g) provincial admin: sign in, dashboard loads without 401s, reports show suppressed cells', async ({ page, watch }) => {
  await signIn(page, '/admin/login', PROVINCIAL);
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible();
  await expect(page.getByText('Clinics on record')).toBeVisible();
  // Everything the dashboard loads is authorised by the session cookie (regression: cookie Path was /api/v1/staff).
  expect(watch.apiFailures.filter((f) => f.endsWith(' 401'))).toEqual([]);

  await page.getByRole('link', { name: 'Request summary' }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('main table').first()).toBeVisible();
  // Small cells are suppressed, never shown as 0 or an exact number below the threshold.
  await expect(page.locator('main table td', { hasText: '<5' }).first()).toBeVisible();
  expect(watch.apiFailures.filter((f) => f.endsWith(' 401'))).toEqual([]);
});

test('(j) service worker registers in the production build and offline navigation shows the offline page', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload once so the page is controlled by the service worker.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  try {
    await page.goto('/clinics/never-visited-while-offline', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/offline/i);
  } finally {
    await context.setOffline(false);
  }
});
