import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { VisionAlert } from '../src/modules/vision/vision.model.js';
import { RETIRED_DETECTION_TYPES } from '../src/modules/vision/vision.types.js';

/**
 * Deletes alerts recorded by detectors that no longer exist.
 *
 * Deliberately a manual, opt-in command rather than a boot migration:
 * silently deleting a customer's recorded history because the product
 * narrowed would be indefensible. The schema keeps retired types readable, so
 * doing nothing is a perfectly valid choice — this exists for local and
 * development databases whose retired-type alerts are just stale test noise.
 *
 *   npm run purge:retired-alerts -- --confirm
 */
async function main() {
  if (env.isProduction) {
    console.error(
      '[purge] refusing to run with APP_ENV=production. Retired-type alerts are real recorded history there; they stay readable and are not deleted automatically.',
    );
    process.exit(1);
  }

  const confirmed = process.argv.includes('--confirm');

  await mongoose.connect(env.mongodbUri);
  const filter = { type: { $in: RETIRED_DETECTION_TYPES } };
  const matching = await VisionAlert.countDocuments(filter);

  if (matching === 0) {
    console.log('[purge] no retired-type alerts found — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const breakdown = await VisionAlert.aggregate<{ _id: string; count: number }>([
    { $match: filter },
    { $group: { _id: '$type', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log(`[purge] ${env.appEnv} database: ${env.mongodbUri.replace(/\/\/[^@]*@/, '//')}`);
  console.log(`[purge] ${matching} retired-type alert(s):`);
  for (const row of breakdown) {
    console.log(`  ${row._id}: ${row.count}`);
  }

  if (!confirmed) {
    console.log('\n[purge] dry run — nothing deleted. Re-run with --confirm to delete them.');
    await mongoose.disconnect();
    return;
  }

  const { deletedCount } = await VisionAlert.deleteMany(filter);
  console.log(`\n[purge] deleted ${deletedCount} retired-type alert(s).`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[purge] failed', error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
