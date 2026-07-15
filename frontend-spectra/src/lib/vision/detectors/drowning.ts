import { ConditionTracker } from '../conditionTracker';
import { TrackHistory } from '../history';
import { poseBoundingBox, poseCentroid } from '../poseMath';
import { isInsideZone, type DetectionAdapter, type DetectionCandidate, type DetectorFrameInput } from './types';
import type { DetectionTypeConfig } from '../types';

const MOVEMENT_WINDOW_MS = 3000;
/** Net displacement over the window, as a fraction of the frame diagonal, below which we call it "not making progress." */
const MIN_PROGRESS_FRACTION = 0.03;

/**
 * Heuristic only, and deliberately conservative in what it claims: flags a
 * person inside a configured "water zone" who is barely moving over a
 * sustained window. This is NOT a certified drowning-detection system and
 * must never replace human lifeguard supervision — it has no way to tell
 * "person floating calmly" from "person in distress" from a single 2D
 * camera angle. Treat every alert as "go look now," not as a diagnosis.
 */
export function createDrowningDetector(): DetectionAdapter {
  const history = new TrackHistory<[number, number]>(MOVEMENT_WINDOW_MS);
  const conditions = new ConditionTracker();

  return {
    type: 'drowning',
    evaluate(input: DetectorFrameInput, config: DetectionTypeConfig): DetectionCandidate[] {
      const candidates: DetectionCandidate[] = [];
      const activeKeys = new Set<string>();
      const diagonal = Math.hypot(input.videoWidth, input.videoHeight);

      for (const pose of input.poses) {
        if (pose.score < config.confidenceThreshold) continue;
        const centroid = poseCentroid(pose);
        if (!centroid) continue;
        if (!isInsideZone(centroid, config.zone, input.videoWidth, input.videoHeight)) continue;

        const key = `pose-${pose.id}`;
        activeKeys.add(key);
        history.push(pose.id, input.now, centroid);

        const samples = history.get(pose.id);
        const oldest = samples[0];
        if (!oldest || input.now - oldest.t < MOVEMENT_WINDOW_MS * 0.6) continue;

        const dist = Math.hypot(centroid[0] - oldest.value[0], centroid[1] - oldest.value[1]);
        const progressFraction = dist / diagonal;

        const conditionTrue = progressFraction < MIN_PROGRESS_FRACTION;
        const shouldFire = conditions.evaluate(
          key,
          conditionTrue,
          input.now,
          config.durationThresholdSeconds * 1000,
          config.cooldownSeconds * 1000,
        );

        if (shouldFire) {
          candidates.push({
            type: 'drowning',
            key,
            confidence: Math.max(0.3, 1 - progressFraction / MIN_PROGRESS_FRACTION),
            message: `Person in water zone showing minimal movement for ${config.durationThresholdSeconds}s — verify immediately`,
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
