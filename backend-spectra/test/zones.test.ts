import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_OPERATOR, jsonHeaders, readJson } from './support/factories.js';

interface TestZone {
  _id: string;
  name: string;
  cameraId: string;
  rect: { x: number; y: number; width: number; height: number };
  active: boolean;
  createdBy: string | null;
  updatedBy: string | null;
}

const VALID_RECT = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };

let server: TestServer;
let adminCookie: string;
let operatorCookie: string;
let cameraId: string;

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

  const camera = await readJson<{ _id: string }>(
    await fetch(`${server.baseUrl}/api/cameras`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ name: 'Test Zone Camera', sourceType: 'local-device' }),
    }),
  );
  cameraId = camera._id;
});

async function createZone(body: Record<string, unknown>) {
  const response = await fetch(`${server.baseUrl}/api/zones`, {
    method: 'POST',
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ name: 'Test Restricted Area', cameraId, rect: VALID_RECT, ...body }),
  });
  return { status: response.status, zone: await readJson<TestZone & { error?: string }>(response) };
}

describe('zones: creation and validation', () => {
  it('creates a named zone on a camera and records who did it', async () => {
    const { status, zone } = await createZone({});
    assert.equal(status, 201);
    assert.equal(zone.name, 'Test Restricted Area');
    assert.equal(String(zone.cameraId), cameraId);
    assert.deepEqual(zone.rect, VALID_RECT);
    assert.equal(zone.active, true);

    const me = await readJson<{ id: string }>(await fetch(`${server.baseUrl}/api/auth/me`, { headers: { Cookie: adminCookie } }));
    assert.equal(zone.createdBy, me.id);
  });

  it('requires a name and a real camera', async () => {
    assert.equal((await createZone({ name: '' })).status, 400);
    assert.equal((await createZone({ cameraId: 'not-an-id' })).status, 400);
    assert.equal((await createZone({ cameraId: '000000000000000000000000' })).status, 400);
  });

  it('rejects a rectangle that is not a usable region of the frame', async () => {
    const cases: Array<[string, unknown]> = [
      ['missing', undefined],
      ['not an object', 'nope'],
      ['non-numeric', { x: 'a', y: 0, width: 0.5, height: 0.5 }],
      ['negative', { x: -0.1, y: 0, width: 0.5, height: 0.5 }],
      ['beyond the frame', { x: 0, y: 0, width: 1.5, height: 0.5 }],
      ['zero area', { x: 0.1, y: 0.1, width: 0, height: 0.5 }],
      ['overflows the frame', { x: 0.8, y: 0.1, width: 0.5, height: 0.2 }],
    ];
    for (const [label, rect] of cases) {
      const { status } = await createZone({ rect });
      assert.equal(status, 400, `should reject a rect that is ${label}`);
    }
  });

  it('refuses two zones with the same name on one camera', async () => {
    assert.equal((await createZone({})).status, 201);
    assert.equal((await createZone({})).status, 409);
  });

  it('allows the same zone name on a different camera', async () => {
    assert.equal((await createZone({})).status, 201);

    const other = await readJson<{ _id: string }>(
      await fetch(`${server.baseUrl}/api/cameras`, {
        method: 'POST',
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({ name: 'Second Test Camera', sourceType: 'local-device' }),
      }),
    );
    assert.equal((await createZone({ cameraId: other._id })).status, 201);
  });
});

