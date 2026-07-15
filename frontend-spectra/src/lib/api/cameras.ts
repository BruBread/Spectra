import type { CameraRecord, NewCameraInput } from '../cameras/types';
import type { ApiResult } from './vision';

function apiBase(): string | null {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? null;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const base = apiBase();
  if (!base) {
    return { data: null, ok: false, error: 'NEXT_PUBLIC_API_BASE_URL is not configured.' };
  }

  try {
    const response = await fetch(new URL(path, base).toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { data: null, ok: false, error: body?.error ?? `Request failed (${response.status})` };
    }

    if (response.status === 204) {
      return { data: null, ok: true };
    }

    const data = (await response.json()) as T;
    return { data, ok: true };
  } catch (error) {
    return { data: null, ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

function normalizeCamera(raw: Record<string, unknown>): CameraRecord {
  return {
    id: String(raw._id ?? raw.id),
    name: String(raw.name),
    location: String(raw.location ?? ''),
    zone: String(raw.zone ?? ''),
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
