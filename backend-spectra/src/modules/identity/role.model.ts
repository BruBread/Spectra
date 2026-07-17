import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ACTION_KEYS, POLICY_RULES } from '../policy/action.catalog.js';

const actionRuleSchema = new Schema(
  {
    /** Constrained to the code-defined catalog: an unknown action is not configurable. */
    action: { type: String, enum: ACTION_KEYS, required: true },
    /** Set for a zone-scoped action; null for a global one. */
    zoneId: { type: Schema.Types.ObjectId, ref: 'Zone', default: null },
    rule: { type: String, enum: POLICY_RULES, required: true },
  },
  { _id: false },
);

const rolePermissionsSchema = new Schema(
  {
    /**
     * Explicit rules only. An action or zone with no rule here restricts —
     * absence is not permission, so an empty list grants nothing.
     */
    actions: { type: [actionRuleSchema], default: [] },
  },
  { _id: false },
);

const roleSchema = new Schema(
  {
    /** Stable machine name (e.g. `security_guard`). Not editable once created. */
    key: { type: String, required: true, unique: true, index: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    active: { type: Boolean, required: true, default: true },
    permissions: { type: rolePermissionsSchema, default: () => ({}) },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export type RoleDocument = HydratedDocument<InferSchemaType<typeof roleSchema>>;

export const Role = model('Role', roleSchema);
