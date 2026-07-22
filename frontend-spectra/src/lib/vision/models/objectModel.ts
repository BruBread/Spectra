import * as ort from 'onnxruntime-web';

/**
 * General object detector: **stock** Ultralytics YOLO11s (COCO-pretrained, no
 * fine-tuning) exported to ONNX and run in the browser via onnxruntime-web —
 * the same runtime and export contract as the weapon model. This replaced the
 * TensorFlow.js COCO-SSD detector: same 80 COCO classes and the same
 * DetectedObjectBox shape out, so every consumer (unattended valuables, the
 * weapon veto/holder gate, restricted-area person tracking) works unchanged —
 * only the source of the boxes changed, with better accuracy and range
 * (640 input vs COCO-SSD's ~300).
 *
 * Export contract (matches weaponModel.ts):
 *   input  — float32 [1, 3, 640, 640], RGB scaled 0-1, letterboxed (gray 114);
 *   output — float32 [1, 84, anchors]: cx, cy, w, h in input pixels, then 80
 *            per-class sigmoid scores. No objectness channel, no NMS in graph.
 */

const MODEL_URL = '/models/objects_yolo11.onnx';
const INPUT = 640;
const PAD = 114;
const NMS_IOU = 0.45;
/** Mirrors the old cocoSsd.detect(video, 20, 0.4) call. */
const SCORE_THRESHOLD = 0.4;
const MAX_DETECTIONS = 20;
const HW = INPUT * INPUT;

/** Standard Ultralytics/COCO class order — index in the output tensor maps here. */
const COCO_CLASSES = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
  'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat',
  'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
  'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
  'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
  'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
  'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
  'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
  'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
  'toothbrush',
];

export interface DetectedObjectBox {
  /** COCO class label, e.g. 'person', 'backpack', 'suitcase'. */
  objectClass: string;
  score: number;
  /** [x, y, width, height] in video pixel coordinates. */
  bbox: [number, number, number, number];
}

export interface ObjectModel {
  session: ort.InferenceSession;
  backend: 'webgpu' | 'wasm';
}

// Shared ort env config with weaponModel — guarded so whichever loads first wins.
let ortConfigured = false;
function configureOrt(): void {
  if (ortConfigured) return;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';
  ortConfigured = true;
}

let modelPromise: Promise<ObjectModel> | null = null;

export async function loadObjectModel(): Promise<ObjectModel> {
  if (!modelPromise) {
    modelPromise = (async () => {
      configureOrt();
      try {
        const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['webgpu'] });
        return { session, backend: 'webgpu' as const };
      } catch {
        const session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
        return { session, backend: 'wasm' as const };
      }
    })();
    // Don't cache a rejection — allow a later retry (e.g. model asset not deployed yet).
    modelPromise.catch(() => {
      modelPromise = null;
    });
  }
  return modelPromise;
}

// Reused offscreen letterbox canvas — lazy so the module stays SSR-import-safe.
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

  const f = new Float32Array(3 * HW);
  for (let p = 0; p < HW; p++) {
    const o = p * 4;
    f[p] = data[o] / 255; // R
    f[HW + p] = data[o + 1] / 255; // G
    f[2 * HW + p] = data[o + 2] / 255; // B
  }
  return { tensor: new ort.Tensor('float32', f, [1, 3, INPUT, INPUT]), ratio };
}

function iou(a: DetectedObjectBox, b: DetectedObjectBox): number {
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

export async function detectObjects(
  model: ObjectModel,
  video: HTMLVideoElement,
): Promise<DetectedObjectBox[]> {
  if (!video.videoWidth || !video.videoHeight) return [];
  const { tensor, ratio } = letterbox(video);
  const results = await model.session.run({ [model.session.inputNames[0]]: tensor });
  tensor.dispose?.();
  const out = results[model.session.outputNames[0]];
  const d = out.data as Float32Array;
  // Channel-major [1, 4 + numClasses, anchors]: channel ch of anchor i is d[ch * anchors + i].
  const [, channels, anchors] = out.dims as number[];
  const numClasses = Math.min(channels - 4, COCO_CLASSES.length);

  const boxes: DetectedObjectBox[] = [];
  for (let i = 0; i < anchors; i++) {
    let score = 0;
    let cls = 0;
    for (let k = 0; k < numClasses; k++) {
      const s = d[(4 + k) * anchors + i];
      if (s > score) {
        score = s;
        cls = k;
      }
    }
    if (score < SCORE_THRESHOLD) continue;
    const cx = d[i];
    const cy = d[anchors + i];
    const w = d[2 * anchors + i];
    const h = d[3 * anchors + i];
    boxes.push({
      objectClass: COCO_CLASSES[cls],
      score,
      bbox: [(cx - w / 2) / ratio, (cy - h / 2) / ratio, w / ratio, h / ratio],
    });
  }

  // Greedy class-aware NMS, capped like the old detect(video, 20, 0.4).
  boxes.sort((a, b) => b.score - a.score);
  const keep: DetectedObjectBox[] = [];
  for (const box of boxes) {
    if (keep.length >= MAX_DETECTIONS) break;
    if (keep.every((k) => k.objectClass !== box.objectClass || iou(k, box) < NMS_IOU)) keep.push(box);
  }
  return keep;
}
