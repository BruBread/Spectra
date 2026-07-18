import { Zone } from '../zones/zones.model.js';
import { DeviceReading } from '../lorawan-ingest/lorawan.model.js';
import { PolicyDecision } from './policy.model.js';
import { findRecentEpisodeDecision } from './policy.service.js';
import { getSettings, createPolicyAlert } from '../vision/vision.service.js';
import { findAction, findRule, resolveRule, type ActionRule, type PolicyRule, type RuleSource } from './action.catalog.js';
import { resolveIdentityFromTags, type IdentityResolution } from './identityResolution.service.js';
import { unidentifiedRules } from './unidentifiedPolicy.service.js';
import type { RestrictedAreaObservation, RestrictedAreaEvaluation, QualityRejection } from './restrictedArea.types.js';
import type { RestrictedAreaSettings } from '../vision/vision.types.js';

const ACTION = 'restricted_area' as const;

/** How recent a LoRa uplink must be to count as corroboration — context only, never identity. */
const LORA_CORROBORATION_WINDOW_MS = 5 * 60 * 1000;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bottom-centre of the person box, in pixels. The required ground point. */
function groundPoint(box: [number, number, number, number]): { x: number; y: number } {
  const [x, y, w, h] = box;
  return { x: x + w / 2, y: y + h };
}

function pointInRect(px: number, py: number, rect: Rect): boolean {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
}

/**
 * The quality gate, re-derived entirely from the submitted box and frame.
 *
 * The browser applies the same checks before posting, but nothing here trusts
 * that: a confirmed entry only becomes a policy event if the server can see,
 * from the geometry alone, that it is a whole person standing on the ground
 * inside the zone. Returns a rejection reason, or null when the observation
 * clears every gate.
 */
