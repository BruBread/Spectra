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

export const env = {
  appEnv,
  isProduction: appEnv === 'production',
  port: Number(process.env.PORT ?? 4000),
  mongodbUri: required('MONGODB_URI'),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  lorawan: {
    ttnWebhookSecret: process.env.TTN_WEBHOOK_SECRET ?? '',
    chirpstackWebhookSecret: process.env.CHIRPSTACK_WEBHOOK_SECRET ?? '',
    mqttEnabled: (process.env.MQTT_ENABLED ?? 'false').toLowerCase() === 'true',
    mqttProvider: (process.env.MQTT_PROVIDER ?? 'ttn').toLowerCase() as 'ttn' | 'chirpstack',
    mqttBrokerUrl: process.env.MQTT_BROKER_URL ?? '',
    mqttUsername: process.env.MQTT_USERNAME ?? '',
    mqttPassword: process.env.MQTT_PASSWORD ?? '',
    mqttTopic: process.env.MQTT_TOPIC ?? '',
  },
};
