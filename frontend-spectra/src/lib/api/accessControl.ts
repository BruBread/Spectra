import type {
  AccessRole,
  ActionKey,
  ActionRule,
  IdentityState,
  LoraDevice,
  Person,
  PersonRoleRef,
  PolicyDecision,
  PolicyDecisionOutcome,
  RolePermissions,
  RestrictedZone,
  ZoneRect,
} from '../accessControl/types';
import type { ApiResult } from './client';
import { request } from './client';

type Raw = Record<string, unknown>;

function id(raw: Raw): string {
  return String(raw._id ?? raw.id);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

/* ---------------------------------- roles ---------------------------------- */

function normalizePermissions(raw: unknown): RolePermissions {
  const permissions = (raw ?? {}) as { actions?: unknown };
  const actions = Array.isArray(permissions.actions) ? permissions.actions : [];
  return {
    actions: actions.map((entry) => {
      const rule = entry as { action?: unknown; zoneId?: unknown; rule?: unknown };
      return {
        action: String(rule.action) as ActionKey,
        zoneId: rule.zoneId ? String(rule.zoneId) : null,
        rule: rule.rule === 'allow' ? 'allow' : 'restrict',
      };
    }),
  };
}

function normalizeRole(raw: Raw): AccessRole {
  return {
    id: id(raw),
    key: String(raw.key),
    name: String(raw.name),
    description: typeof raw.description === 'string' ? raw.description : '',
    active: Boolean(raw.active),
    permissions: normalizePermissions(raw.permissions),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  };
}

export async function fetchRoles(params: { active?: boolean } = {}): Promise<ApiResult<AccessRole[]>> {
  const search = new URLSearchParams();
  if (params.active !== undefined) search.set('active', String(params.active));
  const query = search.toString();
  const result = await request<Raw[]>(`/api/roles${query ? `?${query}` : ''}`);
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error, unauthorized: result.unauthorized };
  return { data: result.data.map(normalizeRole), ok: true };
}

export interface NewRoleInput {
  key: string;
  name: string;
  description?: string;
}

export async function createRole(input: NewRoleInput): Promise<ApiResult<AccessRole>> {
  const result = await request<Raw>('/api/roles', { method: 'POST', body: JSON.stringify(input) });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeRole(result.data), ok: true };
}

/**
 * `key` is intentionally absent: the backend rejects any attempt to change it,
 * because recorded policy decisions refer to a role by key.
 *
 * When `permissions` is sent it replaces the stored rule set wholesale, so
 * callers must pass every rule the role should keep — see
 * updateRoleZonePermissions.
 */
export async function updateRole(
  roleId: string,
  updates: Partial<{ name: string; description: string; active: boolean; permissions: RolePermissions }>,
): Promise<ApiResult<AccessRole>> {
  const result = await request<Raw>(`/api/roles/${roleId}`, { method: 'PATCH', body: JSON.stringify(updates) });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeRole(result.data), ok: true };
}

/**
 * Changes only the role's restricted-area rules, carrying every other rule
 * through untouched.
 *
 * The backend replaces the rule set as a whole, so anything not sent is
 * dropped. Rules for actions this UI has no control for — a `possible_weapon`
 * exemption carried over by the migration, say — must survive an unrelated
 * zone edit rather than vanish invisibly.
 */
export function updateRoleZonePermissions(role: AccessRole, zoneRules: ActionRule[]): Promise<ApiResult<AccessRole>> {
  const others = role.permissions.actions.filter((rule) => rule.action !== 'restricted_area');
  return updateRole(role.id, { permissions: { actions: [...others, ...zoneRules] } });
}

/** Refused with 409 while any person or recorded decision still refers to the role. */
export function deleteRole(roleId: string): Promise<ApiResult<null>> {
  return request<null>(`/api/roles/${roleId}`, { method: 'DELETE' });
}

/* ---------------------------------- people ---------------------------------- */

function normalizeRoleRef(raw: unknown): PersonRoleRef | null {
  // Populated by the backend. A plain id string means the referenced role no
  // longer resolves, which the UI must show rather than invent a name for.
  if (!raw || typeof raw !== 'object') return null;
  const role = raw as Raw;
  if (role.key === undefined) return null;
  return { id: id(role), key: String(role.key), name: String(role.name), active: Boolean(role.active) };
}

function normalizePerson(raw: Raw): Person {
  return {
    id: id(raw),
    name: String(raw.name),
    role: normalizeRoleRef(raw.roleId),
    active: Boolean(raw.active),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    aprilTagId: optionalNumber(raw.aprilTagId),
    loraDeviceId: optionalString(raw.loraDeviceId),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  };
}

export interface PeopleQuery {
  active?: boolean;
  roleId?: string;
  /** Case-insensitive name search, applied by the backend. */
  q?: string;
}

export async function fetchPeople(params: PeopleQuery = {}): Promise<ApiResult<Person[]>> {
  const search = new URLSearchParams();
  if (params.active !== undefined) search.set('active', String(params.active));
  if (params.roleId) search.set('roleId', params.roleId);
  if (params.q) search.set('q', params.q);
  const query = search.toString();
  const result = await request<Raw[]>(`/api/people${query ? `?${query}` : ''}`);
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error, unauthorized: result.unauthorized };
  return { data: result.data.map(normalizePerson), ok: true };
}

export interface PersonInput {
  name: string;
  roleId: string;
  notes?: string;
  /** null clears the credential; the backend leaves an omitted field untouched. */
  aprilTagId?: number | null;
  loraDeviceId?: string | null;
  active?: boolean;
}

