import { VisionAlert } from './vision.model.js';
import { DETECTION_TYPES, defaultSeverityForType } from './vision.types.js';

/**
 * Backfills alerts written before the notification lifecycle existed
 * (severity/status/read/zoneName/occurrences/lastOccurredAt).
 *
 * Mapping for legacy documents:
 * - `acknowledged: true`  -> status `acknowledged`, read `true`
 * - `acknowledged: false` -> status `new`, read `false`
 * - severity  -> the default for the alert's detection type
 * - occurrences -> 1, lastOccurredAt -> the original createdAt
 *
 * Idempotent: it only matches documents with no `status`, so a second run
 * updates nothing. Runs at boot so no manual database reset is needed.
 */
export async function backfillAlertLifecycleFields(): Promise<number> {
  const pending = await VisionAlert.countDocuments({ status: { $exists: false } });
  if (pending === 0) return 0;

  const result = await VisionAlert.bulkWrite(
    DETECTION_TYPES.map((type) => ({
      updateMany: {
        filter: { status: { $exists: false }, type },
        update: [
          {
            $set: {
              severity: defaultSeverityForType(type),
              status: { $cond: [{ $eq: ['$acknowledged', true] }, 'acknowledged', 'new'] },
              read: { $eq: ['$acknowledged', true] },
              // Normalizes a missing legacy flag to an explicit false.
              acknowledged: { $eq: ['$acknowledged', true] },
              zoneName: null,
              occurrences: 1,
              lastOccurredAt: '$createdAt',
            },
          },
        ],
      },
    })),
  );

  const migrated = result.modifiedCount ?? 0;
  console.log(`[vision] backfilled lifecycle fields on ${migrated} legacy alert(s)`);
  return migrated;
}
