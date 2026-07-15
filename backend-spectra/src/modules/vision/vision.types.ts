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
