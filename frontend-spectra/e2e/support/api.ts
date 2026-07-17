import type { APIRequestContext, Page } from '@playwright/test';
import { request } from '@playwright/test';
import { BACKEND_ORIGIN, E2E_ADMIN } from '../../playwright.config';

/**
 * Test data owned by the suite.
 *
 * Ids are obviously synthetic so an assertion can never accidentally pass
 * against real records, and the e2e backend's database is in-memory — it is
 * discarded when the run ends, so nothing here outlives the tests.
 */
export const TEST_CAMERA_ID = 'e2e-test-camera';

export interface SeedAlert {
  type: string;
  confidence: number;
  message: string;
  severity?: string;
  zoneName?: string;
  trackId: string;
  cameraId?: string;
}

/** An API context authenticated as the seeded e2e admin. */
export async function apiAsAdmin(): Promise<APIRequestContext> {
  const context = await request.newContext({ baseURL: BACKEND_ORIGIN });
  const response = await context.post('/api/auth/login', { data: E2E_ADMIN });
  if (!response.ok()) {
    throw new Error(`e2e admin login failed: ${response.status()} ${await response.text()}`);
  }
  return context;
}

/**
 * Registers a camera and returns its id. Needed wherever the UI resolves an
 * alert's camera: a detection from an unregistered camera deliberately shows
 * no Monitor link, since linking would select a different camera.
 */
export async function seedCamera(api: APIRequestContext, name = 'E2E Test Camera'): Promise<string> {
  const response = await api.post('/api/cameras', {
    data: { name, location: 'E2E Test Location', zone: 'E2E Zone', sourceType: 'local-device' },
  });
  if (!response.ok()) {
    throw new Error(`seeding camera failed: ${response.status()} ${await response.text()}`);
  }
  return (await response.json())._id as string;
}

export async function seedAlert(api: APIRequestContext, alert: SeedAlert) {
  const response = await api.post('/api/vision/alerts', {
    data: {
      cameraId: alert.cameraId ?? TEST_CAMERA_ID,
      type: alert.type,
      confidence: alert.confidence,
      message: alert.message,
      ...(alert.severity ? { severity: alert.severity } : {}),
      ...(alert.zoneName ? { zoneName: alert.zoneName } : {}),
      metadata: { trackId: alert.trackId },
    },
  });
  if (!response.ok() && response.status() !== 200) {
    throw new Error(`seeding alert failed: ${response.status()} ${await response.text()}`);
  }
  return response.json();
}

/**
 * Drops every record the suite created, so each spec starts from a known
 * empty state.
 *
 * Alerts have no DELETE endpoint, so this calls the reset the e2e backend
 * mounts around the real app (test/support/e2eServer.ts). That route exists
 * only in the test harness and only ever addresses a throwaway in-memory
 * database — never the normal local one.
 */
export async function resetBackend(api: APIRequestContext) {
  const response = await api.post('/__test__/reset');
  if (!response.ok()) {
    throw new Error(`test reset failed: ${response.status()} — is the e2e backend running?`);
  }
}

export async function alertCounts(api: APIRequestContext) {
  const response = await api.get('/api/vision/alerts/counts');
  return (await response.json()) as { unread: number; criticalOpen: number; new: number };
}

/** Signs in through the real login form, exercising the session cookie path. */
export async function loginViaUi(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(E2E_ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(E2E_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
