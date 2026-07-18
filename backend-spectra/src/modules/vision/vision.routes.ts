import { Router } from 'express';
import * as visionController from './vision.controller.js';
import * as observationsController from './observations.controller.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

export const visionRouter = Router();

// Detection tuning is configuration — admins only. Operators may read it so
// the Monitor page can render what the pipeline is doing.
visionRouter.get('/settings', requireAuth, visionController.getSettings);
visionRouter.put('/settings', requireAuth, requireRole('admin'), visionController.putSettings);

// AprilTag identity now lives on Person (aprilTagId) and is administered
// under /api/people. The tag→label→LoRa mapping this module used to own was
// a second, parallel source of truth for who somebody is; two of those is one
// too many.

// Alerts: operators review and triage, so these stay open to both roles.
// POST is included — an operator's browser pipeline is what submits detections.
visionRouter.get('/alerts', requireAuth, visionController.listAlerts);
visionRouter.get('/alerts/counts', requireAuth, visionController.getAlertCounts);
visionRouter.post('/alerts', requireAuth, visionController.createAlert);

// Restricted-area observations. The browser posts CV facts here; the server
// does identity resolution, the per-zone rule and suppress-or-alert. A
// `restricted_area` alert can only be born from this path, never from
// POST /alerts, so policy can't be bypassed by a client fabricating one.
visionRouter.post('/observations', requireAuth, observationsController.postObservation);
visionRouter.post('/alerts/read-all', requireAuth, visionController.markAllAlertsRead);
visionRouter.patch('/alerts/:id/status', requireAuth, visionController.updateAlertStatus);
visionRouter.patch('/alerts/:id/read', requireAuth, visionController.markAlertRead);
// Legacy acknowledge endpoint — kept working while clients move to /status.
visionRouter.patch('/alerts/:id', requireAuth, visionController.acknowledgeAlert);
