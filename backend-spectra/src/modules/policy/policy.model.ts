import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { IDENTITY_STATES, POLICY_DECISION_OUTCOMES } from '../identity/identity.types.js';
import { ALL_DETECTION_TYPES } from '../vision/vision.types.js';

/**
 * Audit record for one policy evaluation.
 *
 * Nothing writes these yet — policy evaluation lands in a later phase. The
 * model exists now so the shape is settled and reviewable before anything
 * depends on it.
 *
 * A suppressed detection produces no alert, so this record is the only trace
 * it ever happened. That is why the detection context is stored inline rather
 * than referenced: it has to stand on its own.
 */
const policyDecisionSchema = new Schema(
  {
    detectionType: { type: String, enum: ALL_DETECTION_TYPES, required: true, index: true },
    cameraId: { type: String, required: true, index: true },
    zoneId: { type: Schema.Types.ObjectId, ref: 'Zone', default: null, index: true },
    zoneName: { type: String, default: null },

    /** How the subject was identified — `unidentified` unless a badge matched. */
    identityState: { type: String, enum: IDENTITY_STATES, required: true, index: true },
    personId: { type: Schema.Types.ObjectId, ref: 'Person', default: null, index: true },
    personName: { type: String, default: null },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', default: null },
    roleKey: { type: String, default: null },
    /** The credential that produced the match, when there was one. */
    aprilTagId: { type: Number, default: null },
    /** Context only: a nearby wristband never identifies anyone or grants permission. */
    loraDeviceId: { type: String, default: null },
    loraCorroborated: { type: Boolean, required: true, default: false },
    loraLastSeenAt: { type: Date, default: null },

    decision: { type: String, enum: POLICY_DECISION_OUTCOMES, required: true, index: true },
    /** Human-readable explanation of why this outcome was reached. */
    reason: { type: String, required: true },
    /** Which policy applied, when one did. */
    roleZoneAllowed: { type: Boolean, default: null },
    weaponExemptApplied: { type: Boolean, default: null },

    /** Null when the decision suppressed the detection — no alert exists to point at. */
    alertId: { type: Schema.Types.ObjectId, ref: 'VisionAlert', default: null, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

policyDecisionSchema.index({ createdAt: -1 });
policyDecisionSchema.index({ decision: 1, createdAt: -1 });

export type PolicyDecisionDocument = HydratedDocument<InferSchemaType<typeof policyDecisionSchema>>;

export const PolicyDecision = model('PolicyDecision', policyDecisionSchema);
