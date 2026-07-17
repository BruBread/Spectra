import { Router } from 'express';
import * as zonesController from './zones.controller.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

export const zonesRouter = Router();

zonesRouter.get('/', requireAuth, zonesController.listZones);
zonesRouter.get('/:id', requireAuth, zonesController.getZone);
zonesRouter.post('/', requireAuth, requireRole('admin'), zonesController.createZone);
// Also how a zone is archived: `active: false`.
zonesRouter.patch('/:id', requireAuth, requireRole('admin'), zonesController.updateZone);
// Refused once a recorded policy decision names the zone — archive instead.
zonesRouter.delete('/:id', requireAuth, requireRole('admin'), zonesController.deleteZone);
