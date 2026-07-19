import aruco from 'js-aruco2/src/aruco.js';
import 'js-aruco2/src/dictionaries/apriltag_36h11.js';

/**
 * The single AprilTag family Spectra issues and recognises.
 *
 * The valid id range is *derived* from the installed js-aruco2 dictionary — the
 * exact same 36h11 code table the frontend generator (`generateAprilTagSvg`)
 * renders from — so the server can never allocate an id the generator would
 * refuse to draw, and neither side carries a hard-coded range that could drift
 * if the dictionary is ever updated.
 */
const DICTIONARY_NAME = 'APRILTAG_36h11';

/** Human-facing family label, shown verbatim wherever a tag is named. */
export const APRILTAG_FAMILY = 'AprilTag 36h11';

const dictionary = aruco.AR.DICTIONARIES[DICTIONARY_NAME];
if (!dictionary) {
  throw new Error(
    `js-aruco2 does not expose the ${DICTIONARY_NAME} dictionary — cannot derive the valid AprilTag id range`,
  );
}

/** Number of valid ids in the 36h11 dictionary (587: ids 0–586). */
export const APRILTAG_ID_COUNT = dictionary.codeList.length;
export const APRILTAG_MIN_ID = 0;
export const APRILTAG_MAX_ID = APRILTAG_ID_COUNT - 1;

/** True only for an integer inside the installed dictionary's id range. */
export function isValidAprilTagId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= APRILTAG_MIN_ID &&
    value <= APRILTAG_MAX_ID
  );
}
