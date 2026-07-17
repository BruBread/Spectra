'use client';

import { useEffect, useState } from 'react';
import { Loader2, PlugZap, Satellite } from 'lucide-react';
import { fetchDeviceReadings, type ReadingsStatus } from '../../lib/api/readings';
import type { DeviceReading } from '../../lib/types';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { formatDateTime } from '../../lib/format';
import styles from './DeviceReadingsPanel.module.css';

function summarizePayload(reading: DeviceReading): string {
  if (!reading.payloadDecoded) return 'No decoded payload';
  return Object.entries(reading.payloadDecoded)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
}

export function DeviceReadingsPanel() {
  const [readings, setReadings] = useState<DeviceReading[]>([]);
  const [status, setStatus] = useState<ReadingsStatus | 'loading'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchDeviceReadings({ limit: 5 }).then((result) => {
      if (!active) return;
      setReadings(result.readings);
      setStatus(result.status);
      setError(result.error ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card>
      <CardHeader
        title="LoRa Device Readings"
        subtitle="Latest wearable receiver and sensor uplinks"
        action={status === 'ok' ? <Badge tone="success">Live data</Badge> : null}
      />
      {status === 'loading' ? (
        <EmptyState icon={<Loader2 size={20} className={styles.spin} aria-hidden="true" />} title="Loading readings…" />
      ) : status === 'error' ? (
        <EmptyState
          icon={<PlugZap size={20} aria-hidden="true" />}
          title="Backend unavailable"
          description={error ?? 'Could not reach the backend, so no readings can be shown.'}
        />
      ) : status === 'empty' ? (
        <EmptyState
          icon={<Satellite size={20} aria-hidden="true" />}
          title="No recorded data yet"
          description="No device uplinks have been received. Readings appear here once a gateway forwards them."
        />
      ) : (
        <ul className={styles.list}>
          {readings.map((reading, index) => (
            <li key={`${reading.deviceId}-${index}`} className={styles.item}>
              <span className={styles.icon}>
                <Satellite size={16} aria-hidden="true" />
              </span>
              <div className={styles.content}>
                <p className={styles.deviceId}>
                  {reading.deviceId} <span className={styles.provider}>· {reading.provider}</span>
                </p>
                <p className={styles.payload}>{summarizePayload(reading)}</p>
              </div>
              <div className={styles.meta}>
                <span className={styles.time}>{formatDateTime(reading.receivedAt)}</span>
                {typeof reading.rssi === 'number' ? (
                  <span className={styles.rssi}>{reading.rssi} dBm</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
