import type { NextFunction, Request, Response } from 'express';
import { parseTtnUplink } from './parsers/ttn.parser.js';
import { parseChirpstackUplink } from './parsers/chirpstack.parser.js';
import { persistUplink } from './lorawan.service.js';
import { DeviceReading } from './lorawan.model.js';

export async function handleTtnWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const normalized = parseTtnUplink(req.body);
    await persistUplink(normalized);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function handleChirpstackWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const normalized = parseChirpstackUplink(req.body);
    await persistUplink(normalized);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function listReadings(req: Request, res: Response, next: NextFunction) {
  try {
    const { deviceId, limit } = req.query;
    const query = deviceId ? { deviceId: String(deviceId) } : {};
    const readings = await DeviceReading.find(query)
      .sort({ receivedAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200));
    res.json(readings);
  } catch (error) {
    next(error);
  }
}
