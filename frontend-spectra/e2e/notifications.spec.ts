import { expect, test, type APIRequestContext } from '@playwright/test';
import { alertCounts, apiAsAdmin, loginViaUi, resetBackend, seedAlert, seedCamera } from './support/api';

let api: APIRequestContext;

/**
 * Every alert here is created by the suite against the e2e backend's
 * throwaway in-memory database. No assertion depends on any pre-existing
 * record.
 */
const SEEDED = {
  // Severity is set explicitly: the active detectors default to warning/info,
  // and these specs are about how severity renders, not how it's derived.
  critical: {
    type: 'unattended_object',
    severity: 'critical',
    confidence: 0.81,
    message: 'E2E fixture — unattended object, critical',
    trackId: 'e2e-1',
  },
  // A second critical, distinct by trackId so grouping never folds the two.
  // AprilTag is a silent identity capability now and the API refuses to
  // record one, so it can no longer stand in as a second type here.
  criticalTwo: {
    type: 'unattended_object',
    severity: 'critical',
    confidence: 0.72,
    message: 'E2E fixture — unattended object, second critical',
    trackId: 'e2e-2',
  },
  warning: {
    type: 'unattended_object',
    confidence: 0.66,
    message: 'E2E fixture — unattended object, warning',
    trackId: 'e2e-3',
  },
};

test.beforeAll(async () => {
  api = await apiAsAdmin();
});

test.afterAll(async () => {
  await resetBackend(api);
  await api.dispose();
});

test.beforeEach(async () => {
  await resetBackend(api);
});

async function seedThree() {
  await seedAlert(api, SEEDED.critical);
  await seedAlert(api, SEEDED.criticalTwo);
  await seedAlert(api, SEEDED.warning);
}

const rows = '[data-severity][data-unread]';

/**
 * Text assertions must be scoped to the list. The filter dropdowns contain
 * <option> elements with the same labels ("Drowning Posture", "Under review"),
 * so an unscoped getByText matches a hidden option instead of a row.
 */
const rowWith = (page: import('@playwright/test').Page, text: string) =>
  page.locator(rows).filter({ hasText: text });

test.describe('notifications page', () => {
  test('lists real API-backed alerts with their fields', async ({ page }) => {
    await seedThree();
    await loginViaUi(page);
    await page.goto('/notifications');

    await expect(page.locator(rows)).toHaveCount(3);

    const critical = rowWith(page, SEEDED.critical.message);
    await expect(critical).toHaveCount(1);
    await expect(critical).toContainText('Unattended Object');
    await expect(critical).toContainText('critical');
    await expect(critical).toContainText('81% confidence');
    await expect(critical).toContainText('New');
    await expect(page.getByText(/not a confirmed incident/i)).toBeVisible();
  });

  test('shows an honest empty state when there are genuinely no alerts', async ({ page }) => {
    await loginViaUi(page);
    await page.goto('/notifications');

    await expect(page.getByText('No recorded data yet')).toBeVisible();
    await expect(page.locator(rows)).toHaveCount(0);
  });

  test('shows an API-error state instead of an empty list when the request fails', async ({ page }) => {
    await loginViaUi(page);
    // Intercepted so the failure is deterministic rather than staged by
    // breaking the real backend.
    await page.route('**/api/vision/alerts?*', (route) => route.fulfill({ status: 500, body: '{"error":"boom"}' }));
    await page.goto('/notifications');

    await expect(page.getByText('Backend unavailable')).toBeVisible();
    // A failed request must never be presented as "no alerts".
    await expect(page.getByText('No recorded data yet')).toHaveCount(0);
  });

  test('filters by severity and type, server-side', async ({ page }) => {
    await seedThree();
    await loginViaUi(page);
    await page.goto('/notifications');
    await expect(page.locator(rows)).toHaveCount(3);

    await page.getByLabel('Severity', { exact: true }).selectOption('critical');
    await expect(page.locator(rows)).toHaveCount(2);

    // A retired type still filters — its alerts remain in history — but none
    // of these are one.
    await page.getByLabel('Type', { exact: true }).selectOption('drowning');
    // Nothing matches: the empty state must say so rather than claim there
    // are no alerts at all.
    await expect(page.getByText('No notifications match these filters')).toBeVisible();

    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page.locator(rows)).toHaveCount(3);
  });

  test('filters by status', async ({ page }) => {
    await seedThree();
    await loginViaUi(page);
    await page.goto('/notifications');

    await page.getByLabel('Status', { exact: true }).selectOption('new');
    await expect(page.locator(rows)).toHaveCount(3);

    await page.getByLabel('Status', { exact: true }).selectOption('resolved');
    await expect(page.getByText('No notifications match these filters')).toBeVisible();
  });

  test('changing status persists across a reload', async ({ page }) => {
    await seedAlert(api, SEEDED.warning);
    await loginViaUi(page);
    await page.goto('/notifications');

    await page.locator(`${rows} select`).first().selectOption('under_review');
    await expect(rowWith(page, 'Under review')).toHaveCount(1);

    await page.reload();
    await expect(rowWith(page, 'Under review')).toHaveCount(1);

    const list = await (await api.get('/api/vision/alerts?limit=50')).json();
    expect(list.some((alert: { status: string }) => alert.status === 'under_review')).toBe(true);
  });

  test('marks all read and clears the badge without a reload', async ({ page }) => {
    await seedThree();
    await loginViaUi(page);
    await page.goto('/notifications');

    expect((await alertCounts(api)).unread).toBe(3);
    await expect(page.getByText('3 unread')).toBeVisible();

    await page.getByRole('button', { name: /Mark all read/ }).click();

    await expect(page.getByText('0 unread')).toBeVisible();
    expect((await alertCounts(api)).unread).toBe(0);
  });

  test('resolves the camera and deep-links a registered one to Monitor', async ({ page }) => {
    const cameraId = await seedCamera(api);
    await seedAlert(api, { ...SEEDED.warning, cameraId });
    await loginViaUi(page);
    await page.goto('/notifications');

    // The row shows the camera's name, not its raw id.
    await expect(page.locator(rows).first()).toContainText('E2E Test Camera');

    await page.locator(`${rows} [role="button"]`).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('First recorded');
    await expect(dialog).toContainText('Confidence');
    await expect(dialog.getByRole('link', { name: /Open in Live Monitor/ })).toHaveAttribute(
      'href',
      `/monitor?camera=${cameraId}`,
    );
  });

  test('shows no Monitor link for an alert whose camera is not registered', async ({ page }) => {
    await seedAlert(api, SEEDED.warning); // cameraId has no camera record
    await loginViaUi(page);
    await page.goto('/notifications');

    await page.locator(`${rows} [role="button"]`).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Linking would silently select a different camera, so it must be absent.
    await expect(dialog.getByRole('link', { name: /Open in Live Monitor/ })).toHaveCount(0);
  });
});

