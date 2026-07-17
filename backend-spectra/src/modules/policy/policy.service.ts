import { PolicyDecision } from './policy.model.js';
import type { IdentityState, PolicyDecisionOutcome } from '../identity/identity.types.js';
import type { AnyDetectionType } from '../vision/vision.types.js';

export interface ListPolicyDecisionsParams {
  detectionType?: AnyDetectionType;
  cameraId?: string;
  zoneId?: string;
  personId?: string;
  identityState?: IdentityState;
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
  if (params.detectionType) query.detectionType = params.detectionType;
  if (params.cameraId) query.cameraId = params.cameraId;
  if (params.zoneId) query.zoneId = params.zoneId;
  if (params.personId) query.personId = params.personId;
  if (params.identityState) query.identityState = params.identityState;
  if (params.decision) query.decision = params.decision;
  if (params.from || params.to) {
    query.createdAt = { ...(params.from && { $gte: params.from }), ...(params.to && { $lte: params.to }) };
  }

  return PolicyDecision.find(query).sort({ createdAt: -1 }).limit(params.limit);
}

export function findPolicyDecisionById(id: string) {
  return PolicyDecision.findById(id);
}
