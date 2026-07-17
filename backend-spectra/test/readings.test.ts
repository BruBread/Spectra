import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_DEVICE_ID, jsonHeaders, ttnUplinkBody } from './support/factories.js';

const TEST_API_KEY = 'test-mobile-api-key';

let server: TestServer;
let cookie: string;

// Key access on, anonymous off — the intended local/development posture.
before(async () => {
  server = await startTestServer({ MOBILE_API_KEY: TEST_API_KEY, LORAWAN_READINGS_ALLOW_ANONYMOUS: 'false' });
});

after(async () => {
  await server.stop();
});

beforeEach(async () => {
  await server.reset();
  await server.createUser({ ...TEST_ADMIN, role: 'admin' });
  cookie = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);

  // Seed a reading the way real data arrives: through the webhook.
  const response = await fetch(`${server.baseUrl}/api/lorawan/webhook/ttn`, {
    method: 'POST',
    headers: { ...jsonHeaders(), 'X-Webhook-Secret': 'test-ttn-secret' },
    body: JSON.stringify(ttnUplinkBody()),
  });
  assert.equal(response.status, 204);
});

describe('LoRa webhooks', () => {
  it('accepts an uplink with the right secret and no session', async () => {
    const response = await fetch(`${server.baseUrl}/api/lorawan/webhook/ttn`, {
      method: 'POST',
      headers: { ...jsonHeaders(), 'X-Webhook-Secret': 'test-ttn-secret' },
      body: JSON.stringify(ttnUplinkBody('test-device-002')),
    });
    assert.equal(response.status, 204, 'a network server has no browser session');
  });

  it('rejects an uplink with a wrong or missing secret', async () => {
    const wrong = await fetch(`${server.baseUrl}/api/lorawan/webhook/ttn`, {
      method: 'POST',
      headers: { ...jsonHeaders(), 'X-Webhook-Secret': 'wrong' },
      body: JSON.stringify(ttnUplinkBody()),
    });
    assert.equal(wrong.status, 401);

    const missing = await fetch(`${server.baseUrl}/api/lorawan/webhook/ttn`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(ttnUplinkBody()),
    });
    assert.equal(missing.status, 401);
  });
});

describe('reading access: admin session', () => {
  it('reads any device, including the unscoped listing', async () => {
    const all = await fetch(`${server.baseUrl}/api/lorawan/readings`, { headers: { Cookie: cookie } });
    assert.equal(all.status, 200);
    assert.equal(((await all.json()) as unknown[]).length, 1);

    const scoped = await fetch(`${server.baseUrl}/api/lorawan/readings?deviceId=${TEST_DEVICE_ID}`, {
      headers: { Cookie: cookie },
    });
    assert.equal(scoped.status, 200);
  });
});

describe('reading access: development API key', () => {
  it('reads a named device', async () => {
    const response = await fetch(`${server.baseUrl}/api/lorawan/readings?deviceId=${TEST_DEVICE_ID}`, {
      headers: { 'X-Api-Key': TEST_API_KEY },
    });
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as unknown[]).length, 1);
  });

  it('cannot bulk-dump every device', async () => {
    const response = await fetch(`${server.baseUrl}/api/lorawan/readings`, { headers: { 'X-Api-Key': TEST_API_KEY } });
    assert.equal(response.status, 400, 'key access is scoped to a single device');
  });

  it('rejects a wrong key', async () => {
    const response = await fetch(`${server.baseUrl}/api/lorawan/readings?deviceId=${TEST_DEVICE_ID}`, {
      headers: { 'X-Api-Key': 'not-the-key' },
    });
    assert.equal(response.status, 401);
  });

  it('grants nothing beyond readings', async () => {
    for (const path of ['/api/cameras', '/api/vision/alerts', '/api/vision/settings']) {
      const response = await fetch(`${server.baseUrl}${path}`, { headers: { 'X-Api-Key': TEST_API_KEY } });
      assert.equal(response.status, 401, `the key must not reach ${path}`);
    }
  });
});

describe('reading access: anonymous', () => {
  it('is blocked when the compatibility flag is off', async () => {
    const response = await fetch(`${server.baseUrl}/api/lorawan/readings?deviceId=${TEST_DEVICE_ID}`);
    assert.equal(response.status, 401);
  });
});
