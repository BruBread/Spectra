export type DetectionType =
  | 'unattended_object'
  | 'loitering'
  | 'running'
  | 'fighting'
  | 'drowning'
  | 'intoxication'
  | 'apriltag';

export const DETECTION_TYPES: DetectionType[] = [
  'unattended_object',
  'loitering',
  'running',
  'fighting',
  'drowning',
  'intoxication',
  'apriltag',
];

export type AlertSeverity = 'info' | 'warning' | 'critical';

export const ALERT_SEVERITIES: AlertSeverity[] = ['info', 'warning', 'critical'];

export type AlertStatus = 'new' | 'acknowledged' | 'under_review' | 'resolved' | 'dismissed';

export const ALERT_STATUSES: AlertStatus[] = ['new', 'acknowledged', 'under_review', 'resolved', 'dismissed'];

/** Statuses where a human still has the alert on their plate. */
export const OPEN_ALERT_STATUSES: AlertStatus[] = ['new', 'acknowledged', 'under_review'];

const SEVERITY_BY_TYPE: Record<DetectionType, AlertSeverity> = {
  drowning: 'critical',
  fighting: 'critical',
  running: 'warning',
  loitering: 'warning',
  unattended_object: 'warning',
  intoxication: 'warning',
  apriltag: 'info',
};

/**
 * Severity a detection gets when the client doesn't send one. Types added in
 * later phases slot in here: `fall` is critical; `restricted_zone` and
 * `suspicious_activity` are warning (a restricted zone can raise its own
 * alerts to critical through per-zone config).
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
  type: DetectionType;
  enabled: boolean;
  confidenceThreshold: number;
  cooldownSeconds: number;
  durationThresholdSeconds: number;
  zone: Zone | null;
}

const BASE_DETECTORS: DetectionTypeConfig[] = [
  { type: 'unattended_object', enabled: true, confidenceThreshold: 0.6, cooldownSeconds: 60, durationThresholdSeconds: 30, zone: null },
  { type: 'loitering', enabled: true, confidenceThreshold: 0.5, cooldownSeconds: 120, durationThresholdSeconds: 20, zone: null },
  { type: 'running', enabled: true, confidenceThreshold: 0.55, cooldownSeconds: 30, durationThresholdSeconds: 1.5, zone: null },
  { type: 'fighting', enabled: true, confidenceThreshold: 0.55, cooldownSeconds: 30, durationThresholdSeconds: 1.5, zone: null },
  { type: 'drowning', enabled: true, confidenceThreshold: 0.5, cooldownSeconds: 45, durationThresholdSeconds: 5, zone: null },
  { type: 'intoxication', enabled: true, confidenceThreshold: 0.5, cooldownSeconds: 60, durationThresholdSeconds: 5, zone: null },
  { type: 'apriltag', enabled: true, confidenceThreshold: 0.7, cooldownSeconds: 20, durationThresholdSeconds: 0, zone: null },
];

export function defaultDetectorConfigs(): DetectionTypeConfig[] {
  return BASE_DETECTORS.map((detector) => ({ ...detector }));
}
