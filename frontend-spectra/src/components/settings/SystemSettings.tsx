'use client';

import { useAppData } from '../../context/AppDataContext';
import { Card, CardHeader } from '../ui/Card';
import { Select } from '../ui/Select';
import { Switch } from '../ui/Switch';
import type { DetectionSettings } from '../../lib/types';
import styles from './SettingsPanels.module.css';

export function SystemSettings() {
  const { settings, updateSettings } = useAppData();

  const setDetection = (key: keyof DetectionSettings, value: DetectionSettings[keyof DetectionSettings]) => {
    updateSettings({ detection: { ...settings.detection, [key]: value } });
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
        <CardHeader title="System" subtitle="Platform information." />
        <dl className={styles.systemGrid}>
          <div>
            <dt>Backend API</dt>
            <dd>
              {process.env.NEXT_PUBLIC_API_BASE_URL
                ? process.env.NEXT_PUBLIC_API_BASE_URL
                : 'No API base URL configured'}
            </dd>
          </div>
        </dl>
        {/* The version row here reported a hard-coded "v2.4.1" that matched no
            real build, and the reset control regenerated demo records. Both are
            gone: this panel now states only what it can actually know. */}
      </Card>
    </>
  );
}
