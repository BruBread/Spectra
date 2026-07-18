import { Schema, model } from 'mongoose';
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  ALL_DETECTION_TYPES,
  DETECTOR_CONFIG_TYPES,
  defaultRestrictedAreaSettings,
} from './vision.types.js';
import { RULE_SOURCES } from '../policy/action.catalog.js';
import { POLICY_SUBJECTS, UNIDENTIFIED_REASONS } from '../policy/policy.types.js';

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
    // Silent capabilities are configurable too — AprilTag decode strictness
    // is tuned here even though it never produces an alert.
    type: { type: String, enum: DETECTOR_CONFIG_TYPES, required: true },
    enabled: { type: Boolean, required: true, default: true },
    confidenceThreshold: { type: Number, required: true, min: 0, max: 1 },
    cooldownSeconds: { type: Number, required: true, min: 0 },
    durationThresholdSeconds: { type: Number, required: true, min: 0 },
    zone: { type: zoneSchema, default: null },
  },
  { _id: false },
);

/** Quality-gate tunables for restricted-area enforcement — see RestrictedAreaSettings. */
const restrictedAreaSettingsSchema = new Schema(
  {
    minFrames: { type: Number, required: true, min: 1 },
    minDwellMs: { type: Number, required: true, min: 0 },
    minHeightFraction: { type: Number, required: true, min: 0, max: 1 },
    minAreaFraction: { type: Number, required: true, min: 0, max: 1 },
    maxHeightFraction: { type: Number, required: true, min: 0, max: 1 },
    maxAreaFraction: { type: Number, required: true, min: 0, max: 1 },
    edgeEpsilonFraction: { type: Number, required: true, min: 0, max: 0.5 },
    cooldownSeconds: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const visionSettingsSchema = new Schema(
  {
    cameraId: { type: String, required: true, unique: true, index: true },
    processingIntervalMs: { type: Number, required: true, default: 500 },
    retentionDays: { type: Number, required: true, default: 14 },
    detectors: { type: [detectionTypeConfigSchema], default: [] },
    restrictedArea: { type: restrictedAreaSettingsSchema, default: defaultRestrictedAreaSettings },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const VisionSettings = model('VisionSettings', visionSettingsSchema);

/**
 * Why a policy engine let this alert exist, filled in by restricted-area
 * enforcement in a later phase.
 *
 * Null on every alert today, and on anything a browser pipeline posts
 * directly: those were never evaluated, and claiming otherwise would put a
 * provenance on them that nobody established.
 */
const alertPolicySchema = new Schema(
  {
    decisionId: { type: Schema.Types.ObjectId, ref: 'PolicyDecision', default: null },
    subject: { type: String, enum: POLICY_SUBJECTS, required: true },
    /** `unidentified_policy` here is what tells a reviewer the no-credential policy applied. */
    ruleSource: { type: String, enum: RULE_SOURCES, required: true },
    unidentifiedReason: { type: String, enum: [...UNIDENTIFIED_REASONS, null], default: null },
    personId: { type: Schema.Types.ObjectId, ref: 'Person', default: null },
    personName: { type: String, default: null },
    roleKey: { type: String, default: null },
    aprilTagId: { type: Number, default: null },
    zoneId: { type: Schema.Types.ObjectId, ref: 'Zone', default: null },
  },
  { _id: false },
);

const visionAlertSchema = new Schema(
  {
    cameraId: { type: String, required: true, index: true },
    // Accepts retired types, and `apriltag` from before it became a silent
    // identity credential, so alerts recorded then stay valid documents.
    // Creation is restricted to alerting types by the controller.
    type: { type: String, enum: ALL_DETECTION_TYPES, required: true, index: true },
    severity: { type: String, enum: ALERT_SEVERITIES, required: true, default: 'warning' },
    status: { type: String, enum: ALERT_STATUSES, required: true, default: 'new' },
    read: { type: Boolean, required: true, default: false },
    zoneName: { type: String, default: null },
    confidence: { type: Number, required: true },
    message: { type: String, required: true },
    snapshot: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    /** Repeats of the same detection inside the cooldown window fold in here instead of creating duplicates. */
    occurrences: { type: Number, required: true, default: 1, min: 1 },
    lastOccurredAt: { type: Date, required: true, default: Date.now },
    /** Legacy flag, kept in sync with `status` — see acknowledgedForStatus(). */
    acknowledged: { type: Boolean, default: false },
    /** Who triaged this alert, and when. Detections themselves are machine-created. */
    statusChangedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    statusChangedAt: { type: Date, default: null },
    /** Schema only in this phase — nothing writes it until enforcement ships. */
    policy: { type: alertPolicySchema, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

visionAlertSchema.index({ cameraId: 1, createdAt: -1 });
visionAlertSchema.index({ status: 1, severity: 1, createdAt: -1 });
visionAlertSchema.index({ read: 1, createdAt: -1 });
visionAlertSchema.index({ zoneName: 1, createdAt: -1 });

export const VisionAlert = model('VisionAlert', visionAlertSchema);
