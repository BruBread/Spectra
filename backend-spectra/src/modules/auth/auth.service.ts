import { User, type UserDocument } from './auth.model.js';
import { hashPassword, verifyPassword } from './auth.password.js';
import type { AdminRole, PublicUser } from './auth.types.js';

/** Strips the password hash and normalizes ids/dates for API responses. */
export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role as AdminRole,
    active: user.active,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

export function findUserById(id: string) {
  return User.findById(id);
}

/**
 * Verifies an email/password pair. Returns null for unknown email, wrong
 * password, and deactivated accounts alike — the caller must not tell them
 * apart, or the endpoint becomes an account enumeration oracle.
 */
export async function authenticate(email: string, password: string) {
  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user || !user.active) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: AdminRole;
  createdBy?: string | null;
}) {
  const passwordHash = await hashPassword(input.password);
  return User.create({
    name: input.name,
    email: input.email.trim().toLowerCase(),
    passwordHash,
    role: input.role,
    active: true,
    createdBy: input.createdBy ?? null,
    updatedBy: input.createdBy ?? null,
  });
}

export async function updateProfile(id: string, updates: { name?: string; email?: string }) {
  return User.findByIdAndUpdate(
    id,
    {
      $set: {
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.email !== undefined && { email: updates.email.trim().toLowerCase() }),
        updatedBy: id,
      },
    },
    { new: true, runValidators: true },
  );
}

/** Returns false when the current password doesn't match, so the caller can 400 without leaking more. */
export async function changePassword(id: string, currentPassword: string, newPassword: string): Promise<boolean> {
  const user = await User.findById(id);
  if (!user) return false;

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) return false;

  user.passwordHash = await hashPassword(newPassword);
  user.updatedBy = user._id;
  await user.save();
  return true;
}

export function countUsers() {
  return User.countDocuments();
}
