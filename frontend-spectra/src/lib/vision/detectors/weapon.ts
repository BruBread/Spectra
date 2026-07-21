import { CentroidTracker } from '../tracker';
import { ConditionTracker } from '../conditionTracker';
import { isInsideZone, type DetectionAdapter, type DetectionCandidate, type DetectorFrameInput } from './types';
import type { DetectionTypeConfig } from '../types';

/**
 * Everyday objects the weapon model most often mistakes for a firearm. If the
 * COCO-SSD object model confidently reports one of these overlapping a weapon
 * box, we suppress the weapon — the object model is the expert on these classes.
 * This is the exact veto proven in the Phase-0 harness. Glasses/cameras aren't
 * COCO classes, so they can't be vetoed here (they'd need a trained model).
 */
const VETO_CLASSES = new Set([
  'cell phone', 'remote', 'laptop', 'mouse', 'book',
  'backpack', 'handbag', 'suitcase', 'umbrella',
]);
/** How sure the object model must be before it overrules the weapon guess. */
const VETO_MIN_SCORE = 0.55;
/** Suppress if boxes agree (IoU) or the weapon box sits mostly inside the object box. */
const VETO_IOU = 0.4;
const VETO_CONTAINMENT = 0.55;

type Box = [number, number, number, number]; // [x, y, w, h]

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union > 0 ? inter / union : 0;
}

/** Fraction of box `a` (the weapon guess) that lies inside box `b` (the object). */
function containment(a: Box, b: Box): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area = a[2] * a[3];
  return area > 0 ? inter / area : 0;
}

/**
 * Turns YOLOX weapon boxes into alerts. Two real models cooperate: YOLOX
 * proposes "possible_weapon", COCO-SSD vetoes common look-alikes. Boxes are
 * tracked so a weapon must persist (durationThresholdSeconds) before alerting
 * and repeat alerts respect the cooldown — a light temporal guard until the
 * Phase-2 N-of-M confirmation gate lands.
 */
export function createWeaponDetector(): DetectionAdapter {
  const tracker = new CentroidTracker<{ score: number }>({
    maxMatchDistance: 80,
    maxMissedMs: 2000,
  });
  const conditions = new ConditionTracker();

  return {
    type: 'weapon',
    evaluate(input: DetectorFrameInput, config: DetectionTypeConfig): DetectionCandidate[] {
      // Object boxes that are confident enough to overrule a weapon guess.
      const vetoObjects = input.objects.filter(
        (object) => VETO_CLASSES.has(object.objectClass) && object.score >= VETO_MIN_SCORE,
      );

      const detections = input.weapons
        .filter((weapon) => weapon.score >= config.confidenceThreshold)
        .filter((weapon) => {
          // Drop any weapon box the object model explains as a look-alike.
          return !vetoObjects.some(
            (object) => iou(weapon.bbox, object.bbox) >= VETO_IOU || containment(weapon.bbox, object.bbox) >= VETO_CONTAINMENT,
          );
        })
        .map((weapon) => ({ box: weapon.bbox, meta: { score: weapon.score } }));

      const tracks = tracker.update(detections, input.now);
      const candidates: DetectionCandidate[] = [];
      const activeKeys = new Set<string>();

      for (const track of tracks) {
        activeKeys.add(track.trackId);
        if (!isInsideZone(track.centroid, config.zone, input.videoWidth, input.videoHeight)) continue;

        // A tracked, un-vetoed weapon box is the condition; the tracker only
        // holds boxes that survived the veto this tick.
        const shouldFire = conditions.evaluate(
          track.trackId,
          true,
          input.now,
          config.durationThresholdSeconds * 1000,
          config.cooldownSeconds * 1000,
        );

        if (shouldFire) {
          candidates.push({
            type: 'weapon',
            key: track.trackId,
            confidence: track.meta.score,
            message: `possible_weapon detected — score ${track.meta.score.toFixed(2)}`,
            metadata: { trackId: track.trackId, score: track.meta.score },
            box: track.box,
          });
        }
      }

      conditions.prune(activeKeys);
      return candidates;
    },
  };
}
