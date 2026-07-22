import type { CameraRecord, NewCameraInput } from '../cameras/types';
import type { ApiResult } from './client';
import { request } from './client';

function normalizeCamera(raw: Record<string, unknown>): CameraRecord {
  return {
    id: String(raw._id ?? raw.id),
    name: String(raw.name),
    location: String(raw.location ?? ''),
    sourceType: raw.sourceType as CameraRecord['sourceType'],
    streamUrl: (raw.streamUrl as string | null) ?? null,
    preferredDeviceId: (raw.preferredDeviceId as string | null) ?? null,
    preferredDeviceLabel: (raw.preferredDeviceLabel as string | null) ?? null,
    detectionEnabled: Boolean(raw.detectionEnabled),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  };
}

export async function fetchCameras(): Promise<ApiResult<CameraRecord[]>> {
  const result = await request<Record<string, unknown>[]>('/api/cameras');
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: result.data.map(normalizeCamera), ok: true };
}

export async function createCamera(input: NewCameraInput): Promise<ApiResult<CameraRecord>> {
  const result = await request<Record<string, unknown>>('/api/cameras', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeCamera(result.data), ok: true };
}

export async function updateCamera(
  id: string,
  updates: Partial<NewCameraInput & { detectionEnabled: boolean }>,
): Promise<ApiResult<CameraRecord>> {
  const result = await request<Record<string, unknown>>(`/api/cameras/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeCamera(result.data), ok: true };
}

export async function deleteCamera(id: string): Promise<ApiResult<null>> {
  return request<null>(`/api/cameras/${id}`, { method: 'DELETE' });
}
