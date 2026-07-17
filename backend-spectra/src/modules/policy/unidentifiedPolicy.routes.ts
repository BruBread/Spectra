import { Router } from 'express';
import * as unidentifiedPolicyController from './unidentifiedPolicy.controller.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

/**
 * The unidentified-person policy. Readable by any signed-in console user;
 * only an admin may change it — `allow` here applies to everyone the cameras
 * cannot identify.
 *
 * There is no DELETE: removing the policy would be indistinguishable from
 * never having configured one, and the way to withdraw permission is to write
 * `restrict`.
 */
export const unidentifiedPolicyRouter = Router();

unidentifiedPolicyRouter.get('/', requireAuth, unidentifiedPolicyController.getUnidentifiedPolicy);
unidentifiedPolicyRouter.put('/', requireAuth, requireRole('admin'), unidentifiedPolicyController.putUnidentifiedPolicy);
