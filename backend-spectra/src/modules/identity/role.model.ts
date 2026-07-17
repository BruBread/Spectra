import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const roleZoneAccessSchema = new Schema(
  {
    zoneId: { type: Schema.Types.ObjectId, ref: 'Zone', required: true },
    allowed: { type: Boolean, required: true },
  },
  { _id: false },
);

const rolePermissionsSchema = new Schema(
  {
    /** Suppressing a weapon alert additionally requires a matched AprilTag — see identity.types.ts. */
    weaponExempt: { type: Boolean, required: true, default: false },
    /** A zone missing from this list is denied: absence is not permission. */
    zones: { type: [roleZoneAccessSchema], default: [] },
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
