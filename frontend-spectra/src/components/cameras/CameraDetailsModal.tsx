import { MapPin, Radio } from 'lucide-react';
import type { Camera, LogEntry } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { CameraVisual } from './CameraVisual';
import { RelativeTime } from '../ui/RelativeTime';
import { formatDate } from '../../lib/format';
import styles from './CameraDetailsModal.module.css';

interface CameraDetailsModalProps {
  camera: Camera | null;
  logs: LogEntry[];
  onClose: () => void;
  onRemove: (id: string) => void;
}

const STATUS_LABEL: Record<Camera['status'], string> = {
  live: 'Live',
  offline: 'Offline',
  idle: 'Idle',
};

export function CameraDetailsModal({ camera, logs, onClose, onRemove }: CameraDetailsModalProps) {
  if (!camera) return null;

  const relatedLogs = logs.filter((log) => log.details.includes(camera.name)).slice(0, 4);

  return (
    <Modal open={Boolean(camera)} onClose={onClose} title={camera.name} description={camera.location} size="md">
      <div className={styles.wrapper}>
        <CameraVisual paletteIndex={camera.paletteIndex} status={camera.status} />

        <dl className={styles.detailGrid}>
          <div>
            <dt>Status</dt>
            <dd>
              <Badge tone={camera.status === 'live' ? 'success' : camera.status === 'offline' ? 'danger' : 'neutral'} dot>
                {STATUS_LABEL[camera.status]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Zone</dt>
            <dd>{camera.zone}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd className={styles.withIcon}>
              <MapPin size={13} aria-hidden="true" /> {camera.location}
            </dd>
          </div>
          <div>
            <dt>Added</dt>
            <dd>{formatDate(camera.addedAt)}</dd>
          </div>
          <div>
            <dt>Last activity</dt>
            <dd>{camera.lastActivity}</dd>
          </div>
          <div>
            <dt>Camera ID</dt>
            <dd className={styles.mono}>{camera.id}</dd>
          </div>
        </dl>

        <div className={styles.related}>
          <h3 className={styles.relatedTitle}>
            <Radio size={14} aria-hidden="true" /> Related activity
          </h3>
          {relatedLogs.length === 0 ? (
            <p className={styles.emptyRelated}>No recent log entries mention this camera.</p>
          ) : (
            <ul className={styles.relatedList}>
              {relatedLogs.map((log) => (
                <li key={log.id} className={styles.relatedItem}>
                  <span>{log.details}</span>
                  <RelativeTime iso={log.timestamp} className={styles.relatedTime} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.footerActions}>
          <Button variant="danger" size="sm" onClick={() => onRemove(camera.id)}>
            Remove camera
          </Button>
        </div>
      </div>
    </Modal>
  );
}
