import { Router } from 'express';
import * as camerasController from './cameras.controller.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

export const camerasRouter = Router();

// Operators watch cameras; only admins change the camera estate.
camerasRouter.get('/', requireAuth, camerasController.listCameras);
camerasRouter.post('/', requireAuth, requireRole('admin'), camerasController.createCamera);
camerasRouter.patch('/:id', requireAuth, requireRole('admin'), camerasController.updateCamera);
camerasRouter.delete('/:id', requireAuth, requireRole('admin'), camerasController.deleteCamera);
