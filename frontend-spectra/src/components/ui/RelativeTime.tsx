'use client';

import { useSyncExternalStore } from 'react';
import { formatDate, relativeTimeFrom } from '../../lib/format';

interface RelativeTimeProps {
  iso: string;
  className?: string;
}

function subscribe(callback: () => void): () => void {
  const interval = window.setInterval(callback, 30_000);
  return () => window.clearInterval(interval);
}

/**
 * Server (and first client paint) render a fixed absolute date; once
 * mounted, useSyncExternalStore resolves the real "x mins ago" label —
 * relative time depends on the current clock, which can't be computed
 * identically during SSR.
 */
export function RelativeTime({ iso, className }: RelativeTimeProps) {
  const label = useSyncExternalStore(
    subscribe,
    () => relativeTimeFrom(iso, Date.now()),
    () => formatDate(iso),
  );

  return (
    <time className={className} dateTime={iso} title={formatDate(iso)}>
      {label}
    </time>
  );
}
