import type { NormalizedUplink } from './types.js';

/**
 * Parses The Things Stack (v3) uplink JSON — used both for the
 * `application/json` webhook payload and the MQTT `v3/.../up` message.
 */
export function parseTtnUplink(body: any): NormalizedUplink {
  const endDeviceIds = body?.end_device_ids ?? {};
  const uplink = body?.uplink_message ?? {};
  const rxMetadata: any[] = Array.isArray(uplink.rx_metadata) ? uplink.rx_metadata : [];
  const bestRx = rxMetadata[0] ?? {};

  return {
    provider: 'ttn',
    deviceId: endDeviceIds.device_id,
    devEui: endDeviceIds.dev_eui,
    applicationId: endDeviceIds.application_ids?.application_id,
    fPort: uplink.f_port,
    fCnt: uplink.f_cnt,
    payloadRaw: uplink.frm_payload,
    payloadDecoded: uplink.decoded_payload ?? null,
    rssi: bestRx.rssi,
    snr: bestRx.snr,
    frequency: uplink.settings?.frequency ? Number(uplink.settings.frequency) : undefined,
    dataRate: uplink.settings?.data_rate_index !== undefined
      ? String(uplink.settings.data_rate_index)
      : undefined,
    gatewayIds: rxMetadata.map((rx) => rx?.gateway_ids?.gateway_id).filter(Boolean),
    receivedAt: body?.received_at ? new Date(body.received_at) : new Date(),
    raw: body,
  };
}
