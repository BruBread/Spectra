import type { LocalDeviceSource } from './cameraSource';
import type { ModelLoadStatus, VisionTickResult } from './pipeline';

/**
 * Keeps local-device (getUserMedia) camera streams alive above any single view.
 *
 * A `MediaStream` can be attached to many `<video>` elements at once, so one
 * running webcam can be shown on the Cameras grid, its details modal, and Live
 * Monitor simultaneously. This manager is a module-level singleton — it lives
 * outside React, so a started camera survives navigation between pages instead
 * of being torn down when a page unmounts. A camera turns off only on an
 * explicit Stop (or a full page reload), never on a route change.
 *
 * It also arbitrates a single **detection owner** per camera: only one view runs
 * the (expensive) detection pipeline against a shared stream at a time, so two
 * mounted views can't both burn CPU or double-post alerts. The owner publishes
 * each tick here and every other view of that camera mirrors it, so all of them
 * draw the same boxes for the price of one pipeline. Without that broadcast a
 * non-owner view (the details modal opened over an already-detecting grid tile)
 * showed live video with no overlay at all.
 *
 * HLS and MJPEG are intentionally not managed here: HLS binds an MSE buffer to
 * one specific video element (not shareable), and MJPEG renders through <img>.
 */

interface SharedStream {
  source: LocalDeviceSource;
  stream: MediaStream;
}

/** The owner's latest detection output, mirrored by every other view of the camera. */
export interface SharedDetection {
  tick: VisionTickResult | null;
  status: ModelLoadStatus;
}

type DetectionListener = (detection: SharedDetection) => void;

const IDLE_MODEL_STATUS: ModelLoadStatus = { objects: 'idle', apriltag: 'idle', weapons: 'idle' };

class LiveCameraManager {
  private streams = new Map<string, SharedStream>();
  private detectionOwners = new Map<string, symbol>();
  private detections = new Map<string, SharedDetection>();
  private detectionListeners = new Map<string, Set<DetectionListener>>();
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  has(key: string): boolean {
    return this.streams.has(key);
  }

  getStream(key: string): MediaStream | null {
    return this.streams.get(key)?.stream ?? null;
  }

  /**
   * Opens (or reuses) the shared stream for a camera. The first caller pays for
   * getUserMedia; later callers get the same live stream back.
   */
  async acquire(key: string, source: LocalDeviceSource): Promise<MediaStream> {
    const existing = this.streams.get(key);
    if (existing) return existing.stream;

    const stream = await source.open();
    // A concurrent acquire may have won the race while we awaited; keep one.
    const raced = this.streams.get(key);
    if (raced) {
      source.stop();
      return raced.stream;
    }

    this.streams.set(key, { source, stream });
    this.notify();
    return stream;
  }

  /** Explicit Stop: ends the stream for every view and clears detection ownership. */
  release(key: string): void {
    const entry = this.streams.get(key);
    if (!entry) return;
    entry.source.stop();
    this.streams.delete(key);
    this.detectionOwners.delete(key);
    this.clearDetection(key);
    this.notify();
  }

  /** Returns true if `token` now holds detection for this camera (free, or already owned by it). */
  claimDetection(key: string, token: symbol): boolean {
    const owner = this.detectionOwners.get(key);
    if (owner && owner !== token) return false;
    this.detectionOwners.set(key, token);
    return true;
  }

  /** Releases detection ownership only if `token` holds it, and notifies so another view can claim it. */
  releaseDetection(key: string, token: symbol): void {
    if (this.detectionOwners.get(key) !== token) return;
    this.detectionOwners.delete(key);
    // The published boxes belong to a pipeline that no longer runs — drop them
    // so mirroring views wipe their overlay instead of freezing on a stale frame.
    this.clearDetection(key);
    this.notify();
  }

  /** The owner reports a new tick / model status; mirroring views are pushed it. */
  publishDetection(key: string, token: symbol, detection: SharedDetection): void {
    if (this.detectionOwners.get(key) !== token) return;
    this.detections.set(key, detection);
    const listeners = this.detectionListeners.get(key);
    if (listeners) for (const listener of listeners) listener(detection);
  }

  /** The owner's latest published detection, for a view that starts mirroring mid-stream. */
  getDetection(key: string): SharedDetection | null {
    return this.detections.get(key) ?? null;
  }

  subscribeDetection(key: string, listener: DetectionListener): () => void {
    const listeners = this.detectionListeners.get(key) ?? new Set<DetectionListener>();
    this.detectionListeners.set(key, listeners);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.detectionListeners.delete(key);
    };
  }

  private clearDetection(key: string): void {
    if (!this.detections.has(key)) return;
    this.detections.delete(key);
    const listeners = this.detectionListeners.get(key);
    if (listeners) for (const listener of listeners) listener({ tick: null, status: IDLE_MODEL_STATUS });
  }
}

export const liveCameraManager = new LiveCameraManager();
