import type { PolicyDecisionOutcome } from './policy.types.js';

/**
 * One confirmed person-inside-a-zone event, as a browser reports it.
 *
 * Deliberately CV facts only. There is no identity, no role, no rule and no
 * "should this alert" anywhere in here: the browser decodes tags to numbers
 * and measures geometry, and the server does everything that decides what
 * happens. `aprilTags` are raw tag ids, never resolved to people client-side.
 */
export interface RestrictedAreaObservation {
  cameraId: string;
  /** The restricted Zone (a Zone document id) the ground point falls inside. */
  zoneId: string;
  /** Browser-assigned stable id for this tracked person. */
  trackId: string;
  frame: { width: number; height: number };
  /** Person bounding box in video pixels: [x, y, width, height]. */
  personBox: [number, number, number, number];
  /**
   * CV fact: this track was seen with its ground point OUTSIDE the zone before
   * this observation. False means it was already inside when tracking began —
   * not an entry, and never alerted.
   */
  enteredFromOutside: boolean;
  /** Frames the track has been confirmed inside the zone. */
  framesInside: number;
  /** Continuous milliseconds the track has been inside the zone. */
  dwellMs: number;
  /** Raw decoded AprilTag numbers whose centre fell inside the person box. */
  aprilTags: number[];
  /** Base64 JPEG evidence. Required — a restricted-area alert must carry a snapshot. */
  snapshot: string;
}

/**
 * Why an observation was dropped before any policy ran.
 *
 * A quality rejection is not a policy event: the detection wasn't good enough
 * to reason about, so nothing is alerted and nothing is written to the audit
 * trail. These strings exist to explain the 200 response and to be asserted in
 * tests, not to be persisted.
 */
export type QualityRejection =
  | 'zone_not_found'
  | 'ground_point_outside_zone'
  | 'edge_clipped'
  | 'too_small'
  | 'too_large'
  | 'not_confirmed'
  | 'no_entry_transition';

export interface RestrictedAreaEvaluation {
  /** 'ignored' — quality gate failed, nothing written. Otherwise a policy decision was made. */
  status: 'ignored' | 'evaluated';
  outcome?: PolicyDecisionOutcome;
  rejection?: QualityRejection;
  decisionId?: string;
  alertId?: string;
  /** Whether this folded into an existing episode within the cooldown window. */
  deduped?: boolean;
}
