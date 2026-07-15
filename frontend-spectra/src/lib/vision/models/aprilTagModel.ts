import arucoModule from 'js-aruco2/src/aruco.js';
import 'js-aruco2/src/dictionaries/apriltag_36h11.js';

const { AR } = arucoModule;

const DICTIONARY_NAME = 'APRILTAG_36h11';
const DICTIONARY_TAU = AR.DICTIONARIES[DICTIONARY_NAME]?.tau ?? 11;

/** Downscaled processing width for the fiducial detector, for performance. */
export const APRILTAG_PROCESS_WIDTH = 480;

export interface DetectedAprilTag {
  tagId: number;
  /** Marker corners in the downscaled processing-canvas coordinate space. */
  corners: Array<{ x: number; y: number }>;
}

/**
 * Real AprilTag 36h11 decoding via js-aruco2, which bundles the actual
 * AprilTag 36h11 bit dictionary (extracted from the official AprilRobotics
 * tag-generation source) — this is genuine fiducial marker decoding, not a
 * simulated placeholder. `confidenceThreshold` is translated into the
 * decoder's allowed bit-error (Hamming distance) tolerance, since a
 * fiducial decode is a deterministic match/no-match rather than a
 * probabilistic model score.
 */
export function createAprilTagDetector(confidenceThreshold: number) {
  const maxHammingDistance = Math.max(1, Math.round((1 - confidenceThreshold) * DICTIONARY_TAU));
  return new AR.Detector({ dictionaryName: DICTIONARY_NAME, maxHammingDistance });
}

export function detectAprilTags(detector: ReturnType<typeof createAprilTagDetector>, imageData: ImageData): DetectedAprilTag[] {
  return detector.detect(imageData).map((marker) => ({ tagId: marker.id, corners: marker.corners }));
}

export function generateAprilTagSvg(tagId: number): string {
  const dictionary = new AR.Dictionary(DICTIONARY_NAME);
  return dictionary.generateSVG(tagId);
}
