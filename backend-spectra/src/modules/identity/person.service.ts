import { Person } from './person.model.js';

export interface ListPeopleFilter {
  active?: boolean;
  roleId?: string;
  /** Case-insensitive name search. */
  q?: string;
}

export function listPeople(filter: ListPeopleFilter = {}) {
  const query: Record<string, unknown> = {};
  if (filter.active !== undefined) query.active = filter.active;
  if (filter.roleId) query.roleId = filter.roleId;
  if (filter.q) query.name = { $regex: filter.q, $options: 'i' };
  return Person.find(query).sort({ name: 1 }).populate('roleId', 'key name active');
}

export function findPersonById(id: string) {
  return Person.findById(id).populate('roleId', 'key name active');
}

export interface PersonInput {
  name: string;
  roleId: string;
  notes?: string;
  /** Null clears the credential; undefined leaves it untouched. */
  aprilTagId?: number | null;
  loraDeviceId?: string | null;
  active?: boolean;
}

export async function createPerson(input: PersonInput, actorId: string) {
  const person = await Person.create({
    name: input.name,
    roleId: input.roleId,
    notes: input.notes ?? '',
    active: input.active ?? true,
    aprilTagId: input.aprilTagId ?? null,
    loraDeviceId: input.loraDeviceId ?? null,
    createdBy: actorId,
    updatedBy: actorId,
  });
  return findPersonById(String(person._id));
}

/**
 * Applies a partial update. Reassigning a role is just `roleId`, and
 * deactivating is just `active: false` — a person is never deleted, so the
 * credentials they held stay accounted for.
 */
export async function updatePerson(id: string, updates: Partial<PersonInput>, actorId: string) {
  const set: Record<string, unknown> = { updatedBy: actorId };
  for (const field of ['name', 'roleId', 'notes', 'active', 'aprilTagId', 'loraDeviceId'] as const) {
    if (updates[field] !== undefined) set[field] = updates[field];
  }

  const person = await Person.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true });
  if (!person) return null;
  return findPersonById(String(person._id));
}

export function countPeopleWithRole(roleId: string) {
  return Person.countDocuments({ roleId });
}

/** Every LoRa device currently assigned to somebody, with who holds it. */
export function peopleWithLoraDevices() {
  return Person.find({ loraDeviceId: { $type: 'string' } }).select('name loraDeviceId active');
}
