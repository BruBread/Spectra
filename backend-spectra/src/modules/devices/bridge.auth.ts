import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';

/**
 * Authenticates the future Raspberry Pi bridge with a shared secret, HMAC and
 * replay protection. This is the HTTP half of the contract in
 * docs/pi-sx1278-bridge.md; the on-air SX1278 frames use the same secret.
 *
 * Every bridge request must carry three headers:
 *   X-Bridge-Timestamp  Unix seconds when the request was signed
 *   X-Bridge-Nonce      a unique random token per request
 *   X-Bridge-Signature  hex HMAC-SHA256(secret, `${ts}.${method}.${path}.${sha256(body)}`)
 *
 * The body is hashed from the exact received bytes (req.rawBody), so tampering
 * with either the body or the signed prefix fails. A timestamp outside the
 * freshness window is rejected, and a nonce seen inside that window is rejected
 * as a replay.
 *
 * The shared secret is deliberately never a webhook secret — a distinct key
 * with a distinct blast radius (see DEVICE_BRIDGE_SECRET). When no secret is
 * configured the bridge is closed: every request is refused rather than served
 * unauthenticated.
 */

const FRESHNESS_WINDOW_SECONDS = 300;

/** Seen nonces mapped to the Unix-second timestamp they were seen at. */
const seenNonces = new Map<string, number>();

function pruneNonces(nowSeconds: number): void {
  for (const [nonce, seenAt] of seenNonces) {
    if (nowSeconds - seenAt > FRESHNESS_WINDOW_SECONDS) seenNonces.delete(nonce);
  }
}

function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

export function expectedSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  rawBody: Buffer,
): string {
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  const signingString = `${timestamp}.${method.toUpperCase()}.${path}.${bodyHash}`;
  return createHmac('sha256', secret).update(signingString).digest('hex');
}

export function verifyBridgeRequest(req: Request, res: Response, next: NextFunction): void {
  const secret = env.devices.bridgeSecret;
  if (!secret) {
    // No secret configured — the bridge is not open. Never fall through to an
    // unauthenticated allow.
    res.status(503).json({ error: 'Device bridge is not configured (no DEVICE_BRIDGE_SECRET)' });
    return;
  }

  const timestamp = req.header('x-bridge-timestamp');
  const nonce = req.header('x-bridge-nonce');
  const signature = req.header('x-bridge-signature');
  if (!timestamp || !nonce || !signature) {
    res.status(401).json({ error: 'Missing bridge authentication headers' });
    return;
  }

  const tsSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsSeconds) || Math.abs(nowSeconds - tsSeconds) > FRESHNESS_WINDOW_SECONDS) {
    res.status(401).json({ error: 'Bridge request timestamp is missing or outside the freshness window' });
    return;
  }

  pruneNonces(nowSeconds);
  if (seenNonces.has(nonce)) {
    res.status(401).json({ error: 'Bridge request nonce has already been used (possible replay)' });
    return;
  }

  // originalUrl is the full mounted path, which is what the client signs.
  const expected = expectedSignature(secret, timestamp, req.method, req.originalUrl, req.rawBody ?? Buffer.alloc(0));
  if (!hexEqual(signature, expected)) {
    res.status(401).json({ error: 'Invalid bridge request signature' });
    return;
  }

  seenNonces.set(nonce, nowSeconds);
  next();
}

/** Test-only: clears the replay cache between cases. */
export function resetBridgeNoncesForTests(): void {
  seenNonces.clear();
}
