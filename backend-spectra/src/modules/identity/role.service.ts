import { Role } from './role.model.js';
import { Person } from './person.model.js';
import { PolicyDecision } from '../policy/policy.model.js';
import { defaultRolePermissions, type RolePermissions } from './identity.types.js';

export function listRoles(filter: { active?: boolean } = {}) {
  const query: Record<string, unknown> = {};
  if (filter.active !== undefined) query.active = filter.active;
  return Role.find(query).sort({ key: 1 });
}

export function findRoleById(id: string) {
  return Role.findById(id);
}

export function findRoleByKey(key: string) {
  return Role.findOne({ key });
}

export function createRole(
  input: { key: string; name: string; description?: string; permissions?: RolePermissions },
  actorId: string,
) {
  return Role.create({
    key: input.key,
    name: input.name,
    description: input.description ?? '',
    active: true,
    permissions: input.permissions ?? defaultRolePermissions(),
    createdBy: actorId,
    updatedBy: actorId,
  });
}

export function updateRole(
  id: string,
  updates: Partial<{ name: string; description: string; active: boolean; permissions: RolePermissions }>,
  actorId: string,
) {
  // `key` is deliberately not updatable: policy decisions record it, and
  // rewriting it would silently rewrite what those records appear to say.
  return Role.findByIdAndUpdate(id, { $set: { ...updates, updatedBy: actorId } }, { new: true, runValidators: true });
}

export interface RoleUsage {
  people: number;
  policyDecisions: number;
}

/** What still points at this role — a role in use must not vanish. */
export async function roleUsage(id: string): Promise<RoleUsage> {
  const [people, policyDecisions] = await Promise.all([
    Person.countDocuments({ roleId: id }),
    PolicyDecision.countDocuments({ roleId: id }),
  ]);
  return { people, policyDecisions };
}

/**
 * Permanent deletion, allowed only when nothing depends on the role.
 *
 * Roles assigned to people, or named by a recorded policy decision, are never
 * deleted: the first would orphan a person, the second would quietly rewrite
 * an audit trail. Deactivating is the normal way to retire a role.
 */
export async function deleteRole(id: string): Promise<{ deleted: boolean; usage: RoleUsage }> {
  const usage = await roleUsage(id);
  if (usage.people > 0 || usage.policyDecisions > 0) {
    return { deleted: false, usage };
  }
  await Role.findByIdAndDelete(id);
  return { deleted: true, usage };
}

/** Drops a zone from every role's permissions — used when a zone is deleted. */
export function removeZoneFromAllRoles(zoneId: string) {
  return Role.updateMany({ 'permissions.zones.zoneId': zoneId }, { $pull: { 'permissions.zones': { zoneId } } });
}

export function countRoles() {
  return Role.countDocuments();
}
