import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

export interface DetectedObjectBox {
  /** COCO class label, e.g. 'person', 'backpack', 'suitcase'. */
  objectClass: string;
  score: number;
  /** [x, y, width, height] in video pixel coordinates. */
  bbox: [number, number, number, number];
}

let modelPromise: Promise<cocoSsd.ObjectDetection> | null = null;

/**
 * Real, pretrained COCO-SSD object detector (TensorFlow.js). Runs entirely
 * in the browser. Powers unattended-object detection by finding bag-like
 * items and nearby people.
 */
export async function loadObjectModel(): Promise<cocoSsd.ObjectDetection> {
  if (!modelPromise) {
    modelPromise = (async () => {
      await tf.setBackend('webgl');
      await tf.ready();
      return cocoSsd.load({ base: 'lite_mobilenet_v2' });
    })();
  }
  return modelPromise;
}

export async function detectObjects(
  model: cocoSsd.ObjectDetection,
  video: HTMLVideoElement,
): Promise<DetectedObjectBox[]> {
  const predictions = await model.detect(video, 20, 0.4);
  return predictions.map((prediction) => ({
    objectClass: prediction.class,
    score: prediction.score,
    bbox: prediction.bbox,
  }));
}