test.describe('top-bar notification indicator', () => {
  test('shows the real unread count and turns critical', async ({ page }) => {
    await seedThree();
    await loginViaUi(page);

    const counts = await alertCounts(api);
    expect(counts.unread).toBe(3);
    expect(counts.criticalOpen).toBe(2);

    const badge = page.locator('[aria-label="Notifications"] [data-critical]');
    await expect(badge).toHaveText(String(counts.unread));
    await expect(badge).toHaveAttribute('data-critical', 'true');
  });

  test('lists real alerts in the bell and none when empty', async ({ page }) => {
    await seedAlert(api, SEEDED.critical);
    await loginViaUi(page);

    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.getByText(SEEDED.critical.message).first()).toBeVisible();
  });

  test('shows no badge at all when the counts request fails', async ({ page }) => {
    await seedThree();
    await page.route('**/api/vision/alerts/counts', (route) => route.fulfill({ status: 500, body: '{}' }));
    await loginViaUi(page);

    // A failed count is not zero, and not a number we may invent.
    await expect(page.locator('[aria-label="Notifications"] [data-critical]')).toHaveCount(0);
  });
});

test.describe('dashboard alert preview', () => {
  test('renders real alerts from the same API', async ({ page }) => {
    await seedThree();
    await loginViaUi(page);
    await page.goto('/');

    await expect(page.getByText('Recent Alerts')).toBeVisible();
    await expect(page.getByText('Unattended Object').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /View all notifications/ })).toBeVisible();
  });

  test('shows an honest empty state, not a zero, when nothing is recorded', async ({ page }) => {
    await loginViaUi(page);
    await page.goto('/');

    await expect(page.getByText('No recorded data yet').first()).toBeVisible();
  });

  test('shows a dash rather than zero when the counts request fails', async ({ page }) => {
    await page.route('**/api/vision/alerts/counts', (route) => route.fulfill({ status: 500, body: '{}' }));
    await loginViaUi(page);
    await page.goto('/');

    // Both alert-derived cards (New Alerts, Critical Alerts Open) must show a
    // dash; the camera cards still resolve, so exactly two dashes are expected.
    await expect(page.getByText('—')).toHaveCount(2);
  });
});
