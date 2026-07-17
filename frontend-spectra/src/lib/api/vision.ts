import type { AprilTagMapping, DetectionType, NewVisionAlert, VisionAlert, VisionSettings } from '../vision/types';
import type { ApiResult } from './client';
import { request } from './client';

// Re-exported for the modules that already import ApiResult from here.
export type { ApiResult };

function normalizeMapping(raw: Record<string, unknown>): AprilTagMapping {
  return {
    id: String(raw._id ?? raw.id),
    tagId: Number(raw.tagId),
    label: String(raw.label),
    loraDeviceId: String(raw.loraDeviceId),
    notes: raw.notes ? String(raw.notes) : undefined,
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  };
}

function normalizeAlert(raw: Record<string, unknown>): VisionAlert {
  return {
    id: String(raw._id ?? raw.id),
    cameraId: String(raw.cameraId),
    type: raw.type as DetectionType,
    confidence: Number(raw.confidence),
    message: String(raw.message),
    snapshot: (raw.snapshot as string | null) ?? null,
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    acknowledged: Boolean(raw.acknowledged),
    createdAt: String(raw.createdAt ?? ''),
  };
}

export async function fetchVisionSettings(cameraId: string): Promise<ApiResult<VisionSettings>> {
  return request<VisionSettings>(`/api/vision/settings?cameraId=${encodeURIComponent(cameraId)}`);
}

export async function updateVisionSettings(settings: VisionSettings): Promise<ApiResult<VisionSettings>> {
  return request<VisionSettings>('/api/vision/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function fetchAprilTagMappings(): Promise<ApiResult<AprilTagMapping[]>> {
  const result = await request<Record<string, unknown>[]>('/api/vision/apriltag-mappings');
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: result.data.map(normalizeMapping), ok: true };
}

export async function createAprilTagMapping(input: {
  tagId: number;
  label: string;
  loraDeviceId: string;
  notes?: string;
}): Promise<ApiResult<AprilTagMapping>> {
  const result = await request<Record<string, unknown>>('/api/vision/apriltag-mappings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeMapping(result.data), ok: true };
}

export async function updateAprilTagMapping(
  id: string,
  input: Partial<{ label: string; loraDeviceId: string; notes: string }>,
): Promise<ApiResult<AprilTagMapping>> {
  const result = await request<Record<string, unknown>>(`/api/vision/apriltag-mappings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeMapping(result.data), ok: true };
}

export async function deleteAprilTagMapping(id: string): Promise<ApiResult<null>> {
  return request<null>(`/api/vision/apriltag-mappings/${id}`, { method: 'DELETE' });
}

export async function fetchAlerts(params: {
  cameraId?: string;
  type?: DetectionType;
  limit?: number;
}): Promise<ApiResult<VisionAlert[]>> {
  const search = new URLSearchParams();
  if (params.cameraId) search.set('cameraId', params.cameraId);
  if (params.type) search.set('type', params.type);
  search.set('limit', String(params.limit ?? 50));

  const result = await request<Record<string, unknown>[]>(`/api/vision/alerts?${search.toString()}`);
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: result.data.map(normalizeAlert), ok: true };
}

/** Mirrors the backend's `GET /api/vision/alerts/counts` response. */
export interface AlertCounts {
  unread: number;
  criticalOpen: number;
  new: number;
}

export function fetchAlertCounts(): Promise<ApiResult<AlertCounts>> {
  return request<AlertCounts>('/api/vision/alerts/counts');
}

export async function createAlert(input: NewVisionAlert): Promise<ApiResult<VisionAlert>> {
  const result = await request<Record<string, unknown>>('/api/vision/alerts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeAlert(result.data), ok: true };
}

export async function acknowledgeAlert(id: string): Promise<ApiResult<VisionAlert>> {
  const result = await request<Record<string, unknown>>(`/api/vision/alerts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ acknowledged: true }),
  });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeAlert(result.data), ok: true };
}
