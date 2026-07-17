/** Detection types that can create an alert today. */
export type DetectionType = 'unattended_object';

export const DETECTION_TYPES: DetectionType[] = ['unattended_object'];

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
 * Anything that may appear on a stored alert: alerting types, history, and
 * `apriltag` — which no longer creates alerts but did before it became an
 * identity credential, so recorded ones stay readable and filterable.
 */
export type AnyDetectionType = DetectorConfigType | RetiredDetectionType;

export const ALL_DETECTION_TYPES: AnyDetectionType[] = [
  ...DETECTION_TYPES,
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
  // AprilTag stays enabled and tunable: confidenceThreshold controls decode
  // strictness. It produces no alerts — cooldown and duration are inert for it
  // and only kept so one config shape covers every capability.
  { type: 'apriltag', enabled: true, confidenceThreshold: 0.7, cooldownSeconds: 20, durationThresholdSeconds: 0, zone: null },
];

export function defaultDetectorConfigs(): DetectionTypeConfig[] {
  return BASE_DETECTORS.map((detector) => ({ ...detector }));
}
