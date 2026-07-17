import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ACTION_KEYS, POLICY_RULES } from './action.catalog.js';
import { UNIDENTIFIED_SUBJECT } from './policy.types.js';

const unidentifiedRuleSchema = new Schema(
  {
    action: { type: String, enum: ACTION_KEYS, required: true },
    zoneId: { type: Schema.Types.ObjectId, ref: 'Zone', default: null },
    rule: { type: String, enum: POLICY_RULES, required: true },
    /**
     * Attribution per rule, not just per document.
     *
     * `allow` here admits *every* unidentified person in that context, so who
     * turned it on and when has to survive the next unrelated edit.
     */
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

/**
 * Policy for people the cameras cannot identify.
 *
 * A single document, keyed by a fixed value. This is deliberately not a Role
 * and not a Person: it must never be assignable to anybody, deletable, or
 * creatable by an administrator, and it has no credentials of its own.
 *
 * An absent document means every action restricts, so there is nothing to
 * seed — and no code path can produce a permissive default.
 */
const unidentifiedPolicySchema = new Schema(
  {
    singleton: {
      type: String,
      default: UNIDENTIFIED_SUBJECT,
      enum: [UNIDENTIFIED_SUBJECT],
      unique: true,
      immutable: true,
      required: true,
    },
    /** Explicit rules only. Anything absent restricts. */
    rules: { type: [unidentifiedRuleSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export type UnidentifiedPolicyDocument = HydratedDocument<InferSchemaType<typeof unidentifiedPolicySchema>>;

export const UnidentifiedPolicy = model('UnidentifiedPolicy', unidentifiedPolicySchema);
