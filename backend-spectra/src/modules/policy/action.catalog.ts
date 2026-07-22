import type { AlertSeverity } from '../vision/vision.types.js';

/**
 * The actions policy can be written about.
 *
 * Code-defined and closed on purpose: there is no create route and no
 * admin-writable catalog collection. An action carries detection behaviour,
 * severity, evidence requirements and policy semantics, none of which can be
 * expressed by an administrator typing a name into a form. New actions ship
 * in code, reviewed and tested.
 */
export type ActionKey = 'restricted_area' | 'possible_weapon' | 'unattended_object';

export const ACTION_KEYS: ActionKey[] = ['restricted_area', 'possible_weapon', 'unattended_object'];

export type PolicyRule = 'allow' | 'restrict';

export const POLICY_RULES: PolicyRule[] = ['allow', 'restrict'];

/**
 * What applies when no rule is written.
 *
 * Absence is never permission: a missing rule, an unconfigured zone and an
 * unknown subject all restrict.
 */
export const DEFAULT_RULE: PolicyRule = 'restrict';

/** Where a rule came from, recorded on every decision. */
export type RuleSource = 'role' | 'unidentified_policy' | 'default';

export const RULE_SOURCES: RuleSource[] = ['role', 'unidentified_policy', 'default'];

export interface ActionDefinition {
  key: ActionKey;
  label: string;
  description: string;
  /** `zone` — one rule per named zone. `global` — a single rule for the action. */
  scope: 'zone' | 'global';
  /** Whether a detector exists that can produce this action today. */
  detector: 'live' | 'planned';
  /** Whether an administrator may write a rule for this action. */
  configurable: boolean;
  /** Why not. Rendered verbatim by the UI, which never invents this text. */
  unconfigurableReason?: string;
  /** Whether the backend actually applies allow/restrict to it today. */
  policyEnforced: boolean;
  /** Evidence an alert for this action must carry. */
  requiresSnapshot: boolean;
  defaultSeverity: AlertSeverity;
}

/**
 * `detector`, `configurable` and `policyEnforced` are three separate facts
 * because the actions below occupy three different combinations of them.
 * Collapsing them into one "status" would force a lie about at least one
 * action — most importantly it is what lets `restricted_area` be configured
 * before it is enforced, and lets the UI say so for exactly as long as it is
 * true.
 */
export const ACTION_CATALOG: readonly ActionDefinition[] = Object.freeze([
  {
    key: 'restricted_area',
    label: 'Restricted area',
    description:
      'A tracked person has walked into a named restricted zone. Rules are written per zone. An allowed rule requires a readable, registered AprilTag identifying the person; anyone the camera cannot identify is treated by the unidentified-person policy.',
    scope: 'zone',
    // Live and enforced as of Phase 3C: a confirmed entry is evaluated
    // server-side against per-zone role rules and the unidentified-person
    // policy, and either alerts or is suppressed and audited.
    detector: 'live',
    configurable: true,
    policyEnforced: true,
    requiresSnapshot: true,
    defaultSeverity: 'warning',
  },
  {
    key: 'possible_weapon',
    label: 'Possible weapon',
    description:
      'A possible weapon is held by a person. The browser proposes candidate boxes; the server resolves the holder from their AprilTag and applies this rule. It flags possibilities for a human to review and never confirms a weapon. An allowed rule requires a readable, registered AprilTag identifying the holder; anyone the camera cannot identify is treated by the unidentified-person policy and alerts.',
    scope: 'global',
    // Live and enforced as of weapon Phase 3C: a confirmed candidate is
    // evaluated server-side (weapon.service) against the holder's role and the
    // unidentified-person policy — an allowed guard is suppressed and audited,
    // everyone else raises a critical alert.
    detector: 'live',
    configurable: true,
    policyEnforced: true,
    requiresSnapshot: true,
    defaultSeverity: 'critical',
  },
  {
    key: 'unattended_object',
    label: 'Unattended object',
    description: 'A bag-like object has been left stationary with no person nearby for the configured duration.',
    scope: 'global',
    detector: 'live',
    configurable: false,
    unconfigurableReason:
      'Always alerts, regardless of role: once the person who left an object walks away, ownership cannot be established from a camera frame, so no role can be trusted to excuse it.',
    policyEnforced: false,
    requiresSnapshot: true,
    defaultSeverity: 'warning',
  },
]);

export function isActionKey(value: unknown): value is ActionKey {
  return typeof value === 'string' && (ACTION_KEYS as string[]).includes(value);
}

export function findAction(key: string): ActionDefinition | undefined {
  return ACTION_CATALOG.find((action) => action.key === key);
}

/** The actions an administrator may currently write a rule for. */
export function configurableActions(): ActionDefinition[] {
  return ACTION_CATALOG.filter((action) => action.configurable);
}

/**
 * One rule. Shared by role permissions and the unidentified-person policy, so
 * both are read and validated the same way.
 */
export interface ActionRule {
  action: ActionKey;
  /** Required for a `zone`-scoped action; null for a `global` one. */
  zoneId: string | null;
  rule: PolicyRule;
}

/** The rule an administrator explicitly wrote, if any. */
export function findRule(rules: ActionRule[], action: ActionKey, zoneId: string | null): ActionRule | undefined {
  return rules.find((entry) => entry.action === action && String(entry.zoneId ?? '') === String(zoneId ?? ''));
}

/**
 * The rule that applies — the written one, or `restrict`.
 *
 * Callers distinguish the two by checking findRule() themselves, because a
 * decision has to record whether a human wrote the rule or the default caught
 * it.
 */
export function resolveRule(rules: ActionRule[], action: ActionKey, zoneId: string | null): PolicyRule {
  return findRule(rules, action, zoneId)?.rule ?? DEFAULT_RULE;
}