export function checkQuality(
  obs: RestrictedAreaObservation,
  zoneRect: Rect,
  settings: RestrictedAreaSettings,
): QualityRejection | null {
  const { width: fw, height: fh } = obs.frame;
  const [bx, by, bw, bh] = obs.personBox;

  // Box usable at all? Feet or sides cut off make the ground point a guess.
  const edgeW = settings.edgeEpsilonFraction * fw;
  const edgeH = settings.edgeEpsilonFraction * fh;
  const clippedLeft = bx <= edgeW;
  const clippedRight = bx + bw >= fw - edgeW;
  const clippedBottom = by + bh >= fh - edgeH;
  if (clippedLeft || clippedRight || clippedBottom) return 'edge_clipped';

  const heightFraction = bh / fh;
  const areaFraction = (bw * bh) / (fw * fh);
  if (heightFraction < settings.minHeightFraction || areaFraction < settings.minAreaFraction) return 'too_small';
  if (heightFraction > settings.maxHeightFraction || areaFraction > settings.maxAreaFraction) return 'too_large';

  // Standing inside the named zone? Ground point is bottom-centre, normalised.
  const gp = groundPoint(obs.personBox);
  if (!pointInRect(gp.x / fw, gp.y / fh, zoneRect)) return 'ground_point_outside_zone';

  // A real, confirmed entry — not a flicker, and not someone already inside at startup.
  if (obs.framesInside < settings.minFrames || obs.dwellMs < settings.minDwellMs) return 'not_confirmed';
  if (!obs.enteredFromOutside) return 'no_entry_transition';

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
 * The rule that applies to this subject for this zone, and where it came from.
 *
 * `source: 'default'` is kept distinct from an administrator writing `restrict`
 * on purpose — the decision has to be able to say whether a human chose to keep
 * someone out or whether nobody had configured anything and the restrict
 * default caught them.
 */
async function resolveApplicableRule(identity: IdentityResolution, zoneId: string): Promise<ResolvedRule> {
  if (identity.subject === 'person' && identity.role) {
    const rules = roleActionRules(identity.role);
    const written = findRule(rules, ACTION, zoneId);
    return { rule: resolveRule(rules, ACTION, zoneId), source: written ? 'role' : 'default' };
  }

  const rules = await unidentifiedRules();
  const written = findRule(rules, ACTION, zoneId);
  return { rule: resolveRule(rules, ACTION, zoneId), source: written ? 'unidentified_policy' : 'default' };
}

/** Latest uplink for a device inside the corroboration window — context only. */
async function loraCorroboration(loraDeviceId: string | null): Promise<{ deviceId: string | null; corroborated: boolean; lastSeenAt: Date | null }> {
  if (!loraDeviceId) return { deviceId: null, corroborated: false, lastSeenAt: null };
  const reading = await DeviceReading.findOne({ deviceId: loraDeviceId }).sort({ receivedAt: -1 });
  const lastSeenAt = reading?.receivedAt ?? null;
  const corroborated = lastSeenAt !== null && Date.now() - lastSeenAt.getTime() <= LORA_CORROBORATION_WINDOW_MS;
  return { deviceId: loraDeviceId, corroborated, lastSeenAt };
}

function humanReason(identity: IdentityResolution, applied: ResolvedRule, zoneName: string): string {
  const who =
    identity.subject === 'person' && identity.person
      ? `${identity.person.name}${identity.role ? ` (${identity.role.key})` : ''}`
      : `An unidentified person (${identity.unidentifiedReason})`;
  const verb = applied.rule === 'allow' ? 'is allowed in' : 'is not allowed in';
  const via =
    applied.source === 'default'
      ? ' by the restrict default'
      : applied.source === 'unidentified_policy'
        ? ' by the unidentified-person policy'
        : ' by their role';
  return `${who} ${verb} ${zoneName}${applied.rule === 'allow' ? '' : via}.`;
}

/**
 * Evaluates one camera observation against restricted-area policy.
 *
 * This is the whole server-side decision: quality gate, identity resolution
 * from AprilTags, the per-zone rule, suppress-or-alert, and the audit record.
 * The browser reaches none of it — it only reported where a tracked body was
 * and which tag numbers were on it.
 */
export async function evaluateRestrictedAreaObservation(obs: RestrictedAreaObservation): Promise<RestrictedAreaEvaluation> {
  const zone = await Zone.findById(obs.zoneId);
  if (!zone || !zone.active || String(zone.cameraId) !== obs.cameraId) {
    return { status: 'ignored', rejection: 'zone_not_found' };
  }

  const settings = await getSettings(obs.cameraId);
  const raSettings = settings.restrictedArea as unknown as RestrictedAreaSettings;

  const rejection = checkQuality(obs, zone.rect as Rect, raSettings);
  if (rejection) {
    // Below the detection threshold: no alert, and nothing written to the
    // audit trail — there is no policy event to record.
    return { status: 'ignored', rejection };
  }

  const identity = await resolveIdentityFromTags(obs.aprilTags);
  const applied = await resolveApplicableRule(identity, String(zone._id));
  const outcome = applied.rule === 'allow' ? 'suppressed' : 'alert_created';

  // Episode discipline: a repeat of this exact entry inside the cooldown folds
  // into the existing episode instead of writing another decision. Alerts fold
  // through createPolicyAlert's grouping; suppressions fold here.
  const since = new Date(Date.now() - raSettings.cooldownSeconds * 1000);
  const recent = await findRecentEpisodeDecision({
    cameraId: obs.cameraId,
    zoneId: String(zone._id),
    trackId: obs.trackId,
    since,
  });
  if (recent) {
    return { status: 'evaluated', outcome: recent.decision as RestrictedAreaEvaluation['outcome'], decisionId: String(recent._id), deduped: true };
  }

  const lora = await loraCorroboration(identity.person?.loraDeviceId ?? null);
  const zoneName = zone.name;
  const reason = humanReason(identity, applied, zoneName);

  // The decision is the durable record; write it first so the alert can carry
  // its id, then link the alert back onto it. alertId starts null and is filled
  // in only when a restrict rule actually raises an alert.
  const decision = await PolicyDecision.create({
    action: ACTION,
    cameraId: obs.cameraId,
    zoneId: zone._id,
    zoneName,
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
  const created = await createPolicyAlert({
    cameraId: obs.cameraId,
    type: ACTION,
    severity: action?.defaultSeverity ?? 'warning',
    confidence: 1,
    message: reason,
    zoneName,
    snapshot: obs.snapshot,
    metadata: {
      trackKey: `${zone._id}:${obs.trackId}`,
      trackId: obs.trackId,
      subject: identity.subject,
      unidentifiedReason: identity.unidentifiedReason,
    },
    trackKey: `${zone._id}:${obs.trackId}`,
    cooldownSeconds: raSettings.cooldownSeconds,
    policy: {
      decisionId: String(decision._id),
      subject: identity.subject,
      ruleSource: applied.source,
      unidentifiedReason: identity.unidentifiedReason,
      personId: identity.person ? String(identity.person._id) : null,
      personName: identity.person?.name ?? null,
      roleKey: identity.role?.key ?? null,
      aprilTagId: identity.aprilTagId,
      zoneId: String(zone._id),
    },
  });

  const alertId = String(created.alert._id);
  decision.alertId = created.alert._id;
  await decision.save();

  return { status: 'evaluated', outcome, decisionId: String(decision._id), alertId, deduped: created.deduped };
}
