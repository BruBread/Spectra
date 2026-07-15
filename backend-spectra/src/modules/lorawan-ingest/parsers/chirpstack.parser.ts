import type { NormalizedUplink } from './types.js';

/**
 * Parses a ChirpStack (v4) "up" event JSON — used both for the HTTP
 * integration webhook payload and the MQTT `application/.../event/up` message.
 */
export function parseChirpstackUplink(body: any): NormalizedUplink {
  const deviceInfo = body?.deviceInfo ?? {};
  const rxInfo: any[] = Array.isArray(body?.rxInfo) ? body.rxInfo : [];
  const bestRx = rxInfo[0] ?? {};

  return {
    provider: 'chirpstack',
    deviceId: deviceInfo.deviceName ?? deviceInfo.devEui,
    devEui: deviceInfo.devEui,
    applicationId: deviceInfo.applicationId,
    fPort: body?.fPort,
    fCnt: body?.fCnt,
    payloadRaw: body?.data,
    payloadDecoded: body?.object ?? null,
    rssi: bestRx.rssi,
    snr: bestRx.snr,
    frequency: body?.txInfo?.frequency,
    dataRate: body?.dr !== undefined ? String(body.dr) : undefined,
    gatewayIds: rxInfo.map((rx) => rx?.gatewayId).filter(Boolean),
    receivedAt: body?.time ? new Date(body.time) : new Date(),
    raw: body,
  };
}
