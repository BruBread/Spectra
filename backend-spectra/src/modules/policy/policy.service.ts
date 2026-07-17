import { PolicyDecision } from './policy.model.js';
import type { PolicyDecisionOutcome, PolicySubject, UnidentifiedReason } from './policy.types.js';
import type { ActionKey, PolicyRule, RuleSource } from './action.catalog.js';

export interface ListPolicyDecisionsParams {
  action?: ActionKey;
  cameraId?: string;
  zoneId?: string;
  personId?: string;
  subject?: PolicySubject;
  unidentifiedReason?: UnidentifiedReason;
  ruleSource?: RuleSource;
  ruleApplied?: PolicyRule;
  decision?: PolicyDecisionOutcome;
  from?: Date;
  to?: Date;
  limit: number;
}

/**
 * Read-only: decisions are written by policy evaluation (a later phase) and
 * are never edited or removed afterwards — an audit trail that can be
 * rewritten is not an audit trail.
 */
export function listPolicyDecisions(params: ListPolicyDecisionsParams) {
  const query: Record<string, unknown> = {};
  if (params.action) query.action = params.action;
  if (params.cameraId) query.cameraId = params.cameraId;
  if (params.zoneId) query.zoneId = params.zoneId;
  if (params.personId) query.personId = params.personId;
  if (params.subject) query.subject = params.subject;
  if (params.unidentifiedReason) query.unidentifiedReason = params.unidentifiedReason;
  if (params.ruleSource) query.ruleSource = params.ruleSource;
  if (params.ruleApplied) query.ruleApplied = params.ruleApplied;
  if (params.decision) query.decision = params.decision;
  if (params.from || params.to) {
    query.createdAt = { ...(params.from && { $gte: params.from }), ...(params.to && { $lte: params.to }) };
  }

  return PolicyDecision.find(query).sort({ createdAt: -1 }).limit(params.limit);
}

export function findPolicyDecisionById(id: string) {
  return PolicyDecision.findById(id);
}
