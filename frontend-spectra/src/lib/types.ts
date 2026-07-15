export type Severity = 'info' | 'warning' | 'critical';

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

export interface AuthUser {
  name: string;
  email: string;
  role: string;
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
