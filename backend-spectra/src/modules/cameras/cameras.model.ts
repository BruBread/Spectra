import { Schema, model } from 'mongoose';
import { CAMERA_SOURCE_TYPES } from './cameras.types.js';

const cameraSchema = new Schema(
  {
    name: { type: String, required: true },
    location: { type: String, default: '' },
    zone: { type: String, default: '' },
    sourceType: { type: String, enum: CAMERA_SOURCE_TYPES, required: true },
    // hls-stream / mjpeg-stream
    streamUrl: { type: String, default: null },
    // local-device — a best-effort hint only: getUserMedia device ids are
    // scoped to the browser/machine that's actually viewing the page, so
    // this can't be treated as a durable cross-device identifier.
    preferredDeviceId: { type: String, default: null },
    preferredDeviceLabel: { type: String, default: null },
    detectionEnabled: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const Camera = model('Camera', cameraSchema);
