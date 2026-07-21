import * as ort from 'onnxruntime-web';

/**
 * On-device weapon (firearm) detector: a fine-tuned YOLOX-Tiny exported to ONNX,
 * run in the browser via onnxruntime-web. This is the same model and the same
 * pre/post-processing contract proven in the Phase-0 harness — kept byte-for-byte
 * identical so the app behaves exactly like the go/no-go test did.
 *
 * The label is always "possible_weapon", never a confirmed weapon. False-alarm
 * suppression (phones/remotes) is not done here — it lives in the weapon detector
 * adapter, which vetoes look-alikes using the COCO-SSD object boxes.
 */

const MODEL_URL = '/models/possible_weapon.onnx';
const INPUT = 416;
const PAD = 114;
const NUM_CLASSES = 1;
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

// Reused offscreen canvas for the 416 letterbox — created lazily so this module
// stays import-safe on the server (Next may evaluate it during SSR).
let preCanvas: HTMLCanvasElement | null = null;
let preCtx: CanvasRenderingContext2D | null = null;

function letterbox(video: HTMLVideoElement): { tensor: ort.Tensor; ratio: number } {
  if (!preCanvas) {
    preCanvas = document.createElement('canvas');
    preCanvas.width = INPUT;
    preCanvas.height = INPUT;
    preCtx = preCanvas.getContext('2d', { willReadFrequently: true });
  }
  const ctx = preCtx!;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const ratio = Math.min(INPUT / vw, INPUT / vh);
  const nw = Math.round(vw * ratio);
  const nh = Math.round(vh * ratio);

  ctx.fillStyle = `rgb(${PAD},${PAD},${PAD})`;
  ctx.fillRect(0, 0, INPUT, INPUT);
  ctx.drawImage(video, 0, 0, vw, vh, 0, 0, nw, nh);
  const data = ctx.getImageData(0, 0, INPUT, INPUT).data; // RGBA

  // BGR, raw 0-255, no normalization — the export contract.
  const f = new Float32Array(3 * HW);
  for (let p = 0; p < HW; p++) {
    const o = p * 4;
    f[p] = data[o + 2]; // B
    f[HW + p] = data[o + 1]; // G
    f[2 * HW + p] = data[o]; // R
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
 */
export async function detectWeapons(
  model: WeaponModel,
  video: HTMLVideoElement,
  scoreThreshold: number,
): Promise<DetectedWeaponBox[]> {
  if (!video.videoWidth || !video.videoHeight) return [];
  const { tensor, ratio } = letterbox(video);
  const results = await model.session.run({ [model.session.inputNames[0]]: tensor });
  tensor.dispose?.();
  const out = results[model.session.outputNames[0]];
  const d = out.data as Float32Array;
  const [, n, c] = out.dims as number[]; // [1, N, 5 + NUM_CLASSES]

  const boxes: DetectedWeaponBox[] = [];
  for (let i = 0; i < n; i++) {
    const b = i * c;
    const obj = d[b + 4];
    let best = 0;
    for (let k = 0; k < NUM_CLASSES; k++) {
      const s = d[b + 5 + k];
      if (s > best) best = s;
    }
    const score = obj * best;
    if (score < scoreThreshold) continue;
    const cx = d[b];
    const cy = d[b + 1];
    const w = d[b + 2];
    const h = d[b + 3];
    boxes.push({
      score,
      bbox: [(cx - w / 2) / ratio, (cy - h / 2) / ratio, w / ratio, h / ratio],
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
