import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestServer, type TestServer } from './support/testServer.js';
import { TEST_ADMIN, TEST_OPERATOR, jsonHeaders, readJson } from './support/factories.js';

interface TestCamera {
  _id: string;
  name: string;
  sourceType: string;
  streamUrl: string | null;
  error?: string;
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

function createCamera(body: Record<string, unknown>, cookie = adminCookie) {
  return fetch(`${server.baseUrl}/api/cameras`, {
    method: 'POST',
    headers: jsonHeaders(cookie),
    body: JSON.stringify(body),
  });
}

const MJPEG_URL = 'http://camera-ip/video.mjpg';

describe('cameras: duplicate stream URLs', () => {
  it('registers the first camera on a stream URL', async () => {
    const response = await createCamera({ name: 'Front door', sourceType: 'mjpeg-stream', streamUrl: MJPEG_URL });
    assert.equal(response.status, 201);
    assert.equal((await readJson<TestCamera>(response)).streamUrl, MJPEG_URL);
  });

  it('refuses a second camera with the same stream URL', async () => {
    await createCamera({ name: 'Front door', sourceType: 'mjpeg-stream', streamUrl: MJPEG_URL });
    const dup = await createCamera({ name: 'Also front door', sourceType: 'mjpeg-stream', streamUrl: MJPEG_URL });

    assert.equal(dup.status, 409);
    assert.match((await readJson<TestCamera>(dup)).error ?? '', /already exists/i);
  });

  it('refuses the same URL even across stream types (it is one physical feed)', async () => {
    await createCamera({ name: 'MJPEG', sourceType: 'mjpeg-stream', streamUrl: MJPEG_URL });
    const dup = await createCamera({ name: 'HLS', sourceType: 'hls-stream', streamUrl: MJPEG_URL });
    assert.equal(dup.status, 409);
  });

  it('allows a different stream URL', async () => {
    await createCamera({ name: 'Front door', sourceType: 'mjpeg-stream', streamUrl: MJPEG_URL });
    const other = await createCamera({ name: 'Back door', sourceType: 'mjpeg-stream', streamUrl: 'http://camera-ip/back.mjpg' });
    assert.equal(other.status, 201);
  });

  it('does not treat two local-device cameras (no URL) as duplicates', async () => {
    assert.equal((await createCamera({ name: 'Webcam A', sourceType: 'local-device' })).status, 201);
    assert.equal((await createCamera({ name: 'Webcam B', sourceType: 'local-device' })).status, 201);
  });
});

describe('cameras: updating a stream URL', () => {
  async function seed(name: string, streamUrl: string): Promise<string> {
    const response = await createCamera({ name, sourceType: 'mjpeg-stream', streamUrl });
    assert.equal(response.status, 201);
    return (await readJson<TestCamera>(response))._id;
  }

  it('refuses moving a camera onto a URL another camera already uses', async () => {
    await seed('First', MJPEG_URL);
    const secondId = await seed('Second', 'http://camera-ip/second.mjpg');

    const response = await fetch(`${server.baseUrl}/api/cameras/${secondId}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ streamUrl: MJPEG_URL }),
    });
    assert.equal(response.status, 409);
  });

  it('lets a camera keep its own URL on an unrelated edit', async () => {
    const id = await seed('First', MJPEG_URL);
    const response = await fetch(`${server.baseUrl}/api/cameras/${id}`, {
      method: 'PATCH',
      headers: jsonHeaders(adminCookie),
      body: JSON.stringify({ name: 'Renamed', streamUrl: MJPEG_URL }),
    });
    assert.equal(response.status, 200);
    assert.equal((await readJson<TestCamera>(response)).name, 'Renamed');
  });
});

describe('cameras: authorization', () => {
  it('refuses an operator creating a camera', async () => {
    const response = await createCamera(
      { name: 'Nope', sourceType: 'mjpeg-stream', streamUrl: MJPEG_URL },
      operatorCookie,
    );
    assert.equal(response.status, 403);
  });
});
