import { DeviceReading } from '../lorawan-ingest/lorawan.model.js';
import { peopleWithLoraDevices } from './person.service.js';

export interface KnownLoraDevice {
  deviceId: string;
  /**
   * `reading` — the backend has actually received uplinks from it.
   * `manual` — registered against a person for hardware that hasn't reported
   * yet, so it would otherwise be invisible here.
   */
  source: 'reading' | 'manual';
  lastSeenAt: string | null;
  readingCount: number;
  assignedTo: { personId: string; personName: string; active: boolean } | null;
}

/**
 * Every LoRa device id an admin could pick from, and whether it's taken.
 *
 * The list is the union of devices seen in real uplinks and devices already
 * assigned to somebody. Both matter: assigning from readings is the normal
 * path, but a manually registered id that has never reported would vanish
 * from the picker if only readings were listed.
 */
export async function listKnownLoraDevices(): Promise<KnownLoraDevice[]> {
  const [seen, assignedPeople] = await Promise.all([
    DeviceReading.aggregate<{ _id: string; lastSeenAt: Date; readingCount: number }>([
      { $group: { _id: '$deviceId', lastSeenAt: { $max: '$receivedAt' }, readingCount: { $sum: 1 } } },
      { $sort: { lastSeenAt: -1 } },
    ]),
    peopleWithLoraDevices(),
  ]);

  const assignmentByDevice = new Map(
    assignedPeople
      .filter((person) => typeof person.loraDeviceId === 'string')
      .map((person) => [
        person.loraDeviceId as string,
        { personId: String(person._id), personName: person.name, active: person.active },
      ]),
  );

  const devices: KnownLoraDevice[] = seen.map((row) => ({
    deviceId: row._id,
    source: 'reading',
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
    readingCount: row.readingCount,
    assignedTo: assignmentByDevice.get(row._id) ?? null,
  }));

  const seenIds = new Set(devices.map((device) => device.deviceId));
  for (const [deviceId, assignedTo] of assignmentByDevice) {
    if (seenIds.has(deviceId)) continue;
    devices.push({ deviceId, source: 'manual', lastSeenAt: null, readingCount: 0, assignedTo });
  }

  return devices;
}
