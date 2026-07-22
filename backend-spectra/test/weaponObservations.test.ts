import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_OPERATOR, jsonHeaders, readJson } from './support/factories.js';

/**
 * possible_weapon enforcement, end to end through the real weapon-observations
 * endpoint.
 *
 * The browser runs the weapon model and posts CV facts only — the box, the
 * person holding it, the tags on that person. Every assertion below is about
 * what the *server* decided: the re-derivable quality gate, identity from
 * AprilTags, the global allow/restrict rule (the security-guard exemption),
 * suppress-or-alert, and the audit record. Nothing the client sends says who a
 * person is or whether they may carry.
 */

const FRAME = { width: 1000, height: 1000 };
// A holder box and a weapon box squarely inside it — the held, confident,
// confirmed baseline. Individual tests perturb one field to trip a gate.
const HOLDER_BOX: [number, number, number, number] = [300, 100, 200, 500];
const WEAPON_BOX: [number, number, number, number] = [360, 300, 80, 50];

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

async function createCamera(name = 'Lobby Cam'): Promise<string> {
  const camera = await readJson<{ _id: string }>(
    await fetch(`${server.baseUrl}/api/cameras`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ name, sourceType: 'local-device' }),
    }),
  );
  return camera._id;
}

async function createRole(key: string): Promise<string> {
  const role = await readJson<{ _id: string }>(
    await fetch(`${server.baseUrl}/api/roles`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ key, name: key, permissions: { actions: [] } }),
    }),
  );
  return role._id;
}

// possible_weapon is a global action, so its rules carry a null zoneId.
async function setRoleRule(rId: string, rule: 'allow' | 'restrict') {
  const response = await fetch(`${server.baseUrl}/api/roles/${rId}`, {
    method: 'PATCH',
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ permissions: { actions: [{ action: 'possible_weapon', zoneId: null, rule }] } }),
  });
  assert.equal(response.status, 200);
}

async function setUnidentifiedRule(rule: 'allow' | 'restrict') {
  const response = await fetch(`${server.baseUrl}/api/unidentified-policy`, {
    method: 'PUT',
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ rules: [{ action: 'possible_weapon', zoneId: null, rule }] }),
  });
  assert.equal(response.status, 200);
}

async function createPerson(input: { name: string; roleId: string; aprilTagId?: number; active?: boolean }): Promise<string> {
  const { Person } = await import('../src/modules/identity/person.model.js');
  const person = await Person.create({
    name: input.name,
    roleId: input.roleId,
    active: input.active ?? true,
    aprilTagId: input.aprilTagId ?? null,
  });
  return String(person._id);
}

interface Evaluation {
  status: 'ignored' | 'evaluated';
  outcome?: 'alert_created' | 'suppressed';
  rejection?: string;
  decisionId?: string;
  alertId?: string;
  deduped?: boolean;
}

function observationBody(overrides: Record<string, unknown> = {}) {
  return {
    cameraId,
    trackId: 'weapon-track-1',
    frame: FRAME,
    weaponBox: WEAPON_BOX,
    personBox: HOLDER_BOX,
    confidence: 0.9,
    framesConfirmed: 3,
    aprilTags: [] as number[],
    snapshot: 'data:image/jpeg;base64,AAAA',
    ...overrides,
  };
}

async function postObservation(overrides: Record<string, unknown> = {}, cookie = operatorCookie) {
  const response = await fetch(`${server.baseUrl}/api/vision/weapon-observations`, {
    method: 'POST',
    headers: jsonHeaders(cookie),
    body: JSON.stringify(observationBody(overrides)),
  });
  return { status: response.status, body: await readJson<Evaluation & { error?: string }>(response) };
}

async function listDecisions() {
  return readJson<Array<Record<string, unknown>>>(
    await fetch(`${server.baseUrl}/api/policy-decisions?limit=100`, { headers: { Cookie: adminCookie } }),
  );
}

