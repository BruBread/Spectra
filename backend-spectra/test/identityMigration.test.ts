import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';

interface StoredRole {
  key: string;
  permissions: {
    actions?: Array<{ action: string; zoneId: unknown; rule: string }>;
    zones?: unknown;
    weaponExempt?: unknown;
  };
}

let server: TestServer;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.stop();
});

beforeEach(async () => {
  await server.reset();
});

/** A real ObjectId, which is what legacy documents actually hold. */
async function oid(hex: string) {
  const mongoose = (await import('mongoose')).default;
  return new mongoose.Types.ObjectId(hex);
}

/** Writes a role in the pre-catalog shape, bypassing the current schema. */
async function insertLegacyRole(key: string, permissions: Record<string, unknown>) {
  const mongoose = (await import('mongoose')).default;
  await mongoose.connection.collection('roles').insertOne({
    key,
    name: key,
    description: '',
    active: true,
    permissions,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function readRole(key: string): Promise<StoredRole> {
  const mongoose = (await import('mongoose')).default;
  return (await mongoose.connection.collection('roles').findOne({ key })) as unknown as StoredRole;
}

async function migrate() {
  const { migrateRolePermissionsToActionRules } = await import('../src/modules/identity/identity.migration.js');
  await migrateRolePermissionsToActionRules();
}

const zoneA = '507f1f77bcf86cd799439011';
const zoneB = '507f1f77bcf86cd799439012';

describe('role permission migration', () => {
  it('turns allowed zones into restricted_area allow rules', async () => {
    await insertLegacyRole('legacy_guard', {
      weaponExempt: false,
      zones: [{ zoneId: await oid(zoneA), allowed: true }],
    });
    await migrate();

    const role = await readRole('legacy_guard');
    assert.deepEqual(
      role.permissions.actions?.map((rule) => ({ action: rule.action, rule: rule.rule, zoneId: String(rule.zoneId) })),
      [{ action: 'restricted_area', rule: 'allow', zoneId: zoneA }],
    );
  });

  it('preserves an explicit denial rather than dropping it as redundant', async () => {
    await insertLegacyRole('legacy_denied', { zones: [{ zoneId: await oid(zoneA), allowed: false }] });
    await migrate();

    const role = await readRole('legacy_denied');
    // Same effect as no rule, but somebody decided it. `restrict` is now
    // expressible, so the intent survives.
    assert.equal(role.permissions.actions?.[0].rule, 'restrict');
  });

  it('carries a real weapon exemption across instead of silently dropping it', async () => {
    await insertLegacyRole('legacy_exempt', { weaponExempt: true, zones: [] });
    await migrate();

    const role = await readRole('legacy_exempt');
    // The migration preserves an existing exemption as an explicit global
    // possible_weapon allow rule — the same shape the API now writes directly.
    assert.deepEqual(
      role.permissions.actions,
      [{ action: 'possible_weapon', zoneId: null, rule: 'allow' }],
    );
  });

  it('does not invent a rule from weaponExempt: false', async () => {
    await insertLegacyRole('legacy_plain', { weaponExempt: false, zones: [] });
    await migrate();

    // False was the old schema's default, not a decision anyone made.
    assert.deepEqual((await readRole('legacy_plain')).permissions.actions, []);
  });

  it('removes the legacy fields so nothing reads them again', async () => {
    await insertLegacyRole('legacy_cleanup', { weaponExempt: true, zones: [{ zoneId: await oid(zoneA), allowed: true }] });
    await migrate();

    const role = await readRole('legacy_cleanup');
    assert.equal(role.permissions.zones, undefined);
    assert.equal(role.permissions.weaponExempt, undefined);
  });

  it('is idempotent, and leaves already-migrated roles alone', async () => {
    await insertLegacyRole('legacy_twice', { weaponExempt: true, zones: [{ zoneId: await oid(zoneA), allowed: true }] });
    await migrate();
    const first = await readRole('legacy_twice');
    await migrate();
    const second = await readRole('legacy_twice');

    assert.deepEqual(second.permissions.actions, first.permissions.actions);
    assert.equal(second.permissions.actions?.length, 2);
  });

  it('does not clobber a rule already written for the same target', async () => {
    await insertLegacyRole('legacy_conflict', {
      zones: [{ zoneId: await oid(zoneA), allowed: true }],
      actions: [{ action: 'restricted_area', zoneId: await oid(zoneA), rule: 'restrict' }],
    });
    await migrate();

    const role = await readRole('legacy_conflict');
    assert.equal(role.permissions.actions?.length, 1);
    assert.equal(role.permissions.actions?.[0].rule, 'restrict', 'the existing rule wins over a derived one');
  });

  it('does nothing when there is nothing to migrate', async () => {
    const { seedRoles } = await import('../src/modules/identity/identity.seed.js');
    await seedRoles();
    await migrate();

    for (const key of ['security_guard', 'staff']) {
      assert.deepEqual((await readRole(key)).permissions.actions, []);
    }
  });

  it('migrates several zones on one role', async () => {
    await insertLegacyRole('legacy_multi', {
      zones: [
        { zoneId: await oid(zoneA), allowed: true },
        { zoneId: await oid(zoneB), allowed: false },
      ],
    });
    await migrate();

    const role = await readRole('legacy_multi');
    assert.equal(role.permissions.actions?.length, 2);
    assert.deepEqual(role.permissions.actions?.map((rule) => rule.rule), ['allow', 'restrict']);
    // Distinct zones must stay distinct: they are what the rules are about.
    assert.deepEqual(role.permissions.actions?.map((rule) => String(rule.zoneId)), [zoneA, zoneB]);
  });
});
