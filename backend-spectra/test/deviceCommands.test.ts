import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_OPERATOR, jsonHeaders, readJson } from './support/factories.js';

const BRIDGE_SECRET = 'test-device-bridge-secret';
const LORA_DEVICE_ID = 'test-wristband-001';

interface TestCommand {
  _id: string;
  deviceId: string;
  personId: string | null;
  personName: string;
  nonce: string;
  transport: string;
  simulated: boolean;
  status: string;
  issuedByEmail: string;
  delivery: { events: Array<{ label: string; detail: string; simulated: boolean }> };
  ack: { deviceStatus: string; simulated: boolean } | null;
  error?: string;
}

let server: TestServer;
let adminCookie: string;
let operatorCookie: string;
let roleId: string;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.stop();
});

async function createRole(): Promise<string> {
  const response = await fetch(`${server.baseUrl}/api/roles`, {
    method: 'POST',
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ key: 'staff', name: 'Staff' }),
  });
  assert.equal(response.status, 201);
  return (await readJson<{ _id: string }>(response))._id;
}

async function createPerson(body: Record<string, unknown>): Promise<{ status: number; person: { _id: string; error?: string } }> {
  const response = await fetch(`${server.baseUrl}/api/people`, {
    method: 'POST',
    headers: jsonHeaders(adminCookie),
    body: JSON.stringify({ roleId, name: 'Wristband Wearer', ...body }),
  });
  return { status: response.status, person: await readJson(response) };
}

async function testHaptic(personId: string, cookie = adminCookie): Promise<{ status: number; command: TestCommand & { error?: string } }> {
  const response = await fetch(`${server.baseUrl}/api/device-commands/test-haptic`, {
    method: 'POST',
    headers: jsonHeaders(cookie),
    body: JSON.stringify({ personId }),
  });
  return { status: response.status, command: await readJson(response) };
}

