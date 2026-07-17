import type { DeviceReading } from '../types';
import { generateMockReadings } from '../mock/readings';

export interface FetchReadingsResult {
  readings: DeviceReading[];
  source: 'live' | 'mock';
}

interface FetchReadingsParams {
  deviceId?: string;
  limit?: number;
}

/**
 * Attempts to load real uplink readings from the backend's lorawan-ingest
 * endpoint. Falls back to demo data whenever the API base URL isn't
 * configured, the request fails, or the response is empty — the dashboard
 * must always have something to render.
 */
export async function fetchDeviceReadings(params: FetchReadingsParams = {}): Promise<FetchReadingsResult> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    return { readings: generateMockReadings(), source: 'mock' };
  }

  try {
    const url = new URL('/api/lorawan/readings', baseUrl);
    if (params.deviceId) url.searchParams.set('deviceId', params.deviceId);
    url.searchParams.set('limit', String(params.limit ?? 10));

    const response = await fetch(url.toString(), {
      cache: 'no-store',
      // Readings now require a session; without the cookie this 401s and the
      // panel falls back to demo data.
      credentials: 'include',
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      return { readings: generateMockReadings(), source: 'mock' };
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      return { readings: generateMockReadings(), source: 'mock' };
    }

    return { readings: data as DeviceReading[], source: 'live' };
  } catch {
    return { readings: generateMockReadings(), source: 'mock' };
  }
}
