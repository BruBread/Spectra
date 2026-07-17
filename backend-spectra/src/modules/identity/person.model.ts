import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const personSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Exactly one role in this MVP. */
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true, index: true },
    active: { type: Boolean, required: true, default: true },
    notes: { type: String, default: '' },
    /**
     * The camera-visible credential. Optional: a person may exist without a
     * badge, they simply can't be identified by a camera.
     */
    aprilTagId: { type: Number, default: null },
    /**
     * Optional wristband. Corroboration only — it can say a registered device
     * is active, never that this person is the body in a frame, and it grants
     * no permissions on its own.
     */
    loraDeviceId: { type: String, default: null, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

/**
 * Unique only when present.
 *
 * `sparse` would not do this job: it skips documents where the field is
 * *missing*, but these default to an explicit `null`, so every unbadged
 * person would collide on the same null. A partial index keyed on the value's
 * type only covers rows that actually carry a credential.
 */
personSchema.index(
  { aprilTagId: 1 },
  { unique: true, partialFilterExpression: { aprilTagId: { $type: 'number' } } },
);
personSchema.index(
  { loraDeviceId: 1 },
  { unique: true, partialFilterExpression: { loraDeviceId: { $type: 'string' } } },
);

export type PersonDocument = HydratedDocument<InferSchemaType<typeof personSchema>>;

export const Person = model('Person', personSchema);
