import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

export interface DetectedKeypoint {
  x: number;
  y: number;
  score?: number;
  name?: string;
}

export interface DetectedPose {
  /** Persistent id from MoveNet's built-in multi-pose tracker. */
  id: number;
  keypoints: DetectedKeypoint[];
  score: number;
}

let modelPromise: Promise<poseDetection.PoseDetector> | null = null;

/**
 * Real, pretrained MoveNet MultiPose model (TensorFlow.js). Runs entirely in
 * the browser and tracks up to 6 people with a persistent id per person
 * across frames — used as the shared signal source for the
 * behavior-heuristic detectors (loitering, running, fighting, drowning,
 * intoxication). The heuristics built on top of these keypoints are the
 * placeholder part, not the pose estimation itself.
 */
export async function loadPoseModel(): Promise<poseDetection.PoseDetector> {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.setBackend('webgl');
      await tf.ready();
      return poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
        modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableTracking: true,
        trackerType: poseDetection.TrackerType.BoundingBox,
      });
    })();
  }
  return modelPromise;
}

let poseIdCounter = 0;
const anonymousPoseIds = new WeakMap<object, number>();

export async function detectPoses(detector: poseDetection.PoseDetector, video: HTMLVideoElement): Promise<DetectedPose[]> {
  const poses = await detector.estimatePoses(video, { flipHorizontal: false }, performance.now());
  return poses.map((pose) => {
    let id = pose.id;
    if (id === undefined) {
      id = anonymousPoseIds.get(pose) ?? poseIdCounter++;
      anonymousPoseIds.set(pose, id);
    }
    return {
      id,
      score: pose.score ?? 0,
      keypoints: pose.keypoints.map((kp) => ({ x: kp.x, y: kp.y, score: kp.score, name: kp.name })),
    };
  });
}
