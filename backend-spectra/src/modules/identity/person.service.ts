import { Person } from './person.model.js';
import { APRILTAG_MAX_ID, APRILTAG_MIN_ID } from './aprilTagDictionary.js';

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
  /**
   * The AprilTag is deliberately absent: it is never client-supplied. The
   * server allocates it on create and manages its whole lifecycle (issue,
   * release). A LoRa device remains optional and independent.
   */
  loraDeviceId?: string | null;
  active?: boolean;
}

/** Raised when every valid 36h11 id is already held by an assigned person. */
export class AprilTagPoolExhaustedError extends Error {
  constructor() {
    super(
      'No AprilTag 36h11 IDs are available — every id in the dictionary is currently assigned. Remove and release a person to free one.',
    );
    this.name = 'AprilTagPoolExhaustedError';
  }
}

/** A duplicate-key error specifically on the aprilTagId index — i.e. a lost allocation race. */
function isAprilTagDuplicate(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error) || (error as { code?: number }).code !== 11000) {
    return false;
  }
  return Boolean((error as { keyPattern?: Record<string, unknown> }).keyPattern?.aprilTagId);
}

/**
 * The smallest free valid AprilTag id, from the ids currently held by assigned
 * people.
 *
 * Only a *numeric* aprilTagId blocks an id, so a person who was merely
 * deactivated keeps their tag reserved; only an explicit Remove and Release
 * clears a tag (to null) and returns it to this pool.
 */
export async function nextAvailableAprilTagId(): Promise<number> {
  // aprilTagId is only ever a number or null, so "not null" is exactly the set
  // of assigned tags (and sidesteps the $type numeric-alias typing friction).
  const holders = await Person.find({ aprilTagId: { $ne: null } })
    .select('aprilTagId')
    .lean();
  const taken = new Set<number>(holders.map((holder) => holder.aprilTagId as number));
  for (let id = APRILTAG_MIN_ID; id <= APRILTAG_MAX_ID; id += 1) {
    if (!taken.has(id)) return id;
  }
  throw new AprilTagPoolExhaustedError();
}

// A handful of retries absorbs concurrent creates racing for the same lowest id;
// the unique index remains the final arbiter, so this only ever costs a re-pick.
const MAX_ALLOCATION_ATTEMPTS = 8;

export async function createPerson(input: PersonInput, actorId: string) {
  // The server owns the AprilTag credential: it allocates the lowest free id,
  // and if a concurrent create grabbed it first (the index rejects the second),
  // it recomputes and retries rather than surfacing a race to the caller.
  for (let attempt = 1; ; attempt += 1) {
    const aprilTagId = await nextAvailableAprilTagId();
    try {
      const person = await Person.create({
        name: input.name,
        roleId: input.roleId,
        notes: input.notes ?? '',
        active: input.active ?? true,
        aprilTagId,
        loraDeviceId: input.loraDeviceId ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      });
      return findPersonById(String(person._id));
    } catch (error) {
      if (isAprilTagDuplicate(error) && attempt < MAX_ALLOCATION_ATTEMPTS) continue;
      throw error;
    }
  }
}

/**
 * Applies a partial update. The AprilTag is intentionally not updatable here —
 * it is only ever set by allocation (create / issue) and cleared by Remove and
 * Release — so an admin cannot hand-pick or edit a tag. Reassigning a role is
 * just `roleId`, and deactivating is just `active: false`; a person is never
 * deleted, so the credentials they hold stay accounted for.
 */
export async function updatePerson(id: string, updates: Partial<PersonInput>, actorId: string) {
  const set: Record<string, unknown> = { updatedBy: actorId };
  for (const field of ['name', 'roleId', 'notes', 'active', 'loraDeviceId'] as const) {
    if (updates[field] !== undefined) set[field] = updates[field];
  }

  const person = await Person.findByIdAndUpdate(id, { $set: set }, { new: true, runValidators: true });
  if (!person) return null;
  return findPersonById(String(person._id));
}

export type IssueAprilTagResult =
  | { status: 'ok'; person: Awaited<ReturnType<typeof findPersonById>> }
  | { status: 'not-found' }
  | { status: 'inactive' }
  | { status: 'already-assigned'; aprilTagId: number }
  | { status: 'exhausted' };

/**
 * Allocates the next free tag to an existing active person who has none — the
 * path for people registered before automatic assignment, or reactivated after
 * a release. Refuses a person who already holds a tag (nothing to do) or an
 * inactive one (a tag is only issued to someone active).
 */
export async function issueAprilTag(id: string, actorId: string): Promise<IssueAprilTagResult> {
  const existing = await Person.findById(id).select('aprilTagId active').lean();
  if (!existing) return { status: 'not-found' };
  if (typeof existing.aprilTagId === 'number') return { status: 'already-assigned', aprilTagId: existing.aprilTagId };
  if (!existing.active) return { status: 'inactive' };

  for (let attempt = 1; ; attempt += 1) {
    let aprilTagId: number;
    try {
      aprilTagId = await nextAvailableAprilTagId();
    } catch (error) {
      if (error instanceof AprilTagPoolExhaustedError) return { status: 'exhausted' };
      throw error;
    }
    try {
      const updated = await Person.findByIdAndUpdate(
        id,
        { $set: { aprilTagId, updatedBy: actorId } },
        { new: true, runValidators: true },
      );
      if (!updated) return { status: 'not-found' };
      return { status: 'ok', person: await findPersonById(id) };
    } catch (error) {
      if (isAprilTagDuplicate(error) && attempt < MAX_ALLOCATION_ATTEMPTS) continue;
      throw error;
    }
  }
}

/**
 * Archives a person and releases both credentials.
 *
 * The record is kept (so past policy/device audit rows still resolve) but set
 * inactive with its AprilTag and LoRa id cleared, returning both to the
 * available pool. This is the *only* path that frees a tag — an ordinary
 * deactivate never does.
 */
export async function removeAndReleasePerson(id: string, actorId: string) {
  const person = await Person.findByIdAndUpdate(
    id,
    { $set: { active: false, aprilTagId: null, loraDeviceId: null, updatedBy: actorId } },
    { new: true },
  );
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
