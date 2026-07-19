import type { LocalDeviceSource } from './cameraSource';

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
 * mounted views can't both burn CPU or double-post alerts. Everyone else just
 * displays the frames.
 *
 * HLS and MJPEG are intentionally not managed here: HLS binds an MSE buffer to
 * one specific video element (not shareable), and MJPEG renders through <img>.
 */

interface SharedStream {
  source: LocalDeviceSource;
  stream: MediaStream;
}

class LiveCameraManager {
  private streams = new Map<string, SharedStream>();
  private detectionOwners = new Map<string, symbol>();
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
    this.notify();
  }
}

export const liveCameraManager = new LiveCameraManager();
