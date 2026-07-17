'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck, Loader2, PlugZap } from 'lucide-react';
import { useAlertCounts } from '../../context/AlertCountsContext';
import { useCameraSources } from '../../context/CameraSourcesContext';
import { fetchAlerts, markAllAlertsRead } from '../../lib/api/vision';
import type { VisionAlert } from '../../lib/vision/types';
import { SEVERITY_TONE, alertTitle, resolveCamera } from '../../lib/notifications/present';
import { Badge } from '../ui/Badge';
import { RelativeTime } from '../ui/RelativeTime';
import { EmptyState } from '../ui/EmptyState';
import styles from './Topbar.module.css';

/**
 * Contents of the bell dropdown.
 *
 * Mounted only while the menu is open (the Dropdown renders its children
 * lazily), so the recent alerts are fetched on demand instead of polling the
 * full alert list in the background — the badge count alone is polled, and
 * that comes from the much cheaper counts endpoint.
 */
export function TopbarNotifications({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter();
  const { cameras } = useCameraSources();
  const { counts, status: countsStatus, refresh } = useAlertCounts();

  const [alerts, setAlerts] = useState<VisionAlert[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchAlerts({ limit: 6 });
      if (cancelled) return;
      if (result.ok && result.data) {
        setAlerts(result.data);
        setStatus('ok');
      } else {
        setAlerts([]);
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unread = countsStatus === 'ok' ? counts?.unread ?? 0 : null;

  const handleMarkAll = async () => {
    setMarkingAll(true);
    await markAllAlertsRead();
    setMarkingAll(false);
    await refresh();
    const result = await fetchAlerts({ limit: 6 });
    if (result.ok && result.data) setAlerts(result.data);
  };

  const open = (alert: VisionAlert) => {
    onNavigate();
    router.push(`/notifications?alert=${encodeURIComponent(alert.id)}`);
  };

  return (
    <div className={styles.notificationPanel}>
      <div className={styles.notificationHeader}>
        <span>Notifications</span>
        {unread !== null && unread > 0 ? (
          <button type="button" className={styles.markAll} onClick={() => void handleMarkAll()} disabled={markingAll}>
            <CheckCheck size={13} aria-hidden="true" /> {markingAll ? 'Marking…' : 'Mark all as read'}
          </button>
        ) : null}
      </div>

      <div className={styles.notificationList}>
        {status === 'loading' ? (
          <EmptyState icon={<Loader2 size={18} className={styles.spin} aria-hidden="true" />} title="Loading…" />
        ) : status === 'error' ? (
          <EmptyState icon={<PlugZap size={18} aria-hidden="true" />} title="Backend unavailable" description="Couldn't load notifications." />
        ) : alerts.length === 0 ? (
          <EmptyState title="No recorded data yet" description="Detections will appear here once a camera flags something." />
        ) : (
          alerts.map((alert) => (
            <button
              key={alert.id}
              type="button"
              className={styles.notificationItem}
              data-unread={!alert.read}
              onClick={() => open(alert)}
            >
              <span className={styles.notificationTop}>
                <span className={styles.notificationTitle}>{alertTitle(alert)}</span>
                <Badge tone={SEVERITY_TONE[alert.severity]}>{alert.severity}</Badge>
              </span>
              <span className={styles.notificationMessage}>{alert.message}</span>
              <span className={styles.notificationFooter}>
                <span>{resolveCamera(alert, cameras).label}</span>
                <RelativeTime iso={alert.createdAt} className={styles.notificationTime} />
              </span>
            </button>
          ))
        )}
      </div>

      <button
        type="button"
        className={styles.viewAllNotifications}
        onClick={() => {
          onNavigate();
          router.push('/notifications');
        }}
      >
        View all notifications
      </button>
    </div>
  );
}
