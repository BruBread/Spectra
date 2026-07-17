import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_OPERATOR, jsonHeaders, readJson, ttnUplinkBody } from './support/factories.js';

interface TestRole {
  _id: string;
  key: string;
  name: string;
  active: boolean;
  permissions: { actions: Array<{ action: string; zoneId: string | null; rule: string }> };
}

interface TestPerson {
  _id: string;
  name: string;
  active: boolean;
  notes: string;
  aprilTagId: number | null;
  loraDeviceId: string | null;
  roleId: { _id: string; key: string } | string;
  createdBy: string | null;
  updatedBy: string | null;
}

let server: TestServer;
let adminCookie: string;
let operatorCookie: string;
let guardRoleId: string;
let staffRoleId: string;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.stop();
});

/** Roles the suite owns — the real seeder is exercised separately below. */
async function createRole(key: string, name: string): Promise<string> {
  const response = await fetch(`${server.baseUrl}/api/roles`, {
    method: 'POST',
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ key, name }),
  });
  assert.equal(response.status, 201, `failed creating role ${key}`);
  return (await readJson<TestRole>(response))._id;
}

async function createPerson(body: Record<string, unknown>) {
  const response = await fetch(`${server.baseUrl}/api/people`, {
    method: 'POST',
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify(body),
  });
  return { status: response.status, person: await readJson<TestPerson & { error?: string }>(response) };
}

beforeEach(async () => {
  await server.reset();
  await server.createUser({ ...TEST_ADMIN, role: 'admin' });
  await server.createUser({ ...TEST_OPERATOR, role: 'operator' });
  adminCookie = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);
  operatorCookie = await server.login(TEST_OPERATOR.email, TEST_OPERATOR.password);
  guardRoleId = await createRole('security_guard', 'Security guard');
  staffRoleId = await createRole('staff', 'Staff');
});

