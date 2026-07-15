import { ConditionTracker } from '../conditionTracker';
import { TrackHistory } from '../history';
import { poseBoundingBox, poseCentroid } from '../poseMath';
import { isInsideZone, type DetectionAdapter, type DetectionCandidate, type DetectorFrameInput } from './types';
import type { DetectionTypeConfig } from '../types';

const VELOCITY_WINDOW_MS = 1000;
/**
 * Centroid speed as a fraction of the frame diagonal per second. This is a
 * resolution-independent proxy for "fast movement," not a trained gait
 * classifier — it cannot reliably distinguish running from fast walking,
 * or a person moving toward the camera from one moving laterally.
 */
const RUNNING_SPEED_FRACTION_PER_SEC = 0.35;

export function createRunningDetector(): DetectionAdapter {
  const history = new TrackHistory<[number, number]>(VELOCITY_WINDOW_MS);
  const conditions = new ConditionTracker();

  return {
    type: 'running',
    evaluate(input: DetectorFrameInput, config: DetectionTypeConfig): DetectionCandidate[] {
      const candidates: DetectionCandidate[] = [];
      const activeKeys = new Set<string>();
      const diagonal = Math.hypot(input.videoWidth, input.videoHeight);

      for (const pose of input.poses) {
        if (pose.score < config.confidenceThreshold) continue;
        const centroid = poseCentroid(pose);
        if (!centroid) continue;

        const key = `pose-${pose.id}`;
        activeKeys.add(key);
        history.push(pose.id, input.now, centroid);

        const samples = history.get(pose.id);
        const oldest = samples[0];
        let speedFraction = 0;
        if (oldest && input.now - oldest.t > 200) {
          const dist = Math.hypot(centroid[0] - oldest.value[0], centroid[1] - oldest.value[1]);
          const dtSec = (input.now - oldest.t) / 1000;
          speedFraction = dist / diagonal / dtSec;
        }

        const inZone = isInsideZone(centroid, config.zone, input.videoWidth, input.videoHeight);
        const conditionTrue = inZone && speedFraction >= RUNNING_SPEED_FRACTION_PER_SEC;
        const shouldFire = conditions.evaluate(
          key,
          conditionTrue,
          input.now,
          config.durationThresholdSeconds * 1000,
          config.cooldownSeconds * 1000,
        );

        if (shouldFire) {
          candidates.push({
            type: 'running',
            key,
            confidence: Math.min(1, speedFraction / (RUNNING_SPEED_FRACTION_PER_SEC * 1.5)),
            message: 'Fast movement detected — possible running',
            metadata: { trackId: pose.id, speedFraction: Number(speedFraction.toFixed(2)) },
            box: poseBoundingBox(pose),
          });
        }
      }

      conditions.prune(activeKeys);
      return candidates;
    },
  };
}
