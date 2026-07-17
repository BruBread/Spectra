/** Detection types the pipeline can produce today. */
export type DetectionType = 'unattended_object' | 'apriltag';

/**
 * Types removed from the product. Their detectors are gone, so nothing can
 * raise one — they exist here only so alerts already recorded stay readable
 * and filterable rather than rendering as "undefined".
 */
export type RetiredDetectionType = 'loitering' | 'running' | 'fighting' | 'drowning' | 'intoxication';

/** Anything a stored alert may carry: active types plus retired history. */
export type AnyDetectionType = DetectionType | RetiredDetectionType;

/** What raw model output a detector needs computed for it each tick. */
export type DetectionRequirement = 'objects' | 'apriltag';

export interface Zone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionTypeConfig {
  type: DetectionType;
  enabled: boolean;
  /** 0-1. For AprilTag this maps to fiducial bit-error tolerance, not a model score. */
  confidenceThreshold: number;
  /** Minimum time between repeat alerts for the same tracked entity/zone. */
  cooldownSeconds: number;
  /** How long the condition must hold continuously before an alert fires. */
  durationThresholdSeconds: number;
  /** Relative (0-1) region of interest. Null = whole frame. */
  zone: Zone | null;
}

export interface VisionSettings {
  cameraId: string;
  /** How often the pipeline runs a detection pass. */
  processingIntervalMs: number;
  /** How long alerts (incl. snapshots) are retained before backend cleanup. */
  retentionDays: number;
  detectors: DetectionTypeConfig[];
}

export interface AprilTagMapping {
  id: string;
  tagId: number;
  label: string;
  loraDeviceId: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export const ALERT_SEVERITIES: AlertSeverity[] = ['info', 'warning', 'critical'];

export type AlertStatus = 'new' | 'acknowledged' | 'under_review' | 'resolved' | 'dismissed';

export const ALERT_STATUSES: AlertStatus[] = ['new', 'acknowledged', 'under_review', 'resolved', 'dismissed'];

/** Statuses that still need a human — mirrors OPEN_ALERT_STATUSES on the backend. */
export const OPEN_ALERT_STATUSES: AlertStatus[] = ['new', 'acknowledged', 'under_review'];

export const ALERT_STATUS_LABELS: Record<AlertStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  under_review: 'Under review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export const ALERT_SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

const SEVERITY_BY_TYPE: Record<DetectionType, AlertSeverity> = {
  unattended_object: 'warning',
  apriltag: 'info',
};

/**
 * Mirrors the backend's defaultSeverityForType. Only for optimistic rows shown
 * before the server responds — the persisted alert's own severity always wins
 * once it comes back.
 */
export function defaultSeverityForType(type: DetectionType): AlertSeverity {
  return SEVERITY_BY_TYPE[type] ?? 'warning';
}

/** Mirrors the backend's VisionAlert document. `acknowledged` is legacy — prefer `status`. */
export interface VisionAlert {
  id: string;
  cameraId: string;
  /** May be a retired type on alerts recorded before those detectors were removed. */
  type: AnyDetectionType;
  severity: AlertSeverity;
  status: AlertStatus;
  read: boolean;
  zoneName: string | null;
  confidence: number;
  message: string;
  snapshot: string | null;
  metadata: Record<string, unknown>;
  /** Repeats folded into this alert inside its cooldown window. */
  occurrences: number;
  lastOccurredAt: string;
  statusChangedAt: string | null;
  /** @deprecated kept in sync with `status` for older clients. */
  acknowledged: boolean;
  createdAt: string;
}

export interface NewVisionAlert {
  cameraId: string;
  type: DetectionType;
  confidence: number;
  message: string;
  snapshot: string | null;
  metadata?: Record<string, unknown>;
}

/** Mirrors the backend's DETECTION_TYPES — active types, for settings and new alerts. */
export const DETECTION_TYPES: DetectionType[] = ['unattended_object', 'apriltag'];

export const RETIRED_DETECTION_TYPES: RetiredDetectionType[] = [
  'loitering',
  'running',
  'fighting',
  'drowning',
  'intoxication',
];

/** For filtering, which must still reach recorded history. */
export const ALL_DETECTION_TYPES: AnyDetectionType[] = [...DETECTION_TYPES, ...RETIRED_DETECTION_TYPES];

export const DETECTION_LABELS: Record<DetectionType, string> = {
  unattended_object: 'Unattended Object',
  apriltag: 'AprilTag',
};

/**
 * Labels for every type an alert may carry. Retired ones are marked so a
 * historical alert is never mistaken for something the system still watches
 * for.
 */
export const ALL_DETECTION_LABELS: Record<AnyDetectionType, string> = {
  ...DETECTION_LABELS,
  loitering: 'Loitering (retired)',
  running: 'Running (retired)',
  fighting: 'Fighting (retired)',
  drowning: 'Drowning Posture (retired)',
  intoxication: 'Intoxicated Behavior (retired)',
};

export const DETECTION_DESCRIPTIONS: Record<DetectionType, string> = {
  unattended_object:
    'Flags bags/backpacks/suitcases left stationary with no person nearby for the configured duration.',
  apriltag: 'Decodes standard AprilTag 36h11 fiducial markers — the camera-visible identity credential.',
};

export const DETECTION_REQUIREMENTS: Record<DetectionType, DetectionRequirement> = {
  unattended_object: 'objects',
  apriltag: 'apriltag',
};
