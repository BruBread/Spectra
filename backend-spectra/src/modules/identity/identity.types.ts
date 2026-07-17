/**
 * Identity for people a camera may see — deliberately separate from the
 * admin-console roles in modules/auth. An `admin`/`operator` runs the
 * software; a `security_guard`/`staff` is somebody the system observes.
 */

/** The two roles seeded at boot. Admins may create more — this is not a closed set. */
export const SEEDED_ROLE_KEYS = ['security_guard', 'staff'] as const;

export interface RoleZoneAccess {
  zoneId: string;
  allowed: boolean;
}

/**
 * What a role is permitted to do.
 *
 * There is deliberately no unattended-object exemption: once the person who
 * left an object walks away, ownership can't be established from a camera
 * frame, so no role can be trusted to excuse it.
 */
export interface RolePermissions {
  /**
   * Whether a possible-weapon detection may be suppressed for this role.
   * Only ever applies alongside a readable, registered AprilTag — enforced in
   * a later phase, never by configuration alone.
   */
  weaponExempt: boolean;
  /** Per-zone allow/deny. A zone absent from this list is denied. */
  zones: RoleZoneAccess[];
}

export function defaultRolePermissions(): RolePermissions {
  // Restrictive by default: a new role is allowed nowhere and exempt from
  // nothing until an administrator says otherwise.
  return { weaponExempt: false, zones: [] };
}

export type IdentityState = 'identified' | 'unidentified';

export const IDENTITY_STATES: IdentityState[] = ['identified', 'unidentified'];

export type PolicyDecisionOutcome = 'alert_created' | 'suppressed';

export const POLICY_DECISION_OUTCOMES: PolicyDecisionOutcome[] = ['alert_created', 'suppressed'];
