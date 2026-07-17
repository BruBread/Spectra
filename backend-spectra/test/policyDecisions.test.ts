import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_CAMERA_ID, TEST_OPERATOR, jsonHeaders, readJson } from './support/factories.js';

interface TestDecision {
  _id: string;
  detectionType: string;
  cameraId: string;
  identityState: string;
  decision: string;
  reason: string;
  alertId: string | null;
}

let server: TestServer;
let adminCookie: string;
let operatorCookie: string;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.stop();
});

beforeEach(async () => {
  await server.reset();
  await server.createUser({ ...TEST_ADMIN, role: 'admin' });
  await server.createUser({ ...TEST_OPERATOR, role: 'operator' });
  adminCookie = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);
  operatorCookie = await server.login(TEST_OPERATOR.email, TEST_OPERATOR.password);
});

/**
 * Inserted directly: nothing writes decisions until policy evaluation lands.
 * These tests cover the storage shape and the read API that phase will rely
 * on.
 */
async function insertDecision(overrides: Record<string, unknown> = {}) {
  const mongoose = (await import('mongoose')).default;
  const { insertedId } = await mongoose.connection.collection('policydecisions').insertOne({
    detectionType: 'unattended_object',
    cameraId: TEST_CAMERA_ID,
    zoneId: null,
    zoneName: null,
    identityState: 'unidentified',
    personId: null,
    personName: null,
    roleId: null,
    roleKey: null,
    aprilTagId: null,
    loraDeviceId: null,
    loraCorroborated: false,
    loraLastSeenAt: null,
    decision: 'alert_created',
    reason: 'Test fixture decision',
    roleZoneAllowed: null,
    weaponExemptApplied: null,
    alertId: null,
    createdAt: new Date(),
    ...overrides,
  });
  return String(insertedId);
}

const list = async (query = '', cookie = adminCookie) =>
  readJson<TestDecision[]>(await fetch(`${server.baseUrl}/api/policy-decisions${query}`, { headers: { Cookie: cookie } }));

describe('policy decisions: read-only API', () => {
  it('returns an empty list — nothing is seeded or fabricated', async () => {
    assert.deepEqual(await list(), []);
  });

  it('is readable by admin and operator, and never anonymously', async () => {
    await insertDecision();
    assert.equal((await fetch(`${server.baseUrl}/api/policy-decisions`, { headers: { Cookie: adminCookie } })).status, 200);
    assert.equal((await fetch(`${server.baseUrl}/api/policy-decisions`, { headers: { Cookie: operatorCookie } })).status, 200);
    assert.equal((await fetch(`${server.baseUrl}/api/policy-decisions`)).status, 401);
  });

  it('exposes no way to create, edit or delete a decision', async () => {
    const id = await insertDecision();
    const cases: Array<[string, string]> = [
      ['POST', '/api/policy-decisions'],
      ['PATCH', `/api/policy-decisions/${id}`],
      ['PUT', `/api/policy-decisions/${id}`],
      ['DELETE', `/api/policy-decisions/${id}`],
    ];
    for (const [method, path] of cases) {
      const response = await fetch(`${server.baseUrl}${path}`, { method, headers: jsonHeaders(adminCookie), body: '{}' });
      assert.equal(response.status, 404, `${method} ${path} must not exist — an audit trail is not editable`);
    }
  });

  it('returns a decision by id, and 404s otherwise', async () => {
    const id = await insertDecision();
    const found = await fetch(`${server.baseUrl}/api/policy-decisions/${id}`, { headers: { Cookie: adminCookie } });
    assert.equal(found.status, 200);
    assert.equal((await readJson<TestDecision>(found))._id, id);

    const missing = await fetch(`${server.baseUrl}/api/policy-decisions/000000000000000000000000`, { headers: { Cookie: adminCookie } });
    assert.equal(missing.status, 404);
  });
});

describe('policy decisions: storage shape', () => {
  it('stores a suppression with no alert reference', async () => {
    // The case that matters most: a suppressed detection produces no alert, so
    // this record is the only evidence it happened.
    await insertDecision({
      decision: 'suppressed',
      identityState: 'identified',
      personName: 'Test Person',
      roleKey: 'security_guard',
      aprilTagId: 7,
      weaponExemptApplied: true,
      reason: 'Weapon exemption applied for security_guard via AprilTag 7',
      alertId: null,
    });

    const [decision] = await list('?decision=suppressed');
    assert.equal(decision.decision, 'suppressed');
    assert.equal(decision.alertId, null);
    assert.match(decision.reason, /exemption/);
  });

  it('stores a decision that created an alert, linked to it', async () => {
    const mongoose = (await import('mongoose')).default;
    const alertId = new mongoose.Types.ObjectId();
    await insertDecision({ decision: 'alert_created', alertId });

    const [decision] = await list('?decision=alert_created');
    assert.equal(String(decision.alertId), String(alertId));
  });

  it('accepts a retired detection type, since history may reference one', async () => {
    await insertDecision({ detectionType: 'drowning' });
    assert.equal((await list('?detectionType=drowning')).length, 1);
  });
});

describe('policy decisions: filtering', () => {
  it('filters by decision, identity state, camera and detection type', async () => {
    await insertDecision({ decision: 'alert_created', identityState: 'unidentified' });
    await insertDecision({ decision: 'suppressed', identityState: 'identified', detectionType: 'apriltag' });
    await insertDecision({ decision: 'alert_created', cameraId: 'test-camera-other' });

    assert.equal((await list('?decision=alert_created')).length, 2);
    assert.equal((await list('?decision=suppressed')).length, 1);
    assert.equal((await list('?identityState=identified')).length, 1);
    assert.equal((await list('?detectionType=apriltag')).length, 1);
    assert.equal((await list('?cameraId=test-camera-other')).length, 1);
  });

  it('filters by date range and returns newest first', async () => {
    await insertDecision({ createdAt: new Date('2020-01-01T00:00:00Z'), reason: 'old' });
    await insertDecision({ createdAt: new Date('2030-01-01T00:00:00Z'), reason: 'new' });

    const all = await list();
    assert.deepEqual(all.map((decision) => decision.reason), ['new', 'old']);
    assert.equal((await list('?from=2025-01-01T00:00:00Z')).length, 1);
    assert.equal((await list('?to=2025-01-01T00:00:00Z')).length, 1);
  });

  it('rejects an invalid filter rather than silently widening the audit view', async () => {
    const cases = ['decision=maybe', 'identityState=perhaps', 'detectionType=bogus', 'from=notadate', 'zoneId=not-an-id', 'personId=not-an-id'];
    for (const query of cases) {
      const response = await fetch(`${server.baseUrl}/api/policy-decisions?${query}`, { headers: { Cookie: adminCookie } });
      assert.equal(response.status, 400, `${query} should be rejected`);
    }
  });
});
