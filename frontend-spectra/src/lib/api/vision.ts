import type {
  AlertSeverity,
  AlertStatus,
  AnyDetectionType,
  DetectionType,
  NewVisionAlert,
  RestrictedAreaObservation,
  VisionAlert,
  VisionSettings,
} from '../vision/types';
import type { ApiResult } from './client';
import { request } from './client';

// Re-exported for the modules that already import ApiResult from here.
export type { ApiResult };

function normalizeAlert(raw: Record<string, unknown>): VisionAlert {
  const createdAt = String(raw.createdAt ?? '');
  return {
    id: String(raw._id ?? raw.id),
    cameraId: String(raw.cameraId),
    type: raw.type as DetectionType,
    // Defaults mirror the backend schema's, so an alert written before a
    // field existed still renders rather than showing "undefined".
    severity: (raw.severity as AlertSeverity) ?? 'warning',
    status: (raw.status as AlertStatus) ?? 'new',
    read: Boolean(raw.read),
    zoneName: (raw.zoneName as string | null) ?? null,
    confidence: Number(raw.confidence),
    message: String(raw.message),
    snapshot: (raw.snapshot as string | null) ?? null,
    metadata: (raw.metadata as Record<string, unknown>) ?? {},
    occurrences: Number(raw.occurrences ?? 1),
    lastOccurredAt: String(raw.lastOccurredAt ?? createdAt),
    statusChangedAt: (raw.statusChangedAt as string | null) ?? null,
    acknowledged: Boolean(raw.acknowledged),
    createdAt,
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

export interface AlertQuery {
  cameraId?: string;
  /** Retired types are queryable: their alerts still exist. */
  type?: AnyDetectionType;
  severity?: AlertSeverity;
  /** Multiple statuses are sent comma-separated, which the backend accepts. */
  status?: AlertStatus[];
  zoneName?: string;
  read?: boolean;
  /** ISO instants, filtered against createdAt. */
  from?: string;
  to?: string;
  limit?: number;
}

/**
 * Filtering happens on the backend — every parameter here maps to one the
 * alerts endpoint already supports, so the list never lies by filtering a
 * truncated page client-side.
 */
export async function fetchAlerts(params: AlertQuery): Promise<ApiResult<VisionAlert[]>> {
  const search = new URLSearchParams();
  if (params.cameraId) search.set('cameraId', params.cameraId);
  if (params.type) search.set('type', params.type);
  if (params.severity) search.set('severity', params.severity);
  if (params.status && params.status.length > 0) search.set('status', params.status.join(','));
  if (params.zoneName) search.set('zoneName', params.zoneName);
  if (params.read !== undefined) search.set('read', String(params.read));
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  search.set('limit', String(params.limit ?? 50));

  const result = await request<Record<string, unknown>[]>(`/api/vision/alerts?${search.toString()}`);
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: result.data.map(normalizeAlert), ok: true };
}

export async function updateAlertStatus(id: string, status: AlertStatus): Promise<ApiResult<VisionAlert>> {
  const result = await request<Record<string, unknown>>(`/api/vision/alerts/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeAlert(result.data), ok: true };
}

export async function markAlertRead(id: string, read = true): Promise<ApiResult<VisionAlert>> {
  const result = await request<Record<string, unknown>>(`/api/vision/alerts/${id}/read`, {
    method: 'PATCH',
    body: JSON.stringify({ read }),
  });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeAlert(result.data), ok: true };
}

export function markAllAlertsRead(): Promise<ApiResult<{ modified: number }>> {
  return request<{ modified: number }>('/api/vision/alerts/read-all', { method: 'POST' });
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

/** What the server decided about one observation. The browser only reports it — it never sets it. */
export interface ObservationResult {
  status: 'ignored' | 'evaluated';
  outcome?: 'alert_created' | 'suppressed';
  rejection?: string;
  decisionId?: string;
  alertId?: string;
  deduped?: boolean;
}

/**
 * Posts a restricted-area observation. The server does all identity resolution,
 * policy evaluation and suppression — this call carries CV facts and gets back
 * only what the server chose to do, which is never influenced by the client.
 */
export function postObservation(observation: RestrictedAreaObservation): Promise<ApiResult<ObservationResult>> {
  return request<ObservationResult>('/api/vision/observations', {
    method: 'POST',
    body: JSON.stringify(observation),
  });
}

export async function acknowledgeAlert(id: string): Promise<ApiResult<VisionAlert>> {
  const result = await request<Record<string, unknown>>(`/api/vision/alerts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ acknowledged: true }),
  });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeAlert(result.data), ok: true };
}
