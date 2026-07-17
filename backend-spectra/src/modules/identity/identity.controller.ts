import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import * as roleService from './role.service.js';
import * as personService from './person.service.js';
import { listKnownLoraDevices } from './loraDevices.service.js';
import { Zone } from '../zones/zones.model.js';
import { RESERVED_ROLE_KEYS, type RolePermissions } from './identity.types.js';
import { parseActionRules } from '../policy/actionRules.validate.js';
import type { ActionRule } from '../policy/action.catalog.js';

function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && mongoose.isValidObjectId(value);
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function duplicateKeyField(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
    const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern;
    return keyPattern ? Object.keys(keyPattern)[0] ?? 'field' : 'field';
  }
  return null;
}

/**
 * Validates a role's permissions payload.
 *
 * `actions` replaces the whole rule set, so a caller sending it must send
 * every rule the role should keep.
 */
async function parsePermissions(value: unknown): Promise<RolePermissions | { error: string }> {
  if (typeof value !== 'object' || value === null) return { error: 'permissions must be an object' };

  const input = value as { actions?: unknown };
  if (input.actions === undefined) return { error: 'permissions.actions is required' };

  const rules = await parseActionRules(input.actions);
  if ('error' in rules) return { error: rules.error };

  return { actions: rules as ActionRule[] };
}

/* ----------------------------------- roles ---------------------------------- */

export async function listRoles(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await roleService.listRoles({ active: parseBoolean(req.query.active) }));
  } catch (error) {
    next(error);
  }
}

export async function getRole(req: Request, res: Response, next: NextFunction) {
  try {
    const role = await roleService.findRoleById(String(req.params.id));
    if (!role) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
    res.json(role);
  } catch (error) {
    next(error);
  }
}

export async function createRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { key, name, description, permissions } = req.body ?? {};

    if (typeof key !== 'string' || !/^[a-z0-9_]+$/.test(key)) {
      res.status(400).json({ error: 'key is required and may contain only lowercase letters, numbers and underscores' });
      return;
    }
    if (RESERVED_ROLE_KEYS.includes(key)) {
      // Sharing a key with the policy subject would make every decision's
      // origin ambiguous — role rule, or unidentified-person policy?
      res.status(400).json({ error: `"${key}" is reserved for the policy subject of the same name and cannot be a role key` });
      return;
    }
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    let parsed: RolePermissions | undefined;
    if (permissions !== undefined) {
      const result = await parsePermissions(permissions);
      if ('error' in result) {
        res.status(400).json({ error: result.error });
        return;
      }
      parsed = result;
    }

    const role = await roleService.createRole({ key, name: name.trim(), description, permissions: parsed }, req.user!.id);
    res.status(201).json(role);
  } catch (error) {
    if (duplicateKeyField(error) === 'key') {
      res.status(409).json({ error: `A role with key "${req.body?.key}" already exists` });
      return;
    }
    next(error);
  }
}

export async function updateRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description, active, permissions } = req.body ?? {};
    const updates: Parameters<typeof roleService.updateRole>[1] = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'name cannot be empty' });
        return;
      }
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = String(description);
    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        res.status(400).json({ error: 'active must be a boolean' });
        return;
      }
      updates.active = active;
    }
    if (permissions !== undefined) {
      const result = await parsePermissions(permissions);
      if ('error' in result) {
        res.status(400).json({ error: result.error });
        return;
      }
      updates.permissions = result;
    }
    if (req.body?.key !== undefined) {
      res.status(400).json({ error: 'key cannot be changed — recorded policy decisions refer to it' });
      return;
    }

    const role = await roleService.updateRole(String(req.params.id), updates, req.user!.id);
    if (!role) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
    res.json(role);
  } catch (error) {
    next(error);
  }
}

