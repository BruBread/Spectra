import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_OPERATOR, jsonHeaders, readJson } from './support/factories.js';

interface TestPolicy {
  subject: string;
  defaultRule: string;
  rules: Array<{ action: string; zoneId: string | null; rule: string; updatedBy: string | null; updatedAt: string | null }>;
  updatedAt: string | null;
  updatedBy: string | null;
}

let server: TestServer;
let adminCookie: string;
let operatorCookie: string;
let zoneId: string;

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
      body: JSON.stringify({ name: 'Test Policy Camera', sourceType: 'local-device' }),
    }),
  );
  const zone = await readJson<{ _id: string }>(
    await fetch(`${server.baseUrl}/api/zones`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ name: 'Test Policy Zone', cameraId: camera._id, rect: { x: 0.1, y: 0.1, width: 0.4, height: 0.4 } }),
    }),
  );
  zoneId = zone._id;
});

const getPolicy = async (cookie = adminCookie) =>
  readJson<TestPolicy>(await fetch(`${server.baseUrl}/api/unidentified-policy`, { headers: { Cookie: cookie } }));

async function putRules(rules: unknown, cookie = adminCookie) {
  const response = await fetch(`${server.baseUrl}/api/unidentified-policy`, {
    method: 'PUT',
    headers: jsonHeaders(cookie),
    body: JSON.stringify({ rules }),
  });
  return { status: response.status, policy: await readJson<TestPolicy & { error?: string }>(response) };
}

describe('unidentified-person policy: defaults', () => {
  it('answers with an empty, restrictive policy before anyone configures one', async () => {
    const policy = await getPolicy();
    // Not a 404: "no rules" is the real, meaningful state — everything
    // restricts — and a 404 would invite a client to treat it as unknown.
    assert.equal(policy.subject, 'unidentified_person');
    assert.equal(policy.defaultRule, 'restrict');
    assert.deepEqual(policy.rules, []);
  });

  it('does not create a document just because someone looked at it', async () => {
    await getPolicy();
    const mongoose = (await import('mongoose')).default;
    const stored = await mongoose.connection.collection('unidentifiedpolicies').countDocuments();
    // A record here implies somebody configured the policy. Reading is not
    // configuring.
    assert.equal(stored, 0);
  });
});

