import type { DetectionTypeConfig, VisionSettings } from './types';

export const DEFAULT_CAMERA_ID = 'webcam-default';

const BASE_DETECTORS: DetectionTypeConfig[] = [
  {
    type: 'unattended_object',
    enabled: true,
    confidenceThreshold: 0.6,
    cooldownSeconds: 60,
    durationThresholdSeconds: 30,
    zone: null,
  },
  {
    type: 'loitering',
    enabled: true,
    confidenceThreshold: 0.5,
    cooldownSeconds: 120,
    durationThresholdSeconds: 20,
    zone: null,
  },
  {
    type: 'running',
    enabled: true,
    confidenceThreshold: 0.55,
    cooldownSeconds: 30,
    durationThresholdSeconds: 1.5,
    zone: null,
  },
  {
    type: 'fighting',
    enabled: true,
    confidenceThreshold: 0.55,
    cooldownSeconds: 30,
    durationThresholdSeconds: 1.5,
    zone: null,
  },
  {
    type: 'drowning',
    enabled: true,
    confidenceThreshold: 0.5,
    cooldownSeconds: 45,
    durationThresholdSeconds: 5,
    zone: null,
  },
  {
    type: 'intoxication',
    enabled: true,
    confidenceThreshold: 0.5,
    cooldownSeconds: 60,
    durationThresholdSeconds: 5,
    zone: null,
  },
  {
    type: 'apriltag',
    enabled: true,
    confidenceThreshold: 0.7,
    cooldownSeconds: 20,
    durationThresholdSeconds: 0,
    zone: null,
  },
];

export function defaultVisionSettings(cameraId = DEFAULT_CAMERA_ID): VisionSettings {
  return {
    cameraId,
    processingIntervalMs: 500,
    retentionDays: 14,
    detectors: BASE_DETECTORS.map((detector) => ({ ...detector })),
  };
}
