import type { LogEntry } from '../../lib/types';
import { Modal } from '../ui/Modal';
import { Badge, type BadgeTone } from '../ui/Badge';
import { formatDateTime } from '../../lib/format';
import styles from './LogDetailsDrawer.module.css';

const TONE_BY_SEVERITY: Record<LogEntry['severity'], BadgeTone> = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

export function LogDetailsDrawer({ log, onClose }: { log: LogEntry | null; onClose: () => void }) {
  if (!log) return null;

  return (
    <Modal open={Boolean(log)} onClose={onClose} title={`Log #${log.id}`} variant="drawer">
      <div className={styles.wrapper}>
        <Badge tone={TONE_BY_SEVERITY[log.severity]}>{log.severity}</Badge>

        <dl className={styles.grid}>
          <div>
            <dt>Action</dt>
            <dd>{log.action}</dd>
          </div>
          <div>
            <dt>User / Source</dt>
            <dd>{log.user}</dd>
          </div>
          <div>
            <dt>Date &amp; time</dt>
            <dd>{formatDateTime(log.timestamp)}</dd>
          </div>
          <div>
            <dt>Log ID</dt>
            <dd className={styles.mono}>{log.id}</dd>
          </div>
        </dl>

        <div className={styles.details}>
          <h3 className={styles.detailsTitle}>Details</h3>
          <p>{log.details}</p>
        </div>
      </div>
    </Modal>
  );
}
