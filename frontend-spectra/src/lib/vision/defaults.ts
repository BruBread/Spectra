import type { DetectionTypeConfig, VisionSettings } from './types';

export const DEFAULT_CAMERA_ID = 'webcam-default';

/** Mirrors the backend's BASE_DETECTORS — used only until real settings load. */
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
    type: 'weapon',
    enabled: true,
    confidenceThreshold: 0.45,
    cooldownSeconds: 30,
    durationThresholdSeconds: 1,
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
