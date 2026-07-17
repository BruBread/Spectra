import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ADMIN_ROLES } from './auth.types.js';

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    /** scrypt hash — see auth.password.ts. Never select this into API responses. */
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ADMIN_ROLES, required: true, default: 'operator' },
    active: { type: Boolean, required: true, default: true },
    lastLoginAt: { type: Date, default: null },
    /** Null for the env-seeded bootstrap account, which no user creates. */
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const User = model('User', userSchema);
