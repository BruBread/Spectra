import type { NextFunction, Request, Response } from 'express';
import * as service from './deviceCommand.service.js';

/**
 * The HTTP endpoints the future Raspberry Pi + SX1278 bridge speaks to. Every
 * request here is authenticated by verifyBridgeRequest (shared-secret HMAC);
 * the bridge is a trusted relay, not a browser, so there is no session.
 *
 * Direction of each endpoint:
 *   submitUplink        device → backend   (wristband status the Pi relayed)
 *   pollCommands        backend → device   (queued haptics for the Pi to send)
 *   acknowledgeCommand  device → backend   (the device confirmed it buzzed)
 *
 * Nothing here is simulated: an uplink or ack that reaches these endpoints came
 * from a real relay, so it is recorded as real. The in-process simulator never
 * calls them — it acknowledges inline.
 */

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function submitUplink(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { deviceId, batteryPct, status, rssi, snr, receivedAt } = req.body ?? {};
    if (typeof deviceId !== 'string' || !deviceId.trim()) {
      res.status(400).json({ error: 'deviceId is required' });
      return;
    }
    const uplink = await service.recordUplink({
      deviceId: deviceId.trim(),
      batteryPct: optionalNumber(batteryPct),
      status: typeof status === 'string' ? status : '',
      rssi: optionalNumber(rssi),
      snr: optionalNumber(snr),
      receivedAt: typeof receivedAt === 'string' ? receivedAt : undefined,
      simulated: false,
    });
    res.status(202).json({ accepted: true, id: String(uplink._id) });
  } catch (error) {
    next(error);
  }
}

export async function pollCommands(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : '';
    if (!deviceId) {
      res.status(400).json({ error: 'deviceId query parameter is required' });
      return;
    }
    const pending = await service.pollPendingCommands(deviceId);
    // Hand back only what the device needs to act and to ack — the on-air frame
    // carries the nonce, type and params, nothing more.
    res.json({
      deviceId,
      commands: pending.map((command) => ({
        nonce: command.nonce,
        commandType: command.commandType,
        params: command.params,
        expiresAt: command.expiresAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function acknowledgeCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const nonce = String(req.params.nonce ?? '');
    const { deviceStatus, executedAt, rssi, snr } = req.body ?? {};
    const command = await service.acknowledgeByNonce(nonce, {
      deviceStatus: typeof deviceStatus === 'string' ? deviceStatus : undefined,
      executedAt: typeof executedAt === 'string' ? executedAt : undefined,
      rssi: optionalNumber(rssi),
      snr: optionalNumber(snr),
      simulated: false,
    });
    if (!command) {
      res.status(404).json({ error: 'No command found for that nonce' });
      return;
    }
    res.json({ acknowledged: true, status: command.status, nonce: command.nonce });
  } catch (error) {
    next(error);
  }
}