describe('zones: authorization', () => {
  it('lets an operator read but not mutate', async () => {
    const { zone } = await createZone({});

    assert.equal((await fetch(`${server.baseUrl}/api/zones`, { headers: { Cookie: operatorCookie } })).status, 200);

    const cases: Array<[string, RequestInit]> = [
      ['/api/zones', { method: 'POST', body: JSON.stringify({ name: 'x', cameraId, rect: VALID_RECT }) }],
      [`/api/zones/${zone._id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Renamed' }) }],
      [`/api/zones/${zone._id}`, { method: 'DELETE' }],
    ];
    for (const [path, init] of cases) {
      const response = await fetch(`${server.baseUrl}${path}`, { ...init, headers: jsonHeaders(operatorCookie) });
      assert.equal(response.status, 403, `${init.method} ${path} must be admin-only`);
    }
  });
});

describe('zones: update and archive', () => {
  it('renames, moves the rectangle, and archives', async () => {
    const { zone } = await createZone({});

    const renamed = await fetch(`${server.baseUrl}/api/zones/${zone._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ name: 'Renamed Area', rect: { x: 0, y: 0, width: 1, height: 1 } }),
    });
    const updated = await readJson<TestZone>(renamed);
    assert.equal(updated.name, 'Renamed Area');
    assert.deepEqual(updated.rect, { x: 0, y: 0, width: 1, height: 1 });

    const archived = await fetch(`${server.baseUrl}/api/zones/${zone._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ active: false }),
    });
    assert.equal((await readJson<TestZone>(archived)).active, false);

    const activeOnly = await readJson<TestZone[]>(await fetch(`${server.baseUrl}/api/zones?active=true`, { headers: { Cookie: adminCookie } }));
    assert.equal(activeOnly.length, 0);
  });

  it('refuses to move a zone to another camera', async () => {
    const { zone } = await createZone({});
    const response = await fetch(`${server.baseUrl}/api/zones/${zone._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ cameraId: '000000000000000000000000' }),
    });
    assert.equal(response.status, 400, 'a rectangle only means something on its own camera');
  });

  it('filters by camera', async () => {
    await createZone({});
    const other = await readJson<{ _id: string }>(
      await fetch(`${server.baseUrl}/api/cameras`, {
        method: 'POST',
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({ name: 'Other Camera', sourceType: 'local-device' }),
      }),
    );
    await createZone({ cameraId: other._id, name: 'Other Area' });

    const zones = await readJson<TestZone[]>(await fetch(`${server.baseUrl}/api/zones?cameraId=${cameraId}`, { headers: { Cookie: adminCookie } }));
    assert.deepEqual(zones.map((zone) => zone.name), ['Test Restricted Area']);
  });

  it('404s for a zone that does not exist', async () => {
    for (const init of [{ method: 'GET' }, { method: 'PATCH', body: '{}' }, { method: 'DELETE' }]) {
      const response = await fetch(`${server.baseUrl}/api/zones/000000000000000000000000`, {
        ...init,
        headers: jsonHeaders(adminCookie),
      });
      assert.equal(response.status, 404);
    }
  });
});

describe('zones: deletion', () => {
  it('deletes a zone nothing depends on, and pulls it out of role permissions', async () => {
    const { zone } = await createZone({});
    const role = await readJson<{ _id: string }>(
      await fetch(`${server.baseUrl}/api/roles`, {
        method: 'POST',
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({ key: 'test_role', name: 'Test role' }),
      }),
    );
    await fetch(`${server.baseUrl}/api/roles/${role._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ permissions: { weaponExempt: false, zones: [{ zoneId: zone._id, allowed: true }] } }),
    });

    const deleted = await fetch(`${server.baseUrl}/api/zones/${zone._id}`, { method: 'DELETE', headers: { Cookie: adminCookie } });
    assert.equal(deleted.status, 204);

    // The permission must not linger pointing at nothing.
    const after = await readJson<{ permissions: { zones: unknown[] } }>(
      await fetch(`${server.baseUrl}/api/roles/${role._id}`, { headers: { Cookie: adminCookie } }),
    );
    assert.equal(after.permissions.zones.length, 0, 'a dangling permission would be unreadable and unsafe');
  });

  it('refuses to delete a zone named by a recorded policy decision', async () => {
    const { zone } = await createZone({});

    // Written directly: policy evaluation is a later phase, but the audit
    // trail it will produce must already be protected from deletion.
    const mongoose = (await import('mongoose')).default;
    await mongoose.connection.collection('policydecisions').insertOne({
      detectionType: 'unattended_object',
      cameraId,
      zoneId: new mongoose.Types.ObjectId(zone._id),
      identityState: 'unidentified',
      loraCorroborated: false,
      decision: 'alert_created',
      reason: 'fixture',
      createdAt: new Date(),
    });

    const response = await fetch(`${server.baseUrl}/api/zones/${zone._id}`, { method: 'DELETE', headers: { Cookie: adminCookie } });
    assert.equal(response.status, 409);

    const body = await readJson<{ error: string; usage: { policyDecisions: number } }>(response);
    assert.match(body.error, /Deactivate it instead/);
    assert.equal(body.usage.policyDecisions, 1);

    // Archiving is the way out.
    const archived = await fetch(`${server.baseUrl}/api/zones/${zone._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ active: false }),
    });
    assert.equal(archived.status, 200);
  });
});
