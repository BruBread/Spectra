import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the admin app.
 *
 * Playwright starts both servers itself, so a run needs no manually started
 * dev stack, no installed mongod, and no hardware. The backend it starts
 * (`test:e2e-server` in backend-spectra) creates a throwaway in-memory
 * database, so these tests cannot read or mutate the normal local database,
 * real cameras, or recorded alerts.
 *
 * Non-default ports keep a running dev stack (3000/4000) from colliding.
 */
const FRONTEND_PORT = 3100;
const BACKEND_PORT = 4100;

export const FRONTEND_ORIGIN = `http://localhost:${FRONTEND_PORT}`;
export const BACKEND_ORIGIN = `http://localhost:${BACKEND_PORT}`;

/** Must match ADMIN_EMAIL/ADMIN_PASSWORD seeded by the e2e backend. */
export const E2E_ADMIN = { email: 'e2e-admin@example.test', password: 'e2e-admin-pw-1' };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // The suite shares one backend, so parallel workers would race on shared
  // alert state. One worker keeps assertions about counts meaningful.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: FRONTEND_ORIGIN,
    trace: 'on-first-retry',
    // Turbopack cold-compiles a route on first hit, which can outlast a
    // default action timeout.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run test:e2e-server',
      cwd: '../backend-spectra',
      url: `${BACKEND_ORIGIN}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        E2E_BACKEND_PORT: String(BACKEND_PORT),
        E2E_FRONTEND_ORIGIN: FRONTEND_ORIGIN,
      },
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT}`,
      url: `${FRONTEND_ORIGIN}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        // Shell env wins over .env.local in Next, so this points the app at
        // the throwaway e2e backend rather than the developer's stack.
        NEXT_PUBLIC_API_BASE_URL: BACKEND_ORIGIN,
        // Its own build directory, so a dev server running from this same
        // folder doesn't block the run (Next allows only one per distDir).
        NEXT_DIST_DIR: '.next-e2e',
      },
    },
  ],
});
