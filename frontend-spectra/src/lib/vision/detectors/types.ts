import type { DetectedObjectBox } from '../models/objectModel';
import type { DetectedAprilTag } from '../models/aprilTagModel';
import type { DetectedWeaponBox } from '../models/weaponModel';
import type { DetectionType, DetectionTypeConfig, Zone } from '../types';

export interface DetectionCandidate {
  type: DetectionType;
  /** Stable key for this candidate's cooldown/duration state (trackId, zone, pair, tag id, ...). */
  key: string;
  confidence: number;
  message: string;
  metadata?: Record<string, unknown>;
  /** Region to highlight on the overlay and crop context from, in video pixel coordinates. */
  box?: [number, number, number, number];
}

export interface DetectorFrameInput {
  now: number;
  videoWidth: number;
  videoHeight: number;
  objects: DetectedObjectBox[];
  /** YOLO11 weapon boxes for this frame — empty unless weapon detection is on. */
  weapons: DetectedWeaponBox[];
  aprilTags: DetectedAprilTag[];
  /** Multiply AprilTag corner coords by this to map them into video pixel coordinates. */
  aprilTagScale: number;
}

export interface DetectionAdapter {
  type: DetectionType;
  /** Called once per enabled tick; implementations own their internal tracking state. */
  evaluate(input: DetectorFrameInput, config: DetectionTypeConfig): DetectionCandidate[];
}

export function isInsideZone(point: [number, number], zone: Zone | null, videoWidth: number, videoHeight: number): boolean {
  if (!zone) return true;
  const [x, y] = point;
  const zx = zone.x * videoWidth;
  const zy = zone.y * videoHeight;
  const zw = zone.width * videoWidth;
  const zh = zone.height * videoHeight;
  return x >= zx && x <= zx + zw && y >= zy && y <= zy + zh;
}
