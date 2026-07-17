import { Router } from 'express';
import * as policyController from './policy.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';

/**
 * Read-only by design. There is no create/update/delete: these records are
 * written by policy evaluation and must not be editable through the API.
 */
export const policyDecisionsRouter = Router();

policyDecisionsRouter.get('/', requireAuth, policyController.listPolicyDecisions);
policyDecisionsRouter.get('/:id', requireAuth, policyController.getPolicyDecision);
