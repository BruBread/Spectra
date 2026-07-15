'use client';

import { useState, type FormEvent } from 'react';
import type { CameraStatus, NewCameraInput } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import styles from './AddCameraModal.module.css';

interface AddCameraModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: NewCameraInput) => void;
}

const ZONES = ['Zone A', 'Zone B', 'Zone C', 'Zone D'];

export function AddCameraModal({ open, onClose, onSubmit }: AddCameraModalProps) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [zone, setZone] = useState(ZONES[0]);
  const [status, setStatus] = useState<CameraStatus>('live');
  const [errors, setErrors] = useState<{ name?: string; location?: string }>({});

  const reset = () => {
    setName('');
    setLocation('');
    setZone(ZONES[0]);
    setStatus('live');
    setErrors({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: { name?: string; location?: string } = {};
    if (!name.trim()) nextErrors.name = 'Camera name is required.';
    if (!location.trim()) nextErrors.location = 'Location is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({ name: name.trim(), location: location.trim(), zone, status });
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Camera" description="Register a new camera feed for monitoring.">
      <form className={styles.form} onSubmit={handleSubmit}>
        <Input
          label="Camera name"
          placeholder="e.g. West Stairwell"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
        />
        <Input
          label="Location"
          placeholder="e.g. Engineering Building, 3rd Floor"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          error={errors.location}
        />
        <div className={styles.fieldRow}>
          <Select label="Zone" value={zone} onChange={(event) => setZone(event.target.value)}>
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
          <Select label="Initial status" value={status} onChange={(event) => setStatus(event.target.value as CameraStatus)}>
            <option value="live">Live</option>
            <option value="offline">Offline</option>
            <option value="idle">Idle</option>
          </Select>
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit">Add Camera</Button>
        </div>
      </form>
    </Modal>
  );
}
