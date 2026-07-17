'use client';

import { useState } from 'react';
import { Loader2, PlugZap, Plus, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { useCameraSources } from '../../context/CameraSourcesContext';
import { useToast } from '../../context/ToastContext';
import type { LoadState } from '../../lib/accessControl/loadState';
import type { AccessRole, ActionRule, RestrictedZone } from '../../lib/accessControl/types';
import { deleteRole, updateRole, updateRoleZonePermissions } from '../../lib/api/accessControl';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { RoleFormModal } from './RoleFormModal';
import styles from './accessControl.module.css';

interface RolesPanelProps {
  roles: LoadState<AccessRole[]>;
  zones: LoadState<RestrictedZone[]>;
  canEdit: boolean;
  onRolesChanged: () => void;
}

export function RolesPanel({ roles, zones, canEdit, onRolesChanged }: RolesPanelProps) {
  const { showToast } = useToast();
  const { cameras } = useCameraSources();
  const [editing, setEditing] = useState<AccessRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cameraName = (cameraId: string) => cameras.find((camera) => camera.id === cameraId)?.name ?? 'Unregistered camera';

  /**
   * Zones this role can be granted: every active zone, plus any archived zone
   * it already allows — hiding the latter would present a permission that
   * exists as though it didn't.
   */
  const zonesFor = (role: AccessRole) =>
    zones.data.filter((zone) => zone.active || isAllowed(role, zone.id));

  const isAllowed = (role: AccessRole, zoneId: string) =>
    role.permissions.actions.some(
      (entry) => entry.action === 'restricted_area' && entry.zoneId === zoneId && entry.rule === 'allow',
    );

  const handleToggleZone = async (role: AccessRole, zoneId: string, allowed: boolean) => {
    // Only `allow` rules are written from this checkbox. An unticked zone is
    // left unwritten rather than stored as an explicit `restrict`: both deny,
    // and this two-state control cannot express the difference between "denied"
    // and "somebody considered it and denied it".
    const next: ActionRule[] = role.permissions.actions.filter(
      (entry) => entry.action === 'restricted_area' && entry.zoneId !== zoneId && entry.rule === 'allow',
    );
    if (allowed) next.push({ action: 'restricted_area', zoneId, rule: 'allow' });

    setBusyId(role.id);
    const result = await updateRoleZonePermissions(role, next);
    setBusyId(null);

    if (!result.ok) {
      showToast(result.error ?? 'Could not update permissions.', 'error');
      return;
    }
    onRolesChanged();
  };

  const handleToggleActive = async (role: AccessRole) => {
    setBusyId(role.id);
    const result = await updateRole(role.id, { active: !role.active });
    setBusyId(null);

    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Could not update this role.', 'error');
      return;
    }
    showToast(`${result.data.name} ${result.data.active ? 'reactivated' : 'deactivated'}`, 'success');
    onRolesChanged();
  };

  const handleDelete = async (role: AccessRole) => {
    setBusyId(role.id);
    const result = await deleteRole(role.id);
    setBusyId(null);

    if (!result.ok) {
      // The backend refuses while people or recorded decisions still refer to
      // the role, and says so precisely — including the counts.
      showToast(result.error ?? 'Could not delete this role.', 'error');
      return;
    }
    showToast(`${role.name} deleted`, 'success');
    onRolesChanged();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.caution}>
        <ShieldAlert size={16} aria-hidden="true" />
        <span>
          Permissions here are configuration only. No detector or policy engine reads them yet, so nothing on this page
          changes what the cameras currently do.
        </span>
      </div>

      <div className={styles.toolbar}>
        <p className={styles.cellMuted}>
          Roles apply to people the cameras observe, and only when a registered AprilTag identifies them.
        </p>
        {canEdit ? (
          <div className={styles.toolbarActions}>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} aria-hidden="true" /> Add role
            </Button>
          </div>
        ) : null}
      </div>

      {roles.status === 'loading' ? (
        <Card padding="sm">
          <EmptyState icon={<Loader2 size={20} className={styles.spin} aria-hidden="true" />} title="Loading roles…" />
        </Card>
      ) : roles.status === 'error' ? (
        <Card padding="sm">
          <EmptyState
            icon={<PlugZap size={20} aria-hidden="true" />}
            title="Could not load roles"
            description={roles.error ?? undefined}
            action={
              <Button variant="secondary" size="sm" onClick={onRolesChanged}>
                Try again
              </Button>
            }
          />
        </Card>
      ) : roles.data.length === 0 ? (
        <Card padding="sm">
          <EmptyState
            icon={<ShieldQuestion size={20} aria-hidden="true" />}
            title="No roles"
            description="The backend seeds Security Guard and Staff on first start. If this list is empty, no role has been created yet."
          />
        </Card>
      ) : (
        <div className={styles.cardList}>
          {roles.data.map((role) => {
            const selectableZones = zonesFor(role);
            return (
              // The key doubles as a stable test hook: role names are editable,
              // keys are not.
              <Card key={role.id} data-role-key={role.key}>
                <div className={styles.cardTop}>
                  <div>
                    <div className={styles.cardTitleRow}>
                      <span className={styles.cardTitle}>{role.name}</span>
                      <span className={styles.mono}>{role.key}</span>
                      <Badge tone={role.active ? 'success' : 'neutral'}>{role.active ? 'Active' : 'Deactivated'}</Badge>
                      {/* No control for these — the catalog marks them
                          unconfigurable. They are still shown when set, because
                          hiding a permission that exists is worse than showing
                          one that is inert. */}
                      {role.permissions.actions
                        .filter((rule) => rule.action !== 'restricted_area' && rule.rule === 'allow')
                        .map((rule) => (
                          <Badge key={rule.action} tone="warning">
                            {rule.action} allowed — not enforced
                          </Badge>
                        ))}
                    </div>
                    {role.description ? <p className={styles.cardDescription}>{role.description}</p> : null}
                  </div>

                  {canEdit ? (
                    <div className={styles.rowActions}>
                      <Button variant="secondary" size="sm" onClick={() => setEditing(role)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === role.id}
                        onClick={() => void handleToggleActive(role)}
                      >
                        {role.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === role.id}
                        onClick={() => void handleDelete(role)}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className={styles.permissions}>
                  <p className={styles.permissionsHeading}>Restricted zone access</p>

                  {zones.status === 'loading' ? (
                    <p className={styles.emptyPermission}>Loading zones…</p>
                  ) : zones.status === 'error' ? (
                    <p className={styles.emptyPermission}>
                      Zones could not be loaded, so this role’s zone permissions cannot be shown or changed.
                    </p>
                  ) : selectableZones.length === 0 ? (
                    // Controls appear only once there is something real to
                    // grant: an empty permission list would otherwise look
                    // like a decision rather than an absence.
                    <p className={styles.emptyPermission}>
                      No restricted zones exist yet. Create one under Restricted Zones to grant this role access.
                    </p>
                  ) : (
                    <div className={styles.zoneChecks}>
                      {selectableZones.map((zone) => (
                        <label key={zone.id} className={styles.zoneCheck}>
                          <input
                            type="checkbox"
                            checked={isAllowed(role, zone.id)}
                            disabled={!canEdit || busyId === role.id}
                            onChange={(event) => void handleToggleZone(role, zone.id, event.target.checked)}
                          />
                          <span>{zone.name}</span>
                          <span className={styles.zoneCheckMeta}>
                            {cameraName(zone.cameraId)}
                            {zone.active ? '' : ' · archived'}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  <p className={styles.emptyPermission}>
                    A zone that is not ticked is denied — absence is not permission.
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {creating || editing ? (
        <RoleFormModal
          role={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(role) => {
            setCreating(false);
            setEditing(null);
            showToast(`${role.name} saved`, 'success');
            onRolesChanged();
          }}
        />
      ) : null}
    </div>
  );
}
