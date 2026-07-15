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
    if ((sourceType === 'hls-stream' || sourceType === 'mjpeg-stream') && !streamUrl) {
      res.status(400).json({ error: 'streamUrl is required for hls-stream and mjpeg-stream cameras' });
      return;
    }

    const camera = await camerasService.createCamera({
      name,
      location,
      zone,
      sourceType,
      streamUrl,
      preferredDeviceId,
      preferredDeviceLabel,
    });
    res.status(201).json(camera);
  } catch (error) {
    next(error);
  }
}

export async function updateCamera(req: Request, res: Response, next: NextFunction) {
  try {
    const camera = await camerasService.updateCamera(String(req.params.id), req.body);
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
