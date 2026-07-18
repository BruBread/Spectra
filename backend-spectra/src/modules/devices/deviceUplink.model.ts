import { Schema, model } from 'mongoose';

/**
 * A status report from a wristband, relayed by the bridge.
 *
 * This is the device→backend direction: battery, link quality, and a coarse
 * health status. It is kept separate from LoRaWAN `DeviceReading` on purpose —
 * these arrive over the private SX1278 P2P bridge, not a LoRaWAN network
 * server, and carry different fields.
 */
const deviceUplinkSchema = new Schema(
  {
    deviceId: { type: String, required: true, trim: true, index: true },
    /** 0–100 when reported. */
    batteryPct: { type: Number, default: null },
    /** Device-defined coarse health, e.g. "ok", "low-battery". */
    status: { type: String, default: '' },
    rssi: { type: Number, default: null },
    snr: { type: Number, default: null },
    /** True when produced by the simulator rather than a real bridge. */
    simulated: { type: Boolean, required: true, default: false },
    receivedAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

export const DeviceUplink = model('DeviceUplink', deviceUplinkSchema);
