'use client';

import { useState } from 'react';
import type { CameraRecord } from '../../lib/cameras/types';
import type { RestrictedZone, ZoneRect } from '../../lib/accessControl/types';
import { createZone, updateZone } from '../../lib/api/accessControl';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { ZoneDrawer } from '../monitor/ZoneDrawer';
import styles from './accessControl.module.css';

interface ZoneFormModalProps {
  /** null creates; a zone edits. */
  zone: RestrictedZone | null;
  cameras: CameraRecord[];
  onClose: () => void;
  onSaved: (zone: RestrictedZone) => void;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

export function ZoneFormModal({ zone, cameras, onClose, onSaved }: ZoneFormModalProps) {
  const [name, setName] = useState(zone?.name ?? '');
  const [cameraId, setCameraId] = useState(zone?.cameraId ?? cameras[0]?.id ?? '');
  const [rect, setRect] = useState<ZoneRect | null>(zone?.rect ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!cameraId) {
      setError('A camera is required — a zone is a region of one camera’s frame.');
      return;
    }
    if (!rect) {
      setError('Draw a rectangle: a restricted zone has no meaning without one.');
      return;
    }

    setSaving(true);
    setError(null);
    const result = zone
      ? await updateZone(zone.id, { name: name.trim(), rect })
      : await createZone({ name: name.trim(), cameraId, rect });
    setSaving(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? 'Could not save this zone.');
      return;
    }
    onSaved(result.data);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={zone ? `Edit ${zone.name}` : 'Add restricted zone'}
      size="md"
      footer={
        <div className={styles.footerRow}>
          <div className={styles.footerRight}>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={saving}>
              {saving ? 'Saving…' : zone ? 'Save changes' : 'Add zone'}
            </Button>
          </div>
        </div>
      }
    >
      <div className={styles.form}>
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}

        <div className={styles.formRow}>
          <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
          <div>
            <Select
              label="Camera"
              value={cameraId}
              // Fixed after creation: the rectangle is relative to this
              // camera's frame and would land somewhere arbitrary on another.
              disabled={zone !== null}
              onChange={(event) => setCameraId(event.target.value)}
            >
              <option value="">Select a camera…</option>
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.name}
                </option>
              ))}
            </Select>
            {zone ? (
              <p className={styles.fieldHint}>
                A zone cannot move between cameras — its rectangle only means something on this camera’s frame. Create a
                zone on the other camera instead.
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <p className={styles.label}>Zone rectangle</p>
          {/* No live frame here: this page does not run the vision pipeline,
              so the grid is shown rather than a stale or fabricated preview.
              Coordinates are relative to the frame, so they hold at any
              resolution. */}
          <ZoneDrawer
            zone={rect}
            backgroundImage={null}
            hint="Click and drag to draw the zone. A restricted zone must have a rectangle."
            onChange={setRect}
          />
          {rect ? (
            <p className={styles.rectSummary}>
              <span>x {percent(rect.x)}</span>
              <span>y {percent(rect.y)}</span>
              <span>width {percent(rect.width)}</span>
              <span>height {percent(rect.height)}</span>
            </p>
          ) : (
            <p className={styles.fieldHint}>No rectangle drawn yet.</p>
          )}
          <p className={styles.fieldHint}>
            The camera’s live view isn’t rendered here — open the camera in Live Monitor to see the framing this
            rectangle maps onto.
          </p>
        </div>
      </div>
    </Modal>
  );
}
