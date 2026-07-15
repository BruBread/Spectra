import { ConditionTracker } from '../conditionTracker';
import { TrackHistory } from '../history';
import { poseBoundingBox, poseCentroid } from '../poseMath';
import { isInsideZone, type DetectionAdapter, type DetectionCandidate, type DetectorFrameInput } from './types';
import type { DetectionTypeConfig } from '../types';

const SWAY_WINDOW_MS = 3000;
/** Std. deviation of lateral position over the window, as a fraction of frame width. */
const MIN_SWAY_STD_FRACTION = 0.02;

/**
 * Heuristic only: flags erratic side-to-side sway with little net forward
 * progress. Fatigue, injury, disability, carrying a heavy load, or simply
 * an awkward camera angle can all trigger this — it is not a diagnosis of
 * intoxication and should never be presented to anyone as one. Framed
 * purely as "unsteady gait pattern" in the UI for this reason.
 */
export function createIntoxicationDetector(): DetectionAdapter {
  const history = new TrackHistory<[number, number]>(SWAY_WINDOW_MS);
  const conditions = new ConditionTracker();

  return {
    type: 'intoxication',
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
        if (samples.length < 6 || input.now - samples[0].t < SWAY_WINDOW_MS * 0.7) continue;

        const xs = samples.map((sample) => sample.value[0]);
        const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
        const variance = xs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / xs.length;
        const stdevFraction = Math.sqrt(variance) / input.videoWidth;

        const last = samples[samples.length - 1];
        const netProgress = Math.hypot(last.value[0] - samples[0].value[0], last.value[1] - samples[0].value[1]);

        const conditionTrue = stdevFraction >= MIN_SWAY_STD_FRACTION && netProgress / diagonal < 0.12;
        const shouldFire = conditions.evaluate(
          key,
          conditionTrue,
          input.now,
          config.durationThresholdSeconds * 1000,
          config.cooldownSeconds * 1000,
        );

        if (shouldFire) {
          candidates.push({
            type: 'intoxication',
            key,
            confidence: Math.min(1, stdevFraction / (MIN_SWAY_STD_FRACTION * 3)),
            message: 'Unsteady, swaying movement pattern detected',
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
