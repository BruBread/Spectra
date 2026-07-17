'use client';

import { useEffect, useState } from 'react';
import { BellOff, Loader2, PlugZap } from 'lucide-react';
import { fetchAlerts } from '../../lib/api/vision';
import { useCameraSources } from '../../context/CameraSourcesContext';
import type { VisionAlert } from '../../lib/vision/types';
import { SEVERITY_TONE, alertTitle, resolveCamera } from '../../lib/notifications/present';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { RelativeTime } from '../ui/RelativeTime';
import { ButtonLink } from '../ui/ButtonLink';
import styles from './RecentAlertsPanel.module.css';

/**
 * Dashboard preview of the newest detections — the same `/api/vision/alerts`
 * data the Notifications page renders, never a separate or seeded source.
 */
export function RecentAlertsPanel() {
  const { cameras } = useCameraSources();
  const [alerts, setAlerts] = useState<VisionAlert[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchAlerts({ limit: 5 });
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

  return (
    <Card>
      <CardHeader title="Recent Alerts" subtitle="Latest detections requiring review" />

      {status === 'loading' ? (
        <EmptyState icon={<Loader2 size={20} className={styles.spin} aria-hidden="true" />} title="Loading alerts…" />
      ) : status === 'error' ? (
        <EmptyState
          icon={<PlugZap size={20} aria-hidden="true" />}
          title="Backend unavailable"
          description="Could not reach the backend, so recent alerts can't be shown."
        />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={<BellOff size={20} aria-hidden="true" />}
          title="No recorded data yet"
          description="Detections appear here once a camera with AI detection enabled flags something."
        />
      ) : (
        <ul className={styles.list}>
          {alerts.map((alert) => (
            <li key={alert.id} className={styles.item} data-unread={!alert.read}>
              <span className={styles.dot} data-severity={alert.severity} aria-hidden="true" />
              <div className={styles.content}>
                <p className={styles.title}>{alertTitle(alert)}</p>
                <p className={styles.meta}>{resolveCamera(alert, cameras).label}</p>
              </div>
              <div className={styles.right}>
                <Badge tone={SEVERITY_TONE[alert.severity]}>{alert.severity}</Badge>
                <RelativeTime iso={alert.createdAt} className={styles.time} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ButtonLink href="/notifications" variant="secondary" size="sm" className={styles.viewAll}>
        View all notifications
      </ButtonLink>
    </Card>
  );
}
