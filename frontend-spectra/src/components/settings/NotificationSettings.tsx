'use client';

import { useAppData } from '../../context/AppDataContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader } from '../ui/Card';
import { Switch } from '../ui/Switch';

export function NotificationSettings() {
  const { settings, updateSettings } = useAppData();
  const { showToast } = useToast();

  const setPreference = (key: keyof typeof settings.notifications, value: boolean) => {
    updateSettings({ notifications: { ...settings.notifications, [key]: value } });
    showToast('Notification preferences updated', 'success');
  };

  return (
    <Card>
      <CardHeader title="Notification Preferences" subtitle="Choose how Spectra keeps you informed." />
      <Switch
        label="Email alerts"
        description="Receive a summary email when new alerts are triggered."
        checked={settings.notifications.emailAlerts}
        onChange={(checked) => setPreference('emailAlerts', checked)}
      />
      <Switch
        label="Push alerts"
        description="Show real-time alerts in this dashboard."
        checked={settings.notifications.pushAlerts}
        onChange={(checked) => setPreference('pushAlerts', checked)}
      />
      <Switch
        label="Motion alerts"
        description="Notify when a camera or wearable receiver detects motion."
        checked={settings.notifications.motionAlerts}
        onChange={(checked) => setPreference('motionAlerts', checked)}
      />
      <Switch
        label="Door sensor alerts"
        description="Notify when a monitored door is opened outside of scheduled hours."
        checked={settings.notifications.doorAlerts}
        onChange={(checked) => setPreference('doorAlerts', checked)}
      />
      <Switch
        label="Weekly summary"
        description="Get a weekly digest of activity across all sites."
        checked={settings.notifications.weeklySummary}
        onChange={(checked) => setPreference('weeklySummary', checked)}
      />
    </Card>
  );
}
