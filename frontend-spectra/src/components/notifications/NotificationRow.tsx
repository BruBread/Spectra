'use client';

import Link from 'next/link';
import { Camera as CameraIcon, ExternalLink, Layers, MapPin, Repeat2 } from 'lucide-react';
import type { CameraRecord } from '../../lib/cameras/types';
import { ALERT_STATUSES, ALERT_STATUS_LABELS, type AlertStatus, type VisionAlert } from '../../lib/vision/types';
import { SEVERITY_TONE, STATUS_TONE, alertTitle, confidencePercent, monitorHref, resolveCamera } from '../../lib/notifications/present';
import { Badge } from '../ui/Badge';
import { RelativeTime } from '../ui/RelativeTime';
import { Select } from '../ui/Select';
import styles from './NotificationRow.module.css';

interface NotificationRowProps {
  alert: VisionAlert;
  cameras: CameraRecord[];
  busy: boolean;
  onOpen: () => void;
  onMarkRead: () => void;
  onStatusChange: (status: AlertStatus) => void;
}

export function NotificationRow({ alert, cameras, busy, onOpen, onMarkRead, onStatusChange }: NotificationRowProps) {
  const camera = resolveCamera(alert, cameras);

  return (
    <li
      className={styles.row}
      data-severity={alert.severity}
      data-unread={!alert.read}
      data-busy={busy}
    >
      {/* Not a <button>: the row contains its own links and a status select,
          and interactive elements can't nest. */}
      <div
        role="button"
        tabIndex={0}
        className={styles.main}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <span className={styles.severityBar} aria-hidden="true" />

        <div className={styles.body}>
          <div className={styles.titleRow}>
            {!alert.read ? <span className={styles.unreadDot} aria-label="Unread" /> : null}
            <span className={styles.title}>{alertTitle(alert)}</span>
            <Badge tone={SEVERITY_TONE[alert.severity]}>{alert.severity}</Badge>
            <Badge tone={STATUS_TONE[alert.status]}>{ALERT_STATUS_LABELS[alert.status]}</Badge>
            {alert.occurrences > 1 ? (
              <span className={styles.occurrences} title={`Grouped: ${alert.occurrences} occurrences`}>
                <Repeat2 size={12} aria-hidden="true" /> ×{alert.occurrences}
              </span>
            ) : null}
          </div>

          <p className={styles.message}>{alert.message}</p>

          <div className={styles.meta}>
            <span className={styles.metaItem}>
              <CameraIcon size={12} aria-hidden="true" /> {camera.label}
            </span>
            {alert.zoneName ? (
              <span className={styles.metaItem}>
                <MapPin size={12} aria-hidden="true" /> {alert.zoneName}
              </span>
            ) : null}
            <span className={styles.metaItem}>
              <Layers size={12} aria-hidden="true" /> {confidencePercent(alert)} confidence
            </span>
            <RelativeTime iso={alert.createdAt} className={styles.metaItem} />
          </div>
        </div>
      </div>

      <div className={styles.actions} onClick={(event) => event.stopPropagation()}>
        <Select
          aria-label={`Review status for ${alertTitle(alert)}`}
          value={alert.status}
          disabled={busy}
          onChange={(event) => onStatusChange(event.target.value as AlertStatus)}
          className={styles.statusSelect}
        >
          {ALERT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ALERT_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>

        {!alert.read ? (
          <button type="button" className={styles.linkButton} onClick={onMarkRead} disabled={busy}>
            Mark read
          </button>
        ) : null}

        {camera.linkable ? (
          <Link href={monitorHref(alert)} className={styles.monitorLink}>
            <ExternalLink size={12} aria-hidden="true" /> Monitor
          </Link>
        ) : null}
      </div>
    </li>
  );
}
