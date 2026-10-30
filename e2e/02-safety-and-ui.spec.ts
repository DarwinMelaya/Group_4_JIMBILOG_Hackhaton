import { test, expect, manilaDate } from './fixtures';

const URGENT_GUIDANCE = /professional (health )?assessment|qualified health professional/i;
// No contact details may ever appear in urgent guidance: phone-like digit runs, e-mail addresses, tel:/mailto: links, URLs.
async function expectNoContacts(page: import('@playwright/test').Page, scope: import('@playwright/test').Locator): Promise<void> {
  const text = await scope.innerText();
  expect(text).not.toMatch(/\+?\d[\d\s().-]{7,}\d/);
  expect(text).not.toMatch(/\S+@\S+\.\S+/);
  expect(text).not.toMatch(/https?:\/\//i);
  await expect(scope.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="http"]')).toHaveCount(0);
  void page;
}

test('(d) urgent flow: Home control, Pathway button and assistant chip show assessment guidance and no contacts', async ({ page }) => {
  // Home urgent control.
  await page.goto('/');
  await page.getByRole('link', { name: 'Urgent: read what to do first' }).click();
  await expect(page).toHaveURL(/\/learn\/urgent-possible-hiv-exposure-72-hours$/);
  const article = page.locator('main');
  await expect(article).toContainText(URGENT_GUIDANCE);
  await expectNoContacts(page, article);

  // Pathway urgent button.
  await page.goto('/pathway');
  await page.getByRole('button', { name: 'Possible exposure in the last 72 hours' }).click();
  const urgent = page.getByRole('heading', { name: 'Please get a professional assessment urgently' });
  await expect(urgent).toBeVisible();
  const main = page.locator('main');
  await expect(main).toContainText(/qualified health professional or hospital/i);
  await expect(main).toContainText('No contact details are shown');
  await expect(main.locator('a[href^="tel:"], a[href^="mailto:"]')).toHaveCount(0);
  // The explanatory sentence names "contact details" in words only; strip it before the digit/e-mail/URL scan.
  const pathwayText = (await main.innerText()).replace(/No contact details are shown[^.]*\./, '');
  expect(pathwayText).not.toMatch(/\+?\d[\d\s().-]{7,}\d/);
  expect(pathwayText).not.toMatch(/\S+@\S+\.\S+/);

  // Assistant urgent chip.
  await page.goto('/');
  await page.getByRole('button', { name: 'DEMO guide' }).click();
  const dialog = page.getByRole('dialog', { name: 'DEMO guide' });
  await dialog.getByRole('button', { name: 'Possible HIV exposure in the last 72 hours' }).click();
  await expect(dialog.getByText('Possible exposure in the last 72 hours: please get a professional assessment now')).toBeVisible();
  await expect(dialog).toContainText(/qualified health professional or go to a hospital/i);
  const dialogText = await dialog.innerText();
  expect(dialogText).not.toMatch(/\+?\d[\d\s().-]{7,}\d/);
  expect(dialogText).not.toMatch(/\S+@\S+\.\S+/);
  await expect(dialog.locator('a[href^="tel:"], a[href^="mailto:"], a[href^="http"]')).toHaveCount(0);
});

test('(e) real-minor path stays disabled: 15-17 is DEMO-only on a DEMO clinic; real/other paths are refused', async ({ page, request, baseURL }) => {
  await page.goto('/clinics/demo-clinic-a/request');
  await page.getByRole('radio', { name: /15 to 17/ }).check();
  await expect(page.getByText(/DEMO only: ages 15 to 17 can try this request in the demo/)).toBeVisible();
  await expect(page.getByText(/real requests for this age group are not possible/)).toBeVisible();
  await page.locator('#bk-date').fill(manilaDate(5));
  await page.locator('#bk-window').selectOption('afternoon');
  await page.locator('#bk-ack').check();
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('DEMO minor flow: accepted only because this is a demo with a fictitious clinic.')).toBeVisible();

  // Direct API attempts (same-origin through the preview proxy). Idempotency keys are unique per attempt.
  const body = (over: Record<string, unknown>) => ({
    clinicId: 'demo-clinic-a',
    ageBand: '18_plus',
    preferredDate: manilaDate(5),
    preferredWindow: 'morning',
    acknowledgedDisclosure: true,
    ...over,
  });
  const post = (over: Record<string, unknown>) =>
    request.post(`${baseURL}/api/v1/public/booking-requests`, {
      data: body(over),
      headers: { 'Idempotency-Key': `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 12)}-xxxx` },
    });

  // Under 15 is not available at all.
  expect((await post({ ageBand: 'under_15' })).status()).toBe(422);
  // A clinic that is not a DEMO fixture does not exist in this build: the real path is refused/not found.
  const real = await post({ clinicId: 'real-clinic-example', ageBand: '15_17' });
  expect([403, 404]).toContain(real.status());
  // A clinic that does not take requests is refused too.
  expect((await post({ clinicId: 'demo-clinic-c' })).status()).toBe(404);
  // Public config reports real booking disabled.
  const cfg = await (await request.get(`${baseURL}/api/v1/public/config`)).json();
  expect(cfg.realBookingEnabled).toBe(false);
});

test('(f) assistant widget is visible bottom-right on Home/Learn/Clinics/Menu and Escape closes it', async ({ page }) => {
  for (const path of ['/', '/learn', '/clinics', '/menu']) {
    await page.goto(path);
    const fab = page.getByRole('button', { name: 'DEMO guide' });
    await expect(fab).toBeVisible();
    const box = await fab.boundingBox();
    const vp = page.viewportSize();
    expect(box && vp).toBeTruthy();
    if (box && vp) {
      expect(box.x + box.width / 2, `${path} horizontal`).toBeGreaterThan(vp.width / 2);
      expect(box.y + box.height / 2, `${path} vertical`).toBeGreaterThan(vp.height / 2);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    }
    await fab.click();
    const dialog = page.getByRole('dialog', { name: 'DEMO guide' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(fab).toBeFocused();
  }
});

test('(h) EN/FIL switch changes the html lang', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: 'Filipino', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', /^fil/);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
