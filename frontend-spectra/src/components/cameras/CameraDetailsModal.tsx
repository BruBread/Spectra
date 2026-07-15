import { ExternalLink, MapPin } from 'lucide-react';
import type { CameraRecord } from '../../lib/cameras/types';
import { CAMERA_SOURCE_LABELS, supportsDetection } from '../../lib/cameras/types';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ButtonLink } from '../ui/ButtonLink';
import { Switch } from '../ui/Switch';
import { CameraTile } from './CameraTile';
import { formatDate } from '../../lib/format';
import styles from './CameraDetailsModal.module.css';

interface CameraDetailsModalProps {
  camera: CameraRecord | null;
  onClose: () => void;
  onRemove: (id: string) => void;
  onToggleDetection: (id: string, enabled: boolean) => void;
}

export function CameraDetailsModal({ camera, onClose, onRemove, onToggleDetection }: CameraDetailsModalProps) {
  if (!camera) return null;
  const detectionCapable = supportsDetection(camera.sourceType);

  return (
    <Modal open={Boolean(camera)} onClose={onClose} title={camera.name} description={camera.location || undefined} size="md">
      <div className={styles.wrapper}>
        <CameraTile camera={camera} />

        <dl className={styles.detailGrid}>
          <div>
            <dt>Source</dt>
            <dd>{CAMERA_SOURCE_LABELS[camera.sourceType]}</dd>
          </div>
          <div>
            <dt>Zone</dt>
            <dd>{camera.zone || '—'}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd className={styles.withIcon}>
              <MapPin size={13} aria-hidden="true" /> {camera.location || '—'}
            </dd>
          </div>
          <div>
            <dt>Added</dt>
            <dd>{formatDate(camera.createdAt)}</dd>
          </div>
          {camera.sourceType === 'local-device' ? (
            <div>
              <dt>Device</dt>
              <dd>{camera.preferredDeviceLabel || 'Default camera (not pinned)'}</dd>
            </div>
          ) : (
            <div>
              <dt>Stream URL</dt>
              <dd className={styles.mono}>{camera.streamUrl}</dd>
            </div>
          )}
          <div>
            <dt>Camera ID</dt>
            <dd className={styles.mono}>{camera.id}</dd>
          </div>
        </dl>

        {detectionCapable ? (
          <div className={styles.detectionRow}>
            <Switch
              label="AI Detection"
              description="Runs the same detection pipeline as Live Monitor, scoped to this camera."
              checked={camera.detectionEnabled}
              onChange={(checked) => onToggleDetection(camera.id, checked)}
            />
          </div>
        ) : (
          <p className={styles.noDetectionNote}>
            AI detection isn&rsquo;t available for MJPEG streams yet — this camera shows a live preview only.
          </p>
        )}

        <div className={styles.footerActions}>
          <Button variant="danger" size="sm" onClick={() => onRemove(camera.id)}>
            Remove camera
          </Button>
          {detectionCapable && camera.detectionEnabled ? (
            <ButtonLink href={`/monitor?camera=${camera.id}`} variant="primary" size="sm">
              <ExternalLink size={14} aria-hidden="true" /> Open in Live Monitor
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
