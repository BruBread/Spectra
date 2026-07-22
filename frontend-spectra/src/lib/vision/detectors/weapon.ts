import { CentroidTracker } from '../tracker';
import { ConditionTracker } from '../conditionTracker';
import { TrackHistory } from '../history';
import { isInsideZone, type DetectionAdapter, type DetectionCandidate, type DetectorFrameInput } from './types';
import type { DetectionTypeConfig } from '../types';

/**
 * Everyday objects the weapon model most often mistakes for a firearm. If the
 * YOLO11 object model confidently reports one of these overlapping a weapon
 * box, we suppress the weapon — the object model is the expert on these classes.
 * The first row is the exact veto proven in the Phase-0 harness; the second row
 * adds the remaining gun-shaped COCO classes. Wallets/cameras/caps/watches/
 * glasses aren't COCO classes, so they can't be vetoed here — those look-alikes
 * are the hard-negative retraining set's job.
 */
const VETO_CLASSES = new Set([
  'cell phone', 'remote', 'laptop', 'mouse', 'book',
  'backpack', 'handbag', 'suitcase', 'umbrella',
  'bottle', 'cup', 'scissors', 'hair drier',
]);
/** How sure the object model must be before it overrules the weapon guess. */
const VETO_MIN_SCORE = 0.55;
/** Suppress if boxes agree (IoU) or the weapon box sits mostly inside the object box. */
const VETO_IOU = 0.4;
const VETO_CONTAINMENT = 0.55;

/**
 * A weapon candidate must be held: its box has to overlap a detected person.
 * A "gun" floating with nobody near it is almost always a false positive, and
 * every threat scenario this system watches for has a holder. Known tradeoff,
 * accepted deliberately: a weapon lying alone on a table will not alert.
 */
const HOLDER_MIN_PERSON_SCORE = 0.5;
/** Person boxes are grown by this fraction so a gun at arm's length still counts as held. */
const HOLDER_BOX_MARGIN = 0.15;
/** Fraction of the weapon box that must lie inside the (grown) person box. */
const HOLDER_CONTAINMENT = 0.25;

/**
 * N-of-M confirmation: the same track must produce at least this many real
 * detections inside the rolling window before it can begin alerting. A
 * single-frame flicker on a wallet or a wristwatch can never fire; a genuinely
 * held weapon re-detects every tick and passes within ~1.5s. This runs in
 * front of the existing continuous-hold duration and cooldown gates.
 */
const CONFIRM_WINDOW_MS = 5000;
const MIN_CONFIRMATIONS = 3;

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

/** `box` grown by `fraction` of its own size, centred on the original. */
function grow(box: Box, fraction: number): Box {
  const dx = box[2] * fraction;
  const dy = box[3] * fraction;
  return [box[0] - dx / 2, box[1] - dy / 2, box[2] + dx, box[3] + dy];
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
 * Turns YOLO11 weapon boxes into alerts. Two real models cooperate: YOLO11
 * proposes "possible_weapon", the object model vetoes common look-alikes and supplies
 * the person boxes a candidate must be held by. A track then needs
 * MIN_CONFIRMATIONS real detections inside CONFIRM_WINDOW_MS, must hold
 * continuously for durationThresholdSeconds, and repeat alerts respect the
 * cooldown — so no single frame, and no unheld object, can ever alert.
 */
export function createWeaponDetector(): DetectionAdapter {
  const tracker = new CentroidTracker<{ score: number }>({
    maxMatchDistance: 80,
    maxMissedMs: 2000,
  });
  const conditions = new ConditionTracker();
  const hits = new TrackHistory<true>(CONFIRM_WINDOW_MS);

  return {
    type: 'weapon',
    evaluate(input: DetectorFrameInput, config: DetectionTypeConfig): DetectionCandidate[] {
      // Object boxes that are confident enough to overrule a weapon guess.
      const vetoObjects = input.objects.filter(
        (object) => VETO_CLASSES.has(object.objectClass) && object.score >= VETO_MIN_SCORE,
      );

      // Grown person boxes a weapon candidate must be held by.
      const holderBoxes = input.objects
        .filter((object) => object.objectClass === 'person' && object.score >= HOLDER_MIN_PERSON_SCORE)
        .map((object) => grow(object.bbox, HOLDER_BOX_MARGIN));

      const detections = input.weapons
        .filter((weapon) => weapon.score >= config.confidenceThreshold)
        .filter((weapon) => {
          // Drop any weapon box the object model explains as a look-alike.
          return !vetoObjects.some(
            (object) => iou(weapon.bbox, object.bbox) >= VETO_IOU || containment(weapon.bbox, object.bbox) >= VETO_CONTAINMENT,
          );
        })
        .filter((weapon) => {
          // Drop any weapon box nobody is holding.
          return holderBoxes.some((person) => containment(weapon.bbox, person) >= HOLDER_CONTAINMENT);
        })
        .map((weapon) => ({ box: weapon.bbox, meta: { score: weapon.score } }));

      const tracks = tracker.update(detections, input.now);
      const candidates: DetectionCandidate[] = [];
      const activeKeys = new Set<string>();

      for (const track of tracks) {
        activeKeys.add(track.trackId);
        // update() returns only tracks that matched a real detection this
        // tick, so each entry here is one genuine confirmation hit.
        hits.push(track.trackId, input.now, true);
        if (!isInsideZone(track.centroid, config.zone, input.videoWidth, input.videoHeight)) continue;

        // The condition is a confirmed track: enough held, un-vetoed
        // detections inside the rolling window — never a single frame.
        const confirmed = hits.get(track.trackId).length >= MIN_CONFIRMATIONS;
        const shouldFire = conditions.evaluate(
          track.trackId,
          confirmed,
          input.now,
          config.durationThresholdSeconds * 1000,
          config.cooldownSeconds * 1000,
        );

        if (shouldFire) {
          candidates.push({
            type: 'weapon',
            key: track.trackId,
            confidence: track.meta.score,
            message: `Possible weapon detected — needs human review (confidence ${(track.meta.score * 100).toFixed(0)}%)`,
            metadata: { trackId: track.trackId, score: track.meta.score },
            box: track.box,
          });
        }
      }

      conditions.prune(activeKeys);
      hits.prune(input.now, CONFIRM_WINDOW_MS);
      return candidates;
    },
  };
}
