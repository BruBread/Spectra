import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  apiAsAdmin,
  loginViaUi,
  postObservation,
  resetBackend,
  roleByKey,
  seedCamera,
  seedPerson,
  seedZone,
  setRoleRule,
  setUnidentifiedRule,
} from './support/api';

/**
 * Restricted-area enforcement, driven through the real observations endpoint.
 *
 * CI can't walk a person across a webcam, so these feed the server the CV facts
 * the browser observer produces and assert on what the server decided and how
 * the console renders it — the alert in the feed, the decision in the log. The
 * policy itself is proven in the backend suite; this is about the round trip.
 */

let api: APIRequestContext;

test.beforeAll(async () => {
  api = await apiAsAdmin();
});

test.afterAll(async () => {
  await resetBackend(api);
  await api.dispose();
});

const decisionRows = 'tbody tr';
const feedRows = '[data-severity][data-unread]';

async function setup() {
  const cameraId = await seedCamera(api, 'Restricted Cam');
  const zone = await seedZone(api, { name: 'Vault', cameraId });
  return { cameraId, zoneId: zone._id };
}

test.beforeEach(async () => {
  await resetBackend(api);
});

test('an allowed guard is suppressed and audited — no alert, a decision in the log', async ({ page }) => {
  const { cameraId, zoneId } = await setup();
  const guard = await roleByKey(api, 'security_guard');
  await setRoleRule(api, guard._id, zoneId, 'allow');
  await seedPerson(api, { name: 'Ada Guard', roleId: guard._id, aprilTagId: 7 });

  const result = await postObservation(api, { cameraId, zoneId, aprilTags: [7] });
  expect(result.outcome).toBe('suppressed');

  await loginViaUi(page);
  await page.goto('/access-control?tab=decisions');

  const row = page.locator(decisionRows).filter({ hasText: 'Ada Guard' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Vault');
  await expect(row).toContainText('Suppressed');
  await expect(row).toContainText('Allow');

  // Suppressed means exactly that: nothing in the alert feed.
  await page.goto('/notifications');
  await expect(page.locator(feedRows)).toHaveCount(0);
});

test('an unidentified person raises a restricted-area alert and a decision', async ({ page }) => {
  const { cameraId, zoneId } = await setup();

  const result = await postObservation(api, { cameraId, zoneId, aprilTags: [] });
  expect(result.outcome).toBe('alert_created');

  await loginViaUi(page);

  // The alert reaches the feed, labelled as a restricted-area event.
  await page.goto('/notifications');
  const alert = page.locator(feedRows).filter({ hasText: 'Vault' });
  await expect(alert).toHaveCount(1);
  await expect(alert).toContainText('Restricted Area');

  // And the decision log records why: unidentified, restricted by default.
  await page.goto('/access-control?tab=decisions');
  const row = page.locator(decisionRows).filter({ hasText: 'Vault' });
  await expect(row).toContainText('Unidentified');
  await expect(row).toContainText('Alert created');
});

test('the unidentified are suppressed only where an admin explicitly allowed them', async ({ page }) => {
  const { cameraId, zoneId } = await setup();
  await setUnidentifiedRule(api, zoneId, 'allow');

  const result = await postObservation(api, { cameraId, zoneId, aprilTags: [] });
  expect(result.outcome).toBe('suppressed');

  await loginViaUi(page);
  await page.goto('/access-control?tab=decisions');
  const row = page.locator(decisionRows).filter({ hasText: 'Vault' });
  await expect(row).toContainText('Suppressed');
  await expect(row).toContainText('Unidentified policy');
});

test('a low-quality observation is ignored — nothing is written', async ({ page }) => {
  const { cameraId, zoneId } = await setup();

  // A box clipped by the bottom edge: the ground point is unreliable.
  const result = await postObservation(api, { cameraId, zoneId, personBox: [300, 720, 100, 300] });
  expect(result.status).toBe('ignored');
  expect(result.rejection).toBe('edge_clipped');

  await loginViaUi(page);
  await page.goto('/access-control?tab=decisions');
  await expect(page.getByText('No policy decisions recorded')).toBeVisible();
});

test('a client cannot post a restricted_area alert directly — policy cannot be bypassed', async () => {
  const { cameraId } = await setup();
  const response = await api.post('/api/vision/alerts', {
    data: { cameraId, type: 'restricted_area', confidence: 1, message: 'faked' },
  });
  expect(response.status()).toBe(400);
  expect(await response.text()).toMatch(/policy enforcement/i);
});
