import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, jsonHeaders, readJson } from './support/factories.js';
import { resolveIdentityFromTags } from '../src/modules/policy/identityResolution.service.js';

/**
 * The identity resolution matrix, exercised directly.
 *
 * This is the one place a camera decides *who* it is looking at, and the whole
 * of policy hangs off it, so every failure mode gets its own case. People are
 * seeded straight into the store with explicit AprilTag ids: the public API
 * auto-allocates tags, but resolution is being tested against a *known* tag →
 * person mapping, so the fixtures set the tags directly.
 */

let server: TestServer;
let adminCookie: string;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.stop();
});

let roleId: string;

async function createRole(key: string, active = true): Promise<string> {
  const role = await readJson<{ _id: string }>(
    await fetch(`${server.baseUrl}/api/roles`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ key, name: key, permissions: { actions: [] } }),
    }),
  );
  if (!active) {
    await fetch(`${server.baseUrl}/api/roles/${role._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ active: false }),
    });
  }
  return role._id;
}

async function createPerson(input: { name: string; roleId: string; aprilTagId?: number; active?: boolean; loraDeviceId?: string }): Promise<string> {
  const { Person } = await import('../src/modules/identity/person.model.js');
  const person = await Person.create({
    name: input.name,
    roleId: input.roleId,
    active: input.active ?? true,
    aprilTagId: input.aprilTagId ?? null,
    loraDeviceId: input.loraDeviceId ?? null,
  });
  return String(person._id);
}

beforeEach(async () => {
  await server.reset();
  await server.createUser({ ...TEST_ADMIN, role: 'admin' });
  adminCookie = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);
  roleId = await createRole('staff');
});

describe('identity resolution: from AprilTags alone', () => {
  it('no tag at all is unidentified — no_apriltag', async () => {
    const result = await resolveIdentityFromTags([]);
    assert.equal(result.subject, 'unidentified_person');
    assert.equal(result.unidentifiedReason, 'no_apriltag');
    assert.equal(result.person, null);
  });

  it('a tag that belongs to nobody is unregistered_apriltag', async () => {
    const result = await resolveIdentityFromTags([999]);
    assert.equal(result.subject, 'unidentified_person');
    assert.equal(result.unidentifiedReason, 'unregistered_apriltag');
  });

  it('a single active person with an active role is identified', async () => {
    await createPerson({ name: 'Alice', roleId, aprilTagId: 7 });
    const result = await resolveIdentityFromTags([7]);
    assert.equal(result.subject, 'person');
    assert.equal(result.person?.name, 'Alice');
    assert.equal(result.role?.key, 'staff');
    assert.equal(result.aprilTagId, 7);
    assert.equal(result.unidentifiedReason, null);
  });

  it('two distinct registered people on one body is ambiguous_apriltag', async () => {
    await createPerson({ name: 'Alice', roleId, aprilTagId: 7 });
    await createPerson({ name: 'Bob', roleId, aprilTagId: 8 });
    const result = await resolveIdentityFromTags([7, 8]);
    assert.equal(result.subject, 'unidentified_person');
    assert.equal(result.unidentifiedReason, 'ambiguous_apriltag');
  });

  it('a deactivated person grants nothing — inactive_person', async () => {
    await createPerson({ name: 'Alice', roleId, aprilTagId: 7, active: false });
    const result = await resolveIdentityFromTags([7]);
    assert.equal(result.subject, 'unidentified_person');
    assert.equal(result.unidentifiedReason, 'inactive_person');
    // The tag is still recorded so the audit trail can say which badge it was.
    assert.equal(result.aprilTagId, 7);
  });

  it('a deactivated role grants nothing — inactive_role', async () => {
    const retired = await createRole('retired_guard', false);
    await createPerson({ name: 'Carol', roleId: retired, aprilTagId: 7 });
    const result = await resolveIdentityFromTags([7]);
    assert.equal(result.subject, 'unidentified_person');
    assert.equal(result.unidentifiedReason, 'inactive_role');
  });

  it('a LoRa device never identifies anyone: a wristband with no tag is still no_apriltag', async () => {
    // Alice carries a registered wristband but no camera-visible tag is decoded.
    await createPerson({ name: 'Alice', roleId, aprilTagId: 7, loraDeviceId: 'wrist-1' });
    const result = await resolveIdentityFromTags([]);
    assert.equal(result.subject, 'unidentified_person');
    assert.equal(result.unidentifiedReason, 'no_apriltag');
  });
});