/** Signs a bridge request exactly as the future Pi will (see docs/pi-sx1278-bridge.md). */
function bridgeHeaders(method: string, path: string, body: string, opts: { secret?: string; nonce?: string; timestamp?: string } = {}) {
  const secret = opts.secret ?? BRIDGE_SECRET;
  const timestamp = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = opts.nonce ?? `nonce-${Math.random().toString(16).slice(2)}`;
  const bodyHash = createHash('sha256').update(Buffer.from(body)).digest('hex');
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`)
    .digest('hex');
  return {
    'Content-Type': 'application/json',
    'X-Bridge-Timestamp': timestamp,
    'X-Bridge-Nonce': nonce,
    'X-Bridge-Signature': signature,
  };
}

beforeEach(async () => {
  await server.reset();
  await server.createUser({ ...TEST_ADMIN, role: 'admin' });
  await server.createUser({ ...TEST_OPERATOR, role: 'operator' });
  adminCookie = await server.login(TEST_ADMIN.email, TEST_ADMIN.password);
  operatorCookie = await server.login(TEST_OPERATOR.email, TEST_OPERATOR.password);
  roleId = await createRole();
});

describe('device capabilities', () => {
  it('reports simulation enabled and the simulated transport in local mode', async () => {
    const response = await fetch(`${server.baseUrl}/api/device-commands/capabilities`, { headers: { Cookie: operatorCookie } });
    assert.equal(response.status, 200);
    const body = await readJson<{ simulationEnabled: boolean; transport: string; simulated: boolean }>(response);
    assert.equal(body.simulationEnabled, true);
    assert.equal(body.transport, 'simulation');
    assert.equal(body.simulated, true);
  });

  it('requires a session', async () => {
    const response = await fetch(`${server.baseUrl}/api/device-commands/capabilities`);
    assert.equal(response.status, 401);
  });
});

describe('test haptic: command creation and simulated delivery', () => {
  it('creates a simulated, acknowledged command with a full audit trail', async () => {
    const { person } = await createPerson({ loraDeviceId: LORA_DEVICE_ID });
    const { status, command } = await testHaptic(person._id);

    assert.equal(status, 201);
    // Device-ID assignment: the command targets the person's assigned device.
    assert.equal(command.deviceId, LORA_DEVICE_ID);
    assert.equal(command.personId, person._id);
    assert.equal(command.transport, 'simulation');
    assert.equal(command.simulated, true);
    // Simulation acks inline, so the round-trip completes in one call.
    assert.equal(command.status, 'acknowledged');
    assert.ok(command.nonce.length >= 16, 'a nonce is issued');

    // Audit: who fired it, and the labelled delivery + vibration + ack trail.
    assert.equal(command.issuedByEmail, TEST_ADMIN.email);
    const labels = command.delivery.events.map((event) => event.label);
    assert.ok(labels.includes('queued'));
    assert.ok(labels.includes('vibration'), 'a vibration event is recorded');
    assert.ok(labels.includes('acknowledged'));
    // Nothing may be presented as real hardware.
    assert.ok(command.delivery.events.every((event) => event.simulated === true));
    assert.ok(command.ack && command.ack.simulated === true);
  });

  it('lists the created command for any signed-in user', async () => {
    const { person } = await createPerson({ loraDeviceId: LORA_DEVICE_ID });
    await testHaptic(person._id);
    const response = await fetch(`${server.baseUrl}/api/device-commands`, { headers: { Cookie: operatorCookie } });
    assert.equal(response.status, 200);
    const commands = await readJson<TestCommand[]>(response);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].deviceId, LORA_DEVICE_ID);
  });
});

describe('test haptic: authorization and device-id requirements', () => {
  it('refuses an operator (admin only)', async () => {
    const { person } = await createPerson({ loraDeviceId: LORA_DEVICE_ID });
    const { status } = await testHaptic(person._id, operatorCookie);
    assert.equal(status, 403);
  });

  it('refuses an unauthenticated caller', async () => {
    const { person } = await createPerson({ loraDeviceId: LORA_DEVICE_ID });
    const response = await fetch(`${server.baseUrl}/api/device-commands/test-haptic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: person._id }),
    });
    assert.equal(response.status, 401);
  });

  it('refuses a person with no assigned LoRa device', async () => {
    const { person } = await createPerson({});
    const { status, command } = await testHaptic(person._id);
    assert.equal(status, 400);
    assert.match(command.error ?? '', /LoRa device/i);
  });

  it('refuses a deactivated person', async () => {
    const { person } = await createPerson({ loraDeviceId: LORA_DEVICE_ID, active: false });
    const { status, command } = await testHaptic(person._id);
    assert.equal(status, 400);
    assert.match(command.error ?? '', /active/i);
  });

  it('rejects an invalid person id and an unknown person', async () => {
    assert.equal((await testHaptic('not-an-id')).status, 400);
    assert.equal((await testHaptic('64b7f0000000000000000000')).status, 404);
  });
});

describe('device bridge: authentication', () => {
  it('rejects a request with no bridge headers', async () => {
    const response = await fetch(`${server.baseUrl}/api/device-bridge/commands?deviceId=${LORA_DEVICE_ID}`);
    assert.equal(response.status, 401);
  });

  it('rejects a wrong shared secret', async () => {
    const path = `/api/device-bridge/commands?deviceId=${LORA_DEVICE_ID}`;
    const response = await fetch(`${server.baseUrl}${path}`, {
      headers: bridgeHeaders('GET', path, '', { secret: 'wrong-secret' }),
    });
    assert.equal(response.status, 401);
  });

  it('rejects a stale timestamp', async () => {
    const path = `/api/device-bridge/commands?deviceId=${LORA_DEVICE_ID}`;
    const stale = String(Math.floor(Date.now() / 1000) - 10_000);
    const response = await fetch(`${server.baseUrl}${path}`, {
      headers: bridgeHeaders('GET', path, '', { timestamp: stale }),
    });
    assert.equal(response.status, 401);
  });

  it('rejects a replayed nonce', async () => {
    const path = `/api/device-bridge/commands?deviceId=${LORA_DEVICE_ID}`;
    const headers = bridgeHeaders('GET', path, '', { nonce: 'reused-nonce-123' });
    const first = await fetch(`${server.baseUrl}${path}`, { headers });
    assert.equal(first.status, 200);
    const second = await fetch(`${server.baseUrl}${path}`, { headers });
    assert.equal(second.status, 401);
  });
});

