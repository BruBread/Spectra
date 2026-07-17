import { Router } from 'express';
import * as authController from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';

export const authRouter = Router();

// Public — this is how a session is obtained in the first place.
authRouter.post('/login', authController.login);

authRouter.post('/logout', requireAuth, authController.logout);
authRouter.get('/me', requireAuth, authController.me);
authRouter.patch('/me', requireAuth, authController.updateMe);
authRouter.post('/change-password', requireAuth, authController.changePassword);
