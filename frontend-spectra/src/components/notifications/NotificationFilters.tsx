'use client';

import type { CameraRecord } from '../../lib/cameras/types';
import {
  ALERT_SEVERITIES,
  ALERT_SEVERITY_LABELS,
  ALERT_STATUSES,
  ALERT_STATUS_LABELS,
  DETECTION_LABELS,
  DETECTION_TYPES,
  type AlertSeverity,
  type AlertStatus,
  type DetectionType,
} from '../../lib/vision/types';
import { DEFAULT_CAMERA_ID } from '../../lib/vision/defaults';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import styles from './NotificationFilters.module.css';

export interface NotificationFilterState {
  severity: AlertSeverity | 'all';
  type: DetectionType | 'all';
  status: AlertStatus | 'all';
  cameraId: string | 'all';
  zoneName: string | 'all';
  from: string;
  to: string;
}

export const EMPTY_FILTERS: NotificationFilterState = {
  severity: 'all',
  type: 'all',
  status: 'all',
  cameraId: 'all',
  zoneName: 'all',
  from: '',
  to: '',
};

export function hasActiveFilters(filters: NotificationFilterState): boolean {
  return (
    filters.severity !== 'all' ||
    filters.type !== 'all' ||
    filters.status !== 'all' ||
    filters.cameraId !== 'all' ||
    filters.zoneName !== 'all' ||
    filters.from !== '' ||
    filters.to !== ''
  );
}

interface NotificationFiltersProps {
  filters: NotificationFilterState;
  cameras: CameraRecord[];
  /** Zones actually present on recorded alerts — not a guess from camera config. */
  zoneOptions: string[];
  onChange: (next: NotificationFilterState) => void;
  onReset: () => void;
}

export function NotificationFilters({ filters, cameras, zoneOptions, onChange, onReset }: NotificationFiltersProps) {
  const set = <K extends keyof NotificationFilterState>(key: K, value: NotificationFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  return (
    <div className={styles.filters}>
      <Select label="Severity" value={filters.severity} onChange={(e) => set('severity', e.target.value as AlertSeverity | 'all')}>
        <option value="all">All severities</option>
        {ALERT_SEVERITIES.map((severity) => (
          <option key={severity} value={severity}>
            {ALERT_SEVERITY_LABELS[severity]}
          </option>
        ))}
      </Select>

      <Select label="Type" value={filters.type} onChange={(e) => set('type', e.target.value as DetectionType | 'all')}>
        <option value="all">All types</option>
        {DETECTION_TYPES.map((type) => (
          <option key={type} value={type}>
            {DETECTION_LABELS[type]}
          </option>
        ))}
      </Select>

      <Select label="Status" value={filters.status} onChange={(e) => set('status', e.target.value as AlertStatus | 'all')}>
        <option value="all">All statuses</option>
        {ALERT_STATUSES.map((status) => (
          <option key={status} value={status}>
            {ALERT_STATUS_LABELS[status]}
          </option>
        ))}
      </Select>

      <Select label="Camera" value={filters.cameraId} onChange={(e) => set('cameraId', e.target.value)}>
        <option value="all">All cameras</option>
        <option value={DEFAULT_CAMERA_ID}>Browser webcam (quick test)</option>
        {cameras.map((camera) => (
          <option key={camera.id} value={camera.id}>
            {camera.name}
          </option>
        ))}
      </Select>

      {/* Zone options come from zones actually recorded on alerts. Detectors
          don't set zoneName yet, so this is normally empty — and an enabled
          filter that always returns nothing would be worse than a disabled one. */}
      <Select
        label={zoneOptions.length === 0 ? 'Zone (none recorded)' : 'Zone'}
        value={filters.zoneName}
        onChange={(e) => set('zoneName', e.target.value)}
        disabled={zoneOptions.length === 0}
      >
        <option value="all">All zones</option>
        {zoneOptions.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </Select>

      <Input label="From" type="date" value={filters.from} onChange={(e) => set('from', e.target.value)} />
      <Input label="To" type="date" value={filters.to} onChange={(e) => set('to', e.target.value)} />

      <div className={styles.resetSlot}>
        <Button variant="secondary" size="sm" onClick={onReset} disabled={!hasActiveFilters(filters)}>
          Clear filters
        </Button>
      </div>
    </div>
  );
}
