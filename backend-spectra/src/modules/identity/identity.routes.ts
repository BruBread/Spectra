import { Router } from 'express';
import * as identityController from './identity.controller.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

/**
 * Reads are open to any signed-in console user; every mutation is admin-only,
 * matching the rule the camera and vision routes already follow.
 */
export const rolesRouter = Router();

rolesRouter.get('/', requireAuth, identityController.listRoles);
rolesRouter.get('/:id', requireAuth, identityController.getRole);
rolesRouter.post('/', requireAuth, requireRole('admin'), identityController.createRole);
rolesRouter.patch('/:id', requireAuth, requireRole('admin'), identityController.updateRole);
// Deleting is refused while anything depends on the role — deactivate via PATCH instead.
rolesRouter.delete('/:id', requireAuth, requireRole('admin'), identityController.deleteRole);

export const peopleRouter = Router();

peopleRouter.get('/', requireAuth, identityController.listPeople);
peopleRouter.get('/:id', requireAuth, identityController.getPerson);
// Create auto-allocates the person's AprilTag — clients never choose one.
peopleRouter.post('/', requireAuth, requireRole('admin'), identityController.createPerson);
// Covers editing, deactivating (`active: false`) and role reassignment.
// People are never deleted: the credentials they held must stay accounted for.
peopleRouter.patch('/:id', requireAuth, requireRole('admin'), identityController.updatePerson);
// Issue the next free AprilTag to an existing active person who has none.
peopleRouter.post('/:id/issue-apriltag', requireAuth, requireRole('admin'), identityController.issueAprilTag);
// Archive a person and release both credentials (AprilTag + LoRa) back to the pool.
peopleRouter.post('/:id/remove', requireAuth, requireRole('admin'), identityController.removeAndReleasePerson);

export const loraDevicesRouter = Router();

loraDevicesRouter.get('/', requireAuth, identityController.listLoraDevices);
