import { env } from '../../config/env.js';
import type { HardwareGateway } from './deviceGateway.types.js';
import { SimulatedGateway } from './simulatedGateway.js';
import { PiSx1278Gateway } from './piSx1278Gateway.js';

/**
 * Selects the active transport.
 *
 * While the haptic simulation is enabled (local/development only — the
 * production env guard forbids it) commands run through the in-process
 * simulator. Otherwise they are queued for the real Raspberry Pi + SX1278
 * bridge, which polls them over HTTP. One instance is reused per process; the
 * gateways are stateless.
 */
let cached: HardwareGateway | null = null;

export function getGateway(): HardwareGateway {
  if (!cached) {
    cached = env.devices.simulationEnabled ? new SimulatedGateway() : new PiSx1278Gateway();
  }
  return cached;
}

/** Test seam: forces the next getGateway() to re-read configuration. */
export function resetGatewayForTests(): void {
  cached = null;
}
