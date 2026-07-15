import { Battery, DoorOpen, Radar, ServerCrash, Settings2, Video } from 'lucide-react';
import type { NotificationItem, NotificationType } from '../../lib/types';
import { Card, CardHeader } from '../ui/Card';
import { RelativeTime } from '../ui/RelativeTime';
import { EmptyState } from '../ui/EmptyState';
import { cn } from '../../lib/format';
import styles from './NotificationsPreview.module.css';

const ICONS: Record<NotificationType, typeof Radar> = {
  motion: Radar,
  door: DoorOpen,
  unusual: ServerCrash,
  system: Settings2,
  offline: Video,
  battery: Battery,
};

export function NotificationsPreview({ notifications }: { notifications: NotificationItem[] }) {
  const preview = notifications.slice(0, 5);

  return (
    <Card>
      <CardHeader title="Security Alerts" subtitle="Motion, access and device events" />
      {preview.length === 0 ? (
        <EmptyState title="No alerts" description="Nothing to report right now." />
      ) : (
        <ul className={styles.list}>
          {preview.map((notification) => {
            const Icon = ICONS[notification.type];
            return (
              <li key={notification.id} className={styles.item}>
                <span className={cn(styles.icon, styles[notification.severity])}>
                  <Icon size={16} aria-hidden="true" />
                </span>
                <div className={styles.content}>
                  <p className={styles.title}>{notification.title}</p>
                  <p className={styles.message}>{notification.message}</p>
                </div>
                <RelativeTime iso={notification.timestamp} className={styles.time} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
