import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Backend for the frontend end-to-end tests.
 *
 * Starts its own in-memory MongoDB and seeds a test admin, so the E2E run
 * needs no installed mongod, no manual setup, and — critically — cannot see
 * the normal local database. Everything it stores dies with the process.
 *
 * Playwright launches this via `webServer`; it is never used in production.
 */
const PORT = Number(process.env.E2E_BACKEND_PORT ?? 4100);
const FRONTEND_ORIGIN = process.env.E2E_FRONTEND_ORIGIN ?? 'http://localhost:3100';

export const E2E_ADMIN = { email: 'e2e-admin@example.test', password: 'e2e-admin-pw-1', name: 'E2E Admin' };

/**
 * A second, non-admin account.
 *
 * The API has no user-creation endpoint — accounts are seeded from the
 * environment — so the operator the read-only specs sign in as has to be
 * created here, against the same throwaway database.
 */
export const E2E_OPERATOR = { email: 'e2e-operator@example.test', password: 'e2e-operator-pw-1', name: 'E2E Operator' };

async function main() {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri('spectra_e2e');

  // Pinned before the app is imported: src/config/env.ts reads process.env
  // once at import, and dotenv won't overwrite keys that already exist, so a
  // developer's .env.local can't change what the tests exercise.
  Object.assign(process.env, {
    APP_ENV: 'local',
    PORT: String(PORT),
    MONGODB_URI: uri,
    SESSION_SECRET: 'e2e-only-session-secret-not-used-anywhere-real',
    SESSION_COOKIE_SECURE: 'false',
    SESSION_COOKIE_SAMESITE: 'lax',
    CORS_ORIGIN: FRONTEND_ORIGIN,
    TTN_WEBHOOK_SECRET: 'e2e-ttn-secret',
    CHIRPSTACK_WEBHOOK_SECRET: 'e2e-chirpstack-secret',
    MOBILE_API_KEY: '',
    LORAWAN_READINGS_ALLOW_ANONYMOUS: 'false',
    MQTT_ENABLED: 'false',
    ADMIN_NAME: E2E_ADMIN.name,
    ADMIN_EMAIL: E2E_ADMIN.email,
    ADMIN_PASSWORD: E2E_ADMIN.password,
  });

  const mongoose = (await import('mongoose')).default;
  await mongoose.connect(uri);

  const { seedAdminUser } = await import('../../src/modules/auth/auth.seed.js');
  const { seedRoles } = await import('../../src/modules/identity/identity.seed.js');
  const authService = await import('../../src/modules/auth/auth.service.js');
  await seedAdminUser();
  await authService.createUser({ ...E2E_OPERATOR, role: 'operator' });
  // Mirrors server.ts: a real deployment always boots with the two seeded
  // roles, so the UI under test must face the same starting state.
  await seedRoles();

  const { createApp } = await import('../../src/app.js');

  /**
   * The test-only reset lives here, wrapped around the real app, rather than
   * inside createApp() — so it exists only when this script is the entry
   * point and can never be reachable in a real deployment. It has to run
   * before the app because createApp() ends with a 404 handler that would
   * otherwise swallow the route.
   *
   * Alerts have no DELETE endpoint, so specs can't clean up through the API;
   * this drops the collections directly. Users are kept so the seeded admin
   * survives, which is also why it can only ever point at a throwaway DB.
   *
   * Roles are re-seeded afterwards, restoring the same state a real backend
   * boots into — seedRoles() is a no-op unless the collection is empty, so a
   * spec that deactivates a seeded role still gets a clean slate here.
   */
  const outer = express();
  outer.use(express.json());
  outer.post('/__test__/reset', async (_req, res, next) => {
    try {
      const { collections } = mongoose.connection;
      await Promise.all(
        Object.entries(collections)
          .filter(([name]) => name !== 'users')
          .map(([, collection]) => collection.deleteMany({})),
      );
      await seedRoles();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  /**
   * Test-only person seeding, straight into the store.
   *
   * The public API auto-allocates AprilTags and won't accept a hand-picked one,
   * but specs need to plant fixtures in *known* states — a specific tag id to
   * match against an observation, or a tagless/credential-free person that the
   * normal create flow can no longer produce. Like the reset above, this exists
   * only when this harness is the entry point and never inside createApp().
   */
  outer.post('/__test__/seed-person', async (req, res, next) => {
    try {
      const { Person } = await import('../../src/modules/identity/person.model.js');
      const doc = await Person.create(req.body);
      res.status(201).json(doc);
    } catch (error) {
      next(error);
    }
  });

  outer.use(createApp());

  outer.listen(PORT, () => {
    console.log(`[e2e] backend on http://localhost:${PORT} with a throwaway in-memory database`);
  });

  const shutdown = async () => {
    await mongoose.disconnect().catch(() => undefined);
    await mongo.stop().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((error) => {
  console.error('[e2e] failed to start', error);
  process.exit(1);
});
