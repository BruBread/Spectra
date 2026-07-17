/**
 * Who a policy decision was about, and what came of it.
 *
 * Kept apart from identity.types.ts so the identity module and the policy
 * module can both refer to these without importing each other.
 */

/**
 * The reserved subject evaluated when nobody could be identified.
 *
 * Not a Person and not a Role: it is a policy subject, so it can never be
 * assigned to somebody, deleted, or created by an administrator.
 */
export const UNIDENTIFIED_SUBJECT = 'unidentified_person';

export type PolicySubject = 'person' | typeof UNIDENTIFIED_SUBJECT;

export const POLICY_SUBJECTS: PolicySubject[] = ['person', UNIDENTIFIED_SUBJECT];

/**
 * Why the unidentified-person policy was used instead of somebody's role.
 *
 * A wristband is not a credential: a nearby LoRa device with no camera-visible
 * AprilTag is `no_apriltag`, exactly like carrying nothing at all.
 */
export type UnidentifiedReason =
  /** No readable AprilTag in the frame — including when only a LoRa device is nearby. */
  | 'no_apriltag'
  /** A tag was decoded but no registered person holds it. */
  | 'unregistered_apriltag'
  /** More than one tag could belong to the person, or one tag to more than one person. */
  | 'ambiguous_apriltag'
  /** The tag belongs to a person who has been deactivated. */
  | 'inactive_person'
  /** The person's role has been deactivated, so it grants nothing. */
  | 'inactive_role';

export const UNIDENTIFIED_REASONS: UnidentifiedReason[] = [
  'no_apriltag',
  'unregistered_apriltag',
  'ambiguous_apriltag',
  'inactive_person',
  'inactive_role',
];

export type PolicyDecisionOutcome = 'alert_created' | 'suppressed';

export const POLICY_DECISION_OUTCOMES: PolicyDecisionOutcome[] = ['alert_created', 'suppressed'];
