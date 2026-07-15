import type { DeviceReading } from '../types';
import { MOCK_ANCHOR } from './constants';

/**
 * Used only as a fallback when NEXT_PUBLIC_API_BASE_URL is unset, the
 * backend is unreachable, or it returns no readings.
 */
export function generateMockReadings(): DeviceReading[] {
  const entries: Array<Omit<DeviceReading, 'receivedAt'> & { minutesAgo: number }> = [
    {
      provider: 'ttn',
      deviceId: 'sensor-01',
      devEui: '0004A30B001C0530',
      applicationId: 'spectra-app',
      fPort: 2,
      fCnt: 118,
      payloadDecoded: { temperature: 21.4, humidity: 55 },
      rssi: -87,
      snr: 7.2,
      minutesAgo: 4,
    },
    {
      provider: 'chirpstack',
      deviceId: 'sensor-02',
      devEui: '70B3D57ED0056A2C',
      applicationId: 'spectra-app',
      fPort: 5,
      fCnt: 42,
      payloadDecoded: { battery: 3.6 },
      rssi: -80,
      snr: 9.1,
      minutesAgo: 12,
    },
    {
      provider: 'ttn',
      deviceId: 'wearable-wr-104',
      devEui: '0004A30B00220A11',
      applicationId: 'spectra-app',
      fPort: 1,
      fCnt: 305,
      payloadDecoded: { motion: true, zone: 'Zone A' },
      rssi: -92,
      snr: 5.8,
      minutesAgo: 21,
    },
  ];

  return entries.map(({ minutesAgo, ...rest }) => ({
    ...rest,
    receivedAt: new Date(MOCK_ANCHOR - minutesAgo * 60_000).toISOString(),
  }));
}