export async function createPerson(input: PersonInput): Promise<ApiResult<Person>> {
  const result = await request<Raw>('/api/people', { method: 'POST', body: JSON.stringify(input) });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizePerson(result.data), ok: true };
}

/** Covers editing, role reassignment and deactivation. People are never deleted. */
export async function updatePerson(personId: string, updates: Partial<PersonInput>): Promise<ApiResult<Person>> {
  const result = await request<Raw>(`/api/people/${personId}`, { method: 'PATCH', body: JSON.stringify(updates) });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizePerson(result.data), ok: true };
}

/* ------------------------------- lora devices ------------------------------- */

function normalizeLoraDevice(raw: Raw): LoraDevice {
  const assigned = raw.assignedTo as Raw | null;
  return {
    deviceId: String(raw.deviceId),
    source: raw.source === 'manual' ? 'manual' : 'reading',
    lastSeenAt: optionalString(raw.lastSeenAt),
    readingCount: Number(raw.readingCount ?? 0),
    assignedTo: assigned
      ? { personId: String(assigned.personId), personName: String(assigned.personName), active: Boolean(assigned.active) }
      : null,
  };
}

/** The union of devices seen in real uplinks and devices already assigned. */
export async function fetchLoraDevices(): Promise<ApiResult<LoraDevice[]>> {
  const result = await request<Raw[]>('/api/lora-devices');
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error, unauthorized: result.unauthorized };
  return { data: result.data.map(normalizeLoraDevice), ok: true };
}

/* ---------------------------------- zones ----------------------------------- */

function normalizeZone(raw: Raw): RestrictedZone {
  const rect = (raw.rect ?? {}) as Raw;
  return {
    id: id(raw),
    name: String(raw.name),
    cameraId: String(raw.cameraId),
    rect: {
      x: Number(rect.x ?? 0),
      y: Number(rect.y ?? 0),
      width: Number(rect.width ?? 0),
      height: Number(rect.height ?? 0),
    },
    active: Boolean(raw.active),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  };
}

export async function fetchZones(params: { cameraId?: string; active?: boolean } = {}): Promise<ApiResult<RestrictedZone[]>> {
  const search = new URLSearchParams();
  if (params.cameraId) search.set('cameraId', params.cameraId);
  if (params.active !== undefined) search.set('active', String(params.active));
  const query = search.toString();
  const result = await request<Raw[]>(`/api/zones${query ? `?${query}` : ''}`);
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error, unauthorized: result.unauthorized };
  return { data: result.data.map(normalizeZone), ok: true };
}

export async function createZone(input: { name: string; cameraId: string; rect: ZoneRect }): Promise<ApiResult<RestrictedZone>> {
  const result = await request<Raw>('/api/zones', { method: 'POST', body: JSON.stringify(input) });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeZone(result.data), ok: true };
}

/** `cameraId` is absent by design: the backend refuses to move a zone between cameras. */
export async function updateZone(
  zoneId: string,
  updates: Partial<{ name: string; rect: ZoneRect; active: boolean }>,
): Promise<ApiResult<RestrictedZone>> {
  const result = await request<Raw>(`/api/zones/${zoneId}`, { method: 'PATCH', body: JSON.stringify(updates) });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeZone(result.data), ok: true };
}

/** Refused with 409 once a recorded decision names the zone — archive it instead. */
export function deleteZone(zoneId: string): Promise<ApiResult<null>> {
  return request<null>(`/api/zones/${zoneId}`, { method: 'DELETE' });
}

/* ------------------------------ policy decisions ----------------------------- */

function normalizeDecision(raw: Raw): PolicyDecision {
  return {
    id: id(raw),
    detectionType: String(raw.detectionType),
    cameraId: String(raw.cameraId),
    zoneId: optionalString(raw.zoneId),
    zoneName: optionalString(raw.zoneName),
    identityState: raw.identityState === 'identified' ? 'identified' : 'unidentified',
    personId: optionalString(raw.personId),
    personName: optionalString(raw.personName),
    roleKey: optionalString(raw.roleKey),
    aprilTagId: optionalNumber(raw.aprilTagId),
    loraDeviceId: optionalString(raw.loraDeviceId),
    loraCorroborated: Boolean(raw.loraCorroborated),
    decision: raw.decision === 'suppressed' ? 'suppressed' : 'alert_created',
    reason: String(raw.reason ?? ''),
    roleZoneAllowed: typeof raw.roleZoneAllowed === 'boolean' ? raw.roleZoneAllowed : null,
    weaponExemptApplied: typeof raw.weaponExemptApplied === 'boolean' ? raw.weaponExemptApplied : null,
    alertId: optionalString(raw.alertId),
    createdAt: String(raw.createdAt ?? ''),
  };
}

export interface PolicyDecisionQuery {
  decision?: PolicyDecisionOutcome;
  identityState?: IdentityState;
  detectionType?: string;
  cameraId?: string;
  limit?: number;
}

/**
 * Read-only. The API exposes no create, update or delete route at all — an
 * audit trail that can be rewritten is not an audit trail.
 */
export async function fetchPolicyDecisions(params: PolicyDecisionQuery = {}): Promise<ApiResult<PolicyDecision[]>> {
  const search = new URLSearchParams();
  if (params.decision) search.set('decision', params.decision);
  if (params.identityState) search.set('identityState', params.identityState);
  if (params.detectionType) search.set('detectionType', params.detectionType);
  if (params.cameraId) search.set('cameraId', params.cameraId);
  search.set('limit', String(params.limit ?? 100));

  const result = await request<Raw[]>(`/api/policy-decisions?${search.toString()}`);
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error, unauthorized: result.unauthorized };
  return { data: result.data.map(normalizeDecision), ok: true };
}
