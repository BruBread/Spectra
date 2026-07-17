import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_CAMERA_ID, TEST_CAMERA_ID_B, alertBody, jsonHeaders, readJson } from './support/factories.js';

/** The alert fields these tests assert on — the API's shape, declared once. */
interface TestAlert {
  _id: string;
  type: string;
  severity: string;
  status: string;
  read: boolean;
  acknowledged: boolean;
  zoneName: string | null;
  confidence: number;
  message: string;
  occurrences: number;
  lastOccurredAt: string;
  statusChangedAt: string | null;
  statusChangedBy: string | null;
  createdAt: string;
}

let server: TestServer;
let cookie: string;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.stop();
});

beforeEach(async () => {
  await server.reset();
  await server.createUser({ ...TEST_ADMIN, role: 'admin' });
  cookie = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);
});

async function createAlert(body: ReturnType<typeof alertBody>) {
  const response = await fetch(`${server.baseUrl}/api/vision/alerts`, {
    method: 'POST',
    headers: jsonHeaders(cookie),
    body: JSON.stringify(body),
  });
  return { status: response.status, alert: await readJson<TestAlert>(response) };
}

async function listAlerts(query = '') {
  const response = await fetch(`${server.baseUrl}/api/vision/alerts${query}`, { headers: { Cookie: cookie } });
  return { status: response.status, alerts: await readJson<TestAlert[]>(response) };
}

async function counts() {
  const response = await fetch(`${server.baseUrl}/api/vision/alerts/counts`, { headers: { Cookie: cookie } });
  return readJson<{ unread: number; criticalOpen: number; new: number }>(response);
}

describe('alert creation and severity defaults', () => {
  it('defaults severity from the detection type', async () => {
    const cases: Array<[string, string]> = [
      ['drowning', 'critical'],
      ['fighting', 'critical'],
      ['running', 'warning'],
      ['loitering', 'warning'],
      ['unattended_object', 'warning'],
      ['intoxication', 'warning'],
      ['apriltag', 'info'],
    ];

    // No reset between cases: grouping keys on camera + type + trackId, so
    // different types never fold together. (Resetting here would also wipe the
    // users collection and invalidate the session mid-test.)
    for (const [type, expected] of cases) {
      const { alert } = await createAlert(alertBody({ type: type as never, metadata: { trackId: type } }));
      assert.equal(alert.severity, expected, `${type} should default to ${expected}`);
    }
  });

  it('accepts an explicit severity override and a zone name', async () => {
    const { alert } = await createAlert(alertBody({ type: 'running', severity: 'critical', zoneName: 'Test Zone 1' }));
    assert.equal(alert.severity, 'critical');
    assert.equal(alert.zoneName, 'Test Zone 1');
  });

  it('starts new, unread, with a single occurrence', async () => {
    const { status, alert } = await createAlert(alertBody());
    assert.equal(status, 201);
    assert.equal(alert.status, 'new');
    assert.equal(alert.read, false);
    assert.equal(alert.acknowledged, false);
    assert.equal(alert.occurrences, 1);
    assert.ok(alert.lastOccurredAt);
  });

  it('rejects an invalid body', async () => {
    const response = await fetch(`${server.baseUrl}/api/vision/alerts`, {
      method: 'POST',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ cameraId: TEST_CAMERA_ID, type: 'not-a-type', confidence: 0.5, message: 'x' }),
    });
    assert.equal(response.status, 400);
  });
});

