import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_OPERATOR, jsonHeaders, readJson } from './support/factories.js';
import {
  ACTION_CATALOG,
  DEFAULT_RULE,
  findRule,
  resolveRule,
  type ActionRule,
} from '../src/modules/policy/action.catalog.js';

interface TestAction {
  key: string;
  scope: string;
  detector: string;
  configurable: boolean;
  unconfigurableReason?: string;
  policyEnforced: boolean;
  defaultSeverity: string;
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

const fetchCatalog = async (cookie = adminCookie) =>
  readJson<{ actions: TestAction[]; rules: string[]; defaultRule: string }>(
    await fetch(`${server.baseUrl}/api/action-catalog`, { headers: { Cookie: cookie } }),
  );

describe('action catalog: the rules of the catalog itself', () => {
  it('defaults to restrict, everywhere', () => {
    assert.equal(DEFAULT_RULE, 'restrict');
    assert.ok(
      ACTION_CATALOG.every((action) => action.defaultSeverity !== undefined),
      'every action must say how severe its alert is',
    );
  });

  it('resolves a missing rule to restrict rather than nothing', () => {
    const rules: ActionRule[] = [{ action: 'restricted_area', zoneId: 'zone-a', rule: 'allow' }];

    assert.equal(resolveRule(rules, 'restricted_area', 'zone-a'), 'allow');
    // The load-bearing case: silence is denial, not an absence of an answer.
    assert.equal(resolveRule(rules, 'restricted_area', 'zone-b'), 'restrict');
    assert.equal(resolveRule([], 'restricted_area', 'zone-a'), 'restrict');
    assert.equal(resolveRule(rules, 'possible_weapon', null), 'restrict');
  });

  it('lets a caller tell a written restrict from the default', () => {
    const rules: ActionRule[] = [{ action: 'restricted_area', zoneId: 'zone-a', rule: 'restrict' }];

    // Same resolved rule, different provenance — a decision has to record which.
    assert.equal(resolveRule(rules, 'restricted_area', 'zone-a'), 'restrict');
    assert.ok(findRule(rules, 'restricted_area', 'zone-a'), 'an explicit restrict is findable');
    assert.equal(findRule(rules, 'restricted_area', 'zone-b'), undefined);
  });

  it('does not allow a role exemption for unattended objects', () => {
    const unattended = ACTION_CATALOG.find((action) => action.key === 'unattended_object')!;
    // Ownership can't be established once the person walks away, so no role can
    // be trusted to excuse it — this is a product rule, not an oversight.
    assert.equal(unattended.configurable, false);
    assert.match(unattended.unconfigurableReason!, /ownership cannot be established/i);
  });

  it('marks possible_weapon as live and enforced, and never confirms a weapon', () => {
    const weapon = ACTION_CATALOG.find((action) => action.key === 'possible_weapon')!;
    assert.equal(weapon.detector, 'live');
    assert.equal(weapon.configurable, true);
    assert.equal(weapon.policyEnforced, true);
    assert.equal(weapon.scope, 'global');
    assert.equal(weapon.defaultSeverity, 'critical');
    // The candidate framing is load-bearing: it must never claim confirmation.
    assert.match(weapon.description, /never confirms a weapon/i);
  });

  it('has restricted_area live and enforced', () => {
    const restricted = ACTION_CATALOG.find((action) => action.key === 'restricted_area')!;
    assert.equal(restricted.scope, 'zone');
    assert.equal(restricted.configurable, true);
    // Phase 3C ships the detector and enforcement, so the catalog now says so.
    assert.equal(restricted.detector, 'live');
    assert.equal(restricted.policyEnforced, true);
    assert.equal(restricted.requiresSnapshot, true);
  });
});

describe('action catalog: API', () => {
  it('serves the catalog to any signed-in user, and nobody else', async () => {
    const catalog = await fetchCatalog();
    assert.deepEqual(catalog.actions.map((action) => action.key).sort(), [
      'possible_weapon',
      'restricted_area',
      'unattended_object',
    ]);
    assert.deepEqual(catalog.rules, ['allow', 'restrict']);
    assert.equal(catalog.defaultRule, 'restrict');

    assert.equal((await fetch(`${server.baseUrl}/api/action-catalog`, { headers: { Cookie: operatorCookie } })).status, 200);
    assert.equal((await fetch(`${server.baseUrl}/api/action-catalog`)).status, 401);
  });

  it('serves exactly what the code defines — the UI cannot drift from it', async () => {
    const catalog = await fetchCatalog();
    assert.deepEqual(catalog.actions, JSON.parse(JSON.stringify(ACTION_CATALOG)));
  });

  it('exposes no way to add, change or remove an action', async () => {
    const cases: Array<[string, string]> = [
      ['POST', '/api/action-catalog'],
      ['PATCH', '/api/action-catalog/restricted_area'],
      ['PUT', '/api/action-catalog/restricted_area'],
      ['DELETE', '/api/action-catalog/restricted_area'],
    ];
    for (const [method, path] of cases) {
      const response = await fetch(`${server.baseUrl}${path}`, { method, headers: jsonHeaders(adminCookie), body: '{}' });
      // Not even an admin: an action carries detection behaviour and evidence
      // requirements that only exist in code.
      assert.equal(response.status, 404, `${method} ${path} must not exist`);
    }
  });
});