async function listAlerts() {
  return readJson<Array<Record<string, unknown>>>(
    await fetch(`${server.baseUrl}/api/vision/alerts?limit=100`, { headers: { Cookie: adminCookie } }),
  );
}

beforeEach(async () => {
  await server.reset();
  await server.createUser({ ...TEST_ADMIN, role: 'admin' });
  await server.createUser({ ...TEST_OPERATOR, role: 'operator' });
  adminCookie = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);
  operatorCookie = await server.login(TEST_OPERATOR.email, TEST_OPERATOR.password);
  cameraId = await createCamera();
});

describe('weapon observations: the quality gate (nothing is written when it fails)', () => {
  it('ignores a low-confidence box below the camera threshold', async () => {
    const { body } = await postObservation({ confidence: 0.2 });
    assert.equal(body.status, 'ignored');
    assert.equal(body.rejection, 'low_confidence');
    assert.equal((await listDecisions()).length, 0);
    assert.equal((await listAlerts()).length, 0);
  });

  it('ignores an under-confirmed detection — the N-of-M floor is enforced server-side', async () => {
    const { body } = await postObservation({ framesConfirmed: 1 });
    assert.equal(body.rejection, 'not_confirmed');
    assert.equal((await listDecisions()).length, 0);
  });

  it('ignores a weapon box nobody is holding — re-derived from the two boxes', async () => {
    const { body } = await postObservation({ weaponBox: [850, 850, 80, 50] });
    assert.equal(body.rejection, 'not_held');
    assert.equal((await listAlerts()).length, 0);
  });
});

describe('weapon observations: policy for an identified person', () => {
  it('suppresses and audits an allowed guard — the security-guard exemption', async () => {
    const roleId = await createRole('security_guard');
    await setRoleRule(roleId, 'allow');
    await createPerson({ name: 'Alice', roleId, aprilTagId: 7 });

    const { body } = await postObservation({ aprilTags: [7] });
    assert.equal(body.status, 'evaluated');
    assert.equal(body.outcome, 'suppressed');
    assert.equal(body.alertId, undefined);

    assert.equal((await listAlerts()).length, 0);
    const decisions = await listDecisions();
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].action, 'possible_weapon');
    assert.equal(decisions[0].decision, 'suppressed');
    assert.equal(decisions[0].subject, 'person');
    assert.equal(decisions[0].ruleApplied, 'allow');
    assert.equal(decisions[0].ruleSource, 'role');
    assert.equal(decisions[0].personName, 'Alice');
    assert.equal(decisions[0].roleKey, 'security_guard');
  });

  it('alerts an identified person with no weapon rule — restrict by default', async () => {
    const roleId = await createRole('staff');
    await createPerson({ name: 'Bob', roleId, aprilTagId: 8 });

    const { body } = await postObservation({ aprilTags: [8] });
    assert.equal(body.outcome, 'alert_created');
    const decisions = await listDecisions();
    assert.equal(decisions[0].ruleApplied, 'restrict');
    assert.equal(decisions[0].ruleSource, 'default');
  });

  it('records a written restrict as coming from the role, not the default', async () => {
    const roleId = await createRole('staff');
    await setRoleRule(roleId, 'restrict');
    await createPerson({ name: 'Bob', roleId, aprilTagId: 8 });

    const { body } = await postObservation({ aprilTags: [8] });
    assert.equal(body.outcome, 'alert_created');
    assert.equal((await listDecisions())[0].ruleSource, 'role');
  });
});

