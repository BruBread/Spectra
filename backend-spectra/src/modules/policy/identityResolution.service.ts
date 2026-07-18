import { Person, type PersonDocument } from '../identity/person.model.js';
import { Role, type RoleDocument } from '../identity/role.model.js';
import { UNIDENTIFIED_SUBJECT, type PolicySubject, type UnidentifiedReason } from './policy.types.js';

/**
 * Who a camera observation is about, decided server-side from decoded AprilTags
 * alone.
 *
 * The one rule that matters here: a camera identifies a person by a readable,
 * registered AprilTag and nothing else. A LoRa wristband never appears in this
 * resolution — it cannot say which body in a frame is which, so it can neither
 * identify a person nor stand in for a missing tag. Everything that is not a
 * clean, single, active match is `unidentified_person`, and the reason says
 * why, so the audit trail records exactly how identification failed.
 */
export interface IdentityResolution {
  subject: PolicySubject;
  /** Null unless a single active person was cleanly identified. */
  person: PersonDocument | null;
  /** The identified person's role, when resolved and active. */
  role: RoleDocument | null;
  /** Why the subject is unidentified. Null when a person was identified. */
  unidentifiedReason: UnidentifiedReason | null;
  /** The tag that produced a person match, for the decision record. Null otherwise. */
  aprilTagId: number | null;
}

function unidentified(reason: UnidentifiedReason, aprilTagId: number | null = null): IdentityResolution {
  return { subject: UNIDENTIFIED_SUBJECT, person: null, role: null, unidentifiedReason: reason, aprilTagId };
}

/**
 * Resolves a subject from the AprilTag numbers seen on one person.
 *
 * The order of the checks is deliberate:
 * - No tag at all — including the case where only a LoRa device is nearby —
 *   is `no_apriltag`. A wristband is not a credential.
 * - Tags that decode but match no registered person are `unregistered_apriltag`.
 * - Two or more *distinct* registered people on one body is `ambiguous_apriltag`:
 *   the camera can't say which of them it is, so it trusts none of them.
 * - A single match that is deactivated, or whose role is deactivated, grants
 *   nothing — `inactive_person` / `inactive_role`. A revoked badge or a retired
 *   role must not keep opening a door.
 */
export async function resolveIdentityFromTags(aprilTags: number[]): Promise<IdentityResolution> {
  const tags = [...new Set(aprilTags.filter((tag) => Number.isFinite(tag)))];
  if (tags.length === 0) {
    return unidentified('no_apriltag');
  }

  const people = await Person.find({ aprilTagId: { $in: tags } });
  if (people.length === 0) {
    return unidentified('unregistered_apriltag');
  }

  // Distinct people, not distinct tags: two registered badges on one body is
  // still two people, and we can't tell which the frame belongs to.
  const distinct = new Map(people.map((person) => [String(person._id), person]));
  if (distinct.size > 1) {
    return unidentified('ambiguous_apriltag');
  }

  const person = people[0];
  const aprilTagId = typeof person.aprilTagId === 'number' ? person.aprilTagId : null;

  if (!person.active) {
    return unidentified('inactive_person', aprilTagId);
  }

  const role = await Role.findById(person.roleId);
  if (!role || !role.active) {
    return unidentified('inactive_role', aprilTagId);
  }

  return { subject: 'person', person, role, unidentifiedReason: null, aprilTagId };
}
