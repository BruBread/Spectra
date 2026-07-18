import type { GatewayDeliveryResult, HapticCommandEnvelope, HardwareGateway } from './deviceGateway.types.js';

/**
 * Placeholder for the real transport: a Raspberry Pi driving an SX1278 radio
 * over a **private 433 MHz point-to-point link** — deliberately NOT LoRaWAN
 * (no TTN, no ChirpStack, no gateway network). See docs/pi-sx1278-bridge.md for
 * the on-air frame format and the HTTP contract this will speak.
 *
 * It is intentionally inert. When hardware exists, `deliver()` will enqueue the
 * envelope for the Pi to pick up via `GET /api/device-bridge/commands` and the
 * device's acknowledgement will arrive later over HTTP — so, unlike the
 * simulator, it never acks inline. Until then every call throws, which keeps
 * the seam honest: selecting this gateway with no bridge built fails loudly
 * rather than silently pretending to deliver.
 */
export class PiSx1278Gateway implements HardwareGateway {
  readonly transport = 'pi_sx1278_p2p' as const;
  readonly simulated = false as const;

  describe() {
    return {
      transport: this.transport,
      simulated: false,
      configured: false,
      note: 'Raspberry Pi + SX1278 433 MHz private P2P bridge — not yet implemented. Commands are queued for the Pi to poll; see docs/pi-sx1278-bridge.md.',
    };
  }

  async deliver(_envelope: HapticCommandEnvelope): Promise<GatewayDeliveryResult> {
    throw new Error(
      'PiSx1278Gateway is not implemented yet. Real delivery goes through the Pi bridge (GET /api/device-bridge/commands); see docs/pi-sx1278-bridge.md.',
    );
  }
}