describe('unidentified-person policy: authorization', () => {
  it('lets an operator read but never write', async () => {
    assert.equal((await fetch(`${server.baseUrl}/api/unidentified-policy`, { headers: { Cookie: operatorCookie } })).status, 200);

    const { status } = await putRules([{ action: 'restricted_area', zoneId, rule: 'allow' }], operatorCookie);
    // `allow` here admits everyone the cameras cannot identify — admin only.
    assert.equal(status, 403);
  });

  it('rejects anonymous access', async () => {
    assert.equal((await fetch(`${server.baseUrl}/api/unidentified-policy`)).status, 401);
    const response = await fetch(`${server.baseUrl}/api/unidentified-policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules: [] }),
    });
    assert.equal(response.status, 401);
  });
});

describe('unidentified-person policy: rules', () => {
  it('writes a per-zone allow and reads it back', async () => {
    const { status, policy } = await putRules([{ action: 'restricted_area', zoneId, rule: 'allow' }]);
    assert.equal(status, 200);
    assert.equal(policy.rules.length, 1);
    assert.equal(policy.rules[0].rule, 'allow');
    assert.equal(String(policy.rules[0].zoneId), zoneId);

    assert.equal((await getPolicy()).rules.length, 1);
  });

  it('records who set each rule, and when', async () => {
    await putRules([{ action: 'restricted_area', zoneId, rule: 'allow' }]);
    const policy = await getPolicy();
    const me = await readJson<{ id: string }>(await fetch(`${server.baseUrl}/api/auth/me`, { headers: { Cookie: adminCookie } }));

    assert.equal(String(policy.rules[0].updatedBy), me.id);
    assert.ok(policy.rules[0].updatedAt);
  });

  it('keeps the original author of an unchanged rule', async () => {
    await putRules([{ action: 'restricted_area', zoneId, rule: 'allow' }]);
    const first = await getPolicy();

    // Someone else re-saves the form without touching this rule.
    await server.createUser({ name: 'Second Admin', email: 'second-admin@example.test', password: 'second-admin-pw-1', role: 'admin' });
    const otherCookie = await server.login('second-admin@example.test', 'second-admin-pw-1');
    await putRules([{ action: 'restricted_area', zoneId, rule: 'allow' }], otherCookie);

    const second = await getPolicy();
    // Re-saving an untouched `allow` must not make the last person to open the
    // page look like the one who granted it.
    assert.equal(String(second.rules[0].updatedBy), String(first.rules[0].updatedBy));
    assert.equal(second.rules[0].updatedAt, first.rules[0].updatedAt);
  });

  it('reattributes a rule whose value actually changed', async () => {
    await putRules([{ action: 'restricted_area', zoneId, rule: 'allow' }]);

    await server.createUser({ name: 'Third Admin', email: 'third-admin@example.test', password: 'third-admin-pw-1', role: 'admin' });
    const otherCookie = await server.login('third-admin@example.test', 'third-admin-pw-1');
    await putRules([{ action: 'restricted_area', zoneId, rule: 'restrict' }], otherCookie);

    const policy = await getPolicy();
    const other = await readJson<{ id: string }>(await fetch(`${server.baseUrl}/api/auth/me`, { headers: { Cookie: otherCookie } }));
    assert.equal(String(policy.rules[0].updatedBy), other.id);
  });

  it('replaces the rule set wholesale', async () => {
    await putRules([{ action: 'restricted_area', zoneId, rule: 'allow' }]);
    const { policy } = await putRules([]);
    assert.deepEqual(policy.rules, [], 'an empty set withdraws the permission');
  });

  it('refuses a rule for an action nobody may configure', async () => {
    for (const action of ['unattended_object']) {
      const { status } = await putRules([{ action, zoneId: null, rule: 'allow' }]);
      assert.equal(status, 400, `${action} must not be configurable here either`);
    }
  });

  it('accepts a global possible_weapon rule — waving through unidentified holders is a real, if drastic, choice', async () => {
    const { status, policy } = await putRules([{ action: 'possible_weapon', zoneId: null, rule: 'allow' }]);
    assert.equal(status, 200);
    assert.equal(policy.rules[0].action, 'possible_weapon');
    assert.equal(policy.rules[0].rule, 'allow');
  });

  it('refuses malformed rules on exactly the same terms as a role', async () => {
    const cases: unknown[] = [
      'nope',
      [{ action: 'teleportation', zoneId: null, rule: 'allow' }],
      [{ action: 'restricted_area', zoneId: 'not-an-id', rule: 'allow' }],
      [{ action: 'restricted_area', zoneId: null, rule: 'allow' }],
      [{ action: 'restricted_area', zoneId: '000000000000000000000000', rule: 'allow' }],
      [{ action: 'restricted_area', zoneId, rule: 'maybe' }],
    ];
    for (const rules of cases) {
      const { status } = await putRules(rules);
      assert.equal(status, 400, `should reject ${JSON.stringify(rules)}`);
    }
  });

  it('refuses two rules for the same action and zone', async () => {
    const { status } = await putRules([
      { action: 'restricted_area', zoneId, rule: 'allow' },
      { action: 'restricted_area', zoneId, rule: 'restrict' },
    ]);
    assert.equal(status, 400);
  });

  it('exposes no way to delete the policy', async () => {
    const response = await fetch(`${server.baseUrl}/api/unidentified-policy`, { method: 'DELETE', headers: { Cookie: adminCookie } });
    // Deleting it would be indistinguishable from never having configured it.
    // Withdrawing permission means writing `restrict`.
    assert.equal(response.status, 404);
  });
});
