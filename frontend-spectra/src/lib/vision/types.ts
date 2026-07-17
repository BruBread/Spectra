export type DetectionType =
  | 'unattended_object'
  | 'loitering'
  | 'running'
  | 'fighting'
  | 'drowning'
  | 'intoxication'
  | 'apriltag';

/** What raw model output a detector needs computed for it each tick. */
export type DetectionRequirement = 'objects' | 'pose' | 'apriltag';

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
  drowning: 'critical',
  fighting: 'critical',
  running: 'warning',
  loitering: 'warning',
  unattended_object: 'warning',
  intoxication: 'warning',
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
  type: DetectionType;
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

/** Enumerable form of DetectionType, for building filter options. Mirrors the backend's DETECTION_TYPES. */
export const DETECTION_TYPES: DetectionType[] = [
  'unattended_object',
  'loitering',
  'running',
  'fighting',
  'drowning',
  'intoxication',
  'apriltag',
];

export const DETECTION_LABELS: Record<DetectionType, string> = {
  unattended_object: 'Unattended Object',
  loitering: 'Loitering',
  running: 'Running',
  fighting: 'Fighting',
  drowning: 'Drowning Posture',
  intoxication: 'Intoxicated Behavior',
  apriltag: 'AprilTag',
};

export const DETECTION_DESCRIPTIONS: Record<DetectionType, string> = {
  unattended_object:
    'Flags bags/backpacks/suitcases left stationary with no person nearby for the configured duration.',
  loitering: 'Flags a person remaining inside the configured zone for the configured duration.',
  running:
    'Heuristic: flags fast bounding-box movement as a proxy for running. Not a trained action classifier.',
  fighting:
    'Heuristic: flags close proximity between two people combined with rapid, sustained limb movement. Prone to false positives from dancing, sports, or play.',
  drowning:
    'Heuristic: flags a mostly-vertical body posture with minimal forward progress inside a water zone. This is NOT a certified drowning-detection system — always keep human lifeguard supervision.',
  intoxication:
    'Heuristic: flags unsteady, erratic lateral movement (gait sway) as a rough proxy. Many conditions (injury, disability, fatigue) can trigger this — treat as an aid, not a diagnosis.',
  apriltag: 'Decodes standard AprilTag 36h11 fiducial markers and looks up their linked LoRa device.',
};

export const DETECTION_REQUIREMENTS: Record<DetectionType, DetectionRequirement> = {
  unattended_object: 'objects',
  loitering: 'pose',
  running: 'pose',
  fighting: 'pose',
  drowning: 'pose',
  intoxication: 'pose',
  apriltag: 'apriltag',
};
