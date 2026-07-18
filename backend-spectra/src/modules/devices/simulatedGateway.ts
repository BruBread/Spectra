import type {
  GatewayDeliveryResult,
  GatewayEvent,
  HapticCommandEnvelope,
  HardwareGateway,
} from './deviceGateway.types.js';

/**
 * The development-only fake transport.
 *
 * It never sends anything over the air. It fabricates a labelled round-trip —
 * a simulated wristband receives the command, buzzes, and acknowledges — so the
 * end-to-end workflow can be exercised with no LoRa hardware. Every event and
 * the ack are stamped `simulated: true`; nothing here may ever be presented as
 * a real delivery.
 *
 * The simulated device id is derived from the real target id so the trail reads
 * naturally, but it is clearly marked as a stand-in.
 */
export class SimulatedGateway implements HardwareGateway {
  readonly transport = 'simulation' as const;
  readonly simulated = true as const;

  describe() {
    return {
      transport: this.transport,
      simulated: true,
      configured: true,
      note: 'Simulated in-process transport — no LoRa hardware is involved. Every delivery is fabricated and clearly labelled.',
    };
  }

  async deliver(envelope: HapticCommandEnvelope): Promise<GatewayDeliveryResult> {
    // Refuse to "deliver" a command that has already gone stale, exactly as a
    // real gateway would drop a too-late frame.
    if (Date.parse(envelope.expiresAt) <= Date.now()) {
      return {
        transport: this.transport,
        simulated: true,
        accepted: false,
        events: [this.event('expired', 'Command was already expired; nothing was simulated.')],
        error: 'Command expired before simulated delivery',
      };
    }

    const label = simulatedDeviceLabel(envelope.deviceId);
    const { pulses, durationMs, pattern, intensity } = envelope.params;

    const events: GatewayEvent[] = [
      this.event('handed-to-gateway', `Simulated gateway accepted command ${envelope.nonce}.`),
      this.event('device-received', `${label} received the command over the simulated link.`),
      this.event(
        'vibration',
        `${label} vibrated: ${pulses}× "${pattern}" pulse, ${durationMs}ms, intensity ${intensity}/5 (simulated).`,
      ),
    ];

    const now = new Date().toISOString();
    return {
      transport: this.transport,
      simulated: true,
      accepted: true,
      events,
      // The simulator acks inline — the real Pi bridge instead acks later over
      // HTTP, so the two paths diverge only here.
      ack: {
        receivedAt: now,
        executedAt: now,
        deviceStatus: 'ok',
        // Plausible-looking but obviously synthetic radio metrics.
        rssi: -42,
        snr: 9,
        simulated: true,
      },
    };
  }

  private event(labelText: string, detail: string): GatewayEvent {
    return { at: new Date().toISOString(), label: labelText, detail, simulated: true };
  }
}

/** A stand-in label for the fabricated wristband, derived from the real id. */
export function simulatedDeviceLabel(deviceId: string): string {
  return `SIMULATED WRISTBAND (${deviceId})`;
}
