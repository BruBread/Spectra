import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { env } from './config/env.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { lorawanRouter } from './modules/lorawan-ingest/lorawan.routes.js';
import { visionRouter } from './modules/vision/vision.routes.js';
import { camerasRouter } from './modules/cameras/cameras.routes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.set('sessionCookieName', env.session.cookieName);
  // Behind a reverse proxy/load balancer, secure cookies require Express to
  // trust the proxy's X-Forwarded-Proto or it sees plain HTTP and drops them.
  if (env.isProduction) {
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  // credentials: the session cookie is cross-origin (frontend and API are on
  // different ports), so the browser only sends it when the API opts in.
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  // 2mb to comfortably fit small JPEG alert snapshots as base64 in the JSON body.
  app.use(express.json({ limit: '2mb' }));

  app.use(
    session({
      name: env.session.cookieName,
      secret: env.session.secret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: env.mongodbUri,
        collectionName: 'sessions',
        ttl: env.session.ttlHours * 3600,
      }),
      cookie: {
        // httpOnly keeps the session out of reach of any XSS on the frontend.
        httpOnly: true,
        secure: env.session.cookieSecure,
        sameSite: env.session.cookieSameSite,
        maxAge: env.session.ttlHours * 3600 * 1000,
      },
    }),
  );

  // Public: liveness checks must not need a session.
  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);

  // Everything below is admin-console surface. Route-level guards live in each
  // module's routes file, because the split between what an operator may read
  // and what only an admin may change is per-endpoint.
  app.use('/api/lorawan', lorawanRouter);
  app.use('/api/vision', visionRouter);
  app.use('/api/cameras', camerasRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
