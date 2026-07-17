import type { DeviceReading } from '../types';
import { request } from './client';

/**
 * `empty` and `error` are kept distinct on purpose: "no uplinks recorded yet"
 * and "we couldn't reach the backend" are different facts, and the panel must
 * not present one as the other.
 */
export type ReadingsStatus = 'ok' | 'empty' | 'error';

export interface FetchReadingsResult {
  readings: DeviceReading[];
  status: ReadingsStatus;
  error?: string;
}

interface FetchReadingsParams {
  deviceId?: string;
  limit?: number;
}

/**
 * Loads real uplink readings from the backend's lorawan-ingest endpoint.
 *
 * This used to fall back to generated demo readings whenever the API was
 * unreachable or empty, which meant the dashboard could show invented device
 * traffic. It no longer invents anything: callers get the real rows, or an
 * honest empty/error status.
 */
export async function fetchDeviceReadings(params: FetchReadingsParams = {}): Promise<FetchReadingsResult> {
  const search = new URLSearchParams();
  if (params.deviceId) search.set('deviceId', params.deviceId);
  search.set('limit', String(params.limit ?? 10));

  const result = await request<DeviceReading[]>(`/api/lorawan/readings?${search.toString()}`);

  if (!result.ok || !result.data) {
    return { readings: [], status: 'error', error: result.error ?? 'Could not reach the backend.' };
  }

  return { readings: result.data, status: result.data.length === 0 ? 'empty' : 'ok' };
}
