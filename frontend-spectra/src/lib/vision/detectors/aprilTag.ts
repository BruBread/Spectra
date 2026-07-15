import { ConditionTracker } from '../conditionTracker';
import type { DetectionAdapter, DetectionCandidate, DetectorFrameInput } from './types';
import type { DetectionTypeConfig } from '../types';

/**
 * A fiducial decode is deterministic (matched within the configured Hamming
 * distance, or not matched at all) rather than a probabilistic model score,
 * so we report a fixed high confidence for successful decodes.
 * confidenceThreshold instead controls decode strictness — see
 * models/aprilTagModel.ts.
 */
const FIXED_DECODE_CONFIDENCE = 0.95;

export function createAprilTagDetectorAdapter(): DetectionAdapter {
  const conditions = new ConditionTracker();

  return {
    type: 'apriltag',
    evaluate(input: DetectorFrameInput, config: DetectionTypeConfig): DetectionCandidate[] {
      const candidates: DetectionCandidate[] = [];
      const activeKeys = new Set<string>();

      for (const tag of input.aprilTags) {
        const key = `tag-${tag.tagId}`;
        activeKeys.add(key);

        const shouldFire = conditions.evaluate(
          key,
          true,
          input.now,
          config.durationThresholdSeconds * 1000,
          config.cooldownSeconds * 1000,
        );

        if (shouldFire) {
          const xs = tag.corners.map((corner) => corner.x * input.aprilTagScale);
          const ys = tag.corners.map((corner) => corner.y * input.aprilTagScale);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const box: [number, number, number, number] = [minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY];

          candidates.push({
            type: 'apriltag',
            key,
            confidence: FIXED_DECODE_CONFIDENCE,
            message: `AprilTag ${tag.tagId} detected`,
            metadata: { tagId: tag.tagId },
            box,
          });
        }
      }

      conditions.prune(activeKeys);
      return candidates;
    },
  };
}
