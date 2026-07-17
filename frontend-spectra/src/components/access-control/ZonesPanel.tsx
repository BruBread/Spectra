'use client';

import { useState } from 'react';
import { Camera, Loader2, MapPin, PlugZap, Plus, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useCameraSources } from '../../context/CameraSourcesContext';
import { useToast } from '../../context/ToastContext';
import type { LoadState } from '../../lib/accessControl/loadState';
import type { AccessRole, RestrictedZone } from '../../lib/accessControl/types';
import { deleteZone, updateZone } from '../../lib/api/accessControl';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { DataTable, type Column } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { Select } from '../ui/Select';
import { ZoneFormModal } from './ZoneFormModal';
import styles from './accessControl.module.css';

interface ZonesPanelProps {
  zones: LoadState<RestrictedZone[]>;
  roles: LoadState<AccessRole[]>;
  canEdit: boolean;
  /** Deleting a zone also pulls it out of every role's permissions. */
  onZonesChanged: () => void;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function ZonesPanel({ zones, roles, canEdit, onZonesChanged }: ZonesPanelProps) {
  const { showToast } = useToast();
  const { cameras } = useCameraSources();
  const [cameraFilter, setCameraFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(true);
  const [editing, setEditing] = useState<RestrictedZone | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cameraName = (cameraId: string) => cameras.find((camera) => camera.id === cameraId)?.name ?? null;

  const visible = zones.data.filter(
    (zone) => (cameraFilter === 'all' || zone.cameraId === cameraFilter) && (showArchived || zone.active),
  );
  const filtersActive = cameraFilter !== 'all' || !showArchived;

  const rolesAllowedIn = (zoneId: string) =>
    roles.data.filter((role) => role.permissions.zones.some((entry) => entry.zoneId === zoneId && entry.allowed));

  const handleToggleActive = async (zone: RestrictedZone) => {
    setBusyId(zone.id);
    const result = await updateZone(zone.id, { active: !zone.active });
    setBusyId(null);

    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Could not update this zone.', 'error');
      return;
    }
    showToast(`${result.data.name} ${result.data.active ? 'restored' : 'archived'}`, 'success');
    onZonesChanged();
  };

  const handleDelete = async (zone: RestrictedZone) => {
    setBusyId(zone.id);
    const result = await deleteZone(zone.id);
    setBusyId(null);

    if (!result.ok) {
      // Refused once a recorded decision names the zone — that is audit
      // history, and the backend says so and points at archiving instead.
      showToast(result.error ?? 'Could not delete this zone.', 'error');
      return;
    }
    showToast(`${zone.name} deleted`, 'success');
    onZonesChanged();
  };

  const columns: Column<RestrictedZone>[] = [
    {
      key: 'name',
      header: 'Zone',
      render: (zone) => (
        <div className={styles.cellStack}>
          <span>{zone.name}</span>
          <span className={styles.cellMuted}>
            x {percent(zone.rect.x)} · y {percent(zone.rect.y)} · {percent(zone.rect.width)} ×{' '}
            {percent(zone.rect.height)} of the frame
          </span>
        </div>
      ),
    },
    {
      key: 'camera',
      header: 'Camera',
      render: (zone) => {
        const name = cameraName(zone.cameraId);
        return name ? (
          <span>{name}</span>
        ) : (
          // The camera record is gone. Inventing a name would hide that the
          // rectangle no longer maps onto anything.
          <span className={styles.cellMuted}>Camera not found</span>
        );
      },
    },
    {
      key: 'roles',
      header: 'Roles allowed',
      render: (zone) => {
        if (roles.status !== 'ok') return <span className={styles.cellMuted}>—</span>;
        const allowed = rolesAllowedIn(zone.id);
        return allowed.length === 0 ? (
          <span className={styles.cellMuted}>None — everyone is denied</span>
        ) : (
          <div className={styles.cellStack}>
            {allowed.map((role) => (
              <span key={role.id}>
                {role.name}
                {role.active ? '' : ' (role deactivated)'}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (zone) => <Badge tone={zone.active ? 'success' : 'neutral'}>{zone.active ? 'Active' : 'Archived'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      render: (zone) =>
        canEdit ? (
          <div className={styles.rowActions}>
            <Button variant="secondary" size="sm" onClick={() => setEditing(zone)}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" disabled={busyId === zone.id} onClick={() => void handleToggleActive(zone)}>
              {zone.active ? 'Archive' : 'Restore'}
            </Button>
            <Button variant="ghost" size="sm" disabled={busyId === zone.id} onClick={() => void handleDelete(zone)}>
              Delete
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.caution}>
        <ShieldAlert size={16} aria-hidden="true" />
        <span>
          Zones are configuration only. No detector reads them yet, so drawing one does not make anything watch that
          area or raise an alert.
        </span>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <Select
            label="Camera"
            className={styles.filterField}
            value={cameraFilter}
            onChange={(event) => setCameraFilter(event.target.value)}
          >
            <option value="all">All cameras</option>
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.name}
              </option>
            ))}
          </Select>
          <Select
            label="Archived"
            className={styles.filterField}
            value={showArchived ? 'show' : 'hide'}
            onChange={(event) => setShowArchived(event.target.value === 'show')}
          >
            <option value="show">Show archived</option>
            <option value="hide">Hide archived</option>
          </Select>
        </div>

        {canEdit ? (
          <div className={styles.toolbarActions}>
            <Button size="sm" onClick={() => setCreating(true)} disabled={cameras.length === 0}>
              <Plus size={14} aria-hidden="true" /> Add zone
            </Button>
          </div>
        ) : null}
      </div>

      <Card padding="sm">
        {zones.status === 'loading' ? (
          <EmptyState icon={<Loader2 size={20} className={styles.spin} aria-hidden="true" />} title="Loading zones…" />
        ) : zones.status === 'error' ? (
          <EmptyState
            icon={<PlugZap size={20} aria-hidden="true" />}
            title="Could not load zones"
            description={zones.error ?? undefined}
            action={
              <Button variant="secondary" size="sm" onClick={onZonesChanged}>
                Try again
              </Button>
            }
          />
        ) : cameras.length === 0 ? (
          <EmptyState
            icon={<Camera size={20} aria-hidden="true" />}
            title="No cameras registered"
            description="A zone is a region of a camera's frame, so a camera has to exist first."
            action={
              <Link href="/cameras">
                <Button variant="secondary" size="sm">
                  Go to Cameras
                </Button>
              </Link>
            }
          />
        ) : visible.length === 0 && filtersActive ? (
          <EmptyState
            icon={<MapPin size={20} aria-hidden="true" />}
            title="No zones match these filters"
            description="Other zones may exist outside this filter set."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCameraFilter('all');
                  setShowArchived(true);
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<MapPin size={20} aria-hidden="true" />}
            title="No restricted zones yet"
            description="Draw a zone on a camera to name an area. Role permissions can then refer to it."
          />
        ) : (
          <DataTable columns={columns} rows={visible} getRowId={(zone) => zone.id} />
        )}
      </Card>

      {creating || editing ? (
        <ZoneFormModal
          zone={editing}
          cameras={cameras}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(zone) => {
            setCreating(false);
            setEditing(null);
            showToast(`${zone.name} saved`, 'success');
            onZonesChanged();
          }}
        />
      ) : null}
    </div>
  );
}
