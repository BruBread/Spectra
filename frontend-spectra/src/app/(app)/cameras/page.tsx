'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAppData } from '../../../context/AppDataContext';
import { useToast } from '../../../context/ToastContext';
import { CameraCard } from '../../../components/cameras/CameraCard';
import { CameraDetailsModal } from '../../../components/cameras/CameraDetailsModal';
import { AddCameraModal } from '../../../components/cameras/AddCameraModal';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import type { Camera } from '../../../lib/types';
import styles from './cameras.module.css';

export default function CamerasPage() {
  const { cameras, logs, addCamera, removeCamera } = useAppData();
  const { showToast } = useToast();
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const handleRemove = (id: string) => {
    const camera = cameras.find((cam) => cam.id === id);
    removeCamera(id);
    setSelectedCamera(null);
    showToast(`${camera?.name ?? 'Camera'} removed`, 'info');
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Cameras</h2>
          <p className={styles.subtitle}>Monitor and manage all connected cameras.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} aria-hidden="true" /> Add Camera
        </Button>
      </div>

      {cameras.length === 0 ? (
        <EmptyState title="No cameras yet" description="Add your first camera to start monitoring." />
      ) : (
        <div className={styles.grid}>
          {cameras.map((camera) => (
            <CameraCard
              key={camera.id}
              camera={camera}
              onView={() => setSelectedCamera(camera)}
              onRemove={() => handleRemove(camera.id)}
            />
          ))}
        </div>
      )}

      <CameraDetailsModal
        camera={selectedCamera}
        logs={logs}
        onClose={() => setSelectedCamera(null)}
        onRemove={handleRemove}
      />

      <AddCameraModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={(input) => {
          addCamera(input);
          showToast(`${input.name} camera added`, 'success');
        }}
      />
    </div>
  );
}
