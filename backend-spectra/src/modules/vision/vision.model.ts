import { Schema, model } from 'mongoose';
import { DETECTION_TYPES } from './vision.types.js';

const zoneSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false },
);

const detectionTypeConfigSchema = new Schema(
  {
    type: { type: String, enum: DETECTION_TYPES, required: true },
    enabled: { type: Boolean, required: true, default: true },
    confidenceThreshold: { type: Number, required: true, min: 0, max: 1 },
    cooldownSeconds: { type: Number, required: true, min: 0 },
    durationThresholdSeconds: { type: Number, required: true, min: 0 },
    zone: { type: zoneSchema, default: null },
  },
  { _id: false },
);

const visionSettingsSchema = new Schema(
  {
    cameraId: { type: String, required: true, unique: true, index: true },
    processingIntervalMs: { type: Number, required: true, default: 500 },
    retentionDays: { type: Number, required: true, default: 14 },
    detectors: { type: [detectionTypeConfigSchema], default: [] },
  },
  { timestamps: true },
);

export const VisionSettings = model('VisionSettings', visionSettingsSchema);

const aprilTagMappingSchema = new Schema(
  {
    tagId: { type: Number, required: true, unique: true, index: true },
    label: { type: String, required: true },
    loraDeviceId: { type: String, required: true },
    notes: { type: String },
  },
  { timestamps: true },
);

export const AprilTagMapping = model('AprilTagMapping', aprilTagMappingSchema);

const visionAlertSchema = new Schema(
  {
    cameraId: { type: String, required: true, index: true },
    type: { type: String, enum: DETECTION_TYPES, required: true, index: true },
    confidence: { type: Number, required: true },
    message: { type: String, required: true },
    snapshot: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    acknowledged: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

visionAlertSchema.index({ cameraId: 1, createdAt: -1 });

export const VisionAlert = model('VisionAlert', visionAlertSchema);
