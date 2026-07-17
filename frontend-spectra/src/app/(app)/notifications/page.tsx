'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BellOff, CheckCheck, Loader2, PlugZap, RefreshCw, SearchX, ShieldQuestion } from 'lucide-react';
import { useCameraSources } from '../../../context/CameraSourcesContext';
import { useAlertCounts } from '../../../context/AlertCountsContext';
import { useToast } from '../../../context/ToastContext';
import {
  fetchAlerts,
  markAlertRead,
  markAllAlertsRead,
  updateAlertStatus,
  type AlertQuery,
} from '../../../lib/api/vision';
import type { AlertStatus, VisionAlert } from '../../../lib/vision/types';
import {
  EMPTY_FILTERS,
  NotificationFilters,
  hasActiveFilters,
  type NotificationFilterState,
} from '../../../components/notifications/NotificationFilters';
import { NotificationRow } from '../../../components/notifications/NotificationRow';
import { NotificationDetailModal } from '../../../components/notifications/NotificationDetailModal';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import styles from './notifications.module.css';

/**
 * Matches the Monitor page's page size. Alert rows embed base64 snapshots, so
 * a much larger limit would mean a multi-megabyte response; when the cap is
 * reached the UI says so rather than quietly hiding older alerts.
 */
const PAGE_LIMIT = 100;

type LoadStatus = 'loading' | 'ok' | 'error';

