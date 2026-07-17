import type { BadgeTone } from '../../components/ui/Badge';
import type { CameraRecord } from '../cameras/types';
import { DEFAULT_CAMERA_ID } from '../vision/defaults';
import { DETECTION_LABELS, type AlertSeverity, type AlertStatus, type VisionAlert } from '../vision/types';

/**
 * A notification in this app is not a record of its own — it is a presentation
 * of a VisionAlert. These helpers keep that presentation identical across the
 * notifications page, the top-bar bell and the dashboard preview.
 */

export const SEVERITY_TONE: Record<AlertSeverity, BadgeTone> = {
  critical: 'danger',
  warning: 'warning',
  info: 'info',
};

export const STATUS_TONE: Record<AlertStatus, BadgeTone> = {
  new: 'info',
  acknowledged: 'neutral',
  under_review: 'warning',
  resolved: 'success',
  dismissed: 'neutral',
};

/** Neutral, review-oriented title. A detection is a signal to check, never a verdict. */
export function alertTitle(alert: VisionAlert): string {
  return DETECTION_LABELS[alert.type] ?? 'Detection';
}

/**
 * Resolves the camera a detection came from.
 *
 * `webcam-default` is the Monitor page's built-in quick-test webcam rather
 * than a registered camera, so it gets a name but is never treated as a
 * missing record.
 */
export function resolveCamera(alert: VisionAlert, cameras: CameraRecord[]) {
  if (alert.cameraId === DEFAULT_CAMERA_ID) {
    return { label: 'Browser webcam (quick test)', linkable: true as const };
  }

  const camera = cameras.find((entry) => entry.id === alert.cameraId);
  if (camera) return { label: camera.name, linkable: true as const };

  // The camera was removed after this alert was recorded. Linking to Monitor
  // would silently select a different camera, so show the raw id instead.
  return { label: alert.cameraId, linkable: false as const };
}

export function monitorHref(alert: VisionAlert): string {
  return `/monitor?camera=${encodeURIComponent(alert.cameraId)}`;
}

export function confidencePercent(alert: VisionAlert): string {
  return `${Math.round(alert.confidence * 100)}%`;
}
