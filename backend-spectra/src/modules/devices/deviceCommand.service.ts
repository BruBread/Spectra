import { randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { DeviceCommand, type CommandStatus, type DeviceCommandDocument } from './deviceCommand.model.js';
import { DeviceUplink } from './deviceUplink.model.js';
import { getGateway } from './gateway.factory.js';
import type { GatewayAck, GatewayEvent, HapticParams } from './deviceGateway.types.js';

/** Server-issued command nonce: 128 bits of randomness, hex-encoded. */
function newNonce(): string {
  return randomBytes(16).toString('hex');
}

const DEFAULT_PARAMS: HapticParams = { pattern: 'double-pulse', pulses: 2, durationMs: 600, intensity: 3 };

export interface IssueHapticInput {
  deviceId: string;
  personId?: string | null;
  personName?: string;
  params?: Partial<HapticParams>;
  issuedBy: string;
  issuedByEmail: string;
}

function toEventSubdocs(events: GatewayEvent[]) {
  return events.map((event) => ({
    at: new Date(event.at),
    label: event.label,
    detail: event.detail,
    simulated: event.simulated,
  }));
}

function toAckSubdoc(ack: GatewayAck) {
  return {
    receivedAt: new Date(ack.receivedAt),
    executedAt: ack.executedAt ? new Date(ack.executedAt) : null,
    deviceStatus: ack.deviceStatus,
    rssi: ack.rssi,
    snr: ack.snr,
    simulated: ack.simulated,
  };
}

/**
 * Creates a haptic command and hands it to the active gateway.
 *
 * The record is written first (status `queued`) so the command exists in the
 * audit trail even if delivery throws. The simulator acknowledges inline, so a
 * simulated command comes back already `acknowledged`; the real Pi bridge
 * leaves it `delivered` and the device acks later over HTTP.
 */
export async function issueHapticCommand(input: IssueHapticInput): Promise<DeviceCommandDocument> {
  const gateway = getGateway();
  const nonce = newNonce();
  const params: HapticParams = { ...DEFAULT_PARAMS, ...input.params };
  const expiresAt = new Date(Date.now() + env.devices.commandTtlSeconds * 1000);

  const command = await DeviceCommand.create({
    deviceId: input.deviceId,
    personId: input.personId ?? null,
    personName: input.personName ?? '',
    commandType: 'haptic_vibrate',
    params,
    nonce,
    transport: gateway.transport,
    simulated: gateway.simulated,
    status: 'queued',
    origin: 'admin_test',
    issuedBy: input.issuedBy,
    issuedByEmail: input.issuedByEmail,
    delivery: { events: [{ at: new Date(), label: 'queued', detail: 'Command created and queued.', simulated: gateway.simulated }] },
    expiresAt,
  });

  try {
    const result = await gateway.deliver({
      deviceId: input.deviceId,
      nonce,
      commandType: 'haptic_vibrate',
      params,
      expiresAt: expiresAt.toISOString(),
    });

    command.delivery.events.push(...toEventSubdocs(result.events));

    if (!result.accepted) {
      command.status = 'failed';
      command.error = result.error ?? 'Gateway declined the command';
      await command.save();
      return command;
    }

    command.deliveredAt = new Date();
    command.status = 'delivered';

    // Inline ack (simulator). The real bridge path leaves the command
    // `delivered` and the device acknowledges through the bridge endpoint.
    if (result.ack) {
      applyAck(command, toAckSubdoc(result.ack));
    }

    await command.save();
    return command;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gateway delivery failed';
    command.status = 'failed';
    command.error = message;
    command.delivery.events.push({
      at: new Date(),
      label: 'failed',
      detail: message,
      simulated: gateway.simulated,
    });
    await command.save();
    return command;
  }
}

/** Applies an acknowledgement and moves the command to `acknowledged` (idempotent). */
function applyAck(
  command: DeviceCommandDocument,
  ack: ReturnType<typeof toAckSubdoc>,
): void {
  command.ack = ack;
  command.acknowledgedAt = ack.executedAt ?? ack.receivedAt;
  command.status = 'acknowledged';
  command.delivery.events.push({
    at: ack.receivedAt,
    label: 'acknowledged',
    detail: `Device acknowledged (${ack.deviceStatus || 'ok'}).`,
    simulated: ack.simulated,
  });
}

export interface ListCommandsFilter {
  deviceId?: string;
  status?: CommandStatus;
  limit?: number;
}

export function listCommands(filter: ListCommandsFilter = {}) {
  const query: Record<string, unknown> = {};
  if (filter.deviceId) query.deviceId = filter.deviceId;
  if (filter.status) query.status = filter.status;
  return DeviceCommand.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(filter.limit ?? 50, 1), 200));
}

export function findCommandById(id: string) {
  return DeviceCommand.findById(id);
}

export function findCommandByNonce(nonce: string) {
  return DeviceCommand.findOne({ nonce });
}

/**
 * Returns the queued, still-fresh commands for a device and marks them
 * `delivered` — the poll a real Pi bridge makes. Expired queued commands are
 * swept to `expired` and never handed out.
 */
export async function pollPendingCommands(deviceId: string): Promise<DeviceCommandDocument[]> {
  const now = new Date();
  await DeviceCommand.updateMany(
    { deviceId, status: 'queued', expiresAt: { $lte: now } },
    { $set: { status: 'expired', error: 'Command expired before it was polled' } },
  );

  const pending = await DeviceCommand.find({ deviceId, status: 'queued', expiresAt: { $gt: now } }).sort({
    createdAt: 1,
  });

  for (const command of pending) {
    command.status = 'delivered';
    command.deliveredAt = now;
    command.delivery.events.push({
      at: now,
      label: 'delivered',
      detail: 'Handed to the bridge for over-the-air delivery.',
      simulated: command.simulated,
    });
    await command.save();
  }

  return pending;
}

export interface AckInput {
  deviceStatus?: string;
  executedAt?: string;
  rssi?: number | null;
  snr?: number | null;
  /** Set by the caller: bridge acks are real, simulator acks are not. */
  simulated: boolean;
}

/**
 * Records a device acknowledgement against a command by nonce.
 *
 * Idempotent: acknowledging an already-acknowledged command returns it
 * unchanged, which matches a bridge retrying a lost ack. Returns null when the
 * nonce is unknown.
 */
export async function acknowledgeByNonce(nonce: string, input: AckInput): Promise<DeviceCommandDocument | null> {
  const command = await findCommandByNonce(nonce);
  if (!command) return null;
  if (command.status === 'acknowledged') return command;

  const receivedAt = new Date();
  applyAck(command, {
    receivedAt,
    executedAt: input.executedAt ? new Date(input.executedAt) : receivedAt,
    deviceStatus: input.deviceStatus ?? 'ok',
    rssi: input.rssi ?? null,
    snr: input.snr ?? null,
    simulated: input.simulated,
  });
  await command.save();
  return command;
}

export interface UplinkInput {
  deviceId: string;
  batteryPct?: number | null;
  status?: string;
  rssi?: number | null;
  snr?: number | null;
  receivedAt?: string;
  simulated: boolean;
}

/** Stores a wristband status report relayed by the bridge. */
export function recordUplink(input: UplinkInput) {
  return DeviceUplink.create({
    deviceId: input.deviceId,
    batteryPct: input.batteryPct ?? null,
    status: input.status ?? '',
    rssi: input.rssi ?? null,
    snr: input.snr ?? null,
    simulated: input.simulated,
    receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
  });
}
