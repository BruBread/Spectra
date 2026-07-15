'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { CameraRecord } from '../../lib/cameras/types';
import { CAMERA_SOURCE_LABELS } from '../../lib/cameras/types';
import { Card, CardHeader } from '../ui/Card';
import { Select } from '../ui/Select';
import { CameraTile } from '../cameras/CameraTile';
import { EmptyState } from '../ui/EmptyState';
import styles from './CameraPreviewPanel.module.css';

export function CameraPreviewPanel({ cameras }: { cameras: CameraRecord[] }) {
  const [selectedId, setSelectedId] = useState(cameras[0]?.id);
  const camera = cameras.find((cam) => cam.id === selectedId) ?? cameras[0];

  return (
    <Card>
      <CardHeader
        title="Camera Preview"
        subtitle="Live view of a selected camera"
        action={
          cameras.length > 0 ? (
            <Select
              label="Select camera"
              hideLabel
              value={camera?.id}
              onChange={(event) => setSelectedId(event.target.value)}
              className={styles.select}
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.name}
                </option>
              ))}
            </Select>
          ) : null
        }
      />
      {!camera ? (
        <EmptyState title="No cameras to preview" description="Add a camera from the Cameras page to see it here." />
      ) : (
        <div className={styles.body}>
          <CameraTile camera={camera} />
          <div className={styles.info}>
            <div>
              <p className={styles.name}>{camera.name}</p>
              <p className={styles.location}>
                <MapPin size={12} aria-hidden="true" /> {camera.location || CAMERA_SOURCE_LABELS[camera.sourceType]}
                {camera.zone ? ` · ${camera.zone}` : ''}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
