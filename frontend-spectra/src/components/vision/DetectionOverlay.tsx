'use client';

import { useEffect, useRef } from 'react';
import { DETECTION_LABELS } from '../../lib/vision/types';
import type { VisionTickResult } from '../../lib/vision/pipeline';

/**
 * Draws a detection tick's boxes and labels onto a canvas sized to the video.
 *
 * Shared by the Live Monitor and the Cameras grid so both render identical
 * overlays. `mirrored` handles the selfie-mirrored views (the Live Monitor
 * flips the video with CSS): rather than CSS-flipping the canvas — which would
 * reverse the label text — each box's x is mirrored in code while text is drawn
 * left-to-right, so labels stay readable.
 */
function drawDetections(canvas: HTMLCanvasElement | null, tick: VisionTickResult | null, mirrored: boolean): void {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // No active tick (camera stopped, detection off, or between frames): wipe.
  if (!tick) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  canvas.width = tick.videoWidth;
  canvas.height = tick.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const mirrorX = (x: number, w: number) => (mirrored ? canvas.width - x - w : x);
  const mirrorPoint = (x: number) => (mirrored ? canvas.width - x : x);

  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
  ctx.fillStyle = 'rgba(250, 204, 21, 0.9)';
  ctx.font = '12px system-ui, sans-serif';
  for (const { type, zone } of tick.activeZones) {
    const x = zone.x * canvas.width;
    const y = zone.y * canvas.height;
    const w = zone.width * canvas.width;
    const h = zone.height * canvas.height;
    const mx = mirrorX(x, w);
    ctx.strokeRect(mx, y, w, h);
    ctx.fillText(DETECTION_LABELS[type], mx + 4, y + 14);
  }
  ctx.setLineDash([]);

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
  ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
  for (const object of tick.objects) {
    const [x, y, w, h] = object.bbox;
    const mx = mirrorX(x, w);
    ctx.strokeRect(mx, y, w, h);
    ctx.fillText(`${object.objectClass} ${(object.score * 100).toFixed(0)}%`, mx + 4, y + 14);
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(244, 114, 182, 0.9)';
  ctx.fillStyle = 'rgba(244, 114, 182, 0.9)';
  for (const tag of tick.aprilTags) {
    ctx.beginPath();
    tag.corners.forEach((corner, index) => {
      const x = mirrorPoint(corner.x * tick.aprilTagScale);
      const y = corner.y * tick.aprilTagScale;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    const first = tag.corners[0];
    if (first) {
      ctx.fillText(`Tag ${tag.tagId}`, mirrorPoint(first.x * tick.aprilTagScale), first.y * tick.aprilTagScale - 6);
    }
  }

  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
  for (const candidate of tick.candidates) {
    if (!candidate.box) continue;
    const [x, y, w, h] = candidate.box;
    ctx.strokeRect(mirrorX(x, w), y, w, h);
  }
}

interface DetectionOverlayProps {
  tick: VisionTickResult | null;
  /** True for CSS-mirrored (selfie) video, so boxes align while text stays readable. */
  mirrored?: boolean;
  className?: string;
}

export function DetectionOverlay({ tick, mirrored = false, className }: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    drawDetections(canvasRef.current, tick, mirrored);
  }, [tick, mirrored]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
