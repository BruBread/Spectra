'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { DetectionType, DetectionTypeConfig, VisionSettings } from '../../lib/vision/types';
import { DETECTION_DESCRIPTIONS, DETECTION_LABELS } from '../../lib/vision/types';
import { Card, CardHeader } from '../ui/Card';
import { Switch } from '../ui/Switch';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ZoneDrawer } from './ZoneDrawer';
import styles from './DetectionSettingsPanel.module.css';

interface DetectionSettingsPanelProps {
  settings: VisionSettings;
  onUpdateDetector: (type: DetectionType, updates: Partial<DetectionTypeConfig>) => void;
  onUpdateGlobal: (updates: Partial<Pick<VisionSettings, 'processingIntervalMs' | 'retentionDays'>>) => void;
  snapshotForZoneEditor: string | null;
}

export function DetectionSettingsPanel({
  settings,
  onUpdateDetector,
  onUpdateGlobal,
  snapshotForZoneEditor,
}: DetectionSettingsPanelProps) {
  const [zoneEditorType, setZoneEditorType] = useState<DetectionType | null>(null);
  const zoneEditorConfig = settings.detectors.find((detector) => detector.type === zoneEditorType);

  return (
    <div className={styles.wrapper}>
      <Card>
        <CardHeader title="Processing" subtitle="Applies to every detector on this camera." />
        <div className={styles.globalRow}>
          <label className={styles.fieldLabel}>
            Processing interval (ms)
            <input
              type="number"
              min={200}
              max={3000}
              step={50}
              value={settings.processingIntervalMs}
              onChange={(event) => onUpdateGlobal({ processingIntervalMs: Number(event.target.value) })}
              className={styles.numberInput}
            />
          </label>
          <label className={styles.fieldLabel}>
            Alert retention (days)
            <input
              type="number"
              min={1}
              max={365}
              value={settings.retentionDays}
              onChange={(event) => onUpdateGlobal({ retentionDays: Number(event.target.value) })}
              className={styles.numberInput}
            />
          </label>
        </div>
      </Card>

      {settings.detectors.map((detector) => (
        <Card key={detector.type}>
          <Switch
            label={DETECTION_LABELS[detector.type]}
            description={DETECTION_DESCRIPTIONS[detector.type]}
            checked={detector.enabled}
            onChange={(checked) => onUpdateDetector(detector.type, { enabled: checked })}
          />

          <div className={styles.controlsGrid}>
            <label className={styles.fieldLabel}>
              Confidence threshold: {Math.round(detector.confidenceThreshold * 100)}%
              <input
                type="range"
                min={0.2}
                max={0.95}
                step={0.05}
                value={detector.confidenceThreshold}
                onChange={(event) => onUpdateDetector(detector.type, { confidenceThreshold: Number(event.target.value) })}
              />
            </label>
            <label className={styles.fieldLabel}>
              Cooldown (seconds)
              <input
                type="number"
                min={0}
                value={detector.cooldownSeconds}
                onChange={(event) => onUpdateDetector(detector.type, { cooldownSeconds: Number(event.target.value) })}
                className={styles.numberInput}
              />
            </label>
            <label className={styles.fieldLabel}>
              Duration threshold (seconds)
              <input
                type="number"
                min={0}
                step={0.5}
                value={detector.durationThresholdSeconds}
                onChange={(event) =>
                  onUpdateDetector(detector.type, { durationThresholdSeconds: Number(event.target.value) })
                }
                className={styles.numberInput}
              />
            </label>
            <Button variant="secondary" size="sm" onClick={() => setZoneEditorType(detector.type)}>
              <MapPin size={14} aria-hidden="true" /> {detector.zone ? 'Edit zone' : 'Set zone'}
            </Button>
          </div>
        </Card>
      ))}

      <Modal
        open={zoneEditorType !== null}
        onClose={() => setZoneEditorType(null)}
        title={zoneEditorType ? `${DETECTION_LABELS[zoneEditorType]} — Zone of Interest` : 'Zone of Interest'}
        size="md"
      >
        {zoneEditorType && zoneEditorConfig ? (
          <ZoneDrawer
            zone={zoneEditorConfig.zone}
            backgroundImage={snapshotForZoneEditor}
            onChange={(zone) => onUpdateDetector(zoneEditorType, { zone })}
          />
        ) : null}
      </Modal>
    </div>
  );
}
