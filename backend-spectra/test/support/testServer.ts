import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { AdminRole } from '../../src/modules/auth/auth.types.js';

/**
 * Boots the real Express app against a throwaway in-memory MongoDB.
 *
 * The database exists only for the lifetime of the run and is discarded
 * afterwards, so tests can never read or mutate the normal local database,
 * real cameras, or recorded alerts — there is no configuration here that
 * points at them. No mongod needs to be installed or running.
 *
 * Every environment variable the app reads is pinned explicitly *before* the
 * app is imported: `src/config/env.ts` reads process.env once at import time,
 * and dotenv won't overwrite a key that already exists. That keeps a
 * developer's `.env.local` from leaking into test results.
 */
export interface TestServer {
  baseUrl: string;
  /** Drops all data between tests without paying to restart mongod. */
  reset: () => Promise<void>;
  createUser: (input: { name?: string; email: string; password: string; role: AdminRole }) => Promise<string>;
  /** Logs in and returns the session cookie header value. */
  login: (email: string, password: string) => Promise<string>;
  stop: () => Promise<void>;
}

export async function startTestServer(overrides: Record<string, string> = {}): Promise<TestServer> {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri('spectra_test');

  const env: Record<string, string> = {
    APP_ENV: 'local',
    MONGODB_URI: uri,
    SESSION_SECRET: 'test-only-session-secret-not-used-anywhere-real',
    SESSION_COOKIE_NAME: 'spectra.sid',
    SESSION_COOKIE_SECURE: 'false',
    SESSION_COOKIE_SAMESITE: 'lax',
    SESSION_TTL_HOURS: '12',
    CORS_ORIGIN: 'http://localhost:3100',
    TTN_WEBHOOK_SECRET: 'test-ttn-secret',
    CHIRPSTACK_WEBHOOK_SECRET: 'test-chirpstack-secret',
    // Device haptic simulation defaults on in local; the bridge secret is a
    // distinct value from any webhook secret. Tests override these to exercise
    // the disabled/closed postures.
    DEVICE_BRIDGE_SECRET: 'test-device-bridge-secret',
    // Off unless a test opts in — these mirror the shipped defaults.
    MOBILE_API_KEY: '',
    LORAWAN_READINGS_ALLOW_ANONYMOUS: 'false',
    MQTT_ENABLED: 'false',
    // The tests create their own users; no bootstrap seeding.
    ADMIN_EMAIL: '',
    ADMIN_PASSWORD: '',
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  // Imported only now, so the env above is what the app sees.
  const mongoose = (await import('mongoose')).default;
  await mongoose.connect(uri);

  const { createApp } = await import('../../src/app.js');
  const { createUser } = await import('../../src/modules/auth/auth.service.js');

  const app = createApp();
  const server: Server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,

    async reset() {
      const { collections } = mongoose.connection;
      await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
    },

    async createUser(input) {
      const user = await createUser({
        name: input.name ?? 'Test User',
        email: input.email,
        password: input.password,
        role: input.role,
      });
      return String(user._id);
    },

    async login(email, password) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        throw new Error(`test login failed for ${email}: ${response.status}`);
      }
      const cookie = response.headers.get('set-cookie');
      if (!cookie) throw new Error('login returned no session cookie');
      // Just the name=value pair; fetch won't send attributes back.
      return cookie.split(';')[0];
    },

    async stop() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await mongoose.disconnect();
      await mongo.stop();
    },
  };
}
