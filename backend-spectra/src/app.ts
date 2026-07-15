import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { healthRouter } from './modules/health/health.routes.js';
import { lorawanRouter } from './modules/lorawan-ingest/lorawan.routes.js';
import { visionRouter } from './modules/vision/vision.routes.js';
import { camerasRouter } from './modules/cameras/cameras.routes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  // 2mb to comfortably fit small JPEG alert snapshots as base64 in the JSON body.
  app.use(express.json({ limit: '2mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/lorawan', lorawanRouter);
  app.use('/api/vision', visionRouter);
  app.use('/api/cameras', camerasRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
