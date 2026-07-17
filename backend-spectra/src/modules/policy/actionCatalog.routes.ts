import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { ACTION_CATALOG, DEFAULT_RULE, POLICY_RULES } from './action.catalog.js';

/**
 * The code-defined action catalog, served so the console renders exactly what
 * the backend enforces rather than a copy that can drift from it.
 *
 * Read-only for everyone, admins included: there is no route to add, edit or
 * remove an action, because an action carries detection behaviour, evidence
 * requirements and policy semantics that only exist in code.
 */
export const actionCatalogRouter = Router();

function getActionCatalog(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ actions: ACTION_CATALOG, rules: POLICY_RULES, defaultRule: DEFAULT_RULE });
  } catch (error) {
    next(error);
  }
}

// Deliberately public to any signed-in user: the catalog describes the
// product, not anyone's permissions. requireAuth is applied at mount.
actionCatalogRouter.get('/', getActionCatalog);
