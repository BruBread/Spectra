import { Router } from 'express';
import { env } from '../../config/env.js';
import { verifyWebhookSecret } from './webhook.auth.js';
import { handleChirpstackWebhook, handleTtnWebhook, listReadings } from './lorawan.controller.js';

export const lorawanRouter = Router();

lorawanRouter.post(
  '/webhook/ttn',
  verifyWebhookSecret(env.lorawan.ttnWebhookSecret),
  handleTtnWebhook,
);

lorawanRouter.post(
  '/webhook/chirpstack',
  verifyWebhookSecret(env.lorawan.chirpstackWebhookSecret),
  handleChirpstackWebhook,
);

lorawanRouter.get('/readings', listReadings);
