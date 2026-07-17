import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { isValidSecret } from './webhook.auth.js';

/**
 * Authorizes reads of stored device data for the three kinds of caller this
 * endpoint has, in priority order:
 *
 * 1. **Admin console session** — full access, including the unscoped listing
 *    the dashboard uses. Unchanged from the rest of the API.
 * 2. **Mobile/device client with `X-Api-Key`** — scoped: it must name a
 *    `deviceId`, so a key can never bulk-dump every device's readings. This
 *    is the seam a real guest identity slots into later (see below).
 * 3. **Anonymous** — only when `LORAWAN_READINGS_ALLOW_ANONYMOUS=true`. This
 *    restores the pre-authentication behavior for an already-deployed client
 *    that has no credential to send, and is off by default.
 *
 * SECURITY LIMITATION — the API key is a temporary bridge, not the design.
 * It is a single static shared secret: anyone who extracts it from a shipped
 * app binary can read any device's readings by guessing/knowing a device id.
 * It authenticates "some copy of the mobile app", not "this guest", and it
 * cannot express which devices a given guest is entitled to.
 *
 * REQUIRED FOLLOW-UP — replace it with per-guest authentication issuing
 * short-lived tokens that carry the guest's authorized device scope, once
 * person/credential records (Phase 7A) and wristband assignment (Phase 5)
 * exist. The scope check belongs at this same point: swap the `deviceId`
 * presence check below for "is this device in the caller's authorized set",
 * then retire both the shared key and the anonymous flag.
 */
export async function authorizeReadingsAccess(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header('x-api-key');

  // An explicit credential means explicit intent — validate it rather than
  // falling through to a weaker path.
  if (apiKey) {
    if (!env.lorawan.mobileApiKey || !isValidSecret(apiKey, env.lorawan.mobileApiKey)) {
      res.status(401).json({ error: 'Invalid or missing API key' });
      return;
    }

    const deviceId = req.query.deviceId;
    if (typeof deviceId !== 'string' || !deviceId.trim()) {
      res.status(400).json({
        error: 'deviceId is required when using an API key — key access is scoped to a single device',
      });
      return;
    }

    next();
    return;
  }

  if (req.session?.userId) {
    await requireAuth(req, res, next);
    return;
  }

  if (env.lorawan.allowAnonymousReadings) {
    next();
    return;
  }

  res.status(401).json({ error: 'Authentication required' });
}

/**
 * Makes the access posture visible at boot instead of letting a deployed
 * client fail silently in the field.
 */
export function reportReadingsAccessMode(): void {
  if (env.lorawan.allowAnonymousReadings) {
    console.warn(
      '[lorawan] LORAWAN_READINGS_ALLOW_ANONYMOUS=true — GET /api/lorawan/readings is readable by anyone who can reach this server. Temporary compatibility only; see README.',
    );
    return;
  }

  if (!env.lorawan.mobileApiKey) {
    console.warn(
      '[lorawan] no MOBILE_API_KEY set and anonymous reads are off — non-browser clients (e.g. the iOS app) cannot read /api/lorawan/readings. See README > Device readings access.',
    );
  }
}
