import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_OPERATOR, jsonHeaders, readJson } from './support/factories.js';

/**
 * Restricted-area enforcement, end to end through the real observations
 * endpoint.
 *
 * The browser only ever posts CV facts here; every assertion below is about
 * what the *server* decided — identity, rule, suppress-or-alert, provenance —
 * from those facts alone. Nothing the client sends says who a person is or
 * whether they may pass.
 */

// A frame and a person box whose ground point (bottom-centre) lands squarely
// inside ZONE_RECT, clear of every edge and within the size band. Individual
// tests perturb one field at a time to trip a specific gate.
const FRAME = { width: 1000, height: 1000 };
const ZONE_RECT = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 }; // x 0.1–0.5, y 0.2–0.5
const GOOD_BOX: [number, number, number, number] = [300, 100, 100, 300]; // ground point (350, 400) → (0.35, 0.40)

let server: TestServer;
let adminCookie: string;
let operatorCookie: string;
let cameraId: string;
let zoneId: string;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.stop();
});

async function createCamera(name = 'Doorway Cam'): Promise<string> {
  const camera = await readJson<{ _id: string }>(
    await fetch(`${server.baseUrl}/api/cameras`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ name, sourceType: 'local-device' }),
    }),
  );
  return camera._id;
}

async function createZone(camId: string, name = 'Restricted Area'): Promise<string> {
  const zone = await readJson<{ _id: string }>(
    await fetch(`${server.baseUrl}/api/zones`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ name, cameraId: camId, rect: ZONE_RECT }),
    }),
  );
  return zone._id;
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

async function setRoleRule(rId: string, zId: string, rule: 'allow' | 'restrict') {
  const response = await fetch(`${server.baseUrl}/api/roles/${rId}`, {
    method: 'PATCH',
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ permissions: { actions: [{ action: 'restricted_area', zoneId: zId, rule }] } }),
  });
  assert.equal(response.status, 200);
}

async function setUnidentifiedRule(zId: string, rule: 'allow' | 'restrict') {
  const response = await fetch(`${server.baseUrl}/api/unidentified-policy`, {
    method: 'PUT',
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ rules: [{ action: 'restricted_area', zoneId: zId, rule }] }),
  });
  assert.equal(response.status, 200);
}

async function createPerson(input: { name: string; roleId: string; aprilTagId?: number; active?: boolean }): Promise<string> {
  const person = await readJson<{ _id: string }>(
    await fetch(`${server.baseUrl}/api/people`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify(input),
    }),
  );
  return person._id;
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
    zoneId,
    trackId: 'track-1',
    frame: FRAME,
    personBox: GOOD_BOX,
    enteredFromOutside: true,
    framesInside: 5,
    dwellMs: 2000,
    aprilTags: [] as number[],
    snapshot: 'data:image/jpeg;base64,AAAA',
    ...overrides,
  };
}

