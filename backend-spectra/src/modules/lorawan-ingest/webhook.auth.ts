import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Constant-time secret comparison, shared with readings.auth.ts. */
export function isValidSecret(provided: string | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Requires an `X-Webhook-Secret` header matching the configured secret.
 * Configure the same value as a custom header on the webhook integration
 * in The Things Stack / ChirpStack so it is sent back on every request.
 */
export function verifyWebhookSecret(expectedSecret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const provided = req.header('x-webhook-secret');
    if (!isValidSecret(provided, expectedSecret)) {
      res.status(401).json({ error: 'Invalid or missing webhook secret' });
      return;
    }
    next();
  };
}