describe('duplicate grouping', () => {
  it('folds a repeat inside the cooldown into the existing alert instead of duplicating', async () => {
    const first = await createAlert(alertBody({ metadata: { trackId: 7 } }));
    assert.equal(first.status, 201);

    const repeat = await createAlert(alertBody({ confidence: 0.55, message: 'repeat', metadata: { trackId: 7 } }));

    assert.equal(repeat.status, 200, 'a grouped repeat is not a new record');
    assert.equal(repeat.alert._id, first.alert._id);
    assert.equal(repeat.alert.occurrences, 2);
    assert.notEqual(repeat.alert.lastOccurredAt, first.alert.lastOccurredAt);

    const { alerts } = await listAlerts(`?cameraId=${TEST_CAMERA_ID}&limit=50`);
    assert.equal(alerts.length, 1, 'only one row should exist');
  });

  it('never loses the original record when grouping', async () => {
    const first = await createAlert(alertBody({ confidence: 0.9, message: 'original message', metadata: { trackId: 7 } }));
    const repeat = await createAlert(alertBody({ confidence: 0.1, message: 'later weaker repeat', metadata: { trackId: 7 } }));

    assert.equal(repeat.alert.confidence, 0.9, 'original confidence preserved');
    assert.equal(repeat.alert.message, 'original message', 'original message preserved');
    assert.equal(repeat.alert.createdAt, first.alert.createdAt, 'original timestamp preserved');
  });

  it('keeps a different tracked entity separate', async () => {
    await createAlert(alertBody({ metadata: { trackId: 1 } }));
    const other = await createAlert(alertBody({ metadata: { trackId: 2 } }));

    assert.equal(other.status, 201);
    const { alerts } = await listAlerts(`?cameraId=${TEST_CAMERA_ID}&limit=50`);
    assert.equal(alerts.length, 2);
  });

  it('keeps a different camera separate', async () => {
    await createAlert(alertBody({ cameraId: TEST_CAMERA_ID, metadata: { trackId: 1 } }));
    const other = await createAlert(alertBody({ cameraId: TEST_CAMERA_ID_B, metadata: { trackId: 1 } }));

    assert.equal(other.status, 201);
  });

  it('does not let a resolved alert absorb a recurrence', async () => {
    const first = await createAlert(alertBody({ metadata: { trackId: 7 } }));
    await fetch(`${server.baseUrl}/api/vision/alerts/${first.alert._id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ status: 'resolved' }),
    });

    const recurrence = await createAlert(alertBody({ metadata: { trackId: 7 } }));

    assert.equal(recurrence.status, 201, 'an event recurring after sign-off must raise a fresh alert');
    assert.notEqual(recurrence.alert._id, first.alert._id);
    assert.equal(recurrence.alert.status, 'new');
  });

  it('leaves read state alone when grouping, so repeats do not re-notify', async () => {
    const first = await createAlert(alertBody({ metadata: { trackId: 7 } }));
    await fetch(`${server.baseUrl}/api/vision/alerts/${first.alert._id}/read`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ read: true }),
    });

    const repeat = await createAlert(alertBody({ metadata: { trackId: 7 } }));
    assert.equal(repeat.alert.read, true, 'grouping must not re-flag an alert as unread');
  });
});

describe('status lifecycle', () => {
  it('moves through every supported status and keeps the legacy flag in sync', async () => {
    const { alert } = await createAlert(alertBody());

    for (const status of ['acknowledged', 'under_review', 'resolved', 'dismissed'] as const) {
      const response = await fetch(`${server.baseUrl}/api/vision/alerts/${alert._id}/status`, {
        method: 'PATCH',
        headers: jsonHeaders(cookie),
        body: JSON.stringify({ status }),
      });
      assert.equal(response.status, 200);

      const updated = await readJson<TestAlert>(response);
      assert.equal(updated.status, status);
      assert.equal(updated.acknowledged, true, 'anything triaged counts as acknowledged for legacy clients');
      assert.equal(updated.read, true, 'triaging implies it was seen');
      assert.ok(updated.statusChangedAt);
      assert.ok(updated.statusChangedBy);
    }
  });

  it('maps status back to new, leaving acknowledged false', async () => {
    const { alert } = await createAlert(alertBody());
    const response = await fetch(`${server.baseUrl}/api/vision/alerts/${alert._id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ status: 'new' }),
    });
    assert.equal((await readJson<TestAlert>(response)).acknowledged, false);
  });

  it('rejects an unknown status and a missing alert', async () => {
    const { alert } = await createAlert(alertBody());

    const invalid = await fetch(`${server.baseUrl}/api/vision/alerts/${alert._id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ status: 'resolvd' }),
    });
    assert.equal(invalid.status, 400);

    const missing = await fetch(`${server.baseUrl}/api/vision/alerts/000000000000000000000000/status`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ status: 'resolved' }),
    });
    assert.equal(missing.status, 404);
  });

  it('still supports the legacy acknowledge endpoint', async () => {
    const { alert } = await createAlert(alertBody());
    const response = await fetch(`${server.baseUrl}/api/vision/alerts/${alert._id}`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ acknowledged: true }),
    });

    const updated = await readJson<TestAlert>(response);
    assert.equal(response.status, 200);
    assert.equal(updated.acknowledged, true);
    assert.equal(updated.status, 'acknowledged');
  });
});

describe('read state', () => {
  it('marks one alert read and unread', async () => {
    const { alert } = await createAlert(alertBody());

    const read = await fetch(`${server.baseUrl}/api/vision/alerts/${alert._id}/read`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({}),
    });
    assert.equal((await readJson<TestAlert>(read)).read, true, 'read defaults to true');

    const unread = await fetch(`${server.baseUrl}/api/vision/alerts/${alert._id}/read`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ read: false }),
    });
    assert.equal((await readJson<TestAlert>(unread)).read, false);
  });

  it('marks every unread alert read and reports how many changed', async () => {
    await createAlert(alertBody({ metadata: { trackId: 1 } }));
    await createAlert(alertBody({ metadata: { trackId: 2 } }));
    await createAlert(alertBody({ metadata: { trackId: 3 } }));

    const response = await fetch(`${server.baseUrl}/api/vision/alerts/read-all`, {
      method: 'POST',
      headers: jsonHeaders(cookie),
    });
    assert.equal((await readJson<{ modified: number }>(response)).modified, 3);

    const { alerts } = await listAlerts('?limit=50');
    assert.ok(alerts.every((alert) => alert.read));
    assert.equal((await counts()).unread, 0);
  });
});

describe('counts', () => {
  it('reports unread, critical-open and new totals from real records', async () => {
    assert.deepEqual(await counts(), { unread: 0, criticalOpen: 0, new: 0 });

    await createAlert(alertBody({ type: 'drowning', metadata: { trackId: 1 } }));
    await createAlert(alertBody({ type: 'fighting', metadata: { trackId: 2 } }));
    await createAlert(alertBody({ type: 'running', metadata: { trackId: 3 } }));

    assert.deepEqual(await counts(), { unread: 3, criticalOpen: 2, new: 3 });
  });

  it('stops counting a critical alert as open once it is resolved', async () => {
    const { alert } = await createAlert(alertBody({ type: 'drowning' }));
    assert.equal((await counts()).criticalOpen, 1);

    await fetch(`${server.baseUrl}/api/vision/alerts/${alert._id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ status: 'resolved' }),
    });

    const after = await counts();
    assert.equal(after.criticalOpen, 0, 'resolved is not open');
    assert.equal(after.new, 0);
    assert.equal(after.unread, 0, 'triaging marks it read');
  });

  it('still counts an acknowledged critical alert as open', async () => {
    const { alert } = await createAlert(alertBody({ type: 'drowning' }));
    await fetch(`${server.baseUrl}/api/vision/alerts/${alert._id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ status: 'acknowledged' }),
    });
    assert.equal((await counts()).criticalOpen, 1, 'acknowledged still needs someone to close it out');
  });
});

describe('filtering', () => {
  beforeEach(async () => {
    await createAlert(alertBody({ type: 'drowning', cameraId: TEST_CAMERA_ID, zoneName: 'Test Zone 1', metadata: { trackId: 1 } }));
    await createAlert(alertBody({ type: 'running', cameraId: TEST_CAMERA_ID, metadata: { trackId: 2 } }));
    await createAlert(alertBody({ type: 'loitering', cameraId: TEST_CAMERA_ID_B, metadata: { trackId: 3 } }));
  });

  it('filters by severity, type, camera and zone', async () => {
    assert.equal((await listAlerts('?severity=critical&limit=50')).alerts.length, 1);
    assert.equal((await listAlerts('?severity=warning&limit=50')).alerts.length, 2);
    assert.equal((await listAlerts('?type=running&limit=50')).alerts.length, 1);
    assert.equal((await listAlerts(`?cameraId=${TEST_CAMERA_ID}&limit=50`)).alerts.length, 2);
    assert.equal((await listAlerts('?zoneName=Test%20Zone%201&limit=50')).alerts.length, 1);
  });

  it('filters by status, including several at once', async () => {
    const { alerts } = await listAlerts('?limit=50');
    await fetch(`${server.baseUrl}/api/vision/alerts/${alerts[0]._id}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ status: 'resolved' }),
    });

    assert.equal((await listAlerts('?status=new&limit=50')).alerts.length, 2);
    assert.equal((await listAlerts('?status=resolved&limit=50')).alerts.length, 1);
    assert.equal((await listAlerts('?status=new,resolved&limit=50')).alerts.length, 3);
  });

  it('filters by read state and the legacy acknowledged flag', async () => {
    const { alerts } = await listAlerts('?limit=50');
    await fetch(`${server.baseUrl}/api/vision/alerts/${alerts[0]._id}/read`, {
      method: 'PATCH',
      headers: jsonHeaders(cookie),
      body: JSON.stringify({ read: true }),
    });

    assert.equal((await listAlerts('?read=true&limit=50')).alerts.length, 1);
    assert.equal((await listAlerts('?read=false&limit=50')).alerts.length, 2);
    assert.equal((await listAlerts('?acknowledged=false&limit=50')).alerts.length, 3);
  });

  it('filters by date range against createdAt', async () => {
    const future = await listAlerts('?from=2999-01-01T00:00:00Z&limit=50');
    assert.equal(future.alerts.length, 0);

    const past = await listAlerts('?from=2000-01-01T00:00:00Z&limit=50');
    assert.equal(past.alerts.length, 3);

    const ended = await listAlerts('?to=2000-01-01T00:00:00Z&limit=50');
    assert.equal(ended.alerts.length, 0);
  });

  it('combines filters', async () => {
    const { alerts } = await listAlerts(`?severity=warning&cameraId=${TEST_CAMERA_ID}&status=new&limit=50`);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].type, 'running');
  });

  it('returns newest first', async () => {
    const { alerts } = await listAlerts('?limit=50');
    const times = alerts.map((alert) => new Date(alert.createdAt).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => b - a));
  });

  it('rejects an invalid filter rather than silently returning everything', async () => {
    const cases = ['severity=high', 'type=bogus', 'status=nope', 'from=notadate', 'read=maybe'];
    for (const query of cases) {
      const response = await fetch(`${server.baseUrl}/api/vision/alerts?${query}`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 400, `${query} should be rejected`);
    }
  });
});
