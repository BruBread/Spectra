import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import * as zonesService from './zones.service.js';
import { Camera } from '../cameras/cameras.model.js';
import type { ZoneRect } from './zones.service.js';

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/**
 * Rectangles are relative to the frame, so every value must sit inside 0–1
 * and the box must have real area. A zero-area zone would silently never
 * match anything.
 */
function parseRect(value: unknown): ZoneRect | { error: string } {
  if (typeof value !== 'object' || value === null) return { error: 'rect must be an object with x, y, width and height' };

  const rect = value as Record<string, unknown>;
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const entry = rect[key];
    if (typeof entry !== 'number' || Number.isNaN(entry)) return { error: `rect.${key} must be a number` };
    if (entry < 0 || entry > 1) return { error: `rect.${key} must be between 0 and 1 (coordinates are relative to the frame)` };
  }

  const { x, y, width, height } = rect as unknown as ZoneRect;
  if (width <= 0 || height <= 0) return { error: 'rect.width and rect.height must be greater than 0' };
  if (x + width > 1 || y + height > 1) return { error: 'rect must fit inside the frame (x + width and y + height cannot exceed 1)' };

  return { x, y, width, height };
}

export async function listZones(req: Request, res: Response, next: NextFunction) {
  try {
    const { cameraId } = req.query;
    if (cameraId !== undefined && !isObjectId(cameraId)) {
      res.status(400).json({ error: 'cameraId must be a valid camera id' });
      return;
    }
    res.json(
      await zonesService.listZones({
        cameraId: isObjectId(cameraId) ? cameraId : undefined,
        active: parseBoolean(req.query.active),
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getZone(req: Request, res: Response, next: NextFunction) {
  try {
    const zone = await zonesService.findZoneById(String(req.params.id));
    if (!zone) {
      res.status(404).json({ error: 'Zone not found' });
      return;
    }
    res.json(zone);
  } catch (error) {
    next(error);
  }
}

export async function createZone(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, cameraId, rect } = req.body ?? {};

    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    if (!isObjectId(cameraId)) {
      res.status(400).json({ error: 'cameraId must be a valid camera id' });
      return;
    }
    if (!(await Camera.exists({ _id: cameraId }))) {
      res.status(400).json({ error: 'cameraId does not match an existing camera' });
      return;
    }

    const parsedRect = parseRect(rect);
    if ('error' in parsedRect) {
      res.status(400).json({ error: parsedRect.error });
      return;
    }

    const zone = await zonesService.createZone({ name: name.trim(), cameraId, rect: parsedRect }, req.user!.id);
    res.status(201).json(zone);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      res.status(409).json({ error: 'That camera already has a zone with this name' });
      return;
    }
    next(error);
  }
}

export async function updateZone(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, rect, active } = req.body ?? {};
    const updates: Parameters<typeof zonesService.updateZone>[1] = {};

    if (req.body?.cameraId !== undefined) {
      res.status(400).json({ error: 'cameraId cannot be changed — a rectangle only means something on its own camera' });
      return;
    }
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'name cannot be empty' });
        return;
      }
      updates.name = name.trim();
    }
    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        res.status(400).json({ error: 'active must be a boolean' });
        return;
      }
      updates.active = active;
    }
    if (rect !== undefined) {
      const parsedRect = parseRect(rect);
      if ('error' in parsedRect) {
        res.status(400).json({ error: parsedRect.error });
        return;
      }
      updates.rect = parsedRect;
    }

    const zone = await zonesService.updateZone(String(req.params.id), updates, req.user!.id);
    if (!zone) {
      res.status(404).json({ error: 'Zone not found' });
      return;
    }
    res.json(zone);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      res.status(409).json({ error: 'That camera already has a zone with this name' });
      return;
    }
    next(error);
  }
}

export async function deleteZone(req: Request, res: Response, next: NextFunction) {
  try {
    const zone = await zonesService.findZoneById(String(req.params.id));
    if (!zone) {
      res.status(404).json({ error: 'Zone not found' });
      return;
    }

    const { deleted, usage } = await zonesService.deleteZone(String(req.params.id));
    if (!deleted) {
      res.status(409).json({
        error: `Zone "${zone.name}" is named by recorded policy decisions and cannot be deleted. Deactivate it instead to archive it.`,
        usage,
      });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
