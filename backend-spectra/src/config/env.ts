import path from 'node:path';
import dotenv from 'dotenv';

type AppEnv = 'local' | 'development' | 'production';

const RAW_APP_ENV = (process.env.APP_ENV ?? 'local').toLowerCase();

const APP_ENV_ALIASES: Record<string, AppEnv> = {
  local: 'local',
  dev: 'development',
  development: 'development',
  prod: 'production',
  production: 'production',
};

const appEnv: AppEnv = APP_ENV_ALIASES[RAW_APP_ENV] ?? 'local';

const ENV_FILE_BY_APP_ENV: Record<AppEnv, string> = {
  local: '.env.local',
  development: '.env.development',
  production: '.env.production',
};

dotenv.config({ path: path.resolve(process.cwd(), ENV_FILE_BY_APP_ENV[appEnv]) });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const isProduction = appEnv === 'production';

/** Dev-only fallback. Production must supply its own — see sessionSecret below. */
const DEV_SESSION_SECRET = 'spectra-local-dev-session-secret-change-me';

function resolveSessionSecret(): string {
  const value = process.env.SESSION_SECRET;
  if (isProduction) {
    if (!value || value === DEV_SESSION_SECRET) {
      throw new Error(
        'SESSION_SECRET must be set to a unique random value in production (a shared/default secret lets anyone forge session cookies)',
      );
    }
    return value;
  }
  return value ?? DEV_SESSION_SECRET;
}

/**
 * Credentialed CORS cannot use `*` — browsers reject
 * `Access-Control-Allow-Origin: *` on requests that carry cookies, so the
 * allowed origins have to be explicit. Accepts a comma-separated list.
 */
function resolveCorsOrigin(): string[] | boolean {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw || raw === '*') {
    if (isProduction) {
      throw new Error('CORS_ORIGIN must list explicit origins in production — "*" cannot be used with cookie authentication');
    }
    console.warn('[env] CORS_ORIGIN is unset or "*"; reflecting the request origin for local development only');
    return true;
  }
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

const cookieSameSite = (process.env.SESSION_COOKIE_SAMESITE ?? 'lax').toLowerCase() as 'lax' | 'strict' | 'none';
const cookieSecure = (process.env.SESSION_COOKIE_SECURE ?? String(isProduction)).toLowerCase() === 'true';

if (cookieSameSite === 'none' && !cookieSecure) {
  throw new Error('SESSION_COOKIE_SAMESITE=none requires SESSION_COOKIE_SECURE=true (browsers drop insecure SameSite=None cookies)');
}

export const env = {
  appEnv,
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  mongodbUri: required('MONGODB_URI'),
  corsOrigin: resolveCorsOrigin(),
  session: {
    secret: resolveSessionSecret(),
    cookieName: process.env.SESSION_COOKIE_NAME ?? 'spectra.sid',
    ttlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
    cookieSecure,
    cookieSameSite,
  },
  /**
   * Bootstrap admin. Seeded only when no user exists yet, so it can never
   * silently reset a real account's password on restart.
   */
  seedAdmin: {
    email: process.env.ADMIN_EMAIL ?? '',
    password: process.env.ADMIN_PASSWORD ?? '',
    name: process.env.ADMIN_NAME ?? 'Admin',
  },
  lorawan: {
    ttnWebhookSecret: process.env.TTN_WEBHOOK_SECRET ?? '',
    chirpstackWebhookSecret: process.env.CHIRPSTACK_WEBHOOK_SECRET ?? '',
    /** Temporary scoped credential for non-browser clients — see readings.auth.ts. */
    mobileApiKey: process.env.MOBILE_API_KEY ?? '',
    /** Restores pre-auth public reads for an already-deployed client. Off by default. */
    allowAnonymousReadings: (process.env.LORAWAN_READINGS_ALLOW_ANONYMOUS ?? 'false').toLowerCase() === 'true',
    mqttEnabled: (process.env.MQTT_ENABLED ?? 'false').toLowerCase() === 'true',
    mqttProvider: (process.env.MQTT_PROVIDER ?? 'ttn').toLowerCase() as 'ttn' | 'chirpstack',
    mqttBrokerUrl: process.env.MQTT_BROKER_URL ?? '',
    mqttUsername: process.env.MQTT_USERNAME ?? '',
    mqttPassword: process.env.MQTT_PASSWORD ?? '',
    mqttTopic: process.env.MQTT_TOPIC ?? '',
  },
};
