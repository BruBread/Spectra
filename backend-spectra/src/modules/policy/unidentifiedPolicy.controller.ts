import type { NextFunction, Request, Response } from 'express';
import * as unidentifiedPolicyService from './unidentifiedPolicy.service.js';
import { parseActionRules } from './actionRules.validate.js';
import { UNIDENTIFIED_SUBJECT } from './policy.types.js';
import { DEFAULT_RULE, type ActionRule } from './action.catalog.js';

/**
 * The policy as configured.
 *
 * Always answers with a body, even when no document exists: an empty rule
 * list is the real, meaningful state ("everything restricts"), and a 404
 * would invite a client to treat the policy as unknown rather than as the
 * safe default it actually is.
 */
export async function getUnidentifiedPolicy(_req: Request, res: Response, next: NextFunction) {
  try {
    const policy = await unidentifiedPolicyService.findUnidentifiedPolicy();
    res.json({
      subject: UNIDENTIFIED_SUBJECT,
      defaultRule: DEFAULT_RULE,
      rules: policy?.rules ?? [],
      updatedAt: policy?.updatedAt ?? null,
      updatedBy: policy?.updatedBy ?? null,
    });
  } catch (error) {
    next(error);
  }
}

/** Replaces the rule set. Admin-only — see the route. */
export async function putUnidentifiedPolicy(req: Request, res: Response, next: NextFunction) {
  try {
    const { rules } = req.body ?? {};
    if (rules === undefined) {
      res.status(400).json({ error: 'rules is required' });
      return;
    }

    const parsed = await parseActionRules(rules);
    if ('error' in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const policy = await unidentifiedPolicyService.replaceUnidentifiedRules(parsed as ActionRule[], req.user!.id);
    res.json({
      subject: UNIDENTIFIED_SUBJECT,
      defaultRule: DEFAULT_RULE,
      rules: policy?.rules ?? [],
      updatedAt: policy?.updatedAt ?? null,
      updatedBy: policy?.updatedBy ?? null,
    });
  } catch (error) {
    next(error);
  }
}
