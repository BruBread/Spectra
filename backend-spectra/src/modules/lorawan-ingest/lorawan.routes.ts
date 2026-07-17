import { Router } from 'express';
import { env } from '../../config/env.js';
import { authorizeReadingsAccess } from './readings.auth.js';
import { verifyWebhookSecret } from './webhook.auth.js';
import { handleChirpstackWebhook, handleTtnWebhook, listReadings } from './lorawan.controller.js';

export const lorawanRouter = Router();

// Webhooks are machine-to-machine: the network server has no browser session,
// so these authenticate with X-Webhook-Secret and must NOT require one.
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

// Read by the admin console (session) and by the separate mobile client,
// which has no session — authorizeReadingsAccess handles both.
lorawanRouter.get('/readings', authorizeReadingsAccess, listReadings);
