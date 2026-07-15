'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { Camera } from '../../lib/types';
import { Card, CardHeader } from '../ui/Card';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { CameraVisual } from '../cameras/CameraVisual';
import { EmptyState } from '../ui/EmptyState';
import styles from './CameraPreviewPanel.module.css';

export function CameraPreviewPanel({ cameras }: { cameras: Camera[] }) {
  const [selectedId, setSelectedId] = useState(cameras[0]?.id);
  const camera = cameras.find((cam) => cam.id === selectedId) ?? cameras[0];

  return (
    <Card>
      <CardHeader
        title="Camera Preview"
        subtitle="Live status of a selected feed"
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
        <EmptyState title="No cameras to preview" />
      ) : (
        <div className={styles.body}>
          <CameraVisual paletteIndex={camera.paletteIndex} status={camera.status} />
          <div className={styles.info}>
            <div>
              <p className={styles.name}>{camera.name}</p>
              <p className={styles.location}>
                <MapPin size={12} aria-hidden="true" /> {camera.location} · {camera.zone}
              </p>
            </div>
            <Badge tone={camera.status === 'live' ? 'success' : camera.status === 'offline' ? 'danger' : 'neutral'} dot>
              {camera.status === 'live' ? 'Live' : camera.status === 'offline' ? 'Offline' : 'Idle'}
            </Badge>
          </div>
          <p className={styles.lastActivity}>Last activity: {camera.lastActivity}</p>
        </div>
      )}
    </Card>
  );
}
