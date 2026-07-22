import * as ort from 'onnxruntime-web';

/**
 * On-device weapon (firearm) detector: a fine-tuned Ultralytics YOLO11 model
 * exported to ONNX, run in the browser via onnxruntime-web. YOLO11 (and this
 * repository, which serves the model to browsers) is AGPL-3.0 — see LICENSE.
 *
 * The export contract this decoder assumes (`yolo export format=onnx`,
 * default no-NMS graph):
 *   input  — float32 [1, 3, 640, 640], RGB, values scaled to 0-1,
 *            letterboxed with gray (114) padding;
 *   output — float32 [1, 4 + numClasses, anchors]: cx, cy, w, h in input
 *            pixels, then per-class sigmoid scores. No objectness channel —
 *            the class score IS the confidence. NMS runs here in JS.
 *
 * The label is always "possible_weapon", never a confirmed weapon. False-alarm
 * suppression (phones/remotes) is not done here — it lives in the weapon detector
 * adapter, which vetoes look-alikes using the COCO-SSD object boxes.
 */

const MODEL_URL = '/models/possible_weapon_yolo11.onnx';
const INPUT = 640;
const PAD = 114;
const NMS_IOU = 0.45;
const HW = INPUT * INPUT;

export interface DetectedWeaponBox {
  score: number;
  /** [x, y, width, height] in video pixel coordinates — matches DetectedObjectBox. */
  bbox: [number, number, number, number];
}

export interface WeaponModel {
  session: ort.InferenceSession;
  /** Which execution provider actually loaded, for diagnostics. */
  backend: 'webgpu' | 'wasm';
}

// onnxruntime-web needs its wasm assets served somewhere. Point at the pinned
// CDN build (matches the installed version) so we don't have to copy wasm into
// public/ or configure the Next bundler. Single-thread avoids the COOP/COEP
// cross-origin-isolation requirement.
let ortConfigured = false;
function configureOrt(): void {
  if (ortConfigured) return;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
  ortConfigured = true;
}

let modelPromise: Promise<WeaponModel> | null = null;

export async function loadWeaponModel(): Promise<WeaponModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      configureOrt();
      try {
        const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['webgpu'] });
        return { session, backend: 'webgpu' as const };
      } catch {
        // WebGPU unavailable or failed — fall back to WASM, which works anywhere.
        const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
        return { session, backend: 'wasm' as const };
      }
    })();
    // If the load fails, don't cache the rejection — allow a later retry.
    modelPromise.catch(() => {
      modelPromise = null;
    });
  }
  return modelPromise;
}

/** A sub-rectangle of the video to run inference on, in video pixel coordinates. */
export interface WeaponScanRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Reused offscreen canvas for the 416 letterbox — created lazily so this module
// stays import-safe on the server (Next may evaluate it during SSR).
let preCanvas: HTMLCanvasElement | null = null;
let preCtx: CanvasRenderingContext2D | null = null;

function letterbox(video: HTMLVideoElement, region?: WeaponScanRegion): { tensor: ort.Tensor; ratio: number } {
  if (!preCanvas) {
    preCanvas = document.createElement('canvas');
    preCanvas.width = INPUT;
    preCanvas.height = INPUT;
    preCtx = preCanvas.getContext('2d', { willReadFrequently: true });
  }
  const ctx = preCtx!;
  const rx = region?.x ?? 0;
  const ry = region?.y ?? 0;
  const rw = region?.w ?? video.videoWidth;
  const rh = region?.h ?? video.videoHeight;
  const ratio = Math.min(INPUT / rw, INPUT / rh);
  const nw = Math.round(rw * ratio);
  const nh = Math.round(rh * ratio);

  ctx.fillStyle = `rgb(${PAD},${PAD},${PAD})`;
  ctx.fillRect(0, 0, INPUT, INPUT);
  ctx.drawImage(video, rx, ry, rw, rh, 0, 0, nw, nh);
  const data = ctx.getImageData(0, 0, INPUT, INPUT).data; // RGBA

  // RGB planes scaled to 0-1 — the Ultralytics YOLO11 export contract.
  const f = new Float32Array(3 * HW);
  for (let p = 0; p < HW; p++) {
    const o = p * 4;
    f[p] = data[o] / 255; // R
    f[HW + p] = data[o + 1] / 255; // G
    f[2 * HW + p] = data[o + 2] / 255; // B
  }
  return { tensor: new ort.Tensor('float32', f, [1, 3, INPUT, INPUT]), ratio };
}

function iou(a: DetectedWeaponBox, b: DetectedWeaponBox): number {
  const [ax, ay, aw, ah] = a.bbox;
  const [bx, by, bw, bh] = b.bbox;
  const x1 = Math.max(ax, bx);
  const y1 = Math.max(ay, by);
  const x2 = Math.min(ax + aw, bx + bw);
  const y2 = Math.min(ay + ah, by + bh);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = aw * ah + bw * bh - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Run the weapon model on a frame and return boxes scoring at or above
 * `scoreThreshold`, in video pixel coordinates, after NMS.
 *
 * With no `region` this letterboxes the full frame. With a `region` the
 * identical 640/RGB/0-1 letterbox runs on that crop instead — how the zoom
 * pass recovers guns too small to survive the full-frame downscale — and
 * boxes come back already mapped into full-frame video pixel coordinates.
 */
export async function detectWeapons(
  model: WeaponModel,
  video: HTMLVideoElement,
  scoreThreshold: number,
  region?: WeaponScanRegion,
): Promise<DetectedWeaponBox[]> {
  if (!video.videoWidth || !video.videoHeight) return [];
  const rx = region?.x ?? 0;
  const ry = region?.y ?? 0;
  const { tensor, ratio } = letterbox(video, region);
  const results = await model.session.run({ [model.session.inputNames[0]]: tensor });
  tensor.dispose?.();
  const out = results[model.session.outputNames[0]];
  const d = out.data as Float32Array;
  // YOLO11 layout is channel-major: [1, 4 + numClasses, anchors], so value
  // for channel ch of anchor i lives at d[ch * anchors + i].
  const [, channels, anchors] = out.dims as number[];
  const numClasses = channels - 4;

  const boxes: DetectedWeaponBox[] = [];
  for (let i = 0; i < anchors; i++) {
    let score = 0;
    for (let k = 0; k < numClasses; k++) {
      const s = d[(4 + k) * anchors + i];
      if (s > score) score = s;
    }
    if (score < scoreThreshold) continue;
    const cx = d[i];
    const cy = d[anchors + i];
    const w = d[2 * anchors + i];
    const h = d[3 * anchors + i];
    boxes.push({
      score,
      bbox: [rx + (cx - w / 2) / ratio, ry + (cy - h / 2) / ratio, w / ratio, h / ratio],
    });
  }

  // Greedy NMS.
  boxes.sort((a, b) => b.score - a.score);
  const keep: DetectedWeaponBox[] = [];
  for (const box of boxes) {
    if (keep.every((k) => iou(k, box) < NMS_IOU)) keep.push(box);
  }
  return keep;
}

/**
 * De-duplicate boxes from multiple passes over the same frame (full frame +
 * zoom crops) with the same greedy NMS each pass already ran internally — a
 * gun seen by two passes keeps only its highest-scoring box.
 */
export function mergeWeaponBoxes(passes: DetectedWeaponBox[][]): DetectedWeaponBox[] {
  const all = passes.flat().sort((a, b) => b.score - a.score);
  const keep: DetectedWeaponBox[] = [];
  for (const box of all) {
    if (keep.every((k) => iou(k, box) < NMS_IOU)) keep.push(box);
  }
  return keep;
}
