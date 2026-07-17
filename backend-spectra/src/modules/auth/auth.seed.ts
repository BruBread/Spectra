import { env } from '../../config/env.js';
import * as authService from './auth.service.js';

/**
 * Creates the bootstrap admin from ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * Only runs when the users collection is empty, which keeps it from resetting
 * a real account on restart or re-creating an admin someone deliberately
 * removed. Credentials come from the environment — never from committed
 * source — so each deployment sets its own.
 */
export async function seedAdminUser(): Promise<void> {
  const existing = await authService.countUsers();
  if (existing > 0) return;

  const { email, password, name } = env.seedAdmin;
  if (!email || !password) {
    console.warn(
      '[auth] no users exist and ADMIN_EMAIL/ADMIN_PASSWORD are not set — nobody can sign in. Set both and restart to seed the first admin.',
    );
    return;
  }

  await authService.createUser({ name, email, password, role: 'admin' });
  console.log(`[auth] seeded initial admin account: ${email}`);

  if (env.isProduction) {
    console.warn('[auth] change the seeded admin password after first sign-in.');
  }
}
