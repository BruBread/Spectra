import { UnidentifiedPolicy } from './unidentifiedPolicy.model.js';
import { UNIDENTIFIED_SUBJECT } from './policy.types.js';
import { DEFAULT_RULE, resolveRule, type ActionKey, type ActionRule, type PolicyRule } from './action.catalog.js';

/**
 * The policy document, or null when nobody has ever written a rule.
 *
 * Null is a meaningful answer, not a missing one: it means everything
 * restricts. Nothing here creates the document as a side effect of reading,
 * so an admin console that only looks at the policy never leaves a record
 * implying somebody configured it.
 */
export function findUnidentifiedPolicy() {
  return UnidentifiedPolicy.findOne({ singleton: UNIDENTIFIED_SUBJECT });
}

export async function unidentifiedRules(): Promise<ActionRule[]> {
  const policy = await findUnidentifiedPolicy();
  if (!policy) return [];
  return policy.rules.map((rule) => ({
    action: rule.action as ActionKey,
    zoneId: rule.zoneId ? String(rule.zoneId) : null,
    rule: rule.rule as PolicyRule,
  }));
}

/**
 * The rule that applies to an unidentified person, which is `restrict` unless
 * an administrator explicitly wrote otherwise.
 */
export async function resolveUnidentifiedRule(action: ActionKey, zoneId: string | null): Promise<PolicyRule> {
  return resolveRule(await unidentifiedRules(), action, zoneId);
}

export { DEFAULT_RULE };

/**
 * Replaces the rule set wholesale.
 *
 * Rules carry their own attribution, so a rule that is unchanged keeps the
 * `updatedBy`/`updatedAt` it already had: re-saving an untouched `allow`
 * shouldn't make the last person to open the form look like the one who
 * granted it.
 */
export async function replaceUnidentifiedRules(rules: ActionRule[], actorId: string) {
  const existing = await findUnidentifiedPolicy();
  const now = new Date();

  const next = rules.map((rule) => {
    const previous = existing?.rules.find(
      (candidate) =>
        candidate.action === rule.action && String(candidate.zoneId ?? '') === String(rule.zoneId ?? ''),
    );
    const unchanged = previous && previous.rule === rule.rule;
    return {
      action: rule.action,
      zoneId: rule.zoneId,
      rule: rule.rule,
      updatedBy: unchanged ? previous.updatedBy : actorId,
      updatedAt: unchanged ? previous.updatedAt : now,
    };
  });

  return UnidentifiedPolicy.findOneAndUpdate(
    { singleton: UNIDENTIFIED_SUBJECT },
    {
      $set: { rules: next, updatedBy: actorId },
      $setOnInsert: { singleton: UNIDENTIFIED_SUBJECT, createdBy: actorId },
    },
    { new: true, upsert: true, runValidators: true },
  );
}

/** Drops a zone from the policy — used when a zone is deleted. */
export function removeZoneFromUnidentifiedPolicy(zoneId: string) {
  return UnidentifiedPolicy.updateMany({ 'rules.zoneId': zoneId }, { $pull: { rules: { zoneId } } });
}

export function countUnidentifiedRulesForZone(zoneId: string) {
  return UnidentifiedPolicy.countDocuments({ 'rules.zoneId': zoneId });
}
