import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectToDatabase } from './db/mongoose.js';
import { startLorawanMqttClient } from './modules/lorawan-ingest/lorawan.mqtt.js';
import { backfillAlertLifecycleFields, stripRetiredDetectorSettings } from './modules/vision/vision.migration.js';
import { seedAdminUser } from './modules/auth/auth.seed.js';
import { seedRoles } from './modules/identity/identity.seed.js';
import { migrateRolePermissionsToActionRules } from './modules/identity/identity.migration.js';
import { reportReadingsAccessMode } from './modules/lorawan-ingest/readings.auth.js';

async function main() {
  await connectToDatabase();
  await backfillAlertLifecycleFields();
  await stripRetiredDetectorSettings();
  // Before seeding: a role written in the old permission shape must be
  // migrated before anything reads it through the new schema.
  await migrateRolePermissionsToActionRules();
  await seedAdminUser();
  await seedRoles();
  reportReadingsAccessMode();

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
