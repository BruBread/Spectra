/**
 * Admin-console roles. These govern who may operate the Spectra web app and
 * are deliberately separate from the monitored-person roles (faculty,
 * student, security guard, …) introduced in a later identity phase — an
 * `operator` is staff running the console, not somebody a camera sees.
 */
export type AdminRole = 'admin' | 'operator';

export const ADMIN_ROLES: AdminRole[] = ['admin', 'operator'];

/** The user shape returned to clients — never includes the password hash. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  lastLoginAt: string | null;
}
