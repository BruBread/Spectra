'use client';

import { useEffect, useState } from 'react';
import { AlarmClock, BarChart3, Camera as CameraIcon, ScrollText, ShieldAlert, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCameraSources } from '../../context/CameraSourcesContext';
import { fetchAlertCounts, type AlertCounts } from '../../lib/api/vision';
import { StatCard } from '../../components/dashboard/StatCard';
import { TopCamerasPanel } from '../../components/dashboard/TopCamerasPanel';
import { CameraPreviewPanel } from '../../components/dashboard/CameraPreviewPanel';
import { DeviceReadingsPanel } from '../../components/dashboard/DeviceReadingsPanel';
import { RecentAlertsPanel } from '../../components/dashboard/RecentAlertsPanel';
import { PendingBackendPanel } from '../../components/dashboard/PendingBackendPanel';
import styles from './home.module.css';

const GREETING_DATE = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export default function HomePage() {
  const { user } = useAuth();
  const { cameras, backendConnected } = useCameraSources();

  const [counts, setCounts] = useState<AlertCounts | null>(null);
  const [countsFailed, setCountsFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchAlertCounts();
      if (cancelled) return;
      if (result.ok && result.data) {
        setCounts(result.data);
        setCountsFailed(false);
      } else {
        setCounts(null);
        setCountsFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rendered client-side only: the viewer's real date can't be known during
  // SSR without risking a hydration mismatch, and the old code dodged that by
  // formatting a hard-coded fake "today" instead.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the browser clock, an external source unavailable during render
    setToday(GREETING_DATE.format(new Date()));
  }, []);

  // A failed request must not read as "zero" — that is a claim about the
  // system, not about the network.
  const statValue = (value: number | undefined) => (countsFailed || value === undefined ? '—' : String(value));

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.greeting}>Welcome back, {user?.name ?? 'Admin'}</h2>
        <p className={styles.subGreeting}>{today ? `Here's what's happening today, ${today}.` : 'Here’s what’s happening today.'}</p>
      </div>

      <div className={styles.statGrid}>
        <StatCard
          label="Monitored Cameras"
          value={backendConnected ? String(cameras.filter((camera) => camera.detectionEnabled).length) : '—'}
          icon={<CameraIcon size={17} aria-hidden="true" />}
        />
        <StatCard
          label="Registered Cameras"
          value={backendConnected ? String(cameras.length) : '—'}
          icon={<ScrollText size={17} aria-hidden="true" />}
        />
        <StatCard
          label="New Alerts"
          value={statValue(counts?.new)}
          icon={<AlarmClock size={17} aria-hidden="true" />}
        />
        <StatCard
          label="Critical Alerts Open"
          value={statValue(counts?.criticalOpen)}
          icon={<ShieldAlert size={17} aria-hidden="true" />}
        />
      </div>

      <div className={styles.row}>
        <PendingBackendPanel
          title="Activity Overview"
          subtitle="Security events over time"
          icon={<BarChart3 size={20} aria-hidden="true" />}
          description="No recorded analytics are available yet. This chart will appear once the backend records and aggregates activity over time."
        />
        <PendingBackendPanel
          title="Recent Logs"
          subtitle="Latest activity across the platform"
          icon={<ScrollText size={20} aria-hidden="true" />}
          description="Audit logging has no backend API yet, so there is nothing recorded to show."
        />
      </div>

      <div className={styles.row}>
        <TopCamerasPanel cameras={cameras} />
        <PendingBackendPanel
          title="Customer Overview"
          subtitle="Customer records"
          icon={<Users size={20} aria-hidden="true" />}
          description="Customers have no backend API yet. Registered customers will appear here once one exists."
        />
      </div>

      <div className={styles.row}>
        <CameraPreviewPanel cameras={cameras} />
        <RecentAlertsPanel />
      </div>

      <DeviceReadingsPanel />
    </div>
  );
}
