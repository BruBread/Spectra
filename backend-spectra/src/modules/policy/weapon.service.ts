import { DeviceReading } from '../lorawan-ingest/lorawan.model.js';
import { PolicyDecision } from './policy.model.js';
import { findRecentEpisodeDecision } from './policy.service.js';
import { getSettings, createPolicyAlert } from '../vision/vision.service.js';
import { findAction, findRule, resolveRule, type ActionRule, type PolicyRule, type RuleSource } from './action.catalog.js';
import { resolveIdentityFromTags, type IdentityResolution } from './identityResolution.service.js';
import { unidentifiedRules } from './unidentifiedPolicy.service.js';
import type { WeaponObservation, WeaponEvaluation, WeaponQualityRejection } from './weapon.types.js';

const ACTION = 'possible_weapon' as const;
/** possible_weapon is a global action — its rules carry no zone. */
const GLOBAL_ZONE: null = null;

/** How recent a LoRa uplink must be to count as corroboration — context only, never identity. */
const LORA_CORROBORATION_WINDOW_MS = 5 * 60 * 1000;

/**
 * The N-of-M confirmation count the server insists on, mirroring the browser's
 * gate. A client claiming fewer confirmations than this is dropped rather than
 * trusted — the server sets the floor, the client cannot lower it.
 */
const MIN_FRAMES_CONFIRMED = 3;

/** Person box is grown by this fraction so a gun at arm's length still counts as held. */
const HOLDER_BOX_MARGIN = 0.15;
/** Fraction of the weapon box that must lie inside the (grown) holder box. */
const HOLDER_CONTAINMENT = 0.25;
/** Fallback confidence floor if a camera has no weapon detector config. */
const DEFAULT_CONFIDENCE_THRESHOLD = 0.45;
const DEFAULT_COOLDOWN_SECONDS = 30;

type Box = [number, number, number, number];

function grow([x, y, w, h]: Box, fraction: number): Box {
  const dx = w * fraction;
  const dy = h * fraction;
  return [x - dx / 2, y - dy / 2, w + dx, h + dy];
}

/** Fraction of box `a` that lies inside box `b`. */
function containment(a: Box, b: Box): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area = a[2] * a[3];
  return area > 0 ? inter / area : 0;
}

/**
 * The quality gate the server can re-derive without a model.
 *
 * Confidence and confirmation count are floors the server enforces on the
 * client's own numbers; the holder check is re-derived from the two boxes, so a
 * client cannot claim a weapon is held when the geometry says otherwise. What
 * the server cannot re-derive — that a weapon is present at all — it trusts,
 * because there is no detector server-side; see WeaponObservation.
 */
function checkQuality(obs: WeaponObservation, confidenceThreshold: number): WeaponQualityRejection | null {
  if (obs.confidence < confidenceThreshold) return 'low_confidence';
  if (obs.framesConfirmed < MIN_FRAMES_CONFIRMED) return 'not_confirmed';
  if (containment(obs.weaponBox, grow(obs.personBox, HOLDER_BOX_MARGIN)) < HOLDER_CONTAINMENT) return 'not_held';
  return null;
}

/** A role's stored rules as plain ActionRule[], zone ids stringified. */
function roleActionRules(role: { permissions?: { actions?: unknown } } | null): ActionRule[] {
  const actions = (role?.permissions?.actions ?? []) as Array<{ action: string; zoneId: unknown; rule: string }>;
  return actions.map((entry) => ({
    action: entry.action as ActionRule['action'],
    zoneId: entry.zoneId ? String(entry.zoneId) : null,
    rule: entry.rule as PolicyRule,
  }));
}

interface ResolvedRule {
  rule: PolicyRule;
  source: RuleSource;
}

/**
 * The global possible_weapon rule for this subject, and where it came from.
 *
 * `source: 'default'` stays distinct from an administrator writing `restrict`,
 * so the decision records whether a human chose to let this person carry or the
 * restrict default caught them. An identified person is evaluated against their
 * role; anyone unidentified against the unidentified-person policy.
 */
async function resolveApplicableRule(identity: IdentityResolution): Promise<ResolvedRule> {
  if (identity.subject === 'person' && identity.role) {
    const rules = roleActionRules(identity.role);
    const written = findRule(rules, ACTION, GLOBAL_ZONE);
    return { rule: resolveRule(rules, ACTION, GLOBAL_ZONE), source: written ? 'role' : 'default' };
  }

  const rules = await unidentifiedRules();
  const written = findRule(rules, ACTION, GLOBAL_ZONE);
  return { rule: resolveRule(rules, ACTION, GLOBAL_ZONE), source: written ? 'unidentified_policy' : 'default' };
}

/** Latest uplink for a device inside the corroboration window — context only. */
async function loraCorroboration(loraDeviceId: string | null): Promise<{ deviceId: string | null; corroborated: boolean; lastSeenAt: Date | null }> {
  if (!loraDeviceId) return { deviceId: null, corroborated: false, lastSeenAt: null };
  const reading = await DeviceReading.findOne({ deviceId: loraDeviceId }).sort({ receivedAt: -1 });
  const lastSeenAt = reading?.receivedAt ?? null;
  const corroborated = lastSeenAt !== null && Date.now() - lastSeenAt.getTime() <= LORA_CORROBORATION_WINDOW_MS;
  return { deviceId: loraDeviceId, corroborated, lastSeenAt };
}

