import { UNIDENTIFIED_SUBJECT } from '../policy/policy.types.js';
import type { ActionRule } from '../policy/action.catalog.js';

/**
 * Identity for people a camera may see — deliberately separate from the
 * admin-console roles in modules/auth. An `admin`/`operator` runs the
 * software; a `security_guard`/`staff` is somebody the system observes.
 */

/** The two roles seeded at boot. Admins may create more — this is not a closed set. */
export const SEEDED_ROLE_KEYS = ['security_guard', 'staff'] as const;

/**
 * Keys no role may claim.
 *
 * `unidentified_person` names the policy subject that every decision records.
 * A role sharing that key would make a decision's subject ambiguous — you
 * could no longer tell whether a rule came from somebody's role or from the
 * unidentified-person policy.
 */
export const RESERVED_ROLE_KEYS: string[] = [UNIDENTIFIED_SUBJECT];

/**
 * What a role is permitted to do, as explicit rules from the code-defined
 * action catalog.
 *
 * A rule that isn't written restricts — see DEFAULT_RULE. There is
 * deliberately no unattended-object rule: once the person who left an object
 * walks away, ownership can't be established from a camera frame, so no role
 * can be trusted to excuse it.
 */
export interface RolePermissions {
  actions: ActionRule[];
}

export function defaultRolePermissions(): RolePermissions {
  // Restrictive by default: a new role has no rules at all, which means it is
  // allowed nothing until an administrator writes one.
  return { actions: [] };
}
