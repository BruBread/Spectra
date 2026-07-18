import type { CommandTransport, CommandType } from './deviceCommand.model.js';

/**
 * The hardware seam.
 *
 * A `HardwareGateway` is the only thing that knows how a haptic command
 * physically reaches a wristband. The service builds an envelope and hands it
 * to whichever gateway the environment selected; swapping simulated hardware
 * for the real Raspberry Pi + SX1278 bridge is a matter of returning a
 * different implementation from the factory, with no change to the model,
 * service, or API.
 */

export interface HapticParams {
  pattern: string;
  pulses: number;
  durationMs: number;
  intensity: number;
}

/** What the service asks a gateway to deliver. */
export interface HapticCommandEnvelope {
  deviceId: string;
  nonce: string;
  commandType: CommandType;
  params: HapticParams;
  /** ISO timestamp after which the command is stale and must not be delivered. */
  expiresAt: string;
}

/** One labelled step the gateway performed, surfaced to the audit trail and UI. */
export interface GatewayEvent {
  at: string;
  label: string;
  detail: string;
  /** True for anything the simulator fabricated. Real transports set this false. */
  simulated: boolean;
}

/** The device's acknowledgement, when the transport can produce one inline. */
export interface GatewayAck {
  receivedAt: string;
  executedAt: string | null;
  deviceStatus: string;
  rssi: number | null;
  snr: number | null;
  simulated: boolean;
}

export interface GatewayDeliveryResult {
  transport: CommandTransport;
  /** True whenever nothing real happened. */
  simulated: boolean;
  /** False means the gateway declined to deliver (e.g. expired, not configured). */
  accepted: boolean;
  events: GatewayEvent[];
  /**
   * Present only when the transport acknowledges synchronously. The simulator
   * does; the real Pi bridge does not — its device acks arrive later over HTTP
   * (see docs/pi-sx1278-bridge.md), so it leaves this undefined.
   */
  ack?: GatewayAck;
  error?: string;
}

/** A human-readable summary of what this gateway is and whether it is usable. */
export interface GatewayInfo {
  transport: CommandTransport;
  simulated: boolean;
  configured: boolean;
  note: string;
}

export interface HardwareGateway {
  readonly transport: CommandTransport;
  readonly simulated: boolean;
  describe(): GatewayInfo;
  deliver(envelope: HapticCommandEnvelope): Promise<GatewayDeliveryResult>;
}