function humanReason(identity: IdentityResolution, applied: ResolvedRule): string {
  if (applied.rule === 'allow' && identity.subject === 'person' && identity.person) {
    const role = identity.role ? ` (${identity.role.key})` : '';
    return `Possible weapon held by ${identity.person.name}${role} — permitted by their role, so suppressed.`;
  }
  const who =
    identity.subject === 'person' && identity.person
      ? `held by ${identity.person.name}${identity.role ? ` (${identity.role.key})` : ''}`
      : `held by an unidentified person (${identity.unidentifiedReason})`;
  return `Possible weapon detected — needs human review, ${who}.`;
}

/**
 * Evaluates one camera weapon observation against possible_weapon policy.
 *
 * The whole server-side decision: the re-derivable quality gate, identity from
 * AprilTags, the global allow/restrict rule, suppress-or-alert, and the audit
 * record. An `allow` rule — the security-guard exemption — suppresses the alert
 * but still writes a decision, so a permitted carry is audited exactly like a
 * suppressed restricted-area entry. Anyone unidentified, or with no `allow`
 * rule, produces a critical alert. Identity comes from AprilTags alone; a LoRa
 * wristband never grants the exemption.
 */
export async function evaluatePossibleWeaponObservation(obs: WeaponObservation): Promise<WeaponEvaluation> {
  const settings = await getSettings(obs.cameraId);
  const weaponConfig = settings.detectors.find((detector) => detector.type === 'weapon');
  const confidenceThreshold = weaponConfig?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const cooldownSeconds = weaponConfig?.cooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS;

  const rejection = checkQuality(obs, confidenceThreshold);
  if (rejection) {
    // Below threshold: no alert, nothing written — there is no policy event.
    return { status: 'ignored', rejection };
  }

  const identity = await resolveIdentityFromTags(obs.aprilTags);
  const applied = await resolveApplicableRule(identity);
  const outcome = applied.rule === 'allow' ? 'suppressed' : 'alert_created';

  // Episode discipline: a repeat of this exact weapon track inside the cooldown
  // folds into the existing episode instead of writing another decision.
  const since = new Date(Date.now() - cooldownSeconds * 1000);
  const recent = await findRecentEpisodeDecision({
    cameraId: obs.cameraId,
    zoneId: GLOBAL_ZONE,
    trackId: obs.trackId,
    since,
  });
  if (recent) {
    return { status: 'evaluated', outcome: recent.decision as WeaponEvaluation['outcome'], decisionId: String(recent._id), deduped: true };
  }

  const lora = await loraCorroboration(identity.person?.loraDeviceId ?? null);
  const reason = humanReason(identity, applied);

  const decision = await PolicyDecision.create({
    action: ACTION,
    cameraId: obs.cameraId,
    zoneId: null,
    zoneName: null,
    trackId: obs.trackId,
    subject: identity.subject,
    unidentifiedReason: identity.unidentifiedReason,
    personId: identity.person ? identity.person._id : null,
    personName: identity.person?.name ?? null,
    roleId: identity.role ? identity.role._id : null,
    roleKey: identity.role?.key ?? null,
    aprilTagId: identity.aprilTagId,
    loraDeviceId: lora.deviceId,
    loraCorroborated: lora.corroborated,
    loraLastSeenAt: lora.lastSeenAt,
    ruleApplied: applied.rule,
    ruleSource: applied.source,
    decision: outcome,
    reason,
    alertId: null,
  });

  if (outcome === 'suppressed') {
    return { status: 'evaluated', outcome, decisionId: String(decision._id) };
  }

  const action = findAction(ACTION);
  const trackKey = `weapon:${obs.trackId}`;
  const created = await createPolicyAlert({
    cameraId: obs.cameraId,
    type: 'weapon',
    severity: action?.defaultSeverity ?? 'critical',
    confidence: obs.confidence,
    message: reason,
    zoneName: null,
    snapshot: obs.snapshot,
    metadata: {
      trackKey,
      trackId: obs.trackId,
      confidence: obs.confidence,
      subject: identity.subject,
      unidentifiedReason: identity.unidentifiedReason,
    },
    trackKey,
    cooldownSeconds,
    policy: {
      decisionId: String(decision._id),
      subject: identity.subject,
      ruleSource: applied.source,
      unidentifiedReason: identity.unidentifiedReason,
      personId: identity.person ? String(identity.person._id) : null,
      personName: identity.person?.name ?? null,
      roleKey: identity.role?.key ?? null,
      aprilTagId: identity.aprilTagId,
      zoneId: null,
    },
  });

  const alertId = String(created.alert._id);
  decision.alertId = created.alert._id;
  await decision.save();

  return { status: 'evaluated', outcome, decisionId: String(decision._id), alertId, deduped: created.deduped };
}