export async function deleteRole(req: Request, res: Response, next: NextFunction) {
  try {
    const role = await roleService.findRoleById(String(req.params.id));
    if (!role) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    const { deleted, usage } = await roleService.deleteRole(String(req.params.id));
    if (!deleted) {
      res.status(409).json({
        error: `Role "${role.key}" is still in use and cannot be deleted. Deactivate it instead.`,
        usage,
      });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

/* ---------------------------------- people ---------------------------------- */

export async function listPeople(req: Request, res: Response, next: NextFunction) {
  try {
    const { roleId, q } = req.query;
    if (roleId !== undefined && !isObjectId(roleId)) {
      res.status(400).json({ error: 'roleId must be a valid role id' });
      return;
    }
    res.json(
      await personService.listPeople({
        active: parseBoolean(req.query.active),
        roleId: isObjectId(roleId) ? roleId : undefined,
        q: typeof q === 'string' && q.trim() ? q.trim() : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
}

export async function getPerson(req: Request, res: Response, next: NextFunction) {
  try {
    const person = await personService.findPersonById(String(req.params.id));
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }
    res.json(person);
  } catch (error) {
    next(error);
  }
}

/** Shared field validation for create and update. Returns null when valid. */
async function validatePersonFields(body: Record<string, unknown>, requireCore: boolean): Promise<string | null> {
  if (requireCore || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return 'name is required';
  }
  if (requireCore || body.roleId !== undefined) {
    if (!isObjectId(body.roleId)) return 'roleId must be a valid role id';
    const role = await roleService.findRoleById(body.roleId as string);
    if (!role) return 'roleId does not match an existing role';
  }
  if (body.aprilTagId !== undefined && body.aprilTagId !== null) {
    if (typeof body.aprilTagId !== 'number' || !Number.isInteger(body.aprilTagId) || body.aprilTagId < 0) {
      return 'aprilTagId must be a non-negative integer, or null to clear it';
    }
  }
  if (body.loraDeviceId !== undefined && body.loraDeviceId !== null) {
    if (typeof body.loraDeviceId !== 'string' || !body.loraDeviceId.trim()) {
      return 'loraDeviceId must be a non-empty string, or null to clear it';
    }
  }
  if (body.active !== undefined && typeof body.active !== 'boolean') return 'active must be a boolean';
  return null;
}

export async function createPerson(req: Request, res: Response, next: NextFunction) {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const invalid = await validatePersonFields(body, true);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    const person = await personService.createPerson(
      {
        name: String(body.name).trim(),
        roleId: String(body.roleId),
        notes: body.notes === undefined ? undefined : String(body.notes),
        aprilTagId: (body.aprilTagId as number | null | undefined) ?? null,
        loraDeviceId: body.loraDeviceId ? String(body.loraDeviceId).trim() : null,
        active: body.active as boolean | undefined,
      },
      req.user!.id,
    );
    res.status(201).json(person);
  } catch (error) {
    const field = duplicateKeyField(error);
    if (field === 'aprilTagId' || field === 'loraDeviceId') {
      res.status(409).json({ error: `That ${field === 'aprilTagId' ? 'AprilTag ID' : 'LoRa device ID'} is already assigned to another person` });
      return;
    }
    next(error);
  }
}

export async function updatePerson(req: Request, res: Response, next: NextFunction) {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const invalid = await validatePersonFields(body, false);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.roleId !== undefined) updates.roleId = String(body.roleId);
    if (body.notes !== undefined) updates.notes = String(body.notes);
    if (body.active !== undefined) updates.active = body.active;
    if (body.aprilTagId !== undefined) updates.aprilTagId = body.aprilTagId;
    if (body.loraDeviceId !== undefined) {
      updates.loraDeviceId = body.loraDeviceId === null ? null : String(body.loraDeviceId).trim();
    }

    const person = await personService.updatePerson(String(req.params.id), updates, req.user!.id);
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }
    res.json(person);
  } catch (error) {
    const field = duplicateKeyField(error);
    if (field === 'aprilTagId' || field === 'loraDeviceId') {
      res.status(409).json({ error: `That ${field === 'aprilTagId' ? 'AprilTag ID' : 'LoRa device ID'} is already assigned to another person` });
      return;
    }
    next(error);
  }
}

/* ------------------------------- lora devices ------------------------------- */

export async function listLoraDevices(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await listKnownLoraDevices());
  } catch (error) {
    next(error);
  }
}
