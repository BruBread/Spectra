import type { DetectionRequirement, DetectionType, DetectorConfigType, DetectionTypeConfig, VisionSettings, Zone } from './types';
import { DETECTION_REQUIREMENTS } from './types';
import { loadObjectModel, detectObjects, type DetectedObjectBox } from './models/objectModel';
import {
  loadWeaponModel,
  detectWeapons,
  mergeWeaponBoxes,
  type WeaponModel,
  type DetectedWeaponBox,
  type WeaponScanRegion,
} from './models/weaponModel';
import {
  createAprilTagDetector,
  detectAprilTags,
  generateAprilTagSvg as _generateAprilTagSvg,
  APRILTAG_PROCESS_WIDTH,
  type DetectedAprilTag,
} from './models/aprilTagModel';
import { createDetectorRegistry, type DetectionAdapter, type DetectionCandidate, type DetectorFrameInput } from './detectors';
import { RestrictedAreaObserver, type ObserverZone } from './restrictedAreaObserver';

export { _generateAprilTagSvg as generateAprilTagSvg };

/**
 * Zoom pass: the full frame is letterboxed to the weapon model's 416px input,
 * so a gun held by a distant person shrinks below what the model can see. For
 * each detected person still small in frame, the model runs again on their
 * crop, where the gun is several times larger relative to the input. Capped
 * so a crowded frame can't stall the tick.
 */
const ZOOM_MIN_PERSON_SCORE = 0.5;
/** Persons taller than this fraction of the frame are close enough for the full-frame pass. */
const ZOOM_MAX_PERSON_FRACTION = 0.75;
/** Crop margin around the person box, so an outstretched arm stays inside the crop. */
const ZOOM_CROP_MARGIN = 0.3;
const ZOOM_MAX_CROPS = 2;
/** Skip a person's crop when a full-frame weapon box already lies this far inside it. */
const ZOOM_COVERED_CONTAINMENT = 0.25;

type PixelBox = [number, number, number, number]; // [x, y, w, h]

function growPixelBox([x, y, w, h]: PixelBox, fraction: number): PixelBox {
  const dx = w * fraction;
  const dy = h * fraction;
  return [x - dx / 2, y - dy / 2, w + dx, h + dy];
}

function clampToFrame([x, y, w, h]: PixelBox, frameWidth: number, frameHeight: number): WeaponScanRegion {
  const x1 = Math.max(0, x);
  const y1 = Math.max(0, y);
  const x2 = Math.min(frameWidth, x + w);
  const y2 = Math.min(frameHeight, y + h);
  return { x: x1, y: y1, w: Math.max(0, x2 - x1), h: Math.max(0, y2 - y1) };
}

/** Fraction of box `a` that lies inside box `b`. */
function pixelBoxContainment(a: PixelBox, b: PixelBox): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area = a[2] * a[3];
  return area > 0 ? inter / area : 0;
}

export type ModelState = 'idle' | 'loading' | 'ready' | 'error';

export interface ModelLoadStatus {
  objects: ModelState;
  apriltag: ModelState;
  weapons: ModelState;
}

export interface VisionTickResult {
  objects: DetectedObjectBox[];
  weapons: DetectedWeaponBox[];
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

/**
 * A restricted-area observation ready to post. CV facts plus the evidence
 * snapshot the pipeline captured — never an identity or a decision. What the
 * server does with it is the server's business.
 */
export interface PipelineObservation {
  zoneId: string;
  trackId: string;
  frame: { width: number; height: number };
  personBox: [number, number, number, number];
  enteredFromOutside: boolean;
  framesInside: number;
  dwellMs: number;
  aprilTags: number[];
  snapshot: string;
}

interface VisionPipelineCallbacks {
  onTick?: (result: VisionTickResult) => void;
  onAlert: (alert: PipelineAlert) => void;
  /** A confirmed restricted-zone entry to hand to the server for evaluation. */
  onObservation?: (observation: PipelineObservation) => void;
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
  private weaponModel: WeaponModel | null = null;
  private aprilTagDetector: ReturnType<typeof createAprilTagDetector> | null = null;
  private aprilTagDetectorConfidence: number | null = null;

  private restrictedObserver: RestrictedAreaObserver;
  private restrictedZones: ObserverZone[] = [];

  private timer: number | null = null;
  private running = false;
  private ticking = false;

  constructor(video: HTMLVideoElement, initialSettings: VisionSettings, callbacks: VisionPipelineCallbacks) {
    this.video = video;
    this.settings = initialSettings;
    this.callbacks = callbacks;
    this.detectors = createDetectorRegistry();
    this.restrictedObserver = new RestrictedAreaObserver(initialSettings.restrictedArea);
    this.snapshotCanvas = document.createElement('canvas');
    this.aprilTagCanvas = document.createElement('canvas');
  }

  updateSettings(settings: VisionSettings): void {
    this.settings = settings;
    if (settings.restrictedArea) this.restrictedObserver.updateSettings(settings.restrictedArea);
  }

