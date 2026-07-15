import type { LogEntry } from '../../lib/types';
import { Card, CardHeader } from '../ui/Card';
import { Badge, type BadgeTone } from '../ui/Badge';
import { RelativeTime } from '../ui/RelativeTime';
import { ButtonLink } from '../ui/ButtonLink';
import { EmptyState } from '../ui/EmptyState';
import styles from './RecentLogsPanel.module.css';

const TONE_BY_SEVERITY: Record<LogEntry['severity'], BadgeTone> = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

export function RecentLogsPanel({ logs }: { logs: LogEntry[] }) {
  return (
    <Card>
      <CardHeader title="Recent Logs" subtitle="Latest activity across the platform" />
      {logs.length === 0 ? (
        <EmptyState title="No recent logs" />
      ) : (
        <ul className={styles.list}>
          {logs.slice(0, 6).map((log) => (
            <li key={log.id} className={styles.item}>
              <span className={styles.dot} data-severity={log.severity} aria-hidden="true" />
              <div className={styles.content}>
                <p className={styles.action}>
                  {log.action} <span className={styles.byUser}>· {log.user}</span>
                </p>
                <p className={styles.details}>{log.details}</p>
              </div>
              <div className={styles.meta}>
                <RelativeTime iso={log.timestamp} className={styles.time} />
                <Badge tone={TONE_BY_SEVERITY[log.severity]}>{log.severity}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ButtonLink href="/logs" variant="secondary" size="sm" className={styles.viewAll}>
        View All Logs
      </ButtonLink>
    </Card>
  );
}
