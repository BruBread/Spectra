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

/**
 * Anonymous device-reading access exists only to keep an already-deployed
 * client working during a local/development migration window. In production
 * it would hand every device's readings to anyone who can reach the server,
 * so a misconfiguration must fail loudly at boot rather than quietly serve
 * data.
 */
function resolveAllowAnonymousReadings(): boolean {
  const enabled = (process.env.LORAWAN_READINGS_ALLOW_ANONYMOUS ?? 'false').toLowerCase() === 'true';
  if (enabled && isProduction) {
    throw new Error(
      'LORAWAN_READINGS_ALLOW_ANONYMOUS=true is prohibited in production: anonymous reads would expose every device\'s readings to anyone who can reach this server. Unset it or set it to false. Production mobile/guest access requires per-guest, short-lived, device-scoped access tokens — see README > Device readings access.',
    );
  }
  return enabled;
}

/**
 * MOBILE_API_KEY is a development-only bridge. A single static shared secret
 * identifies an app build rather than a guest and cannot express which
 * devices a guest is entitled to, so production must not run on one.
 */
function resolveMobileApiKey(): string {
  const key = process.env.MOBILE_API_KEY ?? '';
  if (key && isProduction) {
    throw new Error(
      'MOBILE_API_KEY must not be set in production: it is a development-only bridge, and a static shared key identifies an app build rather than an individual guest. Unset it. Production mobile/guest access requires per-guest, short-lived, device-scoped access tokens — see README > Device readings access.',
    );
  }
  return key;
}

/**
 * The haptic simulation is a development affordance, never a shipping feature.
 * It fabricates a labelled wristband and a fake round-trip so the workflow can
 * be exercised with no LoRa hardware present. Turning it on in production would
 * let an admin believe a real wristband buzzed when nothing was ever sent, so a
 * misconfiguration must fail loudly at boot rather than quietly lie.
 *
 * Off by default in production; defaults on only in local/development.
 */
function resolveDeviceSimulationEnabled(): boolean {
  const raw = process.env.DEVICE_SIMULATION_ENABLED?.toLowerCase();
  const enabled = raw === undefined ? !isProduction : raw === 'true';
  if (enabled && isProduction) {
    throw new Error(
      'DEVICE_SIMULATION_ENABLED=true is prohibited in production: simulated haptic delivery fabricates a wristband round-trip and never touches real hardware, so it must never run against a live deployment. Unset it or set it to false. Real delivery is the job of the Raspberry Pi + SX1278 bridge — see docs/pi-sx1278-bridge.md.',
    );
  }
  return enabled;
}

/**
 * Shared secret the future Raspberry Pi bridge signs its requests with. There
 * is no dev default on purpose: an empty secret means the bridge endpoints
 * refuse every caller (see bridge.auth.ts), which is the safe posture while no
 * bridge exists. In production a missing secret is a hard boot error — leaving
 * the bridge silently unauthenticated is not an option.
 */
function resolveDeviceBridgeSecret(): string {
  const value = process.env.DEVICE_BRIDGE_SECRET ?? '';
  if (isProduction && !value) {
    throw new Error(
      'DEVICE_BRIDGE_SECRET must be set to a unique random value in production: the Raspberry Pi bridge authenticates with it, and without it the bridge endpoints cannot be safely exposed. Never reuse a webhook secret for it.',
    );
  }
  return value;
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
    /** Development-only scoped credential for non-browser clients — see readings.auth.ts. */
    mobileApiKey: resolveMobileApiKey(),
    /** Development-only pre-auth public reads. Off by default, refused in production. */
    allowAnonymousReadings: resolveAllowAnonymousReadings(),
    mqttEnabled: (process.env.MQTT_ENABLED ?? 'false').toLowerCase() === 'true',
    mqttProvider: (process.env.MQTT_PROVIDER ?? 'ttn').toLowerCase() as 'ttn' | 'chirpstack',
    mqttBrokerUrl: process.env.MQTT_BROKER_URL ?? '',
    mqttUsername: process.env.MQTT_USERNAME ?? '',
    mqttPassword: process.env.MQTT_PASSWORD ?? '',
    mqttTopic: process.env.MQTT_TOPIC ?? '',
  },
  /**
   * Wristband haptic commands. The gateway is a seam: `simulationEnabled`
   * selects the fake in-process transport used for local demos, while the
   * future `pi_sx1278_p2p` transport delivers over the Pi bridge — see
   * docs/pi-sx1278-bridge.md.
   */
  devices: {
    simulationEnabled: resolveDeviceSimulationEnabled(),
    bridgeSecret: resolveDeviceBridgeSecret(),
    /**
     * How long a queued haptic command stays deliverable before it is treated
     * as stale. Short: a wristband buzz that arrives minutes late is noise, and
     * for the simulated round-trip it only bounds the fake ack.
     */
    commandTtlSeconds: Number(process.env.DEVICE_COMMAND_TTL_SECONDS ?? 120),
  },
};
