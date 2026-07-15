import type { DetectedKeypoint, DetectedPose } from './models/poseModel';

const MIN_KEYPOINT_SCORE = 0.3;

export function keypoint(pose: DetectedPose, name: string): DetectedKeypoint | null {
  const kp = pose.keypoints.find((k) => k.name === name);
  if (!kp || (kp.score ?? 0) < MIN_KEYPOINT_SCORE) return null;
  return kp;
}

export function poseCentroid(pose: DetectedPose): [number, number] | null {
  const valid = pose.keypoints.filter((k) => (k.score ?? 0) >= MIN_KEYPOINT_SCORE);
  if (valid.length === 0) return null;
  const x = valid.reduce((sum, k) => sum + k.x, 0) / valid.length;
  const y = valid.reduce((sum, k) => sum + k.y, 0) / valid.length;
  return [x, y];
}

export function poseBoundingBox(pose: DetectedPose): [number, number, number, number] | undefined {
  const valid = pose.keypoints.filter((k) => (k.score ?? 0) >= MIN_KEYPOINT_SCORE);
  if (valid.length === 0) return undefined;
  const xs = valid.map((k) => k.x);
  const ys = valid.map((k) => k.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return [minX, minY, maxX - minX, maxY - minY];
}

/** Sum of wrist/elbow displacement speed (px/sec) between two frames of the same person — a crude "how much are the arms flailing" signal. */
export function limbSpeedSum(prev: DetectedPose | undefined, curr: DetectedPose, dtMs: number): number {
  if (!prev || dtMs <= 0) return 0;
  const names = ['left_wrist', 'right_wrist', 'left_elbow', 'right_elbow'];
  let total = 0;
  for (const name of names) {
    const a = keypoint(prev, name);
    const b = keypoint(curr, name);
    if (a && b) total += Math.hypot(a.x - b.x, a.y - b.y) / (dtMs / 1000);
  }
  return total;
}