describe('role seeding', () => {
  it('seeds exactly the two starting roles, with no permissions', async () => {
    const mongoose = (await import('mongoose')).default;
    await mongoose.connection.collection('roles').deleteMany({});

    const { seedRoles } = await import('../src/modules/identity/identity.seed.js');
    await seedRoles();

    const roles = await readJson<TestRole[]>(await fetch(`${server.baseUrl}/api/roles`, { headers: { Cookie: adminCookie } }));
    assert.deepEqual(
      roles.map((role) => role.key).sort(),
      ['security_guard', 'staff'],
      'exactly two roles, and nothing else',
    );
    assert.ok(roles.every((role) => role.active));
    // Restrictive by default: with no rules written, every action restricts.
    // Being permitted anywhere is an admin decision, not a starting state.
    assert.ok(roles.every((role) => role.permissions.actions.length === 0));
  });

  it('does not resurrect roles once any role exists', async () => {
    const { seedRoles } = await import('../src/modules/identity/identity.seed.js');
    await fetch(`${server.baseUrl}/api/roles/${staffRoleId}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ active: false }),
    });

    await seedRoles();

    const role = await readJson<TestRole>(await fetch(`${server.baseUrl}/api/roles/${staffRoleId}`, { headers: { Cookie: adminCookie } }));
    assert.equal(role.active, false, 'a deliberately deactivated role must stay deactivated');
  });
});

describe('roles: authorization', () => {
  it('lets a signed-in operator read roles', async () => {
    const response = await fetch(`${server.baseUrl}/api/roles`, { headers: { Cookie: operatorCookie } });
    assert.equal(response.status, 200);
  });

  it('forbids an operator from mutating roles', async () => {
    const cases: Array<[string, RequestInit]> = [
      ['/api/roles', { method: 'POST', body: JSON.stringify({ key: 'x', name: 'X' }) }],
      [`/api/roles/${staffRoleId}`, { method: 'PATCH', body: JSON.stringify({ name: 'Renamed' }) }],
      [`/api/roles/${staffRoleId}`, { method: 'DELETE' }],
    ];
    for (const [path, init] of cases) {
      const response = await fetch(`${server.baseUrl}${path}`, { ...init, headers: jsonHeaders(operatorCookie) });
      assert.equal(response.status, 403, `${init.method} ${path} must be admin-only`);
    }
  });

  it('rejects anonymous access', async () => {
    for (const path of ['/api/roles', '/api/people', '/api/lora-devices', '/api/zones', '/api/policy-decisions']) {
      const response = await fetch(`${server.baseUrl}${path}`);
      assert.equal(response.status, 401, `${path} must require a session`);
    }
  });
});

describe('roles: validation and lifecycle', () => {
  it('rejects a malformed or duplicate key', async () => {
    const bad = await fetch(`${server.baseUrl}/api/roles`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ key: 'Not A Key', name: 'X' }),
    });
    assert.equal(bad.status, 400);

    const duplicate = await fetch(`${server.baseUrl}/api/roles`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ key: 'staff', name: 'Staff again' }),
    });
    assert.equal(duplicate.status, 409);
  });

  it('refuses the reserved unidentified_person key', async () => {
    const response = await fetch(`${server.baseUrl}/api/roles`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ key: 'unidentified_person', name: 'Sneaky' }),
    });
    // A role with this key would make every decision ambiguous: did the rule
    // come from somebody's role, or from the unidentified-person policy?
    assert.equal(response.status, 400);
    assert.match((await readJson<{ error: string }>(response)).error, /reserved/i);
  });

  it('supports custom roles beyond the seeded two', async () => {
    const response = await fetch(`${server.baseUrl}/api/roles`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ key: 'contractor', name: 'Contractor', description: 'Third-party contractor' }),
    });
    assert.equal(response.status, 201);
    assert.equal((await readJson<TestRole>(response)).key, 'contractor');
  });

  it('refuses to change a role key', async () => {
    const response = await fetch(`${server.baseUrl}/api/roles/${staffRoleId}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ key: 'renamed' }),
    });
    assert.equal(response.status, 400, 'recorded decisions refer to the key');
  });

  it('deactivates a role and filters by active state', async () => {
    await fetch(`${server.baseUrl}/api/roles/${staffRoleId}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ active: false }),
    });

    const active = await readJson<TestRole[]>(await fetch(`${server.baseUrl}/api/roles?active=true`, { headers: { Cookie: adminCookie } }));
    assert.deepEqual(active.map((role) => role.key), ['security_guard']);
  });

  it('refuses to delete a role assigned to someone, and allows it once unused', async () => {
    const { person } = await createPerson({ name: 'Test Person One', roleId: staffRoleId });

    const blocked = await fetch(`${server.baseUrl}/api/roles/${staffRoleId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    assert.equal(blocked.status, 409, 'deleting would orphan a person');
    const body = await readJson<{ usage: { people: number } }>(blocked);
    assert.equal(body.usage.people, 1);

    // Move them off the role, and it becomes deletable.
    await fetch(`${server.baseUrl}/api/people/${person._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ roleId: guardRoleId }),
    });

    const allowed = await fetch(`${server.baseUrl}/api/roles/${staffRoleId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    assert.equal(allowed.status, 204);
  });
});

describe('role permissions', () => {
  async function createZone(name: string) {
    const camera = await readJson<{ _id: string }>(
      await fetch(`${server.baseUrl}/api/cameras`, {
        method: 'POST',
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({ name: `Camera for ${name}`, sourceType: 'local-device' }),
      }),
    );
    const zone = await readJson<{ _id: string }>(
      await fetch(`${server.baseUrl}/api/zones`, {
        method: 'POST',
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({ name, cameraId: camera._id, rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } }),
      }),
    );
    return zone._id;
  }

  it('writes a per-zone restricted_area rule', async () => {
    const zoneId = await createZone('Test Restricted Area');

    const response = await fetch(`${server.baseUrl}/api/roles/${guardRoleId}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        permissions: { actions: [{ action: 'restricted_area', zoneId, rule: 'allow' }] },
      }),
    });
    assert.equal(response.status, 200);

    const role = await readJson<TestRole>(response);
    assert.equal(role.permissions.actions.length, 1);
    assert.equal(role.permissions.actions[0].action, 'restricted_area');
    assert.equal(String(role.permissions.actions[0].zoneId), zoneId);
    assert.equal(role.permissions.actions[0].rule, 'allow');
  });

  it('stores an explicit restrict, which is not the same as saying nothing', async () => {
    const zoneId = await createZone('Test Explicit Deny');
    const response = await fetch(`${server.baseUrl}/api/roles/${guardRoleId}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        permissions: { actions: [{ action: 'restricted_area', zoneId, rule: 'restrict' }] },
      }),
    });
    assert.equal(response.status, 200);
    // Same effect as no rule, but it records that somebody considered the zone
    // and decided — worth keeping.
    assert.equal((await readJson<TestRole>(response)).permissions.actions[0].rule, 'restrict');
  });

  it('refuses a rule for an action nobody may configure, quoting the catalog', async () => {
    const cases: Array<[string, RegExp]> = [
      // No detector exists, so a rule would apply to nothing.
      ['possible_weapon', /not active yet/i],
      // Ownership can't be established once the owner walks away.
      ['unattended_object', /ownership cannot be established/i],
    ];

    for (const [action, expected] of cases) {
      const response = await fetch(`${server.baseUrl}/api/roles/${guardRoleId}`, {
        method: 'PATCH',
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({ permissions: { actions: [{ action, zoneId: null, rule: 'allow' }] } }),
      });
      assert.equal(response.status, 400, `${action} must not be configurable`);
      assert.match((await readJson<{ error: string }>(response)).error, expected);
    }
  });

  it('rejects a rule naming a zone that does not exist', async () => {
    const response = await fetch(`${server.baseUrl}/api/roles/${guardRoleId}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        permissions: { actions: [{ action: 'restricted_area', zoneId: '000000000000000000000000', rule: 'allow' }] },
      }),
    });
    assert.equal(response.status, 400, 'a rule for a non-existent zone would read as "allowed" but do nothing');
  });

  it('rejects malformed rules', async () => {
    const cases: unknown[] = [
      { actions: 'nope' },
      { actions: [{ action: 'teleportation', zoneId: null, rule: 'allow' }] },
      { actions: [{ action: 'restricted_area', zoneId: 'not-an-id', rule: 'allow' }] },
      // Zone-scoped: a restricted_area rule with no zone applies to nothing.
      { actions: [{ action: 'restricted_area', zoneId: null, rule: 'allow' }] },
      { actions: [{ action: 'restricted_area', zoneId: '000000000000000000000000', rule: 'maybe' }] },
      {},
    ];
    for (const permissions of cases) {
      const response = await fetch(`${server.baseUrl}/api/roles/${guardRoleId}`, {
        method: 'PATCH',
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({ permissions }),
      });
      assert.equal(response.status, 400, `should reject ${JSON.stringify(permissions)}`);
    }
  });

  it('rejects two rules for the same action and zone', async () => {
    const zoneId = await createZone('Test Duplicate Zone');
    const response = await fetch(`${server.baseUrl}/api/roles/${guardRoleId}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({
        permissions: {
          actions: [
            { action: 'restricted_area', zoneId, rule: 'allow' },
            { action: 'restricted_area', zoneId, rule: 'restrict' },
          ],
        },
      }),
    });
    assert.equal(response.status, 400, 'whichever won would be arbitrary');
  });
});

