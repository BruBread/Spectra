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
visionRouter.get('/alerts/counts', visionController.getAlertCounts);
visionRouter.post('/alerts', visionController.createAlert);
visionRouter.post('/alerts/read-all', visionController.markAllAlertsRead);
visionRouter.patch('/alerts/:id/status', visionController.updateAlertStatus);
visionRouter.patch('/alerts/:id/read', visionController.markAlertRead);
// Legacy acknowledge endpoint — kept working while clients move to /status.
visionRouter.patch('/alerts/:id', visionController.acknowledgeAlert);
