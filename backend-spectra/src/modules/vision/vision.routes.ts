import { Router } from 'express';
import * as visionController from './vision.controller.js';

export const visionRouter = Router();

visionRouter.get('/settings', visionController.getSettings);
visionRouter.put('/settings', visionController.putSettings);

visionRouter.get('/apriltag-mappings', visionController.listAprilTagMappings);
visionRouter.post('/apriltag-mappings', visionController.createAprilTagMapping);
visionRouter.patch('/apriltag-mappings/:id', visionController.updateAprilTagMapping);
visionRouter.delete('/apriltag-mappings/:id', visionController.deleteAprilTagMapping);

visionRouter.get('/alerts', visionController.listAlerts);
visionRouter.post('/alerts', visionController.createAlert);
visionRouter.patch('/alerts/:id', visionController.acknowledgeAlert);
