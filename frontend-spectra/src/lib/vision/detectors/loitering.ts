import { ConditionTracker } from '../conditionTracker';
import { poseBoundingBox, poseCentroid } from '../poseMath';
import { isInsideZone, type DetectionAdapter, type DetectionCandidate, type DetectorFrameInput } from './types';
import type { DetectionTypeConfig } from '../types';

/**
 * Flags a tracked person (MoveNet's built-in id) staying inside the
 * configured zone continuously past the duration threshold. Without a
 * configured zone this degrades to "person visible for N seconds," which is
 * rarely useful — the settings panel calls this out.
 */
export function createLoiteringDetector(): DetectionAdapter {
  const conditions = new ConditionTracker();

  return {
    type: 'loitering',
    evaluate(input: DetectorFrameInput, config: DetectionTypeConfig): DetectionCandidate[] {
      const candidates: DetectionCandidate[] = [];
      const activeKeys = new Set<string>();

      for (const pose of input.poses) {
        if (pose.score < config.confidenceThreshold) continue;
        const centroid = poseCentroid(pose);
        if (!centroid) continue;

        const key = `pose-${pose.id}`;
        activeKeys.add(key);

        const inZone = isInsideZone(centroid, config.zone, input.videoWidth, input.videoHeight);
        const shouldFire = conditions.evaluate(
          key,
          inZone,
          input.now,
          config.durationThresholdSeconds * 1000,
          config.cooldownSeconds * 1000,
        );

        if (shouldFire) {
          candidates.push({
            type: 'loitering',
            key,
            confidence: pose.score,
            message: `Person has remained in the monitored zone for ${config.durationThresholdSeconds}s`,
            metadata: { trackId: pose.id },
            box: poseBoundingBox(pose),
          });
        }
      }

      conditions.prune(activeKeys);
      return candidates;
    },
  };
}
