import type { ApiResult } from './client';
import { request } from './client';

/**
 * Client for the wristband haptic-command API.
 *
 * The console only ever fires a *simulated* haptic here, and only when the
 * backend reports simulation is enabled — real delivery is the future Pi +
 * SX1278 bridge's job. Every field the UI shows carries the backend's
 * `simulated` flag so a fabricated buzz can never be presented as a real one.
 */

type Raw = Record<string, unknown>;

export type CommandStatus = 'queued' | 'delivered' | 'acknowledged' | 'failed' | 'expired';
export type CommandTransport = 'simulation' | 'pi_sx1278_p2p';

export interface DeviceCapabilities {
  simulationEnabled: boolean;
  transport: CommandTransport;
  simulated: boolean;
  note: string;
}

export interface DeliveryEvent {
  at: string;
  label: string;
  detail: string;
  simulated: boolean;
}

export interface CommandAck {
  receivedAt: string;
  executedAt: string | null;
  deviceStatus: string;
  rssi: number | null;
  snr: number | null;
  simulated: boolean;
}

export interface DeviceCommand {
  id: string;
  deviceId: string;
  personId: string | null;
  personName: string;
  commandType: string;
  params: { pattern: string; pulses: number; durationMs: number; intensity: number };
  nonce: string;
  transport: CommandTransport;
  simulated: boolean;
  status: CommandStatus;
  issuedByEmail: string;
  events: DeliveryEvent[];
  ack: CommandAck | null;
  error: string | null;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function normalizeEvent(raw: Raw): DeliveryEvent {
  return {
    at: str(raw.at),
    label: str(raw.label),
    detail: str(raw.detail),
    simulated: Boolean(raw.simulated),
  };
}

function normalizeAck(raw: unknown): CommandAck | null {
  if (!raw || typeof raw !== 'object') return null;
  const ack = raw as Raw;
  return {
    receivedAt: str(ack.receivedAt),
    executedAt: ack.executedAt ? str(ack.executedAt) : null,
    deviceStatus: str(ack.deviceStatus),
    rssi: numOrNull(ack.rssi),
    snr: numOrNull(ack.snr),
    simulated: Boolean(ack.simulated),
  };
}

export function normalizeCommand(raw: Raw): DeviceCommand {
  const params = (raw.params ?? {}) as Raw;
  const delivery = (raw.delivery ?? {}) as Raw;
  const events = Array.isArray(delivery.events) ? delivery.events : [];
  return {
    id: str(raw._id ?? raw.id),
    deviceId: str(raw.deviceId),
    personId: raw.personId ? str(raw.personId) : null,
    personName: str(raw.personName),
    commandType: str(raw.commandType),
    params: {
      pattern: str(params.pattern, 'double-pulse'),
      pulses: Number(params.pulses ?? 0),
      durationMs: Number(params.durationMs ?? 0),
      intensity: Number(params.intensity ?? 0),
    },
    nonce: str(raw.nonce),
    transport: raw.transport === 'pi_sx1278_p2p' ? 'pi_sx1278_p2p' : 'simulation',
    simulated: Boolean(raw.simulated),
    status: str(raw.status, 'queued') as CommandStatus,
    issuedByEmail: str(raw.issuedByEmail),
    events: events.map((event) => normalizeEvent(event as Raw)),
    ack: normalizeAck(raw.ack),
    error: raw.error ? str(raw.error) : null,
    deliveredAt: raw.deliveredAt ? str(raw.deliveredAt) : null,
    acknowledgedAt: raw.acknowledgedAt ? str(raw.acknowledgedAt) : null,
    createdAt: str(raw.createdAt),
  };
}

export async function fetchDeviceCapabilities(): Promise<ApiResult<DeviceCapabilities>> {
  const result = await request<Raw>('/api/device-commands/capabilities');
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error, unauthorized: result.unauthorized };
  const gateway = (result.data.gateway ?? {}) as Raw;
  return {
    data: {
      simulationEnabled: Boolean(result.data.simulationEnabled),
      transport: result.data.transport === 'pi_sx1278_p2p' ? 'pi_sx1278_p2p' : 'simulation',
      simulated: Boolean(result.data.simulated),
      note: str(gateway.note),
    },
    ok: true,
  };
}

/** Fires a simulated test haptic at a person's assigned LoRa device. Admin-only on the backend. */
export async function sendTestHaptic(personId: string): Promise<ApiResult<DeviceCommand>> {
  const result = await request<Raw>('/api/device-commands/test-haptic', {
    method: 'POST',
    body: JSON.stringify({ personId }),
  });
  if (!result.ok || !result.data) return { data: null, ok: result.ok, error: result.error };
  return { data: normalizeCommand(result.data), ok: true };
}
