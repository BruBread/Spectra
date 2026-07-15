import type { AppSettings } from '../types';

export function defaultSettings(): AppSettings {
  return {
    notifications: {
      emailAlerts: true,
      pushAlerts: true,
      motionAlerts: true,
      doorAlerts: true,
      weeklySummary: false,
    },
    detection: {
      sensitivity: 'medium',
      notifyOnMotion: true,
      vibrateWearable: true,
      recordClip: true,
      soundAlarm: false,
    },
  };
}
