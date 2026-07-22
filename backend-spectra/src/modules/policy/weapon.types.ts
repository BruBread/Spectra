import type { PolicyDecisionOutcome } from './policy.types.js';

/**
 * One confirmed possible-weapon-on-a-holder event, as a browser reports it.
 *
 * Deliberately CV facts only — no identity, no role, no rule, no outcome. The
 * browser runs the weapon model, applies its own veto / holder / N-of-M gates,
 * and reports the surviving box together with the person it is held by and the
 * raw AprilTag numbers seen on that person. The server does everything that
 * decides what happens.
 *
 * Honest limitation, unlike a restricted-area observation: the *presence* of a
 * weapon is a model inference the browser makes and the server cannot re-derive
 * (there is no model server-side). The server re-derives what geometry allows —
 * that the weapon box is actually held, that confidence and confirmation clear
 * its thresholds — and owns identity resolution and the policy decision. It does
 * not, and cannot, re-confirm the detection itself.
 */
export interface WeaponObservation {
  cameraId: string;
  /** Browser-assigned stable id for this tracked weapon. */
  trackId: string;
  frame: { width: number; height: number };
  /** Weapon bounding box in video pixels: [x, y, width, height]. */
  weaponBox: [number, number, number, number];
  /** The holder's person box in video pixels: [x, y, width, height]. */
  personBox: [number, number, number, number];
  /** Model confidence for the weapon box, 0–1. */
  confidence: number;
  /** How many confirming detections the browser's N-of-M gate counted. */
  framesConfirmed: number;
  /** Raw decoded AprilTag numbers whose centre fell inside the holder's box. */
  aprilTags: number[];
  /** Base64 JPEG evidence. Required — a weapon alert must carry a snapshot. */
  snapshot: string;
}

/**
 * Why a weapon observation was dropped before any policy ran.
 *
 * A quality rejection is not a policy event: the detection wasn't good enough to
 * reason about, so nothing is alerted and nothing is written to the audit trail.
 */
export type WeaponQualityRejection =
  | 'low_confidence'
  | 'not_confirmed'
  | 'not_held';

export interface WeaponEvaluation {
  /** 'ignored' — quality gate failed, nothing written. Otherwise a decision was made. */
  status: 'ignored' | 'evaluated';
  outcome?: PolicyDecisionOutcome;
  rejection?: WeaponQualityRejection;
  decisionId?: string;
  alertId?: string;
  /** Whether this folded into an existing episode within the cooldown window. */
  deduped?: boolean;
}
