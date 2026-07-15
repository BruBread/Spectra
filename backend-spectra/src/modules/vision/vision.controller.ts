import type { NextFunction, Request, Response } from 'express';
import * as visionService from './vision.service.js';
import { DETECTION_TYPES, type DetectionType } from './vision.types.js';

const DEFAULT_CAMERA_ID = 'webcam-default';

function isDetectionType(value: unknown): value is DetectionType {
  return typeof value === 'string' && (DETECTION_TYPES as string[]).includes(value);
}

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const cameraId = typeof req.query.cameraId === 'string' ? req.query.cameraId : DEFAULT_CAMERA_ID;
    const settings = await visionService.getSettings(cameraId);
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

export async function putSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const cameraId = typeof req.body.cameraId === 'string' ? req.body.cameraId : DEFAULT_CAMERA_ID;
    const settings = await visionService.replaceSettings(cameraId, {
      processingIntervalMs: req.body.processingIntervalMs,
      retentionDays: req.body.retentionDays,
      detectors: req.body.detectors,
    });
    res.json(settings);
  } catch (error) {
    next(error);
  }
}

export async function listAprilTagMappings(_req: Request, res: Response, next: NextFunction) {
  try {
    const mappings = await visionService.listAprilTagMappings();
    res.json(mappings);
  } catch (error) {
    next(error);
  }
}

export async function createAprilTagMapping(req: Request, res: Response, next: NextFunction) {
  try {
    const { tagId, label, loraDeviceId, notes } = req.body;
    if (typeof tagId !== 'number' || !label || !loraDeviceId) {
      res.status(400).json({ error: 'tagId (number), label, and loraDeviceId are required' });
      return;
    }
    const mapping = await visionService.createAprilTagMapping({ tagId, label, loraDeviceId, notes });
    res.status(201).json(mapping);
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      res.status(409).json({ error: `A mapping for tag ${req.body.tagId} already exists` });
      return;
    }
    next(error);
  }
}

export async function updateAprilTagMapping(req: Request, res: Response, next: NextFunction) {
  try {
    const mapping = await visionService.updateAprilTagMapping(String(req.params.id), req.body);
    if (!mapping) {
      res.status(404).json({ error: 'Mapping not found' });
      return;
    }
    res.json(mapping);
  } catch (error) {
    next(error);
  }
}

export async function deleteAprilTagMapping(req: Request, res: Response, next: NextFunction) {
  try {
    const mapping = await visionService.deleteAprilTagMapping(String(req.params.id));
    if (!mapping) {
      res.status(404).json({ error: 'Mapping not found' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function listAlerts(req: Request, res: Response, next: NextFunction) {
  try {
    const { cameraId, type, acknowledged, limit } = req.query;
    const alerts = await visionService.listAlerts({
      cameraId: typeof cameraId === 'string' ? cameraId : undefined,
      type: isDetectionType(type) ? type : undefined,
      acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
      limit: Math.min(Number(limit) || 50, 200),
    });
    res.json(alerts);
  } catch (error) {
    next(error);
  }
}

export async function createAlert(req: Request, res: Response, next: NextFunction) {
  try {
    const { cameraId, type, confidence, message, snapshot, metadata } = req.body;
    if (!cameraId || !isDetectionType(type) || typeof confidence !== 'number' || !message) {
      res.status(400).json({ error: 'cameraId, type, confidence (number), and message are required' });
      return;
    }
    const result = await visionService.createAlert({ cameraId, type, confidence, message, snapshot, metadata });
    res.status(result.deduped ? 200 : 201).json(result.alert);
  } catch (error) {
    next(error);
  }
}

export async function acknowledgeAlert(req: Request, res: Response, next: NextFunction) {
  try {
    const alert = await visionService.acknowledgeAlert(String(req.params.id));
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    res.json(alert);
  } catch (error) {
    next(error);
  }
}
