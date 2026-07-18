import type { NextFunction, Request, Response } from 'express';
import * as camerasService from './cameras.service.js';
import { CAMERA_SOURCE_TYPES, type CameraSourceType } from './cameras.types.js';

function isSourceType(value: unknown): value is CameraSourceType {
  return typeof value === 'string' && (CAMERA_SOURCE_TYPES as string[]).includes(value);
}

export async function listCameras(_req: Request, res: Response, next: NextFunction) {
  try {
    const cameras = await camerasService.listCameras();
    res.json(cameras);
  } catch (error) {
    next(error);
  }
}

export async function createCamera(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, location, zone, sourceType, streamUrl, preferredDeviceId, preferredDeviceLabel } = req.body;

    if (!name || !isSourceType(sourceType)) {
      res.status(400).json({ error: 'name and a valid sourceType are required' });
      return;
    }
    if (sourceType === 'hls-stream' || sourceType === 'mjpeg-stream') {
      if (!streamUrl) {
        res.status(400).json({ error: 'streamUrl is required for hls-stream and mjpeg-stream cameras' });
        return;
      }
      if (await camerasService.streamUrlInUse(streamUrl)) {
        res.status(409).json({ error: 'A camera with this stream URL already exists.' });
        return;
      }
    }

    const camera = await camerasService.createCamera(
      {
        name,
        location,
        zone,
        sourceType,
        streamUrl,
        preferredDeviceId,
        preferredDeviceLabel,
      },
      req.user!.id,
    );
    res.status(201).json(camera);
  } catch (error) {
    next(error);
  }
}

/**
 * Only these may be set from a request body — passing the raw body through
 * would let a client write audit fields like createdBy.
 */
const UPDATABLE_CAMERA_FIELDS = [
  'name',
  'location',
  'zone',
  'sourceType',
  'streamUrl',
  'preferredDeviceId',
  'preferredDeviceLabel',
  'detectionEnabled',
] as const;

export async function updateCamera(req: Request, res: Response, next: NextFunction) {
  try {
    const updates: Record<string, unknown> = {};
    for (const field of UPDATABLE_CAMERA_FIELDS) {
      if (req.body?.[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Changing a camera's stream URL can't land it on one another camera already
    // uses — that would recreate the duplicate-feed problem via editing.
    if (typeof updates.streamUrl === 'string' && (await camerasService.streamUrlInUse(updates.streamUrl, String(req.params.id)))) {
      res.status(409).json({ error: 'A camera with this stream URL already exists.' });
      return;
    }

    const camera = await camerasService.updateCamera(String(req.params.id), updates, req.user!.id);
    if (!camera) {
      res.status(404).json({ error: 'Camera not found' });
      return;
    }
    res.json(camera);
  } catch (error) {
    next(error);
  }
}

export async function deleteCamera(req: Request, res: Response, next: NextFunction) {
  try {
    const camera = await camerasService.deleteCamera(String(req.params.id));
    if (!camera) {
      res.status(404).json({ error: 'Camera not found' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
