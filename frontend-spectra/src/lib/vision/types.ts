/** Detection types the browser pipeline may post directly to POST /api/vision/alerts. */
export type DetectionType = 'unattended_object' | 'weapon';

/**
 * Alerting types the backend creates itself and the browser may never post.
 *
 * `restricted_area` is the outcome of server-side policy enforcement over a
 * camera observation. The browser reports the observation; the server decides
 * whether to alert. It is a valid type on a *stored* alert (so the feed can
 * render one) but not a client-creatable one.
 */
export type PolicyAlertType = 'restricted_area';

export const POLICY_ALERT_TYPES: PolicyAlertType[] = ['restricted_area'];

/**
 * Capabilities the pipeline runs every tick that never raise an alert.
 *
 * AprilTag decoding reads an identity credential: a tag says who somebody is,
 * which is an input to policy rather than an incident. It is still decoded
 * and still tunable — it just never reaches the feed.
 */
export type SilentDetectionType = 'apriltag';

/** What a camera's detector settings may configure. */
export type DetectorConfigType = DetectionType | SilentDetectionType;

/**
 * Types removed from the product. Their detectors are gone, so nothing can
 * raise one — they exist here only so alerts already recorded stay readable
 * and filterable rather than rendering as "undefined".
 */
export type RetiredDetectionType = 'loitering' | 'running' | 'fighting' | 'drowning' | 'intoxication';

/** Anything a stored alert may carry: alerting types, server-only policy types, silent ones, and retired history. */
export type AnyDetectionType = DetectorConfigType | PolicyAlertType | RetiredDetectionType;

/** What raw model output a detector needs computed for it each tick. */
export type DetectionRequirement = 'objects' | 'apriltag' | 'weapons';

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
  /** 0-1. For AprilTag this maps to fiducial bit-error tolerance, not a model score. */
  confidenceThreshold: number;
  /** Minimum time between repeat alerts for the same tracked entity/zone. */
  cooldownSeconds: number;
  /** How long the condition must hold continuously before an alert fires. */
  durationThresholdSeconds: number;
  /** Relative (0-1) region of interest. Null = whole frame. */
  zone: Zone | null;
}

/**
 * Quality-gate tunables for restricted-area enforcement. Mirrors the backend's
 * RestrictedAreaSettings — the observer uses these to decide what to post, and
 * the backend re-checks every one authoritatively.
 */
export interface RestrictedAreaSettings {
  minFrames: number;
  minDwellMs: number;
  minHeightFraction: number;
  minAreaFraction: number;
  maxHeightFraction: number;
  maxAreaFraction: number;
  edgeEpsilonFraction: number;
  cooldownSeconds: number;
}

export interface VisionSettings {
  cameraId: string;
  /** How often the pipeline runs a detection pass. */
  processingIntervalMs: number;
  /** How long alerts (incl. snapshots) are retained before backend cleanup. */
  retentionDays: number;
  detectors: DetectionTypeConfig[];
  /** Absent until real settings load; the backend always returns it. */
  restrictedArea?: RestrictedAreaSettings;
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
  weapon: 'critical',
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

/** Mirrors the backend's DETECTION_TYPES — what a new alert may be. */
export const DETECTION_TYPES: DetectionType[] = ['unattended_object', 'weapon'];

export const SILENT_DETECTION_TYPES: SilentDetectionType[] = ['apriltag'];

/** What a camera's detector settings may configure: alerting plus silent. */
export const DETECTOR_CONFIG_TYPES: DetectorConfigType[] = [...DETECTION_TYPES, ...SILENT_DETECTION_TYPES];

export const RETIRED_DETECTION_TYPES: RetiredDetectionType[] = [
  'loitering',
  'running',
  'fighting',
  'drowning',
  'intoxication',
];

/** For filtering, which must still reach recorded history. */
export const ALL_DETECTION_TYPES: AnyDetectionType[] = [
  ...DETECTOR_CONFIG_TYPES,
  ...POLICY_ALERT_TYPES,
  ...RETIRED_DETECTION_TYPES,
];

export const DETECTION_LABELS: Record<DetectorConfigType, string> = {
  unattended_object: 'Unattended Object',
  weapon: 'Possible Weapon',
  apriltag: 'AprilTag',
};

/**
 * Labels for every type an alert may carry. Types that can no longer raise one
 * are marked, so a historical alert is never mistaken for something the system
 * still watches for.
 */
export const ALL_DETECTION_LABELS: Record<AnyDetectionType, string> = {
  ...DETECTION_LABELS,
  restricted_area: 'Restricted Area',
  apriltag: 'AprilTag (no longer alerts)',
  loitering: 'Loitering (retired)',
  running: 'Running (retired)',
  fighting: 'Fighting (retired)',
  drowning: 'Drowning Posture (retired)',
  intoxication: 'Intoxicated Behavior (retired)',
};

export const DETECTION_DESCRIPTIONS: Record<DetectorConfigType, string> = {
  unattended_object:
    'Flags valuables (bags, phones, laptops, umbrellas) left stationary with no person nearby for the configured duration.',
  weapon:
    'Flags a possible weapon (firearm) in view using an on-device model. Never asserts a confirmed weapon; a second object model suppresses common look-alikes (phones, remotes) to cut false alarms.',
  apriltag:
    'Decodes standard AprilTag 36h11 fiducial markers — the camera-visible identity credential. Silent: it raises no alerts and never appears in the feed. Confidence threshold sets decode strictness.',
};

/**
 * What each detector needs computed each tick. Weapon detection needs its own
 * YOLOX output *and* the COCO-SSD object boxes — the object model is what vetoes
 * phone/remote look-alikes, so both must run when weapon detection is on.
 */
export const DETECTION_REQUIREMENTS: Record<DetectorConfigType, DetectionRequirement[]> = {
  unattended_object: ['objects'],
  weapon: ['weapons', 'objects'],
  apriltag: ['apriltag'],
};

/**
 * One confirmed person-inside-a-restricted-zone event the browser reports to
 * the server. CV facts only — no identity, no rule, no decision. The `aprilTags`
 * are raw decoded numbers; the observer never resolves them to a person, so the
 * browser makes no policy decision. Mirrors the backend's RestrictedAreaObservation.
 */
export interface RestrictedAreaObservation {
  cameraId: string;
  zoneId: string;
  trackId: string;
  frame: { width: number; height: number };
  personBox: [number, number, number, number];
  enteredFromOutside: boolean;
  framesInside: number;
  dwellMs: number;
  aprilTags: number[];
  snapshot: string;
}
