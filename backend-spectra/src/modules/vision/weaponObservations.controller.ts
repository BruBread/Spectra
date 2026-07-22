import type { NextFunction, Request, Response } from 'express';
import { evaluatePossibleWeaponObservation } from '../policy/weapon.service.js';
import type { WeaponObservation } from '../policy/weapon.types.js';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBox(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every(isFiniteNumber);
}

class WeaponObservationError extends Error {}

/**
 * Parses and validates a weapon observation.
 *
 * Strict on purpose: this endpoint is the only way a browser reaches
 * possible_weapon enforcement. It parses CV facts only — box, holder box,
 * confidence, confirmation count, tags, snapshot. There is deliberately no
 * field for identity, role, rule or outcome: those are the server's to decide,
 * and accepting them from a client would be the bypass this design prevents.
 */
function parseObservation(body: unknown): WeaponObservation {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.cameraId !== 'string' || b.cameraId === '') {
    throw new WeaponObservationError('cameraId is required');
  }
  if (typeof b.trackId !== 'string' || b.trackId === '') {
    throw new WeaponObservationError('trackId is required');
  }

  const frame = b.frame as Record<string, unknown> | undefined;
  if (!frame || !isFiniteNumber(frame.width) || !isFiniteNumber(frame.height) || frame.width <= 0 || frame.height <= 0) {
    throw new WeaponObservationError('frame.width and frame.height must be positive numbers');
  }

  if (!isBox(b.weaponBox)) {
    throw new WeaponObservationError('weaponBox must be [x, y, width, height] numbers');
  }
  if (b.weaponBox[2] <= 0 || b.weaponBox[3] <= 0) {
    throw new WeaponObservationError('weaponBox width and height must be positive');
  }
  if (!isBox(b.personBox)) {
    throw new WeaponObservationError('personBox must be [x, y, width, height] numbers');
  }
  if (b.personBox[2] <= 0 || b.personBox[3] <= 0) {
    throw new WeaponObservationError('personBox width and height must be positive');
  }

  if (!isFiniteNumber(b.confidence) || b.confidence < 0 || b.confidence > 1) {
    throw new WeaponObservationError('confidence must be a number between 0 and 1');
  }
  if (!isFiniteNumber(b.framesConfirmed) || b.framesConfirmed < 0) {
    throw new WeaponObservationError('framesConfirmed must be a non-negative number');
  }

  const aprilTags = b.aprilTags === undefined ? [] : b.aprilTags;
  if (!Array.isArray(aprilTags) || !aprilTags.every(isFiniteNumber)) {
    throw new WeaponObservationError('aprilTags must be an array of numbers');
  }

  // A weapon alert must carry evidence, so the snapshot is required even though
  // a suppressed decision won't use it.
  if (typeof b.snapshot !== 'string' || b.snapshot === '') {
    throw new WeaponObservationError('snapshot is required');
  }

  return {
    cameraId: b.cameraId,
    trackId: b.trackId,
    frame: { width: frame.width, height: frame.height },
    weaponBox: b.weaponBox,
    personBox: b.personBox,
    confidence: b.confidence,
    framesConfirmed: b.framesConfirmed,
    aprilTags: aprilTags as number[],
    snapshot: b.snapshot,
  };
}

/**
 * POST /api/vision/weapon-observations
 *
 * Intake for the browser's weapon observations. Always responds 200 with the
 * evaluation result — a quality-rejected or suppressed observation is a normal
 * outcome, not a client error. The response reports what the server decided; it
 * never lets the client influence it.
 */
export async function postWeaponObservation(req: Request, res: Response, next: NextFunction) {
  try {
    const observation = parseObservation(req.body);
    const result = await evaluatePossibleWeaponObservation(observation);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof WeaponObservationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}
