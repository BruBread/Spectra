import { Camera } from './cameras.model.js';
import type { CameraSourceType } from './cameras.types.js';

export function listCameras() {
  return Camera.find().sort({ createdAt: -1 });
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
