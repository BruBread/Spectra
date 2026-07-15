'use client';

import { useEffect, useState } from 'react';
import { Satellite } from 'lucide-react';
import { fetchDeviceReadings } from '../../lib/api/readings';
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
  const [source, setSource] = useState<'live' | 'mock' | null>(null);

  useEffect(() => {
    let active = true;
    fetchDeviceReadings({ limit: 5 }).then((result) => {
      if (!active) return;
      setReadings(result.readings);
      setSource(result.source);
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
        action={
          source ? (
            <Badge tone={source === 'live' ? 'success' : 'neutral'}>{source === 'live' ? 'Live data' : 'Demo data'}</Badge>
          ) : null
        }
      />
      {readings.length === 0 ? (
        <EmptyState icon={<Satellite size={20} aria-hidden="true" />} title="Waiting for uplinks" />
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
