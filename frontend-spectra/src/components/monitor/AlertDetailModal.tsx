import type { VisionAlert } from '../../lib/vision/types';
import { ALL_DETECTION_LABELS } from '../../lib/vision/types';
import { detectionDescription } from '../../lib/notifications/present';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { formatDateTime } from '../../lib/format';
import styles from './AlertDetailModal.module.css';

interface AlertDetailModalProps {
  alert: VisionAlert | null;
  onClose: () => void;
}

export function AlertDetailModal({ alert, onClose }: AlertDetailModalProps) {
  if (!alert) return null;

  return (
    <Modal open={Boolean(alert)} onClose={onClose} title={ALL_DETECTION_LABELS[alert.type]} size="md">
      <div className={styles.wrapper}>
        {alert.snapshot ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL snapshot
          <img src={alert.snapshot} alt="Alert snapshot" className={styles.snapshot} />
        ) : (
          <div className={styles.noSnapshot}>No snapshot captured for this alert.</div>
        )}

        <dl className={styles.grid}>
          <div>
            <dt>Camera</dt>
            <dd>{alert.cameraId}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>
              <Badge tone={alert.confidence >= 0.75 ? 'danger' : alert.confidence >= 0.5 ? 'warning' : 'neutral'}>
                {Math.round(alert.confidence * 100)}%
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Timestamp</dt>
            <dd>{formatDateTime(alert.createdAt)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{alert.acknowledged ? 'Acknowledged' : 'Needs review'}</dd>
          </div>
        </dl>

        <p className={styles.message}>{alert.message}</p>
        <p className={styles.disclaimer}>{detectionDescription(alert.type)}</p>
      </div>
    </Modal>
  );
}