describe('weapon observations: policy for the unidentified', () => {
  it('alerts an unidentified holder by default, recording why identification failed', async () => {
    const { body } = await postObservation({ aprilTags: [] });
    assert.equal(body.outcome, 'alert_created');
    const decisions = await listDecisions();
    assert.equal(decisions[0].subject, 'unidentified_person');
    assert.equal(decisions[0].unidentifiedReason, 'no_apriltag');
    assert.equal(decisions[0].ruleApplied, 'restrict');
    assert.equal(decisions[0].ruleSource, 'default');
  });

  it('a nearby LoRa wristband never grants the exemption — a tagless holder still alerts', async () => {
    // An unidentified-allow rule waves through everyone the camera cannot
    // identify, but only via a written policy — never via a wristband.
    const { body } = await postObservation({ aprilTags: [] });
    assert.equal(body.outcome, 'alert_created');
    assert.equal((await listDecisions())[0].unidentifiedReason, 'no_apriltag');
  });

  it('suppresses the unidentified only where an admin explicitly allowed them', async () => {
    await setUnidentifiedRule('allow');
    const { body } = await postObservation({ aprilTags: [] });
    assert.equal(body.outcome, 'suppressed');
    assert.equal((await listAlerts()).length, 0);
    assert.equal((await listDecisions())[0].ruleSource, 'unidentified_policy');
  });

  it('treats a tag that matches nobody as unidentified, not identified', async () => {
    const { body } = await postObservation({ aprilTags: [12345] });
    assert.equal(body.outcome, 'alert_created');
    assert.equal((await listDecisions())[0].unidentifiedReason, 'unregistered_apriltag');
  });
});

describe('weapon observations: the alert a restrict rule creates', () => {
  it('is a critical weapon alert with a snapshot and full provenance', async () => {
    const { body } = await postObservation({ aprilTags: [] });
    assert.equal(body.outcome, 'alert_created');

    const alerts = await listAlerts();
    assert.equal(alerts.length, 1);
    const alert = alerts[0];
    assert.equal(alert.type, 'weapon');
    assert.equal(alert.severity, 'critical');
    assert.ok(typeof alert.snapshot === 'string' && (alert.snapshot as string).length > 0, 'the alert must carry its evidence snapshot');
    assert.match(String(alert.message), /possible weapon/i);

    const provenance = alert.policy as Record<string, unknown>;
    assert.ok(provenance, 'the alert records why policy let it exist');
    assert.equal(provenance.subject, 'unidentified_person');
    assert.equal(provenance.ruleSource, 'default');
    assert.equal(String(provenance.decisionId), String(body.decisionId));

    assert.equal(String((await listDecisions())[0].alertId), String(alert._id));
  });
});

describe('weapon observations: episode discipline', () => {
  it('folds a repeat of the same weapon track inside the cooldown into one episode', async () => {
    const first = await postObservation({ aprilTags: [] });
    assert.equal(first.body.deduped ?? false, false);
    assert.equal(first.body.outcome, 'alert_created');

    const second = await postObservation({ aprilTags: [] }); // same trackId
    assert.equal(second.body.deduped, true);
    assert.equal(second.body.decisionId, first.body.decisionId);

    assert.equal((await listDecisions()).length, 1);
    assert.equal((await listAlerts()).length, 1);
  });

  it('a different weapon track is a separate episode', async () => {
    await postObservation({ aprilTags: [], trackId: 'weapon-track-1' });
    await postObservation({ aprilTags: [], trackId: 'weapon-track-2' });
    assert.equal((await listDecisions()).length, 2);
  });
});

describe('weapon observations: the browser cannot bypass policy', () => {
  it('refuses a client attempt to POST a weapon alert directly, naming the observation endpoint', async () => {
    const response = await fetch(`${server.baseUrl}/api/vision/alerts`, {
      method: 'POST',
      headers: jsonHeaders(operatorCookie),
      body: JSON.stringify({ cameraId, type: 'weapon', confidence: 1, message: 'faked' }),
    });
    assert.equal(response.status, 400);
    const body = await readJson<{ error: string }>(response);
    assert.match(body.error, /policy enforcement/i);
    assert.match(body.error, /weapon-observations/);
  });

  it('requires a snapshot — a weapon event must carry evidence', async () => {
    const { status, body } = await postObservation({ snapshot: '' });
    assert.equal(status, 400);
    assert.match(body.error ?? '', /snapshot/i);
  });

  it('requires authentication', async () => {
    const response = await fetch(`${server.baseUrl}/api/vision/weapon-observations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(observationBody()),
    });
    assert.equal(response.status, 401);
  });
});
