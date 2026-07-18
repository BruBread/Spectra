/**
 * Frontend mirrors of the backend identity/zone/policy models.
 *
 * These describe people a camera may observe — deliberately separate from the
 * admin-console `AuthUser`/`AdminRole` in lib/types.ts, which describes who
 * operates the software.
 */

/** Mirrors the backend's code-defined action catalog keys. */
export type ActionKey = 'restricted_area' | 'possible_weapon' | 'unattended_object';

export type PolicyRule = 'allow' | 'restrict';

export const POLICY_RULES: PolicyRule[] = ['allow', 'restrict'];

export const RULE_LABELS: Record<PolicyRule, string> = {
  allow: 'Allow',
  restrict: 'Restrict',
};

/**
 * One explicit rule. A rule that isn't written restricts — absence is not
 * permission.
 */
export interface ActionRule {
  action: ActionKey;
  /** Set for a zone-scoped action; null for a global one. */
  zoneId: string | null;
  rule: PolicyRule;
}

/**
 * One entry from the backend's code-defined Action Catalog, served by
 * `GET /api/action-catalog`. Rendered as-is — the UI never invents an action,
 * its label, its reason for being unconfigurable, or whether it is enforced.
 */
export interface ActionDefinition {
  key: ActionKey;
  label: string;
  description: string;
  /** `zone` — one rule per named zone. `global` — a single rule for the action. */
  scope: 'zone' | 'global';
  detector: 'live' | 'planned';
  /** Whether an admin may write a rule for it. */
  configurable: boolean;
  /** Why not — rendered verbatim. */
  unconfigurableReason?: string;
  /** Whether the backend actually applies the rule today. */
  policyEnforced: boolean;
  requiresSnapshot: boolean;
  defaultSeverity: 'info' | 'warning' | 'critical';
}

export const ACTION_LABELS: Record<ActionKey, string> = {
  restricted_area: 'Restricted area',
  possible_weapon: 'Possible weapon',
  unattended_object: 'Unattended object',
};

export interface RolePermissions {
  actions: ActionRule[];
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

/** Policy for people the cameras cannot identify — `GET/PUT /api/unidentified-policy`. */
export interface UnidentifiedPolicy {
  subject: 'unidentified_person';
  /** Always `restrict`; surfaced so the UI never hard-codes the default. */
  defaultRule: PolicyRule;
  rules: ActionRule[];
  updatedAt: string | null;
}

export type PolicyDecisionOutcome = 'alert_created' | 'suppressed';

/** Who a decision was about: a specific identified person, or the reserved subject. */
export type PolicySubject = 'person' | 'unidentified_person';

/** Where the applied rule came from. `default` means nobody wrote one. */
export type PolicyRuleSource = 'role' | 'unidentified_policy' | 'default';

/** Why nobody could be identified. */
export type UnidentifiedReason =
  | 'no_apriltag'
  | 'unregistered_apriltag'
  | 'ambiguous_apriltag'
  | 'inactive_person'
  | 'inactive_role';

export interface PolicyDecision {
  id: string;
  action: ActionKey;
  cameraId: string;
  zoneId: string | null;
  zoneName: string | null;
  subject: PolicySubject;
  unidentifiedReason: UnidentifiedReason | null;
  personId: string | null;
  personName: string | null;
  roleKey: string | null;
  aprilTagId: number | null;
  loraDeviceId: string | null;
  loraCorroborated: boolean;
  ruleApplied: PolicyRule;
  ruleSource: PolicyRuleSource;
  decision: PolicyDecisionOutcome;
  reason: string;
  alertId: string | null;
  createdAt: string;
}

export const DECISION_LABELS: Record<PolicyDecisionOutcome, string> = {
  alert_created: 'Alert created',
  suppressed: 'Suppressed',
};

export const SUBJECT_LABELS: Record<PolicySubject, string> = {
  person: 'Identified person',
  unidentified_person: 'Unidentified',
};

export const RULE_SOURCE_LABELS: Record<PolicyRuleSource, string> = {
  role: 'Role rule',
  unidentified_policy: 'Unidentified policy',
  default: 'Default (restrict)',
};

export const UNIDENTIFIED_REASON_LABELS: Record<UnidentifiedReason, string> = {
  no_apriltag: 'No readable AprilTag',
  unregistered_apriltag: 'AprilTag not registered',
  ambiguous_apriltag: 'Ambiguous AprilTag',
  inactive_person: 'Person deactivated',
  inactive_role: 'Role deactivated',
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
