import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ACTION_KEYS, POLICY_RULES, RULE_SOURCES } from './action.catalog.js';
import { POLICY_DECISION_OUTCOMES, POLICY_SUBJECTS, UNIDENTIFIED_REASONS } from './policy.types.js';

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
    /** Which catalog action was evaluated. */
    action: { type: String, enum: ACTION_KEYS, required: true, index: true },
    cameraId: { type: String, required: true, index: true },
    zoneId: { type: Schema.Types.ObjectId, ref: 'Zone', default: null, index: true },
    zoneName: { type: String, default: null },

    /**
     * Who the rule was about: a specific identified person, or the reserved
     * unidentified-person subject.
     */
    subject: { type: String, enum: POLICY_SUBJECTS, required: true, index: true },
    /** Why nobody could be identified. Null when subject is `person`. */
    unidentifiedReason: { type: String, enum: [...UNIDENTIFIED_REASONS, null], default: null },

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

    /** The rule that applied. */
    ruleApplied: { type: String, enum: POLICY_RULES, required: true },
    /**
     * Where that rule came from. `default` means nobody wrote one and the
     * restrict default caught it — worth telling apart from an administrator
     * deliberately choosing restrict.
     */
    ruleSource: { type: String, enum: RULE_SOURCES, required: true, index: true },

    decision: { type: String, enum: POLICY_DECISION_OUTCOMES, required: true, index: true },
    /** Human-readable explanation of why this outcome was reached. */
    reason: { type: String, required: true },

    /** Null when the decision suppressed the detection — no alert exists to point at. */
    alertId: { type: Schema.Types.ObjectId, ref: 'VisionAlert', default: null, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

policyDecisionSchema.index({ createdAt: -1 });
policyDecisionSchema.index({ decision: 1, createdAt: -1 });

export type PolicyDecisionDocument = HydratedDocument<InferSchemaType<typeof policyDecisionSchema>>;

export const PolicyDecision = model('PolicyDecision', policyDecisionSchema);
