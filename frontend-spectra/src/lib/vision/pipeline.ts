import type { DetectionRequirement, DetectionType, DetectorConfigType, DetectionTypeConfig, VisionSettings, Zone } from './types';
import { DETECTION_REQUIREMENTS } from './types';
import { loadObjectModel, detectObjects, type DetectedObjectBox } from './models/objectModel';
import {
  createAprilTagDetector,
  detectAprilTags,
  generateAprilTagSvg as _generateAprilTagSvg,
  APRILTAG_PROCESS_WIDTH,
  type DetectedAprilTag,
} from './models/aprilTagModel';
import { createDetectorRegistry, type DetectionAdapter, type DetectionCandidate, type DetectorFrameInput } from './detectors';

export { _generateAprilTagSvg as generateAprilTagSvg };

export type ModelState = 'idle' | 'loading' | 'ready' | 'error';

export interface ModelLoadStatus {
  objects: ModelState;
  apriltag: ModelState;
}

export interface VisionTickResult {
  objects: DetectedObjectBox[];
  aprilTags: DetectedAprilTag[];
  aprilTagScale: number;
  videoWidth: number;
  videoHeight: number;
  activeZones: Array<{ type: DetectorConfigType; zone: Zone }>;
  candidates: DetectionCandidate[];
}

export interface PipelineAlert {
  type: DetectionType;
  confidence: number;
  message: string;
  metadata: Record<string, unknown>;
  snapshot: string;
  box?: [number, number, number, number];
}

interface VisionPipelineCallbacks {
  onTick?: (result: VisionTickResult) => void;
  onAlert: (alert: PipelineAlert) => void;
  onModelStatus?: (status: ModelLoadStatus) => void;
  onError?: (error: Error) => void;
}

/**
 * Orchestrates one video source through the enabled detection adapters on a
 * fixed interval. Deliberately UI-agnostic — it reports results and alerts
 * through callbacks so the pipeline itself has no rendering concerns and is
 * easy to reuse (e.g. against a future non-webcam CameraSource) or test.
 */
export class VisionPipeline {
  private video: HTMLVideoElement;
  private settings: VisionSettings;
  private callbacks: VisionPipelineCallbacks;
  private detectors: DetectionAdapter[];
  private snapshotCanvas: HTMLCanvasElement;
  private aprilTagCanvas: HTMLCanvasElement;

  private objectModel: Awaited<ReturnType<typeof loadObjectModel>> | null = null;
  private aprilTagDetector: ReturnType<typeof createAprilTagDetector> | null = null;
  private aprilTagDetectorConfidence: number | null = null;

  private timer: number | null = null;
  private running = false;
  private ticking = false;

  constructor(video: HTMLVideoElement, initialSettings: VisionSettings, callbacks: VisionPipelineCallbacks) {
    this.video = video;
    this.settings = initialSettings;
    this.callbacks = callbacks;
    this.detectors = createDetectorRegistry();
    this.snapshotCanvas = document.createElement('canvas');
    this.aprilTagCanvas = document.createElement('canvas');
  }

  updateSettings(settings: VisionSettings): void {
    this.settings = settings;
  }

  async start(): Promise<void> {
    this.running = true;
    await this.ensureModelsLoaded();
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = window.setTimeout(() => {
      void this.tick();
    }, this.settings.processingIntervalMs);
  }

  private requiredCapabilities(): Set<DetectionRequirement> {
    const set = new Set<DetectionRequirement>();
    for (const config of this.settings.detectors) {
      if (config.enabled) set.add(DETECTION_REQUIREMENTS[config.type]);
    }
    return set;
  }

  private configFor(type: DetectorConfigType): DetectionTypeConfig | undefined {
    return this.settings.detectors.find((detector) => detector.type === type);
  }

  private async ensureModelsLoaded(): Promise<void> {
    const requirements = this.requiredCapabilities();
    const status: ModelLoadStatus = {
      objects: this.objectModel ? 'ready' : 'idle',
      apriltag: requirements.has('apriltag') ? 'ready' : 'idle',
    };

    if (requirements.has('objects') && !this.objectModel) {
      status.objects = 'loading';
      this.callbacks.onModelStatus?.({ ...status });
      try {
        this.objectModel = await loadObjectModel();
        status.objects = 'ready';
      } catch (error) {
        status.objects = 'error';
        this.callbacks.onError?.(error instanceof Error ? error : new Error('Failed to load object detection model'));
      }
    }

    this.callbacks.onModelStatus?.(status);
  }

