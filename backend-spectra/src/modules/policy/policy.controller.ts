import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import * as policyService from './policy.service.js';
import { POLICY_DECISION_OUTCOMES, POLICY_SUBJECTS, UNIDENTIFIED_REASONS } from './policy.types.js';
import { ACTION_KEYS, POLICY_RULES, RULE_SOURCES } from './action.catalog.js';

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

/** A present-but-invalid filter is rejected: silently ignoring it would widen the audit view. */
function parseEnumFilter<T extends string>(value: unknown, allowed: T[], field: string): T | undefined | { error: string } {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(allowed as string[]).includes(value)) {
    return { error: `${field} must be one of: ${allowed.join(', ')}` };
  }
  return value as T;
}

function parseDate(value: unknown, field: string): Date | undefined | { error: string } {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return { error: `${field} must be an ISO date string` };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { error: `${field} must be a valid ISO date string` };
  return date;
}

function isError(value: unknown): value is { error: string } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export async function listPolicyDecisions(req: Request, res: Response, next: NextFunction) {
  try {
    const action = parseEnumFilter(req.query.action, ACTION_KEYS, 'action');
    if (isError(action)) {
      res.status(400).json(action);
      return;
    }
    const subject = parseEnumFilter(req.query.subject, POLICY_SUBJECTS, 'subject');
    if (isError(subject)) {
      res.status(400).json(subject);
      return;
    }
    const unidentifiedReason = parseEnumFilter(req.query.unidentifiedReason, UNIDENTIFIED_REASONS, 'unidentifiedReason');
    if (isError(unidentifiedReason)) {
      res.status(400).json(unidentifiedReason);
      return;
    }
    const ruleSource = parseEnumFilter(req.query.ruleSource, RULE_SOURCES, 'ruleSource');
    if (isError(ruleSource)) {
      res.status(400).json(ruleSource);
      return;
    }
    const ruleApplied = parseEnumFilter(req.query.ruleApplied, POLICY_RULES, 'ruleApplied');
    if (isError(ruleApplied)) {
      res.status(400).json(ruleApplied);
      return;
    }
    const decision = parseEnumFilter(req.query.decision, POLICY_DECISION_OUTCOMES, 'decision');
    if (isError(decision)) {
      res.status(400).json(decision);
      return;
    }
    const from = parseDate(req.query.from, 'from');
    if (isError(from)) {
      res.status(400).json(from);
      return;
    }
    const to = parseDate(req.query.to, 'to');
    if (isError(to)) {
      res.status(400).json(to);
      return;
    }

    for (const field of ['zoneId', 'personId'] as const) {
      const value = req.query[field];
      if (value !== undefined && !isObjectId(value)) {
        res.status(400).json({ error: `${field} must be a valid id` });
        return;
      }
    }

    const decisions = await policyService.listPolicyDecisions({
      action,
      subject,
      unidentifiedReason,
      ruleSource,
      ruleApplied,
      decision,
      from,
      to,
      cameraId: typeof req.query.cameraId === 'string' ? req.query.cameraId : undefined,
      zoneId: isObjectId(req.query.zoneId) ? req.query.zoneId : undefined,
      personId: isObjectId(req.query.personId) ? req.query.personId : undefined,
      limit: Math.min(Number(req.query.limit) || 50, 200),
    });
    res.json(decisions);
  } catch (error) {
    next(error);
  }
}

export async function getPolicyDecision(req: Request, res: Response, next: NextFunction) {
  try {
    const decision = await policyService.findPolicyDecisionById(String(req.params.id));
    if (!decision) {
      res.status(404).json({ error: 'Policy decision not found' });
      return;
    }
    res.json(decision);
  } catch (error) {
    next(error);
  }
}
