import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_OPERATOR, jsonHeaders, readJson } from './support/factories.js';

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

describe('authentication', () => {
  it('rejects unauthenticated requests to admin routes with 401', async () => {
    const paths = ['/api/cameras', '/api/vision/alerts', '/api/vision/alerts/counts', '/api/vision/settings', '/api/auth/me'];
    for (const path of paths) {
      const response = await fetch(`${server.baseUrl}${path}`);
      assert.equal(response.status, 401, `${path} should require authentication`);
    }
  });

  it('leaves health public', async () => {
    const response = await fetch(`${server.baseUrl}/api/health`);
    assert.equal(response.status, 200);
  });

  it('rejects a wrong password and an unknown email identically', async () => {
    const wrongPassword = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: TEST_ADMIN.email, password: 'not-the-password' }),
    });
    const unknownEmail = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: 'nobody@example.test', password: TEST_ADMIN.password }),
    });

    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    // Identical bodies: differing responses would let anyone enumerate accounts.
    assert.deepEqual(await wrongPassword.json(), await unknownEmail.json());
  });

  it('issues an httpOnly session cookie on login and never returns the hash', async () => {
    const response = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }),
    });

    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /HttpOnly/i);

    const body = await readJson<{ email: string; role: string; passwordHash?: string; password?: string }>(response);
    assert.equal(body.email, TEST_ADMIN.email);
    assert.equal(body.role, 'admin');
    assert.equal(body.passwordHash, undefined);
    assert.equal(body.password, undefined);
  });

  it('accepts the session on subsequent requests', async () => {
    const response = await fetch(`${server.baseUrl}/api/auth/me`, { headers: { Cookie: adminCookie } });
    assert.equal(response.status, 200);
    assert.equal((await readJson<{ email: string }>(response)).email, TEST_ADMIN.email);
  });

  it('regenerates the session id on login so a pre-login id cannot be reused', async () => {
    const first = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);
    const second = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);
    assert.notEqual(first, second);
  });

  it('invalidates the session on logout', async () => {
    const cookie = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);
    const logout = await fetch(`${server.baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(logout.status, 204);

    const replayed = await fetch(`${server.baseUrl}/api/cameras`, { headers: { Cookie: cookie } });
    assert.equal(replayed.status, 401, 'a destroyed session must not still work');
  });

  it('stores passwords hashed with scrypt, never in plain text', async () => {
    const mongoose = (await import('mongoose')).default;
    const user = await mongoose.connection.collection('users').findOne({ email: TEST_ADMIN.email });

    assert.ok(user);
    const hash = String(user.passwordHash);
    assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
    assert.ok(!hash.includes(TEST_ADMIN.password));
  });

  it('rejects a live session as soon as the account is deactivated', async () => {
    const mongoose = (await import('mongoose')).default;
    const before = await fetch(`${server.baseUrl}/api/cameras`, { headers: { Cookie: operatorCookie } });
    assert.equal(before.status, 200);

    await mongoose.connection.collection('users').updateOne({ email: TEST_OPERATOR.email }, { $set: { active: false } });

    const after = await fetch(`${server.baseUrl}/api/cameras`, { headers: { Cookie: operatorCookie } });
    assert.equal(after.status, 401, 'the user is re-read per request, so deactivation takes effect immediately');
  });

  it('changes a password only with the correct current one, and invalidates the old session', async () => {
    const cookie = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);

    const wrong = await fetch(`${server.baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'replacement-pw-1' }),
    });
    assert.equal(wrong.status, 400);

    const tooShort = await fetch(`${server.baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ currentPassword: TEST_ADMIN.password, newPassword: 'short' }),
    });
    assert.equal(tooShort.status, 400);

    const changed = await fetch(`${server.baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ currentPassword: TEST_ADMIN.password, newPassword: 'replacement-pw-1' }),
    });
    assert.equal(changed.status, 204);

    const oldPassword = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: TEST_ADMIN.email, password: TEST_ADMIN.password }),
    });
    assert.equal(oldPassword.status, 401);

    const newPassword = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: TEST_ADMIN.email, password: 'replacement-pw-1' }),
    });
    assert.equal(newPassword.status, 200);
  });
});

describe('authorization: operator versus admin', () => {
  it('lets an operator read cameras and alerts', async () => {
    for (const path of ['/api/cameras', '/api/vision/alerts', '/api/vision/alerts/counts']) {
      const response = await fetch(`${server.baseUrl}${path}`, { headers: { Cookie: operatorCookie } });
      assert.equal(response.status, 200, `operator should be able to read ${path}`);
    }
  });

  it('lets an operator triage alerts', async () => {
    const created = await fetch(`${server.baseUrl}/api/vision/alerts`, {
      method: 'POST',
      headers: jsonHeaders(operatorCookie),
      body: JSON.stringify({ cameraId: 'test-camera-alpha', type: 'unattended_object', confidence: 0.6, message: 'Test detection' }),
    });
    assert.equal(created.status, 201, 'an operator monitoring a camera submits detections');
    const alert = await readJson<{ _id: string }>(created);

    const status = await fetch(`${server.baseUrl}/api/vision/alerts/${alert._id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(operatorCookie),
      body: JSON.stringify({ status: 'acknowledged' }),
    });
    assert.equal(status.status, 200);
  });

  it('forbids an operator from admin-only actions with 403, not 401', async () => {
    const cases: Array<[string, RequestInit]> = [
      ['/api/cameras', { method: 'POST', body: JSON.stringify({ name: 'x', sourceType: 'local-device' }) }],
      ['/api/vision/settings', { method: 'PUT', body: JSON.stringify({ cameraId: 'test-camera-alpha' }) }],
      ['/api/vision/apriltag-mappings', { method: 'POST', body: JSON.stringify({ tagId: 1, label: 'x', loraDeviceId: 'y' }) }],
    ];

    for (const [path, init] of cases) {
      const response = await fetch(`${server.baseUrl}${path}`, { ...init, headers: jsonHeaders(operatorCookie) });
      assert.equal(response.status, 403, `${path} must be admin-only`);
    }
  });

  it('allows an admin the same actions', async () => {
    const camera = await fetch(`${server.baseUrl}/api/cameras`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ name: 'Test Camera Alpha', sourceType: 'local-device' }),
    });
    assert.equal(camera.status, 201);

    const settings = await fetch(`${server.baseUrl}/api/vision/settings`, {
      method: 'PUT',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ cameraId: 'test-camera-alpha', retentionDays: 7 }),
    });
    assert.equal(settings.status, 200);
  });

  it('records who created and updated a camera, and ignores a forged createdBy', async () => {
    const created = await fetch(`${server.baseUrl}/api/cameras`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ name: 'Test Camera Alpha', sourceType: 'local-device' }),
    });
    const camera = await readJson<{ _id: string; createdBy: string }>(created);

    const me = await readJson<{ id: string }>(
      await fetch(`${server.baseUrl}/api/auth/me`, { headers: { Cookie: adminCookie } }),
    );
    assert.equal(camera.createdBy, me.id);

    const forged = await fetch(`${server.baseUrl}/api/cameras/${camera._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ location: 'Lobby', createdBy: '000000000000000000000000' }),
    });
    const updated = await readJson<{ createdBy: string; location: string }>(forged);

    assert.equal(updated.createdBy, me.id, 'createdBy must not be writable from a request body');
    assert.equal(updated.location, 'Lobby', 'legitimate fields still apply');
  });
});
