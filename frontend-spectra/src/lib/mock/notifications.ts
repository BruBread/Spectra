import type { NotificationItem, NotificationType, Severity } from '../types';
import { createRng, intBetween } from './rng';
import { MOCK_ANCHOR } from './constants';

type Template = { type: NotificationType; severity: Severity; title: string; message: string };

const TEMPLATES: Template[] = [
  {
    type: 'motion',
    severity: 'warning',
    title: 'Motion detected',
    message: 'Wearable receiver WR-104 flagged motion near the Main Entrance, Zone A.',
  },
  {
    type: 'door',
    severity: 'warning',
    title: 'Door opened',
    message: 'Back Entrance door sensor triggered outside of scheduled access hours.',
  },
  {
    type: 'unusual',
    severity: 'critical',
    title: 'Unusual activity pattern',
    message: 'Repeated motion events flagged in the Storage Room over a 5 minute window.',
  },
  {
    type: 'battery',
    severity: 'warning',
    title: 'Low battery',
    message: 'Wearable receiver WR-122 battery is below 15% — schedule a recharge.',
  },
  {
    type: 'offline',
    severity: 'critical',
    title: 'Camera offline',
    message: 'Corridor A camera lost connection to the gateway.',
  },
  {
    type: 'unusual',
    severity: 'critical',
    title: 'Zone breach alert',
    message: 'Intruder alert triggered in Zone B — security dispatched for verification.',
  },
  {
    type: 'system',
    severity: 'info',
    title: 'System update',
    message: 'Spectra platform updated to v2.4.1 with improved LoRa signal handling.',
  },
  {
    type: 'motion',
    severity: 'info',
    title: 'Motion cleared',
    message: 'No further motion detected at Parking Area — alert auto-resolved.',
  },
];

export function generateNotifications(seed = 29, count = 8): NotificationItem[] {
  const rng = createRng(seed);
  let cursor = MOCK_ANCHOR;

  return TEMPLATES.slice(0, count).map((template, index) => {
    cursor -= intBetween(rng, 8, 70) * 60_000;
    return {
      id: `NTF-${index + 1}`,
      type: template.type,
      title: template.title,
      message: template.message,
      severity: template.severity,
      timestamp: new Date(cursor).toISOString(),
      read: index >= 3,
    } satisfies NotificationItem;
  });
}
