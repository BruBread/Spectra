import type { AppSettings } from '../types';

/**
 * Starting values for the admin's own preferences.
 *
 * These are not fabricated records — they are this user's choices, persisted
 * locally and never shown as system activity. Note that nothing on the
 * backend consumes them yet, so they currently only describe intent.
 */
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
