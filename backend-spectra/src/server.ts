import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectToDatabase } from './db/mongoose.js';
import { startLorawanMqttClient } from './modules/lorawan-ingest/lorawan.mqtt.js';
import { backfillAlertLifecycleFields } from './modules/vision/vision.migration.js';

async function main() {
  await connectToDatabase();
  await backfillAlertLifecycleFields();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port} (${env.appEnv})`);
  });

  if (env.lorawan.mqttEnabled) {
    startLorawanMqttClient();
  }
}

main().catch((error) => {
  console.error('[server] failed to start', error);
  process.exit(1);
});