describe('device bridge: poll, acknowledge and uplink (real transport path)', () => {
  /** Inserts a queued command directly — the simulator acks inline, so the queued path is seeded. */
  async function seedQueuedCommand(nonce: string): Promise<void> {
    const mongoose = (await import('mongoose')).default;
    await mongoose.connection.collection('devicecommands').insertOne({
      deviceId: LORA_DEVICE_ID,
      personId: null,
      personName: '',
      commandType: 'haptic_vibrate',
      params: { pattern: 'double-pulse', pulses: 2, durationMs: 600, intensity: 3 },
      nonce,
      transport: 'pi_sx1278_p2p',
      simulated: false,
      status: 'queued',
      origin: 'admin_test',
      delivery: { events: [] },
      ack: null,
      error: null,
      deliveredAt: null,
      acknowledgedAt: null,
      expiresAt: new Date(Date.now() + 120_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  it('polls pending commands and marks them delivered', async () => {
    await seedQueuedCommand('bridge-nonce-1');
    const path = `/api/device-bridge/commands?deviceId=${LORA_DEVICE_ID}`;
    const response = await fetch(`${server.baseUrl}${path}`, { headers: bridgeHeaders('GET', path, '') });
    assert.equal(response.status, 200);
    const body = await readJson<{ commands: Array<{ nonce: string; commandType: string }> }>(response);
    assert.equal(body.commands.length, 1);
    assert.equal(body.commands[0].nonce, 'bridge-nonce-1');

    // A second poll returns nothing — the command has moved to delivered.
    const again = await fetch(`${server.baseUrl}${path}`, { headers: bridgeHeaders('GET', path, '') });
    const againBody = await readJson<{ commands: unknown[] }>(again);
    assert.equal(againBody.commands.length, 0);
  });

  it('acknowledges a command by nonce and is idempotent', async () => {
    await seedQueuedCommand('bridge-nonce-2');
    const ackPath = '/api/device-bridge/commands/bridge-nonce-2/ack';
    const ackBody = JSON.stringify({ deviceStatus: 'ok', rssi: -55, snr: 8 });
    const first = await fetch(`${server.baseUrl}${ackPath}`, {
      method: 'POST',
      headers: bridgeHeaders('POST', ackPath, ackBody),
      body: ackBody,
    });
    assert.equal(first.status, 200);
    assert.equal((await readJson<{ status: string }>(first)).status, 'acknowledged');

    // Re-ack (a bridge retrying a lost response) is accepted, not doubled.
    const second = await fetch(`${server.baseUrl}${ackPath}`, {
      method: 'POST',
      headers: bridgeHeaders('POST', ackPath, ackBody),
      body: ackBody,
    });
    assert.equal(second.status, 200);
    assert.equal((await readJson<{ status: string }>(second)).status, 'acknowledged');
  });

  it('returns 404 acknowledging an unknown nonce', async () => {
    const ackPath = '/api/device-bridge/commands/no-such-nonce/ack';
    const response = await fetch(`${server.baseUrl}${ackPath}`, {
      method: 'POST',
      headers: bridgeHeaders('POST', ackPath, '{}'),
      body: '{}',
    });
    assert.equal(response.status, 404);
  });

  it('records a wristband uplink relayed by the bridge', async () => {
    const path = '/api/device-bridge/uplinks';
    const body = JSON.stringify({ deviceId: LORA_DEVICE_ID, batteryPct: 88, status: 'ok', rssi: -60, snr: 7 });
    const response = await fetch(`${server.baseUrl}${path}`, {
      method: 'POST',
      headers: bridgeHeaders('POST', path, body),
      body,
    });
    assert.equal(response.status, 202);
    assert.equal((await readJson<{ accepted: boolean }>(response)).accepted, true);
  });
});
