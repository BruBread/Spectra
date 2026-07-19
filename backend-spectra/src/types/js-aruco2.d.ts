/**
 * Minimal ambient types for the parts of js-aruco2 the backend touches.
 *
 * The backend never runs the fiducial *detector* — it only reads the installed
 * AprilTag 36h11 dictionary so tag allocation derives its valid id range from
 * the very same data file the frontend generator uses, rather than hard-coding
 * a range that could drift from the dictionary.
 */
declare module 'js-aruco2/src/aruco.js' {
  interface AprilTagDictionaryData {
    nBits: number;
    tau: number;
    /** One packed code per valid tag id; its length is the number of ids. */
    codeList: number[];
  }
  interface ARNamespace {
    DICTIONARIES: Record<string, AprilTagDictionaryData | undefined>;
  }
  const arucoModule: { AR: ARNamespace };
  export default arucoModule;
}

/** Side-effect import: registers APRILTAG_36h11 into AR.DICTIONARIES. */
declare module 'js-aruco2/src/dictionaries/apriltag_36h11.js';
