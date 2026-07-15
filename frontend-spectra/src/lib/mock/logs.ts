import type { LogEntry, Severity } from '../types';
import { createRng, intBetween, pick, weightedPick } from './rng';
import { FIRST_NAMES, LAST_NAMES } from './names';
import { MOCK_ANCHOR } from './constants';

const CAMERA_NAMES = ['Main Entrance', 'Parking Area', 'Lobby', 'Corridor A', 'Back Entrance', 'Storage Room'];
const ZONES = ['Zone A', 'Zone B', 'Zone C', 'Zone D'];
const WEARABLE_IDS = ['WR-104', 'WR-118', 'WR-122', 'WR-131'];

type Template = {
  action: string;
  severity: Severity;
  user: 'Admin' | 'System' | 'Customer';
  detail: (rng: () => number) => string;
  weight: number;
};

function randomName(rng: () => number): string {
  return `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
}

const TEMPLATES: Template[] = [
  { action: 'Login', severity: 'info', user: 'Admin', detail: () => 'Successful login', weight: 10 },
  { action: 'Logout', severity: 'info', user: 'Admin', detail: () => 'User logged out', weight: 6 },
  {
    action: 'Camera Motion',
    severity: 'warning',
    user: 'System',
    detail: (rng) => `${pick(rng, CAMERA_NAMES)} camera detected motion`,
    weight: 14,
  },
  {
    action: 'Door Sensor',
    severity: 'warning',
    user: 'System',
    detail: (rng) => `Door sensor triggered at ${pick(rng, CAMERA_NAMES)}`,
    weight: 8,
  },
  {
    action: 'New Customer',
    severity: 'info',
    user: 'System',
    detail: (rng) => `Customer ${randomName(rng)} registered`,
    weight: 6,
  },
  {
    action: 'Settings Update',
    severity: 'info',
    user: 'Admin',
    detail: (rng) => `Updated ${pick(rng, ['notification', 'detection', 'profile', 'appearance'])} settings`,
    weight: 5,
  },
  {
    action: 'Camera Offline',
    severity: 'critical',
    user: 'System',
    detail: (rng) => `${pick(rng, CAMERA_NAMES)} went offline`,
    weight: 4,
  },
  {
    action: 'Camera Online',
    severity: 'info',
    user: 'System',
    detail: (rng) => `${pick(rng, CAMERA_NAMES)} back online`,
    weight: 4,
  },
  {
    action: 'LoRa Uplink',
    severity: 'info',
    user: 'System',
    detail: (rng) => `Wearable receiver ${pick(rng, WEARABLE_IDS)} sent uplink from ${pick(rng, ZONES)}`,
    weight: 10,
  },
  {
    action: 'Low Battery',
    severity: 'warning',
    user: 'System',
    detail: (rng) => `Low battery alert from wearable receiver ${pick(rng, WEARABLE_IDS)}`,
    weight: 5,
  },
  {
    action: 'Unauthorized Access',
    severity: 'critical',
    user: 'System',
    detail: (rng) => `Unauthorized access attempt detected at ${pick(rng, CAMERA_NAMES)}`,
    weight: 2,
  },
  {
    action: 'Zone Breach',
    severity: 'critical',
    user: 'System',
    detail: (rng) => `Intruder alert triggered in ${pick(rng, ZONES)}`,
    weight: 2,
  },
  {
    action: 'Vibration Alert',
    severity: 'warning',
    user: 'Admin',
    detail: (rng) => `Vibration alert on wearable ${pick(rng, WEARABLE_IDS)} acknowledged by security`,
    weight: 4,
  },
  { action: 'Password Changed', severity: 'info', user: 'Admin', detail: () => 'Password updated successfully', weight: 2 },
  {
    action: 'Customer Update',
    severity: 'info',
    user: 'Admin',
    detail: (rng) => `Updated customer profile for ${randomName(rng)}`,
    weight: 4,
  },
  {
    action: 'Customer Deactivated',
    severity: 'warning',
    user: 'Admin',
    detail: (rng) => `Deactivated customer account for ${randomName(rng)}`,
    weight: 2,
  },
  {
    action: 'System Update',
    severity: 'info',
    user: 'System',
    detail: () => 'System update installed (v2.4.1)',
    weight: 1,
  },
];

export function generateLogs(seed = 19, count = 128, baseId = 11220): LogEntry[] {
  const rng = createRng(seed);
  let cursor = MOCK_ANCHOR;

  return Array.from({ length: count }, (_, index) => {
    const template = weightedPick(rng, TEMPLATES.map((t) => [t, t.weight] as [Template, number]));
    cursor -= intBetween(rng, 3, 90) * 60_000;

    const user = template.user === 'Customer' ? randomName(rng) : template.user;

    return {
      id: String(baseId - index),
      user,
      action: template.action,
      details: template.detail(rng),
      timestamp: new Date(cursor).toISOString(),
      severity: template.severity,
    } satisfies LogEntry;
  });
}
