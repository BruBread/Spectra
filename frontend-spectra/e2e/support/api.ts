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

/* ------------------------------ access control ------------------------------ */

export interface SeedRole {
  _id: string;
  key: string;
  name: string;
}

/**
 * The two roles a real backend seeds at boot, which the e2e backend seeds too
 * (and re-seeds after each reset). Returned rather than assumed so a spec
 * never hard-codes an id.
 */
export async function seededRoles(api: APIRequestContext): Promise<SeedRole[]> {
  const response = await api.get('/api/roles');
  if (!response.ok()) throw new Error(`listing roles failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as SeedRole[];
}

export async function roleByKey(api: APIRequestContext, key: string): Promise<SeedRole> {
  const role = (await seededRoles(api)).find((candidate) => candidate.key === key);
  if (!role) throw new Error(`role "${key}" is not seeded`);
  return role;
}

export async function seedPerson(
  api: APIRequestContext,
  person: { name: string; roleId: string; aprilTagId?: number | null; loraDeviceId?: string | null },
) {
  const response = await api.post('/api/people', { data: person });
  if (!response.ok()) throw new Error(`seeding person failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as { _id: string; name: string };
}

export async function seedZone(
  api: APIRequestContext,
  zone: { name: string; cameraId: string; rect?: { x: number; y: number; width: number; height: number } },
) {
  const response = await api.post('/api/zones', {
    data: { rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 }, ...zone },
  });
  if (!response.ok()) throw new Error(`seeding zone failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as { _id: string; name: string };
}

/** Signs in through the real login form as any seeded account. */
export async function loginAs(page: Page, credentials: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(credentials.email);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** Signs in through the real login form, exercising the session cookie path. */
export function loginViaUi(page: Page) {
  return loginAs(page, E2E_ADMIN);
}
