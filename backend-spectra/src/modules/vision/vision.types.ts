/** Detection types a client's browser pipeline may post directly to POST /api/vision/alerts. */
export type DetectionType = 'unattended_object' | 'weapon';

export const DETECTION_TYPES: DetectionType[] = ['unattended_object', 'weapon'];

/**
 * Alerting types the backend creates itself and a client may never post.
 *
 * `restricted_area` is the product of server-side policy enforcement over a
 * camera observation: identity resolution, the per-zone rule and suppression
 * all happen in restrictedArea.service. Letting a browser POST one to
 * /api/vision/alerts would be a bypass of exactly that evaluation, so it is a
 * valid *stored* type but not a client-creatable one — the alerts controller
 * rejects it.
 */
export type PolicyAlertType = 'restricted_area';

export const POLICY_ALERT_TYPES: PolicyAlertType[] = ['restricted_area'];

/**
 * Capabilities the pipeline runs every tick that never produce an alert.
 *
 * AprilTag decoding is a silent identity credential reader: a tag in frame
 * says who somebody is, which is an input to policy, not an incident. Alerting
 * on it would put a person's presence and identity into the notification feed
 * every time they walked past a camera — noise, and a leak.
 */
export type SilentDetectionType = 'apriltag';

export const SILENT_DETECTION_TYPES: SilentDetectionType[] = ['apriltag'];

/** What a camera's detector settings may configure: alerting types plus silent capabilities. */
export type DetectorConfigType = DetectionType | SilentDetectionType;

export const DETECTOR_CONFIG_TYPES: DetectorConfigType[] = [...DETECTION_TYPES, ...SILENT_DETECTION_TYPES];

/**
 * Types that were removed from the product.
 *
 * The heuristics behind these (pose-based drowning/fighting/running/
 * loitering/intoxication guesses) are gone, so no new alert can be created
 * with them. They stay listed here purely so alerts already recorded remain
 * readable, filterable and renderable — history is not rewritten to match a
 * later product decision.
 */
export type RetiredDetectionType = 'loitering' | 'running' | 'fighting' | 'drowning' | 'intoxication';

export const RETIRED_DETECTION_TYPES: RetiredDetectionType[] = [
  'loitering',
  'running',
  'fighting',
  'drowning',
  'intoxication',
];

/**
 * Anything that may appear on a stored alert: client-creatable types,
 * server-only policy types (`restricted_area`), history, and `apriltag` —
 * which no longer creates alerts but did before it became an identity
 * credential, so recorded ones stay readable and filterable.
 */
export type AnyDetectionType = DetectorConfigType | PolicyAlertType | RetiredDetectionType;

export const ALL_DETECTION_TYPES: AnyDetectionType[] = [
  ...DETECTION_TYPES,
  ...POLICY_ALERT_TYPES,
  ...SILENT_DETECTION_TYPES,
  ...RETIRED_DETECTION_TYPES,
];

export type AlertSeverity = 'info' | 'warning' | 'critical';

export const ALERT_SEVERITIES: AlertSeverity[] = ['info', 'warning', 'critical'];

export type AlertStatus = 'new' | 'acknowledged' | 'under_review' | 'resolved' | 'dismissed';

export const ALERT_STATUSES: AlertStatus[] = ['new', 'acknowledged', 'under_review', 'resolved', 'dismissed'];

/** Statuses where a human still has the alert on their plate. */
export const OPEN_ALERT_STATUSES: AlertStatus[] = ['new', 'acknowledged', 'under_review'];

const SEVERITY_BY_TYPE: Record<DetectionType, AlertSeverity> = {
  unattended_object: 'warning',
  weapon: 'critical',
};

/**
 * Severity a detection gets when the client doesn't send one.
 *
 * Only active types need an entry: this runs when an alert is created, and a
 * retired type can no longer be created. Alerts already stored keep the
 * severity recorded on the row itself.
 */
export function defaultSeverityForType(type: DetectionType): AlertSeverity {
  return SEVERITY_BY_TYPE[type] ?? 'warning';
}

/**
 * `acknowledged` predates the status lifecycle and is still read by the
 * frontend, so it stays in sync rather than drifting: anything a human has
 * triaged at all (any status other than `new`) counts as acknowledged.
 */
export function acknowledgedForStatus(status: AlertStatus): boolean {
  return status !== 'new';
}

export interface Zone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionTypeConfig {
  /** Includes silent capabilities: AprilTag decoding is tuned here, it just never alerts. */
  type: DetectorConfigType;
  enabled: boolean;
  confidenceThreshold: number;
  cooldownSeconds: number;
  durationThresholdSeconds: number;
  zone: Zone | null;
}

const BASE_DETECTORS: DetectionTypeConfig[] = [
  { type: 'unattended_object', enabled: true, confidenceThreshold: 0.6, cooldownSeconds: 60, durationThresholdSeconds: 30, zone: null },
  // Weapon detection runs an on-device YOLOX model. confidenceThreshold 0.45
  // matched 0% false-positives / 96% recall in Phase-0 eval; durationThreshold 1
  // is a light debounce (a weapon must persist ~1s) until the Phase-2 temporal
  // gate lands. Enabled by default — a security console watches for this.
  { type: 'weapon', enabled: true, confidenceThreshold: 0.45, cooldownSeconds: 30, durationThresholdSeconds: 1, zone: null },
  // AprilTag stays enabled and tunable: confidenceThreshold controls decode
  // strictness. It produces no alerts — cooldown and duration are inert for it
  // and only kept so one config shape covers every capability.
  { type: 'apriltag', enabled: true, confidenceThreshold: 0.7, cooldownSeconds: 20, durationThresholdSeconds: 0, zone: null },
];

export function defaultDetectorConfigs(): DetectionTypeConfig[] {
  return BASE_DETECTORS.map((detector) => ({ ...detector }));
}

/**
 * Tunables for restricted-area enforcement.
 *
 * These are the quality gate: a confirmed entry has to clear all of them
 * before identity resolution and policy even run. The browser observer uses
 * the same numbers to decide what to post, but the backend re-checks every
 * one from the submitted box — the client's copy is a courtesy, not a
 * source of truth.
 *
 * Fractions are of the frame (0–1), so they mean the same thing at any
 * resolution, matching how zone rectangles are stored.
 */
export interface RestrictedAreaSettings {
  /** Frames a track must be confirmed inside the zone before it can fire. */
  minFrames: number;
  /** Continuous milliseconds inside the zone before it can fire. */
  minDwellMs: number;
  /** Reject a person box shorter than this fraction of frame height (too far / not a real person). */
  minHeightFraction: number;
  /** Reject a person box smaller than this fraction of frame area. */
  minAreaFraction: number;
  /** Reject a person box taller than this fraction of frame height (too close / occluding the lens). */
  maxHeightFraction: number;
  /** Reject a person box larger than this fraction of frame area. */
  maxAreaFraction: number;
  /**
   * How close to a frame edge counts as "clipped", as a fraction of frame
   * size. A box touching the bottom/left/right within this margin has an
   * unreliable ground point and is rejected.
   */
  edgeEpsilonFraction: number;
  /** Repeat entries for the same camera+zone+track inside this window fold instead of re-alerting. */
  cooldownSeconds: number;
}

export function defaultRestrictedAreaSettings(): RestrictedAreaSettings {
  return {
    minFrames: 3,
    minDwellMs: 1000,
    minHeightFraction: 0.15,
    minAreaFraction: 0.01,
    maxHeightFraction: 0.95,
    maxAreaFraction: 0.6,
    edgeEpsilonFraction: 0.01,
    cooldownSeconds: 60,
  };
}
