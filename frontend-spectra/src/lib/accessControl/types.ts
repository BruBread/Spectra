/**
 * Frontend mirrors of the backend identity/zone/policy models.
 *
 * These describe people a camera may observe — deliberately separate from the
 * admin-console `AuthUser`/`AdminRole` in lib/types.ts, which describes who
 * operates the software.
 */

export interface RoleZoneAccess {
  zoneId: string;
  allowed: boolean;
}

export interface RolePermissions {
  /**
   * Whether a possible-weapon detection may be suppressed for this role.
   *
   * There is no control for this in the UI: nothing enforces it yet, so a
   * toggle would imply an effect that does not exist. It is still carried on
   * every update, because the backend replaces `permissions` wholesale and
   * omitting it would silently reset a permission we chose not to show.
   */
  weaponExempt: boolean;
  /** Per-zone allow/deny. A zone absent from this list is denied. */
  zones: RoleZoneAccess[];
}

export interface AccessRole {
  id: string;
  /** Stable machine name. Immutable — recorded decisions refer to it. */
  key: string;
  name: string;
  description: string;
  active: boolean;
  permissions: RolePermissions;
  createdAt: string;
  updatedAt: string;
}

/** The role as embedded in a person record by the backend's populate(). */
export interface PersonRoleRef {
  id: string;
  key: string;
  name: string;
  active: boolean;
}

export interface Person {
  id: string;
  name: string;
  role: PersonRoleRef | null;
  active: boolean;
  notes: string;
  /** The camera-visible credential. Null when the person has no badge. */
  aprilTagId: number | null;
  /** Corroboration only — never identity. Null when unassigned. */
  loraDeviceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoraDevice {
  deviceId: string;
  /** `reading` — real uplinks received. `manual` — registered against a person, never heard from. */
  source: 'reading' | 'manual';
  lastSeenAt: string | null;
  readingCount: number;
  assignedTo: { personId: string; personName: string; active: boolean } | null;
}

export interface ZoneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RestrictedZone {
  id: string;
  name: string;
  /** Immutable — a rectangle only means something on its own camera's frame. */
  cameraId: string;
  rect: ZoneRect;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type IdentityState = 'identified' | 'unidentified';
export type PolicyDecisionOutcome = 'alert_created' | 'suppressed';

export interface PolicyDecision {
  id: string;
  detectionType: string;
  cameraId: string;
  zoneId: string | null;
  zoneName: string | null;
  identityState: IdentityState;
  personId: string | null;
  personName: string | null;
  roleKey: string | null;
  aprilTagId: number | null;
  loraDeviceId: string | null;
  loraCorroborated: boolean;
  decision: PolicyDecisionOutcome;
  reason: string;
  roleZoneAllowed: boolean | null;
  weaponExemptApplied: boolean | null;
  alertId: string | null;
  createdAt: string;
}

export const IDENTITY_STATE_LABELS: Record<IdentityState, string> = {
  identified: 'Identified',
  unidentified: 'Unidentified',
};

export const DECISION_LABELS: Record<PolicyDecisionOutcome, string> = {
  alert_created: 'Alert created',
  suppressed: 'Suppressed',
};

/* -------------------------------- credentials ------------------------------- */

export type CredentialState = 'both' | 'apriltag_only' | 'lora_only' | 'none';

export function credentialState(person: Pick<Person, 'aprilTagId' | 'loraDeviceId'>): CredentialState {
  const tag = person.aprilTagId !== null;
  const lora = person.loraDeviceId !== null;
  if (tag && lora) return 'both';
  if (tag) return 'apriltag_only';
  if (lora) return 'lora_only';
  return 'none';
}

/**
 * What each combination actually means for recognition.
 *
 * Only a readable, registered AprilTag identifies somebody in a frame. A LoRa
 * device says a registered wristband is active nearby — it can corroborate,
 * but it can never name the body in the picture, so a person carrying only a
 * LoRa device is unidentified to a camera.
 */
export const CREDENTIAL_MEANING: Record<CredentialState, string> = {
  both: 'Recognizable by camera via AprilTag. The LoRa device corroborates activity only.',
  apriltag_only: 'Recognizable by camera via AprilTag. No wristband activity to corroborate.',
  lora_only: 'Not recognizable by camera. A LoRa device alone never identifies a person or grants permissions.',
  none: 'Not recognizable by camera. This person is unidentified in every frame.',
};

export const CREDENTIAL_LABELS: Record<CredentialState, string> = {
  both: 'AprilTag + LoRa',
  apriltag_only: 'AprilTag only',
  lora_only: 'LoRa only',
  none: 'No credentials',
};
