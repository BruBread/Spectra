import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { evaluateRestrictedAreaObservation } from '../policy/restrictedArea.service.js';
import type { RestrictedAreaObservation } from '../policy/restrictedArea.types.js';

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Reports the field that failed so a client posting a bad observation learns why. */
class ObservationError extends Error {}

/**
 * Parses and validates a restricted-area observation.
 *
 * Strict on purpose: this endpoint is the only way a browser reaches policy
 * enforcement, so everything the server later reasons about — box, frame,
 * zone, snapshot — has to be well-formed here. It parses CV facts only. There
 * is deliberately no field for identity, role, rule or outcome: those are the
 * server's to decide, and accepting them from a client would be the bypass
 * this whole design exists to prevent.
 */
function parseObservation(body: unknown): RestrictedAreaObservation {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.cameraId !== 'string' || b.cameraId === '') {
    throw new ObservationError('cameraId is required');
  }
  if (!isObjectId(b.zoneId)) {
    throw new ObservationError('zoneId must be a valid zone id');
  }
  if (typeof b.trackId !== 'string' || b.trackId === '') {
    throw new ObservationError('trackId is required');
  }

  const frame = b.frame as Record<string, unknown> | undefined;
  if (!frame || !isFiniteNumber(frame.width) || !isFiniteNumber(frame.height) || frame.width <= 0 || frame.height <= 0) {
    throw new ObservationError('frame.width and frame.height must be positive numbers');
  }

  const box = b.personBox;
  if (!Array.isArray(box) || box.length !== 4 || !box.every(isFiniteNumber)) {
    throw new ObservationError('personBox must be [x, y, width, height] numbers');
  }
  const personBox = box as [number, number, number, number];
  if (personBox[2] <= 0 || personBox[3] <= 0) {
    throw new ObservationError('personBox width and height must be positive');
  }

  if (typeof b.enteredFromOutside !== 'boolean') {
    throw new ObservationError('enteredFromOutside must be a boolean');
  }
  if (!isFiniteNumber(b.framesInside) || b.framesInside < 0) {
    throw new ObservationError('framesInside must be a non-negative number');
  }
  if (!isFiniteNumber(b.dwellMs) || b.dwellMs < 0) {
    throw new ObservationError('dwellMs must be a non-negative number');
  }

  const aprilTags = b.aprilTags === undefined ? [] : b.aprilTags;
  if (!Array.isArray(aprilTags) || !aprilTags.every(isFiniteNumber)) {
    throw new ObservationError('aprilTags must be an array of numbers');
  }

  // A restricted-area alert must carry evidence, so the snapshot is required
  // even though a suppressed decision won't use it.
  if (typeof b.snapshot !== 'string' || b.snapshot === '') {
    throw new ObservationError('snapshot is required');
  }

  return {
    cameraId: b.cameraId,
    zoneId: b.zoneId,
    trackId: b.trackId,
    frame: { width: frame.width, height: frame.height },
    personBox,
    enteredFromOutside: b.enteredFromOutside,
    framesInside: b.framesInside,
    dwellMs: b.dwellMs,
    aprilTags: aprilTags as number[],
    snapshot: b.snapshot,
  };
}

/**
 * POST /api/vision/observations
 *
 * Intake for the browser's restricted-area observations. Always responds 200
 * with the evaluation result — a quality-rejected or suppressed observation is
 * a normal, expected outcome, not a client error. The response reports what the
 * server decided; it never lets the client influence it.
 */
export async function postObservation(req: Request, res: Response, next: NextFunction) {
  try {
    const observation = parseObservation(req.body);
    const result = await evaluateRestrictedAreaObservation(observation);
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ObservationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}
