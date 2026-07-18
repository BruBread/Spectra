'use client';

import { useState } from 'react';
import { Loader2, PlugZap, Plus, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { useCameraSources } from '../../context/CameraSourcesContext';
import { useToast } from '../../context/ToastContext';
import type { LoadState } from '../../lib/accessControl/loadState';
import type { AccessRole, ActionDefinition, ActionRule, RestrictedZone } from '../../lib/accessControl/types';
import { deleteRole, updateRole, updateRolePermissions } from '../../lib/api/accessControl';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { ActionRulesEditor } from './ActionRulesEditor';
import { RoleFormModal } from './RoleFormModal';
import styles from './accessControl.module.css';

interface RolesPanelProps {
  roles: LoadState<AccessRole[]>;
  zones: LoadState<RestrictedZone[]>;
  catalog: LoadState<ActionDefinition[]>;
  canEdit: boolean;
  onRolesChanged: () => void;
}

export function RolesPanel({ roles, zones, catalog, canEdit, onRolesChanged }: RolesPanelProps) {
  const { showToast } = useToast();
  const { cameras } = useCameraSources();
  const [editing, setEditing] = useState<AccessRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cameraName = (cameraId: string) => cameras.find((camera) => camera.id === cameraId)?.name ?? 'Unregistered camera';

  const handleRulesChange = async (role: AccessRole, nextRules: ActionRule[]) => {
    setBusyId(role.id);
    const result = await updateRolePermissions(role.id, nextRules);
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
          Rules here are configuration only. No detector or policy engine reads them yet, so nothing on this page
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
          {roles.data.map((role) => (
            // The key doubles as a stable test hook: role names are editable,
            // keys are not.
            <Card key={role.id} data-role-key={role.key}>
              <div className={styles.cardTop}>
                <div>
                  <div className={styles.cardTitleRow}>
                    <span className={styles.cardTitle}>{role.name}</span>
                    <span className={styles.mono}>{role.key}</span>
                    <Badge tone={role.active ? 'success' : 'neutral'}>{role.active ? 'Active' : 'Deactivated'}</Badge>
                  </div>
                  {role.description ? <p className={styles.cardDescription}>{role.description}</p> : null}
                </div>

                {canEdit ? (
                  <div className={styles.rowActions}>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(role)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busyId === role.id} onClick={() => void handleToggleActive(role)}>
                      {role.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busyId === role.id} onClick={() => void handleDelete(role)}>
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className={styles.permissions}>
                <p className={styles.permissionsHeading}>Action rules</p>
                {catalog.status === 'error' ? (
                  <p className={styles.emptyPermission}>
                    The action catalog could not be loaded, so rules cannot be shown or changed.
                  </p>
                ) : (
                  <ActionRulesEditor
                    catalog={catalog.data}
                    zones={zones}
                    rules={role.permissions.actions}
                    canEdit={canEdit}
                    busy={busyId === role.id}
                    cameraName={cameraName}
                    onChange={(nextRules) => void handleRulesChange(role, nextRules)}
                  />
                )}
              </div>
            </Card>
          ))}
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
