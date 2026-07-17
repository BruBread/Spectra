import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const rectSchema = new Schema(
  {
    // Relative to the frame (0–1), matching the detector zone format already
    // used by vision settings, so a zone means the same thing at any
    // resolution.
    x: { type: Number, required: true, min: 0, max: 1 },
    y: { type: Number, required: true, min: 0, max: 1 },
    width: { type: Number, required: true, min: 0, max: 1 },
    height: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false },
);

const zoneSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    /** A zone is a region of one camera's frame, so it belongs to that camera. */
    cameraId: { type: Schema.Types.ObjectId, ref: 'Camera', required: true, index: true },
    rect: { type: rectSchema, required: true },
    active: { type: Boolean, required: true, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

/** Two zones on one camera can't share a name — policies refer to them by name in the UI. */
zoneSchema.index({ cameraId: 1, name: 1 }, { unique: true });

export type ZoneDocument = HydratedDocument<InferSchemaType<typeof zoneSchema>>;

export const Zone = model('Zone', zoneSchema);
