'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fetchAlertCounts, type AlertCounts } from '../lib/api/vision';

const POLL_INTERVAL_MS = 30_000;

type CountsStatus = 'loading' | 'ok' | 'error';

interface AlertCountsContextValue {
  counts: AlertCounts | null;
  status: CountsStatus;
  /** Re-read immediately — call after any mutation that changes read/status. */
  refresh: () => Promise<void>;
}

const AlertCountsContext = createContext<AlertCountsContextValue | null>(null);

/**
 * Single source of truth for the alert badge counts.
 *
 * Provided inside the authenticated layout so polling only ever runs for a
 * signed-in session, and paused while the tab is hidden — a background tab
 * hammering the API for a badge nobody can see is pure waste. `counts` stays
 * null on failure rather than falling back to zero: "we couldn't ask" is not
 * the same as "there are none".
 */
export function AlertCountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<AlertCounts | null>(null);
  const [status, setStatus] = useState<CountsStatus>('loading');
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    // Guards against overlapping requests when a poll tick lands on top of a
    // manual refresh triggered by a mutation.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await fetchAlertCounts();
      if (result.ok && result.data) {
        setCounts(result.data);
        setStatus('ok');
      } else {
        setCounts(null);
        setStatus('error');
      }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled || document.hidden) return;
      void refresh();
    };

    void refresh();
    timer = window.setInterval(tick, POLL_INTERVAL_MS);

    // Coming back to the tab should show current numbers straight away rather
    // than whatever was true when it was backgrounded.
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const value = useMemo<AlertCountsContextValue>(() => ({ counts, status, refresh }), [counts, status, refresh]);

  return <AlertCountsContext.Provider value={value}>{children}</AlertCountsContext.Provider>;
}

export function useAlertCounts(): AlertCountsContextValue {
  const ctx = useContext(AlertCountsContext);
  if (!ctx) throw new Error('useAlertCounts must be used within an AlertCountsProvider');
  return ctx;
}