async function postObservation(overrides: Record<string, unknown> = {}, cookie = operatorCookie) {
  const response = await fetch(`${server.baseUrl}/api/vision/observations`, {
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
  zoneId = await createZone(cameraId);
});

describe('observations: the quality gate (nothing is written when it fails)', () => {
  it('rejects a box clipped by the bottom edge — the ground point is unreliable', async () => {
    const { body } = await postObservation({ personBox: [300, 695, 100, 300] });
    assert.equal(body.status, 'ignored');
    assert.equal(body.rejection, 'edge_clipped');
    assert.equal((await listDecisions()).length, 0);
    assert.equal((await listAlerts()).length, 0);
  });

  it('rejects a box clipped by the left edge', async () => {
    const { body } = await postObservation({ personBox: [5, 100, 100, 300] });
    assert.equal(body.rejection, 'edge_clipped');
  });

  it('rejects a person box too small to be a real, close person', async () => {
    const { body } = await postObservation({ personBox: [300, 300, 50, 100] });
    assert.equal(body.rejection, 'too_small');
  });

  it('rejects an oversized box (too close, occluding the lens)', async () => {
    const { body } = await postObservation({ personBox: [100, 20, 800, 900] });
    assert.equal(body.rejection, 'too_large');
  });

  it('rejects a person whose ground point is outside the named zone', async () => {
    // Well-sized, unclipped, but standing below the zone.
    const { body } = await postObservation({ personBox: [300, 550, 100, 200] });
    assert.equal(body.rejection, 'ground_point_outside_zone');
  });

  it('does not fire on a single flickering frame — confirmation is required', async () => {
    const { body } = await postObservation({ framesInside: 1, dwellMs: 200 });
    assert.equal(body.rejection, 'not_confirmed');
  });

  it('does not fire on someone already inside when monitoring started', async () => {
    const { body } = await postObservation({ enteredFromOutside: false });
    assert.equal(body.rejection, 'no_entry_transition');
    assert.equal((await listDecisions()).length, 0);
  });

  it('ignores an observation for a zone on a different camera', async () => {
    const otherCamera = await createCamera('Other Cam');
    const { body } = await postObservation({ cameraId: otherCamera });
    assert.equal(body.rejection, 'zone_not_found');
  });
});

describe('observations: policy for an identified person', () => {
  it('suppresses and audits an allowed guard — no alert, one suppressed decision', async () => {
    const roleId = await createRole('security_guard');
    await setRoleRule(roleId, zoneId, 'allow');
    await createPerson({ name: 'Alice', roleId, aprilTagId: 7 });

    const { body } = await postObservation({ aprilTags: [7] });
    assert.equal(body.status, 'evaluated');
    assert.equal(body.outcome, 'suppressed');
    assert.equal(body.alertId, undefined);

    assert.equal((await listAlerts()).length, 0);
    const decisions = await listDecisions();
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].decision, 'suppressed');
    assert.equal(decisions[0].subject, 'person');
    assert.equal(decisions[0].ruleApplied, 'allow');
    assert.equal(decisions[0].ruleSource, 'role');
    assert.equal(decisions[0].personName, 'Alice');
    assert.equal(decisions[0].roleKey, 'security_guard');
  });

  it('alerts an identified person with no rule for the zone — restrict by default', async () => {
    const roleId = await createRole('staff');
    await createPerson({ name: 'Bob', roleId, aprilTagId: 8 });

    const { body } = await postObservation({ aprilTags: [8] });
    assert.equal(body.outcome, 'alert_created');
    const decisions = await listDecisions();
    assert.equal(decisions[0].ruleApplied, 'restrict');
    // Nobody wrote a rule — the default caught them, which the log must say.
    assert.equal(decisions[0].ruleSource, 'default');
  });

  it('records a written restrict as coming from the role, not the default', async () => {
    const roleId = await createRole('staff');
    await setRoleRule(roleId, zoneId, 'restrict');
    await createPerson({ name: 'Bob', roleId, aprilTagId: 8 });

    const { body } = await postObservation({ aprilTags: [8] });
    assert.equal(body.outcome, 'alert_created');
    assert.equal((await listDecisions())[0].ruleSource, 'role');
  });
});

describe('observations: policy for the unidentified', () => {
  it('alerts an unidentified person by default, recording why they could not be identified', async () => {
    const { body } = await postObservation({ aprilTags: [] });
    assert.equal(body.outcome, 'alert_created');
    const decisions = await listDecisions();
    assert.equal(decisions[0].subject, 'unidentified_person');
    assert.equal(decisions[0].unidentifiedReason, 'no_apriltag');
    assert.equal(decisions[0].ruleApplied, 'restrict');
    assert.equal(decisions[0].ruleSource, 'default');
  });

  it('suppresses the unidentified only where an admin explicitly allowed them', async () => {
    await setUnidentifiedRule(zoneId, 'allow');
    const { body } = await postObservation({ aprilTags: [] });
    assert.equal(body.outcome, 'suppressed');
    assert.equal((await listAlerts()).length, 0);
    const decisions = await listDecisions();
    assert.equal(decisions[0].ruleSource, 'unidentified_policy');
    assert.equal(decisions[0].ruleApplied, 'allow');
  });

  it('treats a tag that matches nobody as unidentified, not identified', async () => {
    const { body } = await postObservation({ aprilTags: [12345] });
    assert.equal(body.outcome, 'alert_created');
    assert.equal((await listDecisions())[0].unidentifiedReason, 'unregistered_apriltag');
  });
});

