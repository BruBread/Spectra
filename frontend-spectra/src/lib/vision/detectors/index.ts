import type { DetectionAdapter } from './types';
import { createUnattendedObjectDetector } from './unattendedObject';
import { createAprilTagDetectorAdapter } from './aprilTag';

export type { DetectionAdapter, DetectionCandidate, DetectorFrameInput } from './types';

/**
 * The active detectors.
 *
 * The pose-based behaviour heuristics (drowning, fighting, running,
 * loitering, intoxication) were removed from the product: they guessed at
 * intent from body geometry and were never reliable enough to act on.
 */
export function createDetectorRegistry(): DetectionAdapter[] {
  return [createUnattendedObjectDetector(), createAprilTagDetectorAdapter()];
}
