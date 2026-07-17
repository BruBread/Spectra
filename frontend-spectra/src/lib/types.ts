export type Severity = 'info' | 'warning' | 'critical';

/* ---------------------------------------------------------------------------
 * NOT YET IMPLEMENTED
 *
 * The customer, log and notification types below describe features that have
 * no backend model, route or API client. They are kept as the intended shapes
 * for when those endpoints are built — nothing renders them today, and the
 * generators that used to fabricate records in these shapes are gone. Confirm
 * against the real API before relying on them.
 * ------------------------------------------------------------------------ */

export type CustomerStatus = 'active' | 'inactive' | 'pending';

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: CustomerStatus;
  joinedOn: string;
}

export interface NewCustomerInput {
  name: string;
  email: string;
  phone: string;
  status: CustomerStatus;
}

export interface LogEntry {
  id: string;
  user: string;
  action: string;
  details: string;
  timestamp: string;
  severity: Severity;
}

export type NotificationType = 'motion' | 'door' | 'unusual' | 'system' | 'offline' | 'battery';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: Severity;
  timestamp: string;
  read: boolean;
}

/* --------------------------- end NOT YET IMPLEMENTED --------------------- */

export interface DetectionSettings {
  sensitivity: 'low' | 'medium' | 'high';
  notifyOnMotion: boolean;
  vibrateWearable: boolean;
  recordClip: boolean;
  soundAlarm: boolean;
}

export interface NotificationPreferences {
  emailAlerts: boolean;
  pushAlerts: boolean;
  motionAlerts: boolean;
  doorAlerts: boolean;
  weeklySummary: boolean;
}

export interface AppSettings {
  notifications: NotificationPreferences;
  detection: DetectionSettings;
}

/**
 * Admin-console roles, mirroring the backend's AdminRole. Separate from the
 * monitored-person roles (faculty, student, …) of the later identity phase.
 */
export type AdminRole = 'admin' | 'operator';

/** Mirrors the backend's PublicUser shape from `GET /api/auth/me`. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  lastLoginAt: string | null;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface DeviceReading {
  _id?: string;
  provider: 'ttn' | 'chirpstack' | string;
  deviceId: string;
  devEui?: string;
  applicationId?: string;
  fPort?: number;
  fCnt?: number;
  payloadRaw?: string;
  payloadDecoded?: Record<string, unknown> | null;
  rssi?: number;
  snr?: number;
  frequency?: number;
  dataRate?: string;
  gatewayIds?: string[];
  receivedAt: string;
  createdAt?: string;
}