describe('people', () => {
  it('creates a person with a role and records who did it', async () => {
    const { status, person } = await createPerson({ name: 'Test Person One', roleId: staffRoleId, notes: 'fixture' });
    assert.equal(status, 201);
    assert.equal(person.name, 'Test Person One');
    assert.equal(person.active, true);
    assert.equal(person.aprilTagId, null);
    assert.equal(person.loraDeviceId, null);

    const me = await readJson<{ id: string }>(await fetch(`${server.baseUrl}/api/auth/me`, { headers: { Cookie: adminCookie } }));
    assert.equal(person.createdBy, me.id);
    assert.equal(person.updatedBy, me.id);
  });

  it('requires a name and a real role', async () => {
    assert.equal((await createPerson({ roleId: staffRoleId })).status, 400);
    assert.equal((await createPerson({ name: 'No Role' })).status, 400);
    assert.equal((await createPerson({ name: 'Bad Role', roleId: 'not-an-id' })).status, 400);
    assert.equal((await createPerson({ name: 'Missing Role', roleId: '000000000000000000000000' })).status, 400);
  });

  it('forbids an operator from creating or editing people', async () => {
    const created = await fetch(`${server.baseUrl}/api/people`, {
      method: 'POST',
      headers: jsonHeaders(operatorCookie),
      body: JSON.stringify({ name: 'Nope', roleId: staffRoleId }),
    });
    assert.equal(created.status, 403);
  });

  it('reassigns a role', async () => {
    const { person } = await createPerson({ name: 'Test Person One', roleId: staffRoleId });

    const response = await fetch(`${server.baseUrl}/api/people/${person._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ roleId: guardRoleId }),
    });
    assert.equal(response.status, 200);

    const updated = await readJson<TestPerson>(response);
    const role = updated.roleId as { _id: string; key: string };
    assert.equal(role.key, 'security_guard');
  });

  it('deactivates rather than deletes', async () => {
    const { person } = await createPerson({ name: 'Test Person One', roleId: staffRoleId });

    const response = await fetch(`${server.baseUrl}/api/people/${person._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ active: false }),
    });
    assert.equal((await readJson<TestPerson>(response)).active, false);

    const remaining = await readJson<TestPerson[]>(await fetch(`${server.baseUrl}/api/people`, { headers: { Cookie: adminCookie } }));
    assert.equal(remaining.length, 1, 'the record still exists');

    const activeOnly = await readJson<TestPerson[]>(await fetch(`${server.baseUrl}/api/people?active=true`, { headers: { Cookie: adminCookie } }));
    assert.equal(activeOnly.length, 0);

    // No delete route exists at all.
    const deleted = await fetch(`${server.baseUrl}/api/people/${person._id}`, { method: 'DELETE', headers: { Cookie: adminCookie } });
    assert.equal(deleted.status, 404);
  });

  it('filters by role and name', async () => {
    await createPerson({ name: 'Alice Guard', roleId: guardRoleId });
    await createPerson({ name: 'Bob Staff', roleId: staffRoleId });

    const byRole = await readJson<TestPerson[]>(await fetch(`${server.baseUrl}/api/people?roleId=${guardRoleId}`, { headers: { Cookie: adminCookie } }));
    assert.deepEqual(byRole.map((person) => person.name), ['Alice Guard']);

    const byName = await readJson<TestPerson[]>(await fetch(`${server.baseUrl}/api/people?q=bob`, { headers: { Cookie: adminCookie } }));
    assert.deepEqual(byName.map((person) => person.name), ['Bob Staff']);
  });
});

