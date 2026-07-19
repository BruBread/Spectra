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

/**
 * Plants a person in a known credential state.
 *
 * Uses the test-only seed route, not `POST /api/people`: the real endpoint
 * auto-allocates the AprilTag and rejects a client-chosen one, but specs need
 * fixtures with a specific tag (to match an observation) or with no tag/no
 * credentials at all — states the normal create flow can no longer produce.
 */
export async function seedPerson(
  api: APIRequestContext,
  person: { name: string; roleId: string; aprilTagId?: number | null; loraDeviceId?: string | null; active?: boolean },
) {
  const response = await api.post('/__test__/seed-person', { data: person });
  if (!response.ok()) throw new Error(`seeding person failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as { _id: string; name: string; aprilTagId: number | null; active: boolean };
}

/** Creates a person through the *real* API, exercising automatic tag allocation. */
export async function createPersonViaApi(api: APIRequestContext, person: { name: string; roleId: string; loraDeviceId?: string }) {
  const response = await api.post('/api/people', { data: person });
  if (!response.ok()) throw new Error(`creating person failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as { _id: string; name: string; aprilTagId: number | null };
}

/** Issues the next free AprilTag to an existing active person who has none. */
export async function issueAprilTag(api: APIRequestContext, personId: string) {
  const response = await api.post(`/api/people/${personId}/issue-apriltag`);
  if (!response.ok()) throw new Error(`issuing tag failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as { _id: string; aprilTagId: number | null };
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

/** Writes one restricted-area rule onto a role, replacing its rule set. */
export async function setRoleRule(api: APIRequestContext, roleId: string, zoneId: string, rule: 'allow' | 'restrict') {
  const response = await api.patch(`/api/roles/${roleId}`, {
    data: { permissions: { actions: [{ action: 'restricted_area', zoneId, rule }] } },
  });
  if (!response.ok()) throw new Error(`setting role rule failed: ${response.status()} ${await response.text()}`);
}

/** Writes one restricted-area rule onto the unidentified-person policy. */
export async function setUnidentifiedRule(api: APIRequestContext, zoneId: string, rule: 'allow' | 'restrict') {
  const response = await api.put('/api/unidentified-policy', {
    data: { rules: [{ action: 'restricted_area', zoneId, rule }] },
  });
  if (!response.ok()) throw new Error(`setting unidentified rule failed: ${response.status()} ${await response.text()}`);
}

export interface SeedObservation {
  cameraId: string;
  zoneId: string;
  trackId?: string;
  aprilTags?: number[];
  /** Bottom-centre lands in seedZone's default rect (x 0.1–0.5, y 0.1–0.5) on a 1000×1000 frame. */
  personBox?: [number, number, number, number];
  enteredFromOutside?: boolean;
  framesInside?: number;
  dwellMs?: number;
}

/**
 * Posts a restricted-area observation the way the browser pipeline would.
 *
 * The suite can't drive a real person across a webcam in CI, so it feeds the
 * server the same CV facts the observer produces and asserts on what the server
 * decides — which is the whole of the policy behaviour under test.
 */
export async function postObservation(api: APIRequestContext, observation: SeedObservation) {
  const response = await api.post('/api/vision/observations', {
    data: {
      cameraId: observation.cameraId,
      zoneId: observation.zoneId,
      trackId: observation.trackId ?? 'e2e-track-1',
      frame: { width: 1000, height: 1000 },
      personBox: observation.personBox ?? [300, 100, 100, 300],
      enteredFromOutside: observation.enteredFromOutside ?? true,
      framesInside: observation.framesInside ?? 5,
      dwellMs: observation.dwellMs ?? 2000,
      aprilTags: observation.aprilTags ?? [],
      snapshot: 'data:image/jpeg;base64,AAAA',
    },
  });
  if (!response.ok()) throw new Error(`posting observation failed: ${response.status()} ${await response.text()}`);
  return (await response.json()) as { status: string; outcome?: string; rejection?: string };
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
