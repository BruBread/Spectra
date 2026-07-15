import { ConditionTracker } from '../conditionTracker';
import { limbSpeedSum, poseBoundingBox } from '../poseMath';
import type { DetectionAdapter, DetectionCandidate, DetectorFrameInput } from './types';
import type { DetectionTypeConfig } from '../types';
import type { DetectedPose } from '../models/poseModel';

/** Fraction of the frame diagonal within which two people are considered "close." */
const PROXIMITY_FRACTION = 0.22;
/** Combined wrist/elbow px/sec across both people; heuristic, tuned loosely. */
const ACTIVITY_SPEED_THRESHOLD = 260;

/**
 * Heuristic only: close proximity + high combined limb velocity. This will
 * also fire on dancing, contact sports, roughhousing, and celebratory
 * hugs/high-fives — it needs a trained action-recognition model to be
 * meaningfully reliable. Treat alerts as "worth a human glance," not fact.
 */
export function createFightingDetector(): DetectionAdapter {
  const previousPoses = new Map<number, { pose: DetectedPose; t: number }>();
  const conditions = new ConditionTracker();

  return {
    type: 'fighting',
    evaluate(input: DetectorFrameInput, config: DetectionTypeConfig): DetectionCandidate[] {
      const candidates: DetectionCandidate[] = [];
      const activeKeys = new Set<string>();
      const diagonal = Math.hypot(input.videoWidth, input.videoHeight);
      const eligible = input.poses.filter((pose) => pose.score >= config.confidenceThreshold);

      const activity = new Map<number, number>();
      for (const pose of eligible) {
        const prev = previousPoses.get(pose.id);
        const dtMs = prev ? input.now - prev.t : 0;
        activity.set(pose.id, prev ? limbSpeedSum(prev.pose, pose, dtMs) : 0);
        previousPoses.set(pose.id, { pose, t: input.now });
      }

      for (let i = 0; i < eligible.length; i++) {
        for (let j = i + 1; j < eligible.length; j++) {
          const a = eligible[i];
          const b = eligible[j];
          const boxA = poseBoundingBox(a);
          const boxB = poseBoundingBox(b);
          if (!boxA || !boxB) continue;

          const centroidA: [number, number] = [boxA[0] + boxA[2] / 2, boxA[1] + boxA[3] / 2];
          const centroidB: [number, number] = [boxB[0] + boxB[2] / 2, boxB[1] + boxB[3] / 2];
          const dist = Math.hypot(centroidA[0] - centroidB[0], centroidA[1] - centroidB[1]);
          const isClose = dist < diagonal * PROXIMITY_FRACTION;
          const combinedActivity = (activity.get(a.id) ?? 0) + (activity.get(b.id) ?? 0);
          const conditionTrue = isClose && combinedActivity > ACTIVITY_SPEED_THRESHOLD;

          const key = `pair-${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}`;
          activeKeys.add(key);
          const shouldFire = conditions.evaluate(
            key,
            conditionTrue,
            input.now,
            config.durationThresholdSeconds * 1000,
            config.cooldownSeconds * 1000,
          );

          if (shouldFire) {
            const unionBox: [number, number, number, number] = [
              Math.min(boxA[0], boxB[0]),
              Math.min(boxA[1], boxB[1]),
              Math.max(boxA[0] + boxA[2], boxB[0] + boxB[2]) - Math.min(boxA[0], boxB[0]),
              Math.max(boxA[1] + boxA[3], boxB[1] + boxB[3]) - Math.min(boxA[1], boxB[1]),
            ];
            candidates.push({
              type: 'fighting',
              key,
              confidence: Math.min(1, combinedActivity / (ACTIVITY_SPEED_THRESHOLD * 2)),
              message: 'Close-proximity rapid movement between two people — possible altercation',
              metadata: { trackIds: [a.id, b.id] },
              box: unionBox,
            });
          }
        }
      }

      conditions.prune(activeKeys);
      for (const id of [...previousPoses.keys()]) {
        if (!eligible.some((pose) => pose.id === id)) previousPoses.delete(id);
      }
      return candidates;
    },
  };
}