describe('credential uniqueness', () => {
  it('allows many people with no AprilTag and no LoRa device', async () => {
    // The trap a plain `sparse` unique index would fall into: these all store
    // an explicit null, and nulls must not collide with each other.
    for (const name of ['Person A', 'Person B', 'Person C']) {
      const { status } = await createPerson({ name, roleId: staffRoleId });
      assert.equal(status, 201, `${name} should be creatable without credentials`);
    }
  });

  it('rejects a duplicate AprilTag ID', async () => {
    assert.equal((await createPerson({ name: 'Tag Holder', roleId: staffRoleId, aprilTagId: 7 })).status, 201);

    const duplicate = await createPerson({ name: 'Tag Thief', roleId: staffRoleId, aprilTagId: 7 });
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.person.error ?? '', /AprilTag ID/);
  });

  it('rejects a duplicate LoRa device ID', async () => {
    assert.equal((await createPerson({ name: 'Band Holder', roleId: staffRoleId, loraDeviceId: 'test-band-1' })).status, 201);

    const duplicate = await createPerson({ name: 'Band Thief', roleId: staffRoleId, loraDeviceId: 'test-band-1' });
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.person.error ?? '', /LoRa device ID/);
  });

  it('rejects a duplicate credential on update too', async () => {
    await createPerson({ name: 'Tag Holder', roleId: staffRoleId, aprilTagId: 7 });
    const { person } = await createPerson({ name: 'Other Person', roleId: staffRoleId });

    const response = await fetch(`${server.baseUrl}/api/people/${person._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ aprilTagId: 7 }),
    });
    assert.equal(response.status, 409);
  });

  it('frees a credential when it is cleared, and validates its shape', async () => {
    const { person } = await createPerson({ name: 'Tag Holder', roleId: staffRoleId, aprilTagId: 7 });

    await fetch(`${server.baseUrl}/api/people/${person._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ aprilTagId: null }),
    });

    const reuse = await createPerson({ name: 'New Holder', roleId: staffRoleId, aprilTagId: 7 });
    assert.equal(reuse.status, 201, 'a released tag can be reissued');

    assert.equal((await createPerson({ name: 'Bad Tag', roleId: staffRoleId, aprilTagId: -1 })).status, 400);
    assert.equal((await createPerson({ name: 'Bad Tag', roleId: staffRoleId, aprilTagId: 1.5 })).status, 400);
    assert.equal((await createPerson({ name: 'Bad Band', roleId: staffRoleId, loraDeviceId: '   ' })).status, 400);
  });

  it('allows an AprilTag with no LoRa device, and a LoRa device with no AprilTag', async () => {
    const badgeOnly = await createPerson({ name: 'Badge Only', roleId: guardRoleId, aprilTagId: 11 });
    assert.equal(badgeOnly.status, 201);
    assert.equal(badgeOnly.person.loraDeviceId, null, 'a badge alone is enough to be identified by a camera');

    const bandOnly = await createPerson({ name: 'Band Only', roleId: staffRoleId, loraDeviceId: 'test-band-2' });
    assert.equal(bandOnly.status, 201);
    assert.equal(bandOnly.person.aprilTagId, null, 'a band alone is storable, but can never prove camera identity');
  });
});