  /** The restricted zones to enforce for this camera, from GET /api/zones. */
  setRestrictedZones(zones: ObserverZone[]): void {
    this.restrictedZones = zones;
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
      if (config.enabled) for (const req of DETECTION_REQUIREMENTS[config.type]) set.add(req);
    }
    // Restricted-area enforcement needs person boxes to track people and
    // AprilTags to feed the server's identity resolution, regardless of which
    // alerting detectors happen to be on.
    if (this.restrictedZones.length > 0) {
      set.add('objects');
      set.add('apriltag');
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
      weapons: this.weaponModel ? 'ready' : 'idle',
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

    if (requirements.has('weapons') && !this.weaponModel) {
      status.weapons = 'loading';
      this.callbacks.onModelStatus?.({ ...status });
      try {
        this.weaponModel = await loadWeaponModel();
        status.weapons = 'ready';
      } catch (error) {
        status.weapons = 'error';
        this.callbacks.onError?.(error instanceof Error ? error : new Error('Failed to load weapon detection model'));
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

    const weaponThreshold = this.configFor('weapon')?.confidenceThreshold ?? 0.45;

    // Object detection runs first, because its person boxes gate the weapon
    // model. A weapon candidate with no holder is discarded downstream (the
    // detector's holder gate), so running the weapon model on a person-free
    // frame can never raise an alert — it is pure waste. Most frames a security
    // camera sees are empty, so skipping the weapon passes when nobody is in
    // view is the cheapest large saving on the camera end. The cost is losing
    // the parallelism with object detection on the minority of frames that do
    // contain a person; that trade is strongly positive for CCTV scenes.
    const objects =
      requirements.has('objects') && this.objectModel ? await detectObjects(this.objectModel, this.video) : [];

    const weaponModel = this.weaponModel;
    const hasHolder = objects.some(
      (object) => object.objectClass === 'person' && object.score >= ZOOM_MIN_PERSON_SCORE,
    );
    const runWeapons = requirements.has('weapons') && weaponModel !== null && hasHolder;

    const fullFrameWeapons =
      runWeapons && weaponModel ? await detectWeapons(weaponModel, this.video, weaponThreshold) : [];
    // The zoom pass needs the person boxes, so it runs after the full-frame pass.
    const weapons = runWeapons
      ? await this.zoomPassWeapons(objects, fullFrameWeapons, weaponThreshold)
      : fullFrameWeapons;

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

    const input: DetectorFrameInput = { now, videoWidth, videoHeight, objects, weapons, aprilTags, aprilTagScale };

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

    // Restricted-area observations: track people, spot confirmed entries, and
    // hand each to the server. The observer emits CV facts and tag numbers
    // only — every identity and policy decision is made server-side.
    if (this.restrictedZones.length > 0 && this.callbacks.onObservation) {
      const observations = this.restrictedObserver.observe(
        { now, videoWidth, videoHeight, objects, aprilTags, aprilTagScale },
        this.restrictedZones,
      );
      for (const observation of observations) {
        const snapshot = this.captureSnapshot(observation.box);
        this.callbacks.onObservation({
          zoneId: observation.zoneId,
          trackId: observation.trackId,
          frame: observation.frame,
          personBox: observation.personBox,
          enteredFromOutside: observation.enteredFromOutside,
          framesInside: observation.framesInside,
          dwellMs: observation.dwellMs,
          aprilTags: observation.aprilTags,
          snapshot,
        });
      }
    }

    const activeZones = this.settings.detectors
      .filter((detector): detector is DetectionTypeConfig & { zone: Zone } => detector.enabled && detector.zone !== null)
      .map((detector) => ({ type: detector.type, zone: detector.zone }));

    this.callbacks.onTick?.({ objects, weapons, aprilTags, aprilTagScale, videoWidth, videoHeight, activeZones, candidates: firedCandidates });
  }

  /**
   * Re-run the weapon model on crops of persons small in frame — see the
   * ZOOM_* constants. Crops the full-frame pass already found a weapon in are
   * skipped, and all passes merge through one NMS so nothing double-counts.
   */
  private async zoomPassWeapons(
    objects: DetectedObjectBox[],
    fullFrameWeapons: DetectedWeaponBox[],
    scoreThreshold: number,
  ): Promise<DetectedWeaponBox[]> {
    if (!this.weaponModel) return fullFrameWeapons;
    const frameWidth = this.video.videoWidth;
    const frameHeight = this.video.videoHeight;

    const cropTargets = objects
      .filter((object) => object.objectClass === 'person' && object.score >= ZOOM_MIN_PERSON_SCORE)
      .filter((object) => object.bbox[3] < frameHeight * ZOOM_MAX_PERSON_FRACTION)
      .map((object) => growPixelBox(object.bbox, ZOOM_CROP_MARGIN))
      .filter((crop) => !fullFrameWeapons.some((weapon) => pixelBoxContainment(weapon.bbox, crop) >= ZOOM_COVERED_CONTAINMENT))
      .sort((a, b) => b[3] - a[3])
      .slice(0, ZOOM_MAX_CROPS);

    if (cropTargets.length === 0) return fullFrameWeapons;

    const passes: DetectedWeaponBox[][] = [fullFrameWeapons];
    for (const crop of cropTargets) {
      const region = clampToFrame(crop, frameWidth, frameHeight);
      if (region.w < 32 || region.h < 32) continue;
      passes.push(await detectWeapons(this.weaponModel, this.video, scoreThreshold, region));
    }
    return mergeWeaponBoxes(passes);
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
