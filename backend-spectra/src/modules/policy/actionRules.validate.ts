import mongoose from 'mongoose';
import { Zone } from '../zones/zones.model.js';
import { findAction, isActionKey, POLICY_RULES, type ActionRule, type PolicyRule } from './action.catalog.js';

/**
 * Validates a set of action rules.
 *
 * Shared by role permissions and the unidentified-person policy: both are
 * lists of the same rule, so both must be accepted or refused on identical
 * terms. A rule that validates in one place and not the other would be a way
 * to configure something the review of the other path was supposed to catch.
 */
export async function parseActionRules(value: unknown): Promise<ActionRule[] | { error: string }> {
  if (!Array.isArray(value)) return { error: 'actions must be an array' };

  const rules: ActionRule[] = [];

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return { error: 'each actions entry must be an object' };
    const { action, zoneId, rule } = entry as { action?: unknown; zoneId?: unknown; rule?: unknown };

    if (!isActionKey(action)) {
      return { error: `actions[].action must be one of: ${['restricted_area', 'possible_weapon', 'unattended_object'].join(', ')}` };
    }

    const definition = findAction(action)!;
    if (!definition.configurable) {
      // The catalog's own words, so the API and the UI give the same reason.
      return { error: `"${action}" cannot be configured: ${definition.unconfigurableReason}` };
    }

    if (typeof rule !== 'string' || !(POLICY_RULES as string[]).includes(rule)) {
      return { error: `actions[].rule must be one of: ${POLICY_RULES.join(', ')}` };
    }

    if (definition.scope === 'zone') {
      if (typeof zoneId !== 'string' || !mongoose.isValidObjectId(zoneId)) {
        return { error: `"${action}" is scoped to a zone, so actions[].zoneId must be a valid zone id` };
      }
    } else if (zoneId !== undefined && zoneId !== null) {
      // A zone on a global action would read as though it only applied there.
      return { error: `"${action}" is not scoped to a zone, so actions[].zoneId must be null` };
    }

    rules.push({
      action,
      zoneId: definition.scope === 'zone' ? (zoneId as string) : null,
      rule: rule as PolicyRule,
    });
  }

  const seen = new Set<string>();
  for (const entry of rules) {
    const key = `${entry.action}:${entry.zoneId ?? ''}`;
    if (seen.has(key)) {
      // Two rules for the same target: whichever won would be arbitrary.
      return { error: `actions contains more than one rule for "${entry.action}"${entry.zoneId ? ' on the same zone' : ''}` };
    }
    seen.add(key);
  }

  const zoneIds = [...new Set(rules.map((entry) => entry.zoneId).filter((id): id is string => id !== null))];
  if (zoneIds.length > 0) {
    const found = await Zone.countDocuments({ _id: { $in: zoneIds } });
    if (found !== zoneIds.length) {
      // A rule naming a zone that doesn't exist is a silent no-op waiting to
      // be misread as a decision someone made.
      return { error: 'actions references a zone that does not exist' };
    }
  }

  return rules;
}