  private async tick(): Promise<void> {
    if (this.ticking) {
      this.scheduleNext();
      return;
    }
    this.ticking = true;

    try {
      if (this.video.readyState >= 2 && this.video.videoWidth > 0) {
        await this.processFrame();
      }
      await this.ensureModelsLoaded();
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error : new Error('Vision pipeline tick failed'));
    } finally {
      this.ticking = false;
      this.scheduleNext();
    }
  }

  private async processFrame(): Promise<void> {
    const now = performance.now();
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;
    const requirements = this.requiredCapabilities();

    const [objects] = await Promise.all([
      requirements.has('objects') && this.objectModel ? detectObjects(this.objectModel, this.video) : Promise.resolve([]),
    ]);

    let aprilTags: DetectedAprilTag[] = [];
    let aprilTagScale = 1;
    if (requirements.has('apriltag')) {
      const apriltagConfig = this.configFor('apriltag');
      const confidenceThreshold = apriltagConfig?.confidenceThreshold ?? 0.7;
      if (!this.aprilTagDetector || this.aprilTagDetectorConfidence !== confidenceThreshold) {
        this.aprilTagDetector = createAprilTagDetector(confidenceThreshold);
        this.aprilTagDetectorConfidence = confidenceThreshold;
      }

      aprilTagScale = videoWidth / APRILTAG_PROCESS_WIDTH;
      const processHeight = Math.max(1, Math.round(videoHeight / aprilTagScale));
      this.aprilTagCanvas.width = APRILTAG_PROCESS_WIDTH;
      this.aprilTagCanvas.height = processHeight;
      const ctx = this.aprilTagCanvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(this.video, 0, 0, APRILTAG_PROCESS_WIDTH, processHeight);
        const imageData = ctx.getImageData(0, 0, APRILTAG_PROCESS_WIDTH, processHeight);
        aprilTags = detectAprilTags(this.aprilTagDetector, imageData);
      }
    }

    const input: DetectorFrameInput = { now, videoWidth, videoHeight, objects, aprilTags, aprilTagScale };

    const firedCandidates: DetectionCandidate[] = [];
    for (const detector of this.detectors) {
      const config = this.configFor(detector.type);
      if (!config?.enabled) continue;
      const candidates = detector.evaluate(input, config);
      for (const candidate of candidates) {
        firedCandidates.push(candidate);
        this.emitAlert(candidate);
      }
    }

    const activeZones = this.settings.detectors
      .filter((detector): detector is DetectionTypeConfig & { zone: Zone } => detector.enabled && detector.zone !== null)
      .map((detector) => ({ type: detector.type, zone: detector.zone }));

    this.callbacks.onTick?.({ objects, aprilTags, aprilTagScale, videoWidth, videoHeight, activeZones, candidates: firedCandidates });
  }

  private emitAlert(candidate: DetectionCandidate): void {
    const snapshot = this.captureSnapshot(candidate.box);
    this.callbacks.onAlert({
      type: candidate.type,
      confidence: candidate.confidence,
      message: candidate.message,
      metadata: { ...candidate.metadata, trackId: candidate.metadata?.trackId ?? candidate.key },
      snapshot,
      box: candidate.box,
    });
  }

  private captureSnapshot(box?: [number, number, number, number]): string {
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    if (!width || !height) return '';

    const maxWidth = 480;
    const scale = Math.min(1, maxWidth / width);
    this.snapshotCanvas.width = Math.round(width * scale);
    this.snapshotCanvas.height = Math.round(height * scale);
    const ctx = this.snapshotCanvas.getContext('2d');
    if (!ctx) return '';

    ctx.drawImage(this.video, 0, 0, this.snapshotCanvas.width, this.snapshotCanvas.height);

    if (box) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.strokeRect(box[0] * scale, box[1] * scale, box[2] * scale, box[3] * scale);
    }

    return this.snapshotCanvas.toDataURL('image/jpeg', 0.6);
  }
}