describe('observations: the alert a restrict rule creates', () => {
  it('is a restricted_area alert with a snapshot, zone name and full provenance', async () => {
    const { body } = await postObservation({ aprilTags: [] });
    assert.equal(body.outcome, 'alert_created');

    const alerts = await listAlerts();
    assert.equal(alerts.length, 1);
    const alert = alerts[0];
    assert.equal(alert.type, 'restricted_area');
    assert.equal(alert.severity, 'warning');
    assert.equal(alert.zoneName, 'Restricted Area');
    assert.ok(typeof alert.snapshot === 'string' && (alert.snapshot as string).length > 0, 'the alert must carry its evidence snapshot');

    const provenance = alert.policy as Record<string, unknown>;
    assert.ok(provenance, 'the alert records why policy let it exist');
    assert.equal(provenance.subject, 'unidentified_person');
    assert.equal(provenance.ruleSource, 'default');
    assert.equal(provenance.unidentifiedReason, 'no_apriltag');
    assert.equal(String(provenance.decisionId), String(body.decisionId));

    // The decision points back at its alert — the trail closes both ways.
    assert.equal(String((await listDecisions())[0].alertId), String(alert._id));
  });
});

describe('observations: episode discipline', () => {
  it('folds a repeat of the same entry inside the cooldown into one episode', async () => {
    const first = await postObservation({ aprilTags: [] });
    assert.equal(first.body.deduped ?? false, false);
    // The second observation resolves to the same open episode, so it reports
    // the first decision's outcome rather than making a new one.
    assert.equal(first.body.outcome, 'alert_created');

    const second = await postObservation({ aprilTags: [] }); // same trackId
    assert.equal(second.body.deduped, true);
    assert.equal(second.body.outcome, 'alert_created');
    assert.equal(second.body.decisionId, first.body.decisionId);

    // A within-cooldown repeat is fully folded: no second decision and no
    // second alert. One entry, one record — that is the whole point.
    assert.equal((await listDecisions()).length, 1);
    assert.equal((await listAlerts()).length, 1);
  });

  it('a different track in the same zone is a separate episode', async () => {
    await postObservation({ aprilTags: [], trackId: 'track-1' });
    await postObservation({ aprilTags: [], trackId: 'track-2' });
    assert.equal((await listDecisions()).length, 2);
  });
});

describe('observations: the browser cannot bypass policy', () => {
  it('refuses a client attempt to POST a restricted_area alert directly', async () => {
    const response = await fetch(`${server.baseUrl}/api/vision/alerts`, {
      method: 'POST',
      headers: jsonHeaders(operatorCookie),
      body: JSON.stringify({ cameraId, type: 'restricted_area', confidence: 1, message: 'faked' }),
    });
    assert.equal(response.status, 400);
    const body = await readJson<{ error: string }>(response);
    assert.match(body.error, /policy enforcement/i);
  });

  it('requires a snapshot — a restricted-area event must carry evidence', async () => {
    const { status, body } = await postObservation({ snapshot: '' });
    assert.equal(status, 400);
    assert.match(body.error ?? '', /snapshot/i);
  });

  it('requires authentication', async () => {
    const response = await fetch(`${server.baseUrl}/api/vision/observations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(observationBody()),
    });
    assert.equal(response.status, 401);
  });
});
