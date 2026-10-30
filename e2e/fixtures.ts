import { test as base, expect, type Page } from '@playwright/test';

/** DEMO-only accounts documented in docs/run-guide.md. The domain is reserved (.invalid); nothing here is real. */
export const DEMO_PASSWORD = 'demo-staff-only-2026';
export const STAFF_A = 'staff.a@demo.invalid';
export const PROVINCIAL = 'provincial@demo.invalid';

export interface Watch {
  /** securitypolicyviolation events and console errors (resource-status noise excluded), per test. */
  problems: string[];
  /** API responses with status >= 400, "METHOD path status". */
  apiFailures: string[];
}

/**
 * Every test gets a page that records CSP violations (DOM event) and console errors, and the test fails at the end if
 * any appeared. Expected HTTP errors are tracked separately in `watch.apiFailures` and asserted by the tests that care.
 */
export const test = base.extend<{ watch: Watch }>({
  watch: [
    async ({ page }, use) => {
      const watch: Watch = { problems: [], apiFailures: [] };
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          console.error(`CSPVIOLATION ${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber} ${e.sample}`);
        });
      });
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        // "Failed to load resource: ... 401" is browser noise for handled HTTP errors; tracked via apiFailures instead.
        if (/Failed to load resource/.test(m.text())) return;
        watch.problems.push(m.text());
      });
      page.on('pageerror', (e) => watch.problems.push(`pageerror ${e.message}`));
      page.on('response', (r) => {
        if (r.url().includes('/api/') && r.status() >= 400) watch.apiFailures.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`);
      });
      await use(watch);
      expect(watch.problems, 'CSP violations / console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Date (YYYY-MM-DD) `days` from now in Asia/Manila. */
export function manilaDate(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
}

export async function signIn(page: Page, loginPath: string, email: string): Promise<void> {
  await page.goto(loginPath);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
