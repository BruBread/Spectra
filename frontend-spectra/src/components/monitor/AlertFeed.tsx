'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { AprilTagMapping, VisionAlert } from '../../lib/vision/types';
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
  mappings: AprilTagMapping[];
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
}

export function AlertFeed({ alerts, mappings, onAcknowledge, onAcknowledgeAll }: AlertFeedProps) {
  const [selected, setSelected] = useState<VisionAlert | null>(null);
  const unacknowledgedCount = alerts.filter((alert) => !alert.acknowledged).length;
  const mappingByTagId = new Map(mappings.map((mapping) => [mapping.tagId, mapping]));

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
              mapping={alert.type === 'apriltag' ? mappingByTagId.get(Number(alert.metadata.tagId)) : undefined}
              persisted={alert.persisted}
              onAcknowledge={onAcknowledge}
              onView={setSelected}
            />
          ))}
        </ul>
      )}

      <AlertDetailModal
        alert={selected}
        mapping={
          selected?.type === 'apriltag' ? mappingByTagId.get(Number(selected.metadata.tagId)) : undefined
        }
        onClose={() => setSelected(null)}
      />
    </Card>
  );
}
