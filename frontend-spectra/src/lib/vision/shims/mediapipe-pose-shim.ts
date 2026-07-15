/**
 * @tensorflow-models/pose-detection statically imports @mediapipe/pose for
 * its BlazePose runtime, even though this project only ever constructs a
 * MoveNet detector. @mediapipe/pose ships as a non-ESM global-script bundle
 * that bundlers can't statically analyze, so it's aliased to this shim in
 * next.config.ts. The real BlazePose code path is never invoked.
 */
export class Pose {
  constructor() {
    throw new Error('@mediapipe/pose is stubbed out — BlazePose is not used in this project (MoveNet only).');
  }
}
