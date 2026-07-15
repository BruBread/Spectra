'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useCameraSources } from '../../../context/CameraSourcesContext';
import { useToast } from '../../../context/ToastContext';
import { CameraCard } from '../../../components/cameras/CameraCard';
import { CameraDetailsModal } from '../../../components/cameras/CameraDetailsModal';
import { AddCameraModal } from '../../../components/cameras/AddCameraModal';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import type { CameraRecord } from '../../../lib/cameras/types';
import styles from './cameras.module.css';

export default function CamerasPage() {
  const { cameras, loading, backendConnected, addCamera, updateCamera, removeCamera } = useCameraSources();
  const { showToast } = useToast();
  const [selectedCamera, setSelectedCamera] = useState<CameraRecord | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const handleRemove = (id: string) => {
    const camera = cameras.find((cam) => cam.id === id);
    void removeCamera(id);
    setSelectedCamera(null);
    showToast(`${camera?.name ?? 'Camera'} removed`, 'info');
  };

  const handleToggleDetection = (id: string, enabled: boolean) => {
    void updateCamera(id, { detectionEnabled: enabled });
    setSelectedCamera((current) => (current && current.id === id ? { ...current, detectionEnabled: enabled } : current));
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Cameras</h2>
          <p className={styles.subtitle}>Connect and monitor real camera sources — local devices or stream URLs.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} aria-hidden="true" /> Add Camera
        </Button>
      </div>

      {!backendConnected ? (
        <p className={styles.banner}>
          Backend not reachable — camera changes can&rsquo;t be saved right now. Check that backend-spectra is
          running.
        </p>
      ) : null}

      {!loading && cameras.length === 0 ? (
        <EmptyState
          title="No cameras yet"
          description="Add a local device or a stream URL to start monitoring — see the guide for what's supported."
        />
      ) : (
        <div className={styles.grid}>
          {cameras.map((camera) => (
            <CameraCard
              key={camera.id}
              camera={camera}
              onView={() => setSelectedCamera(camera)}
              onRemove={() => handleRemove(camera.id)}
              onToggleDetection={(enabled) => handleToggleDetection(camera.id, enabled)}
            />
          ))}
        </div>
      )}

      <CameraDetailsModal
        camera={selectedCamera}
        onClose={() => setSelectedCamera(null)}
        onRemove={handleRemove}
        onToggleDetection={handleToggleDetection}
      />

      <AddCameraModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (input) => {
          const created = await addCamera(input);
          if (created) showToast(`${input.name} camera added`, 'success');
        }}
      />
    </div>
  );
}
