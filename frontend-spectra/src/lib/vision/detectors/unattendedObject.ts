import { CentroidTracker } from '../tracker';
import { ConditionTracker } from '../conditionTracker';
import { TrackHistory } from '../history';
import { isInsideZone, type DetectionAdapter, type DetectionCandidate, type DetectorFrameInput } from './types';
import type { DetectionTypeConfig } from '../types';

// Valuables the stock YOLO11 object model detects (COCO classes, no custom training).
// wallet / cards / wristwatch are NOT COCO classes — those need a trained model.
const VALUABLE_CLASSES = new Set(['backpack', 'handbag', 'suitcase', 'cell phone', 'laptop', 'umbrella']);
const STATIONARY_WINDOW_MS = 4000;
const STATIONARY_PX_THRESHOLD = 30;
/** Fraction of the frame diagonal within which a person "owns" a nearby bag. */
const PROXIMITY_RADIUS_FRACTION = 0.18;

/**
 * Real detections (YOLO11 object model), real tracking, real duration/proximity logic
 * — "unattended" here specifically means "no detected person
 * within the proximity radius," not identity-linked ownership.
 */
export function createUnattendedObjectDetector(): DetectionAdapter {
  const tracker = new CentroidTracker<{ objectClass: string; score: number }>({
    maxMatchDistance: 60,
    maxMissedMs: 3000,
  });
  const positionHistory = new TrackHistory<[number, number]>(STATIONARY_WINDOW_MS);
  const conditions = new ConditionTracker();

  return {
    type: 'unattended_object',
    evaluate(input: DetectorFrameInput, config: DetectionTypeConfig): DetectionCandidate[] {
      const bagDetections = input.objects
        .filter((object) => VALUABLE_CLASSES.has(object.objectClass) && object.score >= config.confidenceThreshold)
        .map((object) => ({ box: object.bbox, meta: { objectClass: object.objectClass, score: object.score } }));

      const persons = input.objects.filter((object) => object.objectClass === 'person');
      const tracks = tracker.update(bagDetections, input.now);
      const diagonal = Math.hypot(input.videoWidth, input.videoHeight);
      const proximityRadius = diagonal * PROXIMITY_RADIUS_FRACTION;

      const candidates: DetectionCandidate[] = [];
      const activeKeys = new Set<string>();

      for (const track of tracks) {
        activeKeys.add(track.trackId);
        positionHistory.push(track.trackId, input.now, track.centroid);

        if (!isInsideZone(track.centroid, config.zone, input.videoWidth, input.videoHeight)) continue;

        const history = positionHistory.get(track.trackId);
        const oldest = history[0];
        const isStationary =
          Boolean(oldest) &&
          input.now - oldest.t >= STATIONARY_WINDOW_MS * 0.6 &&
          Math.hypot(oldest.value[0] - track.centroid[0], oldest.value[1] - track.centroid[1]) < STATIONARY_PX_THRESHOLD;

        const hasNearbyPerson = persons.some((person) => {
          const personCentroid: [number, number] = [
            person.bbox[0] + person.bbox[2] / 2,
            person.bbox[1] + person.bbox[3] / 2,
          ];
          return Math.hypot(personCentroid[0] - track.centroid[0], personCentroid[1] - track.centroid[1]) < proximityRadius;
        });

        const conditionTrue = isStationary && !hasNearbyPerson;
        const shouldFire = conditions.evaluate(
          track.trackId,
          conditionTrue,
          input.now,
          config.durationThresholdSeconds * 1000,
          config.cooldownSeconds * 1000,
        );

        if (shouldFire) {
          candidates.push({
            type: 'unattended_object',
            key: track.trackId,
            confidence: track.meta.score,
            message: `Unattended ${track.meta.objectClass} — no one nearby for ${config.durationThresholdSeconds}s`,
            metadata: { trackId: track.trackId, objectClass: track.meta.objectClass },
            box: track.box,
          });
        }
      }

      conditions.prune(activeKeys);
      return candidates;
    },
  };
}
