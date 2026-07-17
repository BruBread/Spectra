import type { ObjectId } from 'mongodb';
import { Role } from './role.model.js';
import type { ActionRule } from '../policy/action.catalog.js';

interface LegacyZoneAccess {
  zoneId: unknown;
  allowed: unknown;
}

interface LegacyPermissions {
  weaponExempt?: unknown;
  zones?: unknown;
  actions?: unknown;
}

/**
 * Rewrites the pre-catalog role permission shape into action rules.
 *
 * Old: `{ weaponExempt: boolean, zones: [{ zoneId, allowed }] }`
 * New: `{ actions: [{ action, zoneId, rule }] }`
 *
 * Runs through the raw collection rather than the model, because Mongoose
 * silently drops fields the schema no longer declares — reading through Role
 * would hide the very data this needs to migrate.
 *
 * Idempotent: only documents that still carry a legacy field are touched, and
 * a rule already present for the same action/zone wins over a derived one.
 */
export async function migrateRolePermissionsToActionRules(): Promise<void> {
  const legacyRoles = await Role.collection
    .find<{ _id: ObjectId; key?: string; permissions?: LegacyPermissions }>({
      $or: [{ 'permissions.zones': { $exists: true } }, { 'permissions.weaponExempt': { $exists: true } }],
    })
    .toArray();

  if (legacyRoles.length === 0) return;

  let migrated = 0;

  for (const role of legacyRoles) {
    const permissions = role.permissions ?? {};
    const existing: ActionRule[] = Array.isArray(permissions.actions) ? (permissions.actions as ActionRule[]) : [];
    const derived: ActionRule[] = [];

    if (Array.isArray(permissions.zones)) {
      for (const entry of permissions.zones as LegacyZoneAccess[]) {
        if (!entry?.zoneId) continue;
        // `allowed: false` was an administrator explicitly denying a zone, and
        // `restrict` is now expressible — so the intent is preserved rather
        // than dropped as "same as the default anyway".
        derived.push({
          action: 'restricted_area',
          zoneId: entry.zoneId as string,
          rule: entry.allowed === true ? 'allow' : 'restrict',
        });
      }
    }

    // Only when true. `false` is the old schema's default rather than a
    // decision anyone made, and possible_weapon restricts by default — so
    // migrating it would invent an explicit rule nobody wrote. A `true` here
    // is a real permission and must not vanish, even though the action isn't
    // configurable in the UI.
    if (permissions.weaponExempt === true) {
      derived.push({ action: 'possible_weapon', zoneId: null, rule: 'allow' });
    }

    const actions = [...existing];
    for (const rule of derived) {
      const alreadySet = actions.some(
        (candidate) =>
          candidate.action === rule.action && String(candidate.zoneId ?? '') === String(rule.zoneId ?? ''),
      );
      if (!alreadySet) actions.push(rule);
    }

    await Role.collection.updateOne(
      { _id: role._id },
      {
        $set: { 'permissions.actions': actions },
        $unset: { 'permissions.zones': '', 'permissions.weaponExempt': '' },
      },
    );
    migrated += 1;
  }

  console.log(`[identity] migrated ${migrated} role(s) from zone/weaponExempt permissions to action rules`);
}
