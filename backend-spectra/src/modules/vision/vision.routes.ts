import { Router } from 'express';
import * as visionController from './vision.controller.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

export const visionRouter = Router();

// Detection tuning is configuration — admins only. Operators may read it so
// the Monitor page can render what the pipeline is doing.
visionRouter.get('/settings', requireAuth, visionController.getSettings);
visionRouter.put('/settings', requireAuth, requireRole('admin'), visionController.putSettings);

// Device/credential administration.
visionRouter.get('/apriltag-mappings', requireAuth, visionController.listAprilTagMappings);
visionRouter.post('/apriltag-mappings', requireAuth, requireRole('admin'), visionController.createAprilTagMapping);
visionRouter.patch('/apriltag-mappings/:id', requireAuth, requireRole('admin'), visionController.updateAprilTagMapping);
visionRouter.delete('/apriltag-mappings/:id', requireAuth, requireRole('admin'), visionController.deleteAprilTagMapping);

// Alerts: operators review and triage, so these stay open to both roles.
// POST is included — an operator's browser pipeline is what submits detections.
visionRouter.get('/alerts', requireAuth, visionController.listAlerts);
visionRouter.get('/alerts/counts', requireAuth, visionController.getAlertCounts);
visionRouter.post('/alerts', requireAuth, visionController.createAlert);
visionRouter.post('/alerts/read-all', requireAuth, visionController.markAllAlertsRead);
visionRouter.patch('/alerts/:id/status', requireAuth, visionController.updateAlertStatus);
visionRouter.patch('/alerts/:id/read', requireAuth, visionController.markAlertRead);
// Legacy acknowledge endpoint — kept working while clients move to /status.
visionRouter.patch('/alerts/:id', requireAuth, visionController.acknowledgeAlert);
