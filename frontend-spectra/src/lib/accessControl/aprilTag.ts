import { generateAprilTagSvg } from '../vision/models/aprilTagModel';

/**
 * Print-side helpers for a person's AprilTag.
 *
 * These wrap the *existing* 36h11 generator the camera pipeline already uses
 * (`generateAprilTagSvg`) — there is deliberately no second tag family, no
 * external image service, and no new dependency. The printed marker is byte-for
 * byte the same one the detector decodes, so a demo cannot print a tag the
 * camera then fails to recognise.
 */

/** The single family Spectra recognises. Shown verbatim; never invented per-call. */
export const APRILTAG_FAMILY = 'AprilTag 36h11';

export type AprilTagSvgResult =
  | { ok: true; svg: string; tagId: number }
  | { ok: false; error: string };

/**
 * Builds the AprilTag SVG for a tag id, or a clear error for an unusable one.
 *
 * A missing id, or an id the 36h11 dictionary does not contain, must fail
 * safely rather than render an arbitrary or misleading marker — the underlying
 * generator throws for out-of-range ids, and that message already states the
 * valid range, so it is surfaced as-is.
 */
export function buildAprilTagSvg(tagId: number | null | undefined): AprilTagSvgResult {
  if (tagId === null || tagId === undefined || !Number.isInteger(tagId) || tagId < 0) {
    return { ok: false, error: 'This person has no valid AprilTag ID assigned, so there is nothing to print.' };
  }

  try {
    const svg = generateAprilTagSvg(tagId);
    return { ok: true, svg, tagId };
  } catch (error) {
    // The generator throws a plain string for ids outside the dictionary,
    // e.g. 'The id "999" is not valid ... ID must be between 0 and 586 included.'
    const message =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : 'This AprilTag ID is not valid for the 36h11 family and cannot be printed.';
    return { ok: false, error: message };
  }
}
