'use client';

import { useState } from 'react';
import type { LoadState } from '../../lib/accessControl/loadState';
import type { LoraDevice } from '../../lib/accessControl/types';
import { formatDateTime } from '../../lib/format';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import styles from './accessControl.module.css';

const MANUAL = '__manual__';
const NONE = '';

interface LoraDevicePickerProps {
  devices: LoadState<LoraDevice[]>;
  /** The device currently assigned to the person being edited, if any. */
  value: string | null;
  /** Lets this person keep their own device without it reading as "taken". */
  currentPersonId?: string;
  disabled?: boolean;
  onChange: (deviceId: string | null) => void;
}

function describe(device: LoraDevice): string {
  if (device.source === 'manual') return 'registered manually — no uplinks received yet';
  const seen = device.lastSeenAt ? `last seen ${formatDateTime(device.lastSeenAt)}` : 'no uplink timestamp';
  return `${seen} · ${device.readingCount} reading${device.readingCount === 1 ? '' : 's'}`;
}

/**
 * Picks a LoRa device from the ones the backend actually knows about.
 *
 * The list is never invented: it is the union of devices that have sent real
 * uplinks and devices already assigned to somebody. Manual entry exists for
 * hardware that has not reported yet — assigning an id to a person is what
 * registers it, which is the only registration flow the backend has.
 */
export function LoraDevicePicker({ devices, value, currentPersonId, disabled, onChange }: LoraDevicePickerProps) {
  const [manual, setManual] = useState(false);

  const known = devices.data.some((device) => device.deviceId === value);
  const takenBySomeoneElse = (device: LoraDevice) =>
    device.assignedTo !== null && device.assignedTo.personId !== currentPersonId;

  const selectValue = manual ? MANUAL : value ?? NONE;

  return (
    <div>
      <Select
        label="LoRa device"
        value={selectValue}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (next === MANUAL) {
            setManual(true);
            onChange(null);
            return;
          }
          setManual(false);
          onChange(next === NONE ? null : next);
        }}
      >
        <option value={NONE}>None</option>
        {/* While the list loads — or if it failed — the person's real device
            still has to be selectable, or the form would silently offer to
            save a cleared credential. */}
        {value !== null && !known ? <option value={value}>{value}</option> : null}
        {devices.data.map((device) => (
          <option key={device.deviceId} value={device.deviceId} disabled={takenBySomeoneElse(device)}>
            {device.deviceId}
            {takenBySomeoneElse(device)
              ? ` — assigned to ${device.assignedTo?.personName}`
              : ` — ${describe(device)}`}
          </option>
        ))}
        <option value={MANUAL}>Enter a device ID manually…</option>
      </Select>

      {manual ? (
        <Input
          label="LoRa device ID"
          placeholder="e.g. wristband-014"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.trim() || null)}
        />
      ) : null}

      <p className={styles.fieldHint}>
        {devices.status === 'loading'
          ? 'Loading known devices…'
          : devices.status === 'error'
            ? `Device list unavailable: ${devices.error}. You can still enter an ID manually.`
            : devices.data.length === 0
              ? 'No LoRa devices are known yet. A device appears here once the backend receives an uplink from it, or once an ID is entered manually.'
              : 'Devices with recorded uplinks are listed first. Enter an ID manually only for hardware that has not reported yet.'}
      </p>
    </div>
  );
}
