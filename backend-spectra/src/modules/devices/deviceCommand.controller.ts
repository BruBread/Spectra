import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { findPersonById } from '../identity/person.service.js';
import { getGateway } from './gateway.factory.js';
import { COMMAND_STATUSES, type CommandStatus } from './deviceCommand.model.js';
import * as service from './deviceCommand.service.js';

/**
 * Capability probe for the console. The frontend hides the whole Test Haptic
 * affordance when simulation is off, so it never offers an action that can only
 * 403 — the backend stays the single source of truth for whether simulation is
 * allowed here.
 */
export function getCapabilities(_req: Request, res: Response): void {
  const gateway = getGateway();
  res.json({
    simulationEnabled: env.devices.simulationEnabled,
    transport: gateway.transport,
    simulated: gateway.simulated,
    gateway: gateway.describe(),
  });
}

/**
 * Admin-only. Sends a labelled test haptic to an *active, registered* person
 * who has an *assigned LoRa device*. Refused entirely unless simulation is
 * enabled, so it can never run against real hardware here.
 */
export async function testHaptic(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!env.devices.simulationEnabled) {
      res.status(403).json({
        error: 'Test Haptic is only available while device simulation is enabled (local/development).',
      });
      return;
    }

    const { personId } = req.body ?? {};
    if (typeof personId !== 'string' || !mongoose.isValidObjectId(personId)) {
      res.status(400).json({ error: 'personId is required and must be a valid person id' });
      return;
    }

    const person = await findPersonById(personId);
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }
    if (!person.active) {
      res.status(400).json({ error: 'Test Haptic requires an active person — this person is deactivated' });
      return;
    }
    if (typeof person.loraDeviceId !== 'string' || !person.loraDeviceId.trim()) {
      res.status(400).json({ error: 'This person has no assigned LoRa device id to send a haptic to' });
      return;
    }

    const command = await service.issueHapticCommand({
      deviceId: person.loraDeviceId.trim(),
      personId: String(person._id),
      personName: person.name,
      issuedBy: req.user!.id,
      issuedByEmail: req.user!.email,
    });

    res.status(201).json(command);
  } catch (error) {
    next(error);
  }
}

function parseStatus(value: unknown): CommandStatus | undefined {
  return typeof value === 'string' && (COMMAND_STATUSES as readonly string[]).includes(value)
    ? (value as CommandStatus)
    : undefined;
}

export async function listCommands(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const commands = await service.listCommands({
      deviceId,
      status: parseStatus(req.query.status),
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.json(commands);
  } catch (error) {
    next(error);
  }
}

export async function getCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(404).json({ error: 'Command not found' });
      return;
    }
    const command = await service.findCommandById(String(req.params.id));
    if (!command) {
      res.status(404).json({ error: 'Command not found' });
      return;
    }
    res.json(command);
  } catch (error) {
    next(error);
  }
}
