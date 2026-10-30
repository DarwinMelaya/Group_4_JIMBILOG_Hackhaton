import { test, expect, manilaDate, signIn, STAFF_A } from './fixtures';

// One continuous story (a, b, c): visitor requests, staff confirms, visitor sees "confirmed". Serial and data-carrying.
test.describe.serial('visitor -> staff -> visitor journey', () => {
  const state: { reference: string; secret: string } = { reference: '', secret: '' };

  test('(a) anonymous visitor: Home, Learn, article, Pathway, Clinics, profile, request, receipt, pending lookup', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Learn About STIs' }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page.getByText(/articles found/)).toBeVisible();

    await page.getByRole('link', { name: /Common STIs: an overview/ }).first().click();
    await expect(page).toHaveURL(/\/learn\/common-stis-overview$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Common STIs');

    await page.goto('/pathway');
    await page.getByRole('checkbox', { name: 'Privacy and confidentiality' }).check();
    await page.getByRole('checkbox', { name: 'Cost of testing' }).check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Skip this question' }).click();
    await page.getByRole('button', { name: 'Show sample matches' }).click();
    await expect(page.getByText(/sample clinics found/)).toBeVisible();

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Clinics' }).click();
    await expect(page).toHaveURL(/\/clinics$/);
    await page.getByRole('link', { name: /DEMO Clinic A/ }).first().click();
    await expect(page).toHaveURL(/\/clinics\/demo-clinic-a$/);
    await page.getByRole('link', { name: 'Send a request to this clinic' }).click();
    await expect(page.getByRole('heading', { name: 'Appointment request' })).toBeVisible();

    // Fill the form (age group, date, window, service; contact preference and notes stay optional).
    await page.getByRole('radio', { name: '18 or older' }).check();
    await page.locator('#bk-date').fill(manilaDate(5));
    await page.locator('#bk-window').selectOption('morning');
    await page.locator('#bk-service').selectOption('hiv_testing');
    await page.locator('#bk-ack').check();
    await page.getByRole('button', { name: 'Send request' }).click();

    await expect(page.getByRole('heading', { name: 'Request sent: pending clinic review' })).toBeVisible();
    const reference = await page.locator('#bk-ref').inputValue();
    expect(reference.length).toBeGreaterThanOrEqual(6);
    await page.getByRole('button', { name: 'Show secret' }).click();
    const secret = await page.locator('#bk-secret').inputValue();
    expect(secret.length).toBeGreaterThanOrEqual(32);
    state.reference = reference;
    state.secret = secret;

    await page.goto('/appointments/lookup');
    await page.getByLabel('Reference').fill(reference);
    await page.getByLabel('Secret', { exact: true }).fill(secret);
    await page.getByRole('button', { name: 'Check status' }).click();
    await expect(page.getByText('Pending clinic review').first()).toBeVisible();
  });

  test('(b) staff: sign in with the DEMO account, queue, open request, confirm with visit time, sign out', async ({ page, watch }) => {
    await signIn(page, '/staff/login', STAFF_A);
    await expect(page.getByRole('heading', { name: 'Booking requests' }).first()).toBeVisible();
    // Fresh in-memory database per e2e run: the first pending request listed for DEMO Clinic A is the one created in (a).
    const items = page.locator('main a[href^="/staff/requests/"]');
    await expect(items.first()).toBeVisible();
    await items.first().click();
    await expect(page.getByRole('heading', { name: 'Decision' })).toBeVisible();

    await page.getByRole('radio', { name: 'Confirm the visit' }).check();
    await page.locator('#staff-date').fill(manilaDate(7));
    await page.locator('#staff-time').fill('14:30');
    await page.locator('#staff-requirements').fill('Bring a valid ID (DEMO text).');
    await page.getByRole('button', { name: 'Save decision' }).click();
    await expect(page.getByText(/Decision saved/)).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/staff\/login/);
    // Staff API calls were never rejected once signed in (a pre-login session probe may 401).
    expect(watch.apiFailures.filter((f) => !f.includes('/staff/me') && !f.includes('/staff/login'))).toEqual([]);
  });

  test('(c) visitor lookup now shows confirmed', async ({ page }) => {
    await page.goto('/appointments/lookup');
    await page.getByLabel('Reference').fill(state.reference);
    await page.getByLabel('Secret', { exact: true }).fill(state.secret);
    await page.getByRole('button', { name: 'Check status' }).click();
    await expect(page.getByText('Confirmed by the clinic').first()).toBeVisible();
    await expect(page.getByText('Bring a valid ID (DEMO text).')).toBeVisible();
  });
});
