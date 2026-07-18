import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, jsonHeaders, readJson } from './support/factories.js';

/**
 * Separate file so it gets its own process: `src/config/env.ts` reads the
 * environment once at import, so the simulation-disabled / bridge-closed posture
 * (what production looks like) can't coexist with the default one in a single
 * test process.
 */

const LORA_DEVICE_ID = 'test-wristband-off';

let server: TestServer;
let adminCookie: string;

before(async () => {
  // Simulation off and no bridge secret — the production-shaped configuration.
  server = await startTestServer({ DEVICE_SIMULATION_ENABLED: 'false', DEVICE_BRIDGE_SECRET: '' });
});

after(async () => {
  await server.stop();
});

beforeEach(async () => {
  await server.reset();
  await server.createUser({ ...TEST_ADMIN, role: 'admin' });
  adminCookie = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);
});

describe('device commands with simulation disabled', () => {
  it('reports simulation disabled', async () => {
    const caps = await readJson<{ simulationEnabled: boolean }>(
      await fetch(`${server.baseUrl}/api/device-commands/capabilities`, { headers: { Cookie: adminCookie } }),
    );
    assert.equal(caps.simulationEnabled, false);
  });

  it('refuses a test haptic even for an eligible person', async () => {
    const role = await readJson<{ _id: string }>(
      await fetch(`${server.baseUrl}/api/roles`, {
        method: 'POST',
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({ key: 'staff', name: 'Staff' }),
      }),
    );
    const person = await readJson<{ _id: string }>(
      await fetch(`${server.baseUrl}/api/people`, {
        method: 'POST',
        headers: jsonHeaders(adminCookie),
        body: JSON.stringify({ roleId: role._id, name: 'Eligible Person', loraDeviceId: LORA_DEVICE_ID }),
      }),
    );

    const response = await fetch(`${server.baseUrl}/api/device-commands/test-haptic`, {
      method: 'POST',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ personId: person._id }),
    });
    assert.equal(response.status, 403);
  });

  it('closes the bridge (503) when no DEVICE_BRIDGE_SECRET is configured', async () => {
    const response = await fetch(`${server.baseUrl}/api/device-bridge/commands?deviceId=${LORA_DEVICE_ID}`);
    assert.equal(response.status, 503);
  });
});