describe('LoRa device selection', () => {
  async function seedReading(deviceId: string) {
    const response = await fetch(`${server.baseUrl}/api/lorawan/webhook/ttn`, {
      method: 'POST',
      headers: { ...jsonHeaders(), 'X-Webhook-Secret': 'test-ttn-secret' },
      body: JSON.stringify(ttnUplinkBody(deviceId)),
    });
    assert.equal(response.status, 204);
  }

  interface KnownDevice {
    deviceId: string;
    source: string;
    readingCount: number;
    assignedTo: { personId: string; personName: string } | null;
  }

  const listDevices = async () =>
    readJson<KnownDevice[]>(await fetch(`${server.baseUrl}/api/lora-devices`, { headers: { Cookie: adminCookie } }));

  it('lists device ids seen in real readings, unassigned by default', async () => {
    await seedReading('test-device-aaa');
    await seedReading('test-device-bbb');

    const devices = await listDevices();
    assert.deepEqual(devices.map((device) => device.deviceId).sort(), ['test-device-aaa', 'test-device-bbb']);
    assert.ok(devices.every((device) => device.source === 'reading'));
    assert.ok(devices.every((device) => device.assignedTo === null));
    assert.ok(devices.every((device) => device.readingCount === 1));
  });

  it('reports which device is already assigned, and to whom', async () => {
    await seedReading('test-device-aaa');
    const { person } = await createPerson({ name: 'Band Wearer', roleId: staffRoleId, loraDeviceId: 'test-device-aaa' });

    const [device] = await listDevices();
    assert.equal(device.assignedTo?.personId, person._id);
    assert.equal(device.assignedTo?.personName, 'Band Wearer');
  });

  it('includes a manually registered id that has never reported', async () => {
    await seedReading('test-device-aaa');
    await createPerson({ name: 'Future Hardware', roleId: staffRoleId, loraDeviceId: 'not-yet-deployed-1' });

    const devices = await listDevices();
    const manual = devices.find((device) => device.deviceId === 'not-yet-deployed-1');

    assert.ok(manual, 'a manually registered id must not vanish from the picker');
    assert.equal(manual.source, 'manual');
    assert.equal(manual.readingCount, 0);
    assert.equal(manual.assignedTo?.personName, 'Future Hardware');
  });

  it('is readable by an operator but reflects no fabricated devices', async () => {
    const response = await fetch(`${server.baseUrl}/api/lora-devices`, { headers: { Cookie: operatorCookie } });
    assert.equal(response.status, 200);
    assert.deepEqual(await readJson<KnownDevice[]>(response), [], 'nothing is seeded — the list is empty until real readings arrive');
  });
});
