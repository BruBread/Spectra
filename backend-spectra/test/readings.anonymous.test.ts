import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_DEVICE_ID, jsonHeaders, ttnUplinkBody } from './support/factories.js';

/**
 * Separate file so it gets its own process: `src/config/env.ts` reads the
 * environment once at import, so the anonymous-enabled posture can't coexist
 * with the default one inside a single test process.
 */
let server: TestServer;

before(async () => {
  server = await startTestServer({ LORAWAN_READINGS_ALLOW_ANONYMOUS: 'true', MOBILE_API_KEY: '' });
});

after(async () => {
  await server.stop();
});

beforeEach(async () => {
  await server.reset();
  await fetch(`${server.baseUrl}/api/lorawan/webhook/ttn`, {
    method: 'POST',
    headers: { ...jsonHeaders(), 'X-Webhook-Secret': 'test-ttn-secret' },
    body: JSON.stringify(ttnUplinkBody()),
  });
});

describe('reading access with the anonymous compatibility flag on', () => {
  it('restores unauthenticated reads for an already-deployed client', async () => {
    const response = await fetch(`${server.baseUrl}/api/lorawan/readings?deviceId=${TEST_DEVICE_ID}`);
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as unknown[]).length, 1);
  });

  it('still protects every admin route', async () => {
    for (const path of ['/api/cameras', '/api/vision/alerts', '/api/vision/settings']) {
      const response = await fetch(`${server.baseUrl}${path}`);
      assert.equal(response.status, 401, `${path} must stay protected regardless of the readings flag`);
    }
  });
});
