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

export function createCamera(input: CreateCameraInput) {
  return Camera.create(input);
}

export function updateCamera(id: string, updates: Partial<CreateCameraInput>) {
  return Camera.findByIdAndUpdate(id, { $set: updates }, { new: true });
}

export function deleteCamera(id: string) {
  return Camera.findByIdAndDelete(id);
}
