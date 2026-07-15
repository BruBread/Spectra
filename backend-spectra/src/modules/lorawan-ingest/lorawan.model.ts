import { Schema, model } from 'mongoose';

const deviceReadingSchema = new Schema(
  {
    provider: { type: String, enum: ['ttn', 'chirpstack'], required: true },
    deviceId: { type: String, required: true, index: true },
    devEui: { type: String, index: true },
    applicationId: { type: String },
    fPort: { type: Number },
    fCnt: { type: Number },
    payloadRaw: { type: String },
    payloadDecoded: { type: Schema.Types.Mixed, default: null },
    rssi: { type: Number },
    snr: { type: Number },
    frequency: { type: Number },
    dataRate: { type: String },
    gatewayIds: { type: [String], default: [] },
    receivedAt: { type: Date, required: true, index: true },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const DeviceReading = model('DeviceReading', deviceReadingSchema);
