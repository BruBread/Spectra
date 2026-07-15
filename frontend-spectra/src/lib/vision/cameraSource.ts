import Hls from 'hls.js';
import type { CameraRecord } from '../cameras/types';

export type CameraErrorReason =
  | 'unsupported'
  | 'permission-denied'
  | 'not-found'
  | 'in-use'
  | 'stream-error'
  | 'unknown';

export class CameraSourceError extends Error {
  reason: CameraErrorReason;

  constructor(reason: CameraErrorReason, message: string) {
    super(message);
    this.name = 'CameraSourceError';
    this.reason = reason;
  }
}

/**
 * Anything that can wire itself into a <video> element implements this — the
 * detection pipeline only ever talks to that <video>, so swapping in new
 * hardware/protocols later means writing a new CameraSource without
 * touching any detection code. MJPEG deliberately isn't a CameraSource: it
 * renders through <img>, not <video>, so it's handled separately in
 * CameraTile and never enters the detection pipeline.
 */
export interface CameraSource {
  readonly id: string;
  readonly name: string;
  attach(video: HTMLVideoElement): Promise<void>;
  stop(): void;
}

/** A camera attached to (or built into) the machine running the browser, via getUserMedia. */
export class LocalDeviceSource implements CameraSource {
  readonly id: string;
  readonly name: string;
  private deviceId?: string;
  private stream: MediaStream | null = null;

  constructor(options: { id?: string; name?: string; deviceId?: string } = {}) {
    this.id = options.id ?? 'local-default';
    this.name = options.name ?? 'Local camera';
    this.deviceId = options.deviceId;
  }

  async attach(video: HTMLVideoElement): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new CameraSourceError('unsupported', 'This browser does not support camera access.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: this.deviceId
          ? { deviceId: { exact: this.deviceId } }
          : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
    } catch (error) {
      // A remembered deviceId can go stale (unplugged, different machine/browser) —
      // fall back to whatever default camera is available rather than hard-failing.
      if (this.deviceId) {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
        } catch (fallbackError) {
          throw mapGetUserMediaError(fallbackError);
        }
      } else {
        throw mapGetUserMediaError(error);
      }
    }

    video.srcObject = this.stream;
    await video.play();
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

/** Back-compat alias used by the Live Monitor "quick test" flow. */
export class WebcamSource extends LocalDeviceSource {
  constructor() {
    super({ id: 'webcam-default', name: 'This browser’s webcam' });
  }
}

/** An HLS stream URL — e.g. from an NVR/camera bridge that transcodes RTSP to HLS for browsers. */
export class HlsStreamSource implements CameraSource {
  readonly id: string;
  readonly name: string;
  private url: string;
  private hls: Hls | null = null;

  constructor(options: { id: string; name: string; url: string }) {
    this.id = options.id;
    this.name = options.name;
    this.url = options.url;
  }

  async attach(video: HTMLVideoElement): Promise<void> {
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari plays HLS natively — using it directly avoids double-decoding through hls.js's MSE path.
      video.src = this.url;
      await video.play();
      return;
    }

    if (!Hls.isSupported()) {
      throw new CameraSourceError('unsupported', 'This browser cannot play HLS streams.');
    }

    return new Promise((resolve, reject) => {
      const hls = new Hls();
      this.hls = hls;

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        hls.destroy();
        this.hls = null;
        reject(new CameraSourceError('stream-error', `Could not load the stream (${data.details}).`));
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().then(resolve).catch(reject);
      });

      hls.loadSource(this.url);
      hls.attachMedia(video);
    });
  }

  stop(): void {
    this.hls?.destroy();
    this.hls = null;
  }
}

/** Builds the right CameraSource for a registered camera's stored source config. */
export function createCameraSource(camera: CameraRecord): CameraSource {
  if (camera.sourceType === 'hls-stream') {
    return new HlsStreamSource({ id: camera.id, name: camera.name, url: camera.streamUrl ?? '' });
  }
  return new LocalDeviceSource({
    id: camera.id,
    name: camera.name,
    deviceId: camera.preferredDeviceId ?? undefined,
  });
}

function mapGetUserMediaError(error: unknown): CameraSourceError {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraSourceError(
        'permission-denied',
        'Camera access was denied. Allow camera permission for this site in your browser settings and try again.',
      );
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraSourceError('not-found', 'No camera was found on this device.');
    case 'NotReadableError':
    case 'AbortError':
      return new CameraSourceError('in-use', 'The camera is already in use by another application.');
    default:
      return new CameraSourceError('unknown', 'Could not access the camera. Please try again.');
  }
}
