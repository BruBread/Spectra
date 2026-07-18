import { Camera } from './cameras.model.js';
import type { CameraSourceType } from './cameras.types.js';

export function listCameras() {
  return Camera.find().sort({ createdAt: -1 });
}

/**
 * Whether a stream URL is already registered on some camera.
 *
 * Two cameras pointing at the same URL are the same physical stream, so they
 * would show an identical feed — registering the duplicate is refused. `exclude`
 * lets an update ignore the camera being edited so saving it unchanged doesn't
 * collide with itself.
 */
export async function streamUrlInUse(streamUrl: string, excludeId?: string): Promise<boolean> {
  const query: Record<string, unknown> = { streamUrl };
  if (excludeId) query._id = { $ne: excludeId };
  return (await Camera.exists(query)) !== null;
}

interface CreateCameraInput {
  name: string;
  location?: string;
  zone?: string;
  sourceType: CameraSourceType;
  streamUrl?: string;
  preferredDeviceId?: string;
  preferredDeviceLabel?: string;
  detectionEnabled?: boolean;
}

export function createCamera(input: CreateCameraInput, actorId: string) {
  return Camera.create({ ...input, createdBy: actorId, updatedBy: actorId });
}

export function updateCamera(id: string, updates: Partial<CreateCameraInput>, actorId: string) {
  return Camera.findByIdAndUpdate(id, { $set: { ...updates, updatedBy: actorId } }, { new: true });
}

export function deleteCamera(id: string) {
  return Camera.findByIdAndDelete(id);
}
