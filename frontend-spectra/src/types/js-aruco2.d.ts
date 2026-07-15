/**
 * js-aruco2 ships no type definitions and uses a legacy CJS pattern
 * (`this.AR = AR`, `require()`-based dictionary registration). These
 * ambient declarations cover only the surface this project uses.
 */
declare module 'js-aruco2/src/aruco.js' {
  interface ArucoMarkerCorner {
    x: number;
    y: number;
  }

  interface ArucoMarker {
    id: number;
    corners: ArucoMarkerCorner[];
  }

  interface ArucoDetectorOptions {
    dictionaryName?: string;
    maxHammingDistance?: number;
  }

  interface ArucoDetector {
    detect(imageData: ImageData): ArucoMarker[];
  }

  interface ArucoDictionary {
    generateSVG(id: number): string;
  }

  interface ArNamespace {
    Detector: new (options?: ArucoDetectorOptions) => ArucoDetector;
    Dictionary: new (dictionaryName: string) => ArucoDictionary;
    DICTIONARIES: Record<string, { nBits: number; tau: number; codeList: number[] }>;
  }

  const mod: { AR: ArNamespace };
  export = mod;
}

declare module 'js-aruco2/src/dictionaries/apriltag_36h11.js' {
  const mod: unknown;
  export = mod;
}
