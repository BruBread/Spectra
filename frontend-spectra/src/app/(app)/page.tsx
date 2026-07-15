'use client';

import { useMemo } from 'react';
import { AlarmClock, Camera as CameraIcon, ScrollText, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppData } from '../../context/AppDataContext';
import { StatCard } from '../../components/dashboard/StatCard';
import { ActivityChart } from '../../components/dashboard/ActivityChart';
import { RecentLogsPanel } from '../../components/dashboard/RecentLogsPanel';
import { TopCamerasPanel } from '../../components/dashboard/TopCamerasPanel';
import { CustomerOverview } from '../../components/dashboard/CustomerOverview';
import { CameraPreviewPanel } from '../../components/dashboard/CameraPreviewPanel';
import { NotificationsPreview } from '../../components/dashboard/NotificationsPreview';
import { DeviceReadingsPanel } from '../../components/dashboard/DeviceReadingsPanel';
import { Card, CardHeader } from '../../components/ui/Card';
import { generateWeeklyActivity, MOCK_ANCHOR } from '../../lib/mock';
import { isSameUtcDay, daysSince } from '../../lib/format';
import styles from './home.module.css';

const GREETING_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export default function HomePage() {
  const { user } = useAuth();
  const { cameras, logs, customers, notifications } = useAppData();

  const activity = useMemo(() => generateWeeklyActivity(), []);

  const stats = useMemo(() => {
    const yesterdayAnchor = MOCK_ANCHOR - 86_400_000;

    const logsToday = logs.filter((log) => isSameUtcDay(log.timestamp, MOCK_ANCHOR)).length;
    const logsYesterday = logs.filter((log) => isSameUtcDay(log.timestamp, yesterdayAnchor)).length;

    const alertsToday = logs.filter(
      (log) => log.severity !== 'info' && isSameUtcDay(log.timestamp, MOCK_ANCHOR),
    ).length;
    const alertsYesterday = logs.filter(
      (log) => log.severity !== 'info' && isSameUtcDay(log.timestamp, yesterdayAnchor),
    ).length;

    const activeCameras = cameras.filter((camera) => camera.status === 'live').length;

    const newCustomers = customers.filter((customer) => daysSince(customer.joinedOn, MOCK_ANCHOR) <= 7).length;
    const newCustomersPrevWeek = customers.filter((customer) => {
      const age = daysSince(customer.joinedOn, MOCK_ANCHOR);
      return age > 7 && age <= 14;
    }).length;

    const pct = (current: number, previous: number) => {
      if (previous === 0) return current === 0 ? '0%' : '+100%';
      const change = Math.round(((current - previous) / previous) * 100);
      return `${change >= 0 ? '+' : ''}${change}%`;
    };

    return {
      logsToday,
      alertsToday,
      activeCameras,
      newCustomers,
      logsTrend: pct(logsToday, logsYesterday),
      logsPositive: logsToday >= logsYesterday,
      alertsTrend: pct(alertsToday, alertsYesterday),
      alertsPositive: alertsToday <= alertsYesterday,
      customersTrend: pct(newCustomers, newCustomersPrevWeek),
      customersPositive: newCustomers >= newCustomersPrevWeek,
    };
  }, [logs, cameras, customers]);

  return (
    <div className={styles.page}>
      <div>
        <h2 className={styles.greeting}>Welcome back, {user?.name ?? 'Admin'}</h2>
        <p className={styles.subGreeting}>Here&apos;s what&apos;s happening today, {GREETING_DATE.format(MOCK_ANCHOR)}.</p>
      </div>

      <div className={styles.statGrid}>
        <StatCard
          label="Total Logs Today"
          value={String(stats.logsToday)}
          icon={<ScrollText size={17} aria-hidden="true" />}
          trend={{ value: stats.logsTrend, direction: stats.logsPositive ? 'up' : 'down', positive: stats.logsPositive }}
        />
        <StatCard
          label="Active Cameras"
          value={String(stats.activeCameras)}
          icon={<CameraIcon size={17} aria-hidden="true" />}
        />
        <StatCard
          label="Alerts Today"
          value={String(stats.alertsToday)}
          icon={<AlarmClock size={17} aria-hidden="true" />}
          trend={{ value: stats.alertsTrend, direction: stats.alertsPositive ? 'up' : 'down', positive: stats.alertsPositive }}
        />
        <StatCard
          label="New Customers"
          value={String(stats.newCustomers)}
          icon={<UserPlus size={17} aria-hidden="true" />}
          trend={{
            value: stats.customersTrend,
            direction: stats.customersPositive ? 'up' : 'down',
            positive: stats.customersPositive,
          }}
        />
      </div>

      <div className={styles.row}>
        <Card className={styles.chartCard}>
          <CardHeader title="Activity Overview" subtitle="Security events across this week" />
          <ActivityChart data={activity} />
        </Card>
        <RecentLogsPanel logs={logs} />
      </div>

      <div className={styles.row}>
        <TopCamerasPanel cameras={cameras} />
        <CustomerOverview customers={customers} />
      </div>

      <div className={styles.row}>
        <CameraPreviewPanel cameras={cameras} />
        <NotificationsPreview notifications={notifications} />
      </div>

      <DeviceReadingsPanel />
    </div>
  );
}