/** Dates come from <input type="date"> as YYYY-MM-DD; widen them to cover the whole local day. */
function startOfDayIso(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}
function endOfDayIso(value: string): string {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function toQuery(filters: NotificationFilterState): AlertQuery {
  return {
    severity: filters.severity === 'all' ? undefined : filters.severity,
    type: filters.type === 'all' ? undefined : filters.type,
    status: filters.status === 'all' ? undefined : [filters.status],
    cameraId: filters.cameraId === 'all' ? undefined : filters.cameraId,
    zoneName: filters.zoneName === 'all' ? undefined : filters.zoneName,
    from: filters.from ? startOfDayIso(filters.from) : undefined,
    to: filters.to ? endOfDayIso(filters.to) : undefined,
    limit: PAGE_LIMIT,
  };
}

function NotificationsPageInner() {
  const { cameras } = useCameraSources();
  const { counts, status: countsStatus, refresh: refreshCounts } = useAlertCounts();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const requestedAlertId = searchParams.get('alert');

  const [alerts, setAlerts] = useState<VisionAlert[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<NotificationFilterState>(EMPTY_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [selected, setSelected] = useState<VisionAlert | null>(null);

  // Zone options must reflect zones actually recorded, so they're captured from
  // the first unfiltered response and kept — deriving them from a filtered list
  // would make the dropdown empty itself as you filter.
  const [zoneOptions, setZoneOptions] = useState<string[]>([]);
  const zonesCaptured = useRef(false);

  const load = useCallback(
    async (next: NotificationFilterState, showSpinner = true) => {
      if (showSpinner) setStatus('loading');
      const result = await fetchAlerts(toQuery(next));

      if (!result.ok || !result.data) {
        setStatus('error');
        setError(result.error ?? 'Could not reach the backend.');
        setAlerts([]);
        return;
      }

      setAlerts(result.data);
      setStatus('ok');
      setError(null);

      if (!zonesCaptured.current && !hasActiveFilters(next)) {
        zonesCaptured.current = true;
        const zones = Array.from(
          new Set(result.data.map((alert) => alert.zoneName).filter((zone): zone is string => Boolean(zone))),
        ).sort();
        setZoneOptions(zones);
      }
    },
    [],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching from the backend when the filter set changes; the loading flip is the point, not a derived value
    void load(filters);
  }, [filters, load]);

  // Deep link from the top-bar bell: open that alert's detail once it's loaded.
  const deepLinked = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedAlertId || deepLinked.current === requestedAlertId) return;
    const match = alerts.find((alert) => alert.id === requestedAlertId);
    if (!match) return;
    deepLinked.current = requestedAlertId;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the URL's ?alert= param, an external navigation source
    setSelected(match);
  }, [requestedAlertId, alerts]);

  /** Replaces one row from the server's response — never a guess at what changed. */
  const replaceAlert = (updated: VisionAlert) => {
    setAlerts((current) => current.map((alert) => (alert.id === updated.id ? updated : alert)));
    setSelected((current) => (current && current.id === updated.id ? updated : current));
  };

  const handleStatusChange = async (alert: VisionAlert, next: AlertStatus) => {
    setBusyId(alert.id);
    const result = await updateAlertStatus(alert.id, next);
    setBusyId(null);

    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Could not update the review status.', 'error');
      return;
    }
    replaceAlert(result.data);
    void refreshCounts();
  };

  const handleMarkRead = async (alert: VisionAlert) => {
    setBusyId(alert.id);
    const result = await markAlertRead(alert.id, true);
    setBusyId(null);

    if (!result.ok || !result.data) {
      showToast(result.error ?? 'Could not mark this notification as read.', 'error');
      return;
    }
    replaceAlert(result.data);
    void refreshCounts();
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    const result = await markAllAlertsRead();
    setMarkingAll(false);

    if (!result.ok) {
      showToast(result.error ?? 'Could not mark notifications as read.', 'error');
      return;
    }
    showToast(`${result.data?.modified ?? 0} notification(s) marked as read`, 'success');
    await load(filters, false);
    void refreshCounts();
  };

  const handleOpen = (alert: VisionAlert) => {
    setSelected(alert);
    // Opening a notification is reading it — reflect that without a second click.
    if (!alert.read) void handleMarkRead(alert);
  };

  const filtersActive = useMemo(() => hasActiveFilters(filters), [filters]);
  const unread = countsStatus === 'ok' ? counts?.unread ?? 0 : null;
  const criticalOpen = countsStatus === 'ok' ? counts?.criticalOpen ?? 0 : null;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Notifications</h2>
          <p className={styles.subtitle}>Detections recorded by the vision pipeline, newest first.</p>
        </div>
        <div className={styles.headerActions}>
          {/* Counts render only when the API answered — a failed request shows
              nothing rather than an authoritative-looking zero. */}
          {unread !== null ? <Badge tone={unread > 0 ? 'info' : 'neutral'}>{unread} unread</Badge> : null}
          {criticalOpen !== null && criticalOpen > 0 ? <Badge tone="danger">{criticalOpen} critical open</Badge> : null}
          <Button variant="secondary" size="sm" onClick={() => void load(filters)} disabled={status === 'loading'}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </Button>
          <Button size="sm" onClick={() => void handleMarkAllRead()} disabled={markingAll || unread === 0}>
            <CheckCheck size={14} aria-hidden="true" /> {markingAll ? 'Marking…' : 'Mark all read'}
          </Button>
        </div>
      </div>

      <div className={styles.disclaimer}>
        <ShieldQuestion size={16} aria-hidden="true" />
        Every notification here is an AI-assisted signal for a human to verify — not a confirmed incident.
      </div>

      <Card>
        <NotificationFilters
          filters={filters}
          cameras={cameras}
          zoneOptions={zoneOptions}
          onChange={setFilters}
          onReset={() => setFilters(EMPTY_FILTERS)}
        />
      </Card>

      <Card padding="sm">
        {status === 'loading' ? (
          <EmptyState icon={<Loader2 size={20} className={styles.spin} aria-hidden="true" />} title="Loading notifications…" />
        ) : status === 'error' ? (
          <EmptyState
            icon={<PlugZap size={20} aria-hidden="true" />}
            title="Backend unavailable"
            description={error ?? 'Could not reach the backend, so notifications cannot be shown.'}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load(filters)}>
                Try again
              </Button>
            }
          />
        ) : alerts.length === 0 ? (
          filtersActive ? (
            <EmptyState
              icon={<SearchX size={20} aria-hidden="true" />}
              title="No notifications match these filters"
              description="Other notifications may exist outside this filter set."
              action={
                <Button variant="secondary" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<BellOff size={20} aria-hidden="true" />}
              title="No recorded data yet"
              description="No detections have been recorded. Alerts appear here once a camera with AI detection enabled flags something on the Live Monitor page."
            />
          )
        ) : (
          <>
            <ul className={styles.list}>
              {alerts.map((alert) => (
                <NotificationRow
                  key={alert.id}
                  alert={alert}
                  cameras={cameras}
                  busy={busyId === alert.id}
                  onOpen={() => handleOpen(alert)}
                  onMarkRead={() => void handleMarkRead(alert)}
                  onStatusChange={(next) => void handleStatusChange(alert, next)}
                />
              ))}
            </ul>
            {alerts.length >= PAGE_LIMIT ? (
              <p className={styles.limitNotice}>
                Showing the {PAGE_LIMIT} most recent notifications. Narrow the filters to see older ones.
              </p>
            ) : null}
          </>
        )}
      </Card>

      <NotificationDetailModal
        alert={selected}
        cameras={cameras}
        busy={busyId === selected?.id}
        onClose={() => setSelected(null)}
        onStatusChange={(next) => {
          if (selected) void handleStatusChange(selected, next);
        }}
      />
    </div>
  );
}

/**
 * useSearchParams needs a Suspense boundary so the shell can render while the
 * client resolves the query string.
 */
export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <NotificationsPageInner />
    </Suspense>
  );
}
