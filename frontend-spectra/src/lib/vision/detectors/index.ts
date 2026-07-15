import type { DetectionAdapter } from './types';
import { createUnattendedObjectDetector } from './unattendedObject';
import { createLoiteringDetector } from './loitering';
import { createRunningDetector } from './running';
import { createFightingDetector } from './fighting';
import { createDrowningDetector } from './drowning';
import { createIntoxicationDetector } from './intoxication';
import { createAprilTagDetectorAdapter } from './aprilTag';

export type { DetectionAdapter, DetectionCandidate, DetectorFrameInput } from './types';

export function createDetectorRegistry(): DetectionAdapter[] {
  return [
    createUnattendedObjectDetector(),
    createLoiteringDetector(),
    createRunningDetector(),
    createFightingDetector(),
    createDrowningDetector(),
    createIntoxicationDetector(),
    createAprilTagDetectorAdapter(),
  ];
}
