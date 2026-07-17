import { Zone } from './zones.model.js';
import { Role } from '../identity/role.model.js';
import { PolicyDecision } from '../policy/policy.model.js';
import { removeZoneFromAllRoles } from '../identity/role.service.js';
import {
  countUnidentifiedRulesForZone,
  removeZoneFromUnidentifiedPolicy,
} from '../policy/unidentifiedPolicy.service.js';

export interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function listZones(filter: { cameraId?: string; active?: boolean } = {}) {
  const query: Record<string, unknown> = {};
  if (filter.cameraId) query.cameraId = filter.cameraId;
  if (filter.active !== undefined) query.active = filter.active;
  return Zone.find(query).sort({ name: 1 });
}

export function findZoneById(id: string) {
  return Zone.findById(id);
}

export function createZone(input: { name: string; cameraId: string; rect: ZoneRect }, actorId: string) {
  return Zone.create({
    name: input.name,
    cameraId: input.cameraId,
    rect: input.rect,
    active: true,
    createdBy: actorId,
    updatedBy: actorId,
  });
}

export function updateZone(
  id: string,
  updates: Partial<{ name: string; rect: ZoneRect; active: boolean }>,
  actorId: string,
) {
  // cameraId is not updatable: a rectangle is meaningless against a different
  // camera's frame, so moving a zone means creating one on that camera.
  return Zone.findByIdAndUpdate(id, { $set: { ...updates, updatedBy: actorId } }, { new: true, runValidators: true });
}

export interface ZoneUsage {
  rolePermissions: number;
  unidentifiedPolicyRules: number;
  policyDecisions: number;
}

export async function zoneUsage(id: string): Promise<ZoneUsage> {
  const [rolePermissions, unidentifiedPolicyRules, policyDecisions] = await Promise.all([
    Role.countDocuments({ 'permissions.actions.zoneId': id }),
    countUnidentifiedRulesForZone(id),
    PolicyDecision.countDocuments({ zoneId: id }),
  ]);
  return { rolePermissions, unidentifiedPolicyRules, policyDecisions };
}

/**
 * Deletes a zone only when no recorded decision refers to it.
 *
 * A zone named by a policy decision is part of an audit trail and is archived
 * (deactivated) instead. Rules alone don't block deletion — they are current
 * configuration, not history, so the zone is pulled out of every role *and*
 * out of the unidentified-person policy on the way out. Both matter: a rule
 * left pointing at a deleted zone is unreadable, and a stale `allow` is worse
 * than unreadable.
 */
export async function deleteZone(id: string): Promise<{ deleted: boolean; usage: ZoneUsage }> {
  const usage = await zoneUsage(id);
  if (usage.policyDecisions > 0) {
    return { deleted: false, usage };
  }

  await Promise.all([removeZoneFromAllRoles(id), removeZoneFromUnidentifiedPolicy(id)]);
  await Zone.findByIdAndDelete(id);
  return { deleted: true, usage };
}
