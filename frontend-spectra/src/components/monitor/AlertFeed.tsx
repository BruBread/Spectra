'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { VisionAlert } from '../../lib/vision/types';
import { Card, CardHeader } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { AlertCard } from './AlertCard';
import { AlertDetailModal } from './AlertDetailModal';
import styles from './AlertFeed.module.css';

export interface FeedAlert extends VisionAlert {
  persisted: boolean;
}

interface AlertFeedProps {
  alerts: FeedAlert[];
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
}

export function AlertFeed({ alerts, onAcknowledge, onAcknowledgeAll }: AlertFeedProps) {
  const [selected, setSelected] = useState<VisionAlert | null>(null);
  const unacknowledgedCount = alerts.filter((alert) => !alert.acknowledged).length;

  return (
    <Card>
      <CardHeader
        title="Live Alerts"
        subtitle={`${unacknowledgedCount} needing review`}
        action={
          unacknowledgedCount > 0 ? (
            <Button size="sm" variant="secondary" onClick={onAcknowledgeAll}>
              Acknowledge all
            </Button>
          ) : undefined
        }
      />
      {alerts.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert size={20} aria-hidden="true" />}
          title="No alerts yet"
          description="Start the camera to begin monitoring — alerts will appear here in real time."
        />
      ) : (
        <ul className={styles.list}>
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              persisted={alert.persisted}
              onAcknowledge={onAcknowledge}
              onView={setSelected}
            />
          ))}
        </ul>
      )}

      <AlertDetailModal alert={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}
