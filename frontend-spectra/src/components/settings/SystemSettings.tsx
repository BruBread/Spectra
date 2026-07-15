'use client';

import { useState } from 'react';
import { useAppData } from '../../context/AppDataContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader } from '../ui/Card';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import type { DetectionSettings } from '../../lib/types';
import styles from './SettingsPanels.module.css';

export function SystemSettings() {
  const { settings, updateSettings, resetDemoData } = useAppData();
  const { showToast } = useToast();
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const setDetection = (key: keyof DetectionSettings, value: DetectionSettings[keyof DetectionSettings]) => {
    updateSettings({ detection: { ...settings.detection, [key]: value } });
  };

  const handleReset = () => {
    resetDemoData();
    setConfirmResetOpen(false);
    showToast('Demo data has been reset', 'info');
  };

  return (
    <>
      <Card>
        <CardHeader title="Camera Activity Detection" subtitle="Control how sensitive detection is and what happens on an alert." />
        <div className={styles.fieldRow}>
          <Select
            label="Sensitivity"
            value={settings.detection.sensitivity}
            onChange={(event) => setDetection('sensitivity', event.target.value as DetectionSettings['sensitivity'])}
          >
            <option value="low">Low — fewer, larger movements only</option>
            <option value="medium">Medium — balanced (recommended)</option>
            <option value="high">High — detects small movements</option>
          </Select>
        </div>

        <div className={styles.divider} />

        <Switch
          label="Notify on motion"
          description="Send an alert to the dashboard and notification center."
          checked={settings.detection.notifyOnMotion}
          onChange={(checked) => setDetection('notifyOnMotion', checked)}
        />
        <Switch
          label="Vibrate wearable receiver"
          description="Trigger the wearable's vibration motor when motion is confirmed."
          checked={settings.detection.vibrateWearable}
          onChange={(checked) => setDetection('vibrateWearable', checked)}
        />
        <Switch
          label="Record video clip"
          description="Save a short clip from the triggering camera."
          checked={settings.detection.recordClip}
          onChange={(checked) => setDetection('recordClip', checked)}
        />
        <Switch
          label="Sound audible alarm"
          description="Play an on-site alarm sound when a critical alert fires."
          checked={settings.detection.soundAlarm}
          onChange={(checked) => setDetection('soundAlarm', checked)}
        />
      </Card>

      <Card>
        <CardHeader title="System" subtitle="Platform information and data management." />
        <dl className={styles.systemGrid}>
          <div>
            <dt>Version</dt>
            <dd>Spectra Admin v2.4.1</dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>{process.env.NEXT_PUBLIC_API_BASE_URL ? 'Connected to backend API' : 'Demo mode (no API configured)'}</dd>
          </div>
        </dl>
        <div className={styles.divider} />
        <p className={styles.helperText}>
          Reset all locally stored demo data — cameras, customers, logs and settings — back to the original seed values.
        </p>
        <div className={styles.actionsRow}>
          <Button variant="danger" onClick={() => setConfirmResetOpen(true)}>
            Reset demo data
          </Button>
        </div>
      </Card>

      <Modal
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title="Reset demo data?"
        description="This clears everything stored locally in this browser and restores the original demo dataset. This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleReset}>
              Reset data
            </Button>
          </>
        }
      >
        <p className={styles.helperText}>Any cameras or customers you&apos;ve added will be removed.</p>
      </Modal>
    </>
  );
}
