import { Check, Wifi, WifiOff } from 'lucide-react';
import type { VisionAlert } from '../../lib/vision/types';
import { ALL_DETECTION_LABELS } from '../../lib/vision/types';
import { Badge, type BadgeTone } from '../ui/Badge';
import { RelativeTime } from '../ui/RelativeTime';
import styles from './AlertCard.module.css';

function toneForConfidence(confidence: number): BadgeTone {
  if (confidence >= 0.75) return 'danger';
  if (confidence >= 0.5) return 'warning';
  return 'neutral';
}

interface AlertCardProps {
  alert: VisionAlert;
  persisted: boolean;
  onAcknowledge: (id: string) => void;
  onView: (alert: VisionAlert) => void;
}

export function AlertCard({ alert, persisted, onAcknowledge, onView }: AlertCardProps) {
  return (
    <li className={styles.card} data-acknowledged={alert.acknowledged}>
      <button type="button" className={styles.thumbButton} onClick={() => onView(alert)} aria-label="View snapshot">
        {alert.snapshot ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL snapshot, not an optimizable remote asset
          <img src={alert.snapshot} alt="" className={styles.thumb} />
        ) : (
          <div className={styles.thumbPlaceholder} aria-hidden="true" />
        )}
      </button>

      <div className={styles.body}>
        <div className={styles.topRow}>
          <span className={styles.title}>{ALL_DETECTION_LABELS[alert.type]}</span>
          <Badge tone={toneForConfidence(alert.confidence)}>{Math.round(alert.confidence * 100)}% confidence</Badge>
        </div>
        <p className={styles.message}>{alert.message}</p>

        <div className={styles.metaRow}>
          <span className={styles.cameraId}>{alert.cameraId}</span>
          <RelativeTime iso={alert.createdAt} className={styles.time} />
          <span className={styles.persistBadge} title={persisted ? 'Saved to backend' : 'Not saved — backend unavailable'}>
            {persisted ? <Wifi size={12} aria-hidden="true" /> : <WifiOff size={12} aria-hidden="true" />}
          </span>
        </div>
      </div>

      {!alert.acknowledged ? (
        <button type="button" className={styles.ackButton} onClick={() => onAcknowledge(alert.id)} aria-label="Acknowledge alert">
          <Check size={14} aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}
