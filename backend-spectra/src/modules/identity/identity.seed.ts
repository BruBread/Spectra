import { Role } from './role.model.js';
import { countRoles } from './role.service.js';
import { defaultRolePermissions } from './identity.types.js';

/**
 * Creates the two starting roles.
 *
 * Only runs when no role exists at all — the same rule the admin seeder
 * follows. Upserting by key on every boot would quietly resurrect a role an
 * administrator deliberately deactivated or removed.
 *
 * Both start with no permissions: allowed in no zone, exempt from nothing.
 * A guard being permitted somewhere is a decision an admin makes, not a
 * default the software assumes.
 */
export async function seedRoles(): Promise<void> {
  if ((await countRoles()) > 0) return;

  await Role.create([
    {
      key: 'security_guard',
      name: 'Security guard',
      description: 'On-site security personnel.',
      active: true,
      permissions: defaultRolePermissions(),
    },
    {
      key: 'staff',
      name: 'Staff',
      description: 'General staff member.',
      active: true,
      permissions: defaultRolePermissions(),
    },
  ]);

  console.log('[identity] seeded roles: security_guard, staff');
}
