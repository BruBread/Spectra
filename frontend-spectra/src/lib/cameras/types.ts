export type CameraSourceType = 'local-device' | 'hls-stream' | 'mjpeg-stream';

export interface CameraRecord {
  id: string;
  name: string;
  location: string;
  zone: string;
  sourceType: CameraSourceType;
  streamUrl: string | null;
  preferredDeviceId: string | null;
  preferredDeviceLabel: string | null;
  detectionEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewCameraInput {
  name: string;
  location?: string;
  zone?: string;
  sourceType: CameraSourceType;
  streamUrl?: string;
  preferredDeviceId?: string;
  preferredDeviceLabel?: string;
}

export const CAMERA_SOURCE_LABELS: Record<CameraSourceType, string> = {
  'local-device': 'Local device (webcam/USB)',
  'hls-stream': 'HLS stream URL',
  'mjpeg-stream': 'MJPEG stream URL',
};

/** MJPEG renders via <img>, not <video>, so it doesn't feed the AI detection pipeline (see CameraTile). */
export function supportsDetection(sourceType: CameraSourceType): boolean {
  return sourceType === 'local-device' || sourceType === 'hls-stream';
}
