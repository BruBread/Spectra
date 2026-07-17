import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it } from 'node:test';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The production guards live in `src/config/env.ts`, which throws while the
 * module is being evaluated. That can't be re-tested in-process — the module
 * is cached after its first import — so each case loads it in a fresh child
 * process and asserts the process refuses to start.
 *
 * Nothing here touches a database: the guards throw before any connection.
 */
function loadEnvWith(extra: Record<string, string>): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', '--eval', "await import('./src/config/env.ts');"],
      {
        cwd: backendRoot,
        env: {
          ...process.env,
          APP_ENV: 'production',
          MONGODB_URI: 'mongodb://127.0.0.1:27017/never-connected',
          SESSION_SECRET: 'a-unique-production-secret-for-this-test',
          CORS_ORIGIN: 'https://spectra.example.test',
          MOBILE_API_KEY: '',
          LORAWAN_READINGS_ALLOW_ANONYMOUS: 'false',
          ...extra,
        },
      },
    );

    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

describe('production configuration guards', () => {
  it('refuses to start when anonymous LoRa reads are enabled', async () => {
    const { code, output } = await loadEnvWith({ LORAWAN_READINGS_ALLOW_ANONYMOUS: 'true' });

    assert.notEqual(code, 0, 'production must not boot with anonymous reads enabled');
    assert.match(output, /LORAWAN_READINGS_ALLOW_ANONYMOUS=true is prohibited in production/);
  });

  it('refuses to start when a mobile API key is configured', async () => {
    const { code, output } = await loadEnvWith({ MOBILE_API_KEY: 'some-shared-key' });

    assert.notEqual(code, 0, 'the shared key is development-only');
    assert.match(output, /MOBILE_API_KEY must not be set in production/);
  });

  it('refuses to start without a unique session secret', async () => {
    const { code, output } = await loadEnvWith({ SESSION_SECRET: '' });

    assert.notEqual(code, 0);
    assert.match(output, /SESSION_SECRET must be set/);
  });

  it('refuses to start with a wildcard CORS origin', async () => {
    const { code, output } = await loadEnvWith({ CORS_ORIGIN: '*' });

    assert.notEqual(code, 0, 'a wildcard origin cannot be used with cookie authentication');
    assert.match(output, /CORS_ORIGIN must list explicit origins in production/);
  });

  it('starts when neither development-only setting is present', async () => {
    const { code, output } = await loadEnvWith({});

    assert.equal(code, 0, `production config should load cleanly, got: ${output}`);
  });
});
