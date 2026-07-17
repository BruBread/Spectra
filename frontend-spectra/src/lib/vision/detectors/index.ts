import type { DetectionAdapter } from './types';
import { createUnattendedObjectDetector } from './unattendedObject';

export type { DetectionAdapter, DetectionCandidate, DetectorFrameInput } from './types';

/**
 * The detectors that can raise an alert.
 *
 * AprilTag decoding still runs every tick (see VisionPipeline) but has no
 * adapter here on purpose: a tag says who somebody is, which is an input to
 * policy rather than an incident. Alerting on it put a person's identity into
 * the notification feed every time they walked past a camera.
 *
 * The pose-based behaviour heuristics (drowning, fighting, running,
 * loitering, intoxication) were removed from the product: they guessed at
 * intent from body geometry and were never reliable enough to act on.
 */
export function createDetectorRegistry(): DetectionAdapter[] {
  return [createUnattendedObjectDetector()];
}
