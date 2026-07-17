'use client';

import Image from 'next/image';
import { ExternalLink, ShieldQuestion } from 'lucide-react';
import type { CameraRecord } from '../../lib/cameras/types';
import { ALERT_STATUSES, ALERT_STATUS_LABELS, type AlertStatus, type VisionAlert } from '../../lib/vision/types';
import { SEVERITY_TONE, STATUS_TONE, alertTitle, confidencePercent, detectionDescription, monitorHref, resolveCamera } from '../../lib/notifications/present';
import { formatDateTime } from '../../lib/format';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ButtonLink } from '../ui/ButtonLink';
import { Select } from '../ui/Select';
import styles from './NotificationDetailModal.module.css';

interface NotificationDetailModalProps {
  alert: VisionAlert | null;
  cameras: CameraRecord[];
  busy: boolean;
  onClose: () => void;
  onStatusChange: (status: AlertStatus) => void;
}

export function NotificationDetailModal({ alert, cameras, busy, onClose, onStatusChange }: NotificationDetailModalProps) {
  if (!alert) return null;

  const camera = resolveCamera(alert, cameras);

  return (
    <Modal
      open={alert !== null}
      onClose={onClose}
      title={alertTitle(alert)}
      description={alert.message}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {camera.linkable ? (
            <ButtonLink href={monitorHref(alert)}>
              <ExternalLink size={15} aria-hidden="true" /> Open in Live Monitor
            </ButtonLink>
          ) : null}
        </>
      }
    >
      <div className={styles.badges}>
        <Badge tone={SEVERITY_TONE[alert.severity]}>{alert.severity}</Badge>
        <Badge tone={STATUS_TONE[alert.status]}>{ALERT_STATUS_LABELS[alert.status]}</Badge>
        {!alert.read ? <Badge tone="info">Unread</Badge> : null}
      </div>

      {alert.snapshot ? (
        <div className={styles.snapshotWrap}>
          <Image
            src={alert.snapshot}
            alt={`Evidence frame captured when ${alertTitle(alert)} was detected`}
            className={styles.snapshot}
            width={480}
            height={360}
            unoptimized
          />
        </div>
      ) : null}

      <dl className={styles.grid}>
        <div>
          <dt>Camera</dt>
          <dd>{camera.label}</dd>
        </div>
        {alert.zoneName ? (
          <div>
            <dt>Zone</dt>
            <dd>{alert.zoneName}</dd>
          </div>
        ) : null}
        <div>
          <dt>Confidence</dt>
          <dd>{confidencePercent(alert)}</dd>
        </div>
        <div>
          <dt>First recorded</dt>
          <dd>{formatDateTime(alert.createdAt)}</dd>
        </div>
        {alert.occurrences > 1 ? (
          <>
            <div>
              <dt>Occurrences</dt>
              <dd>{alert.occurrences} (grouped)</dd>
            </div>
            <div>
              <dt>Last occurred</dt>
              <dd>{formatDateTime(alert.lastOccurredAt)}</dd>
            </div>
          </>
        ) : null}
        {alert.statusChangedAt ? (
          <div>
            <dt>Status changed</dt>
            <dd>{formatDateTime(alert.statusChangedAt)}</dd>
          </div>
        ) : null}
      </dl>

      <div className={styles.statusRow}>
        <Select
          label="Review status"
          value={alert.status}
          disabled={busy}
          onChange={(event) => onStatusChange(event.target.value as AlertStatus)}
        >
          {ALERT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ALERT_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      <p className={styles.disclaimer}>
        <ShieldQuestion size={14} aria-hidden="true" />
        <span>
          AI-assisted detection — a signal to review, not a confirmed incident. {detectionDescription(alert.type)}
        </span>
      </p>
    </Modal>
  );
}
