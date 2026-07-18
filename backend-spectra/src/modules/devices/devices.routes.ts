import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { verifyBridgeRequest } from './bridge.auth.js';
import * as commandController from './deviceCommand.controller.js';
import * as bridgeController from './bridge.controller.js';

/**
 * Admin-console surface. Reads are open to any signed-in user; the one mutation
 * — firing a test haptic — is admin-only, matching the rest of the console.
 */
export const deviceCommandsRouter = Router();

deviceCommandsRouter.get('/capabilities', requireAuth, commandController.getCapabilities);
deviceCommandsRouter.get('/', requireAuth, commandController.listCommands);
deviceCommandsRouter.get('/:id', requireAuth, commandController.getCommand);
deviceCommandsRouter.post('/test-haptic', requireAuth, requireRole('admin'), commandController.testHaptic);

/**
 * The device bridge surface. No session — the future Raspberry Pi authenticates
 * every request with the shared-secret HMAC in verifyBridgeRequest.
 */
export const deviceBridgeRouter = Router();

deviceBridgeRouter.post('/uplinks', verifyBridgeRequest, bridgeController.submitUplink);
deviceBridgeRouter.get('/commands', verifyBridgeRequest, bridgeController.pollCommands);
deviceBridgeRouter.post('/commands/:nonce/ack', verifyBridgeRequest, bridgeController.acknowledgeCommand);
