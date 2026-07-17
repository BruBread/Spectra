'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, Camera, CameraOff, Loader2, Video } from 'lucide-react';
import type { useVisionPipeline } from '../../lib/vision/useVisionPipeline';
import { DETECTION_LABELS } from '../../lib/vision/types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import styles from './CameraFeed.module.css';

type CameraFeedProps = ReturnType<typeof useVisionPipeline>;

const REASON_HINTS: Record<string, string> = {
  'permission-denied': 'Open your browser’s site settings and allow camera access for this page, then try again.',
  'not-found': 'Connect a camera or check that another app isn’t hiding it from the browser.',
  'in-use': 'Close other apps or browser tabs that might be using the camera (Zoom, FaceTime, another tab, ...).',
  unsupported: 'Try a recent version of Chrome, Edge, or Safari.',
  unknown: 'Reload the page and try again.',
};

export function CameraFeed({ videoRef, cameraState, cameraError, modelStatus, tickResult, pipelineError, start, stop }: CameraFeedProps) {
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !tickResult) return;

    canvas.width = tickResult.videoWidth;
    canvas.height = tickResult.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
    ctx.fillStyle = 'rgba(250, 204, 21, 0.9)';
    ctx.font = '12px system-ui, sans-serif';
    for (const { type, zone } of tickResult.activeZones) {
      const x = zone.x * canvas.width;
      const y = zone.y * canvas.height;
      const w = zone.width * canvas.width;
      const h = zone.height * canvas.height;
      ctx.strokeRect(x, y, w, h);
      ctx.fillText(DETECTION_LABELS[type], x + 4, y + 14);
    }
    ctx.setLineDash([]);

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
    for (const object of tickResult.objects) {
      const [x, y, w, h] = object.bbox;
      ctx.strokeRect(x, y, w, h);
      ctx.fillText(`${object.objectClass} ${(object.score * 100).toFixed(0)}%`, x + 4, y + 14);
    }

    ctx.fillStyle = 'rgba(74, 222, 128, 0.9)';

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.9)';
    ctx.fillStyle = 'rgba(244, 114, 182, 0.9)';
    for (const tag of tickResult.aprilTags) {
      ctx.beginPath();
      tag.corners.forEach((corner, index) => {
        const x = corner.x * tickResult.aprilTagScale;
        const y = corner.y * tickResult.aprilTagScale;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      const first = tag.corners[0];
      if (first) {
        ctx.fillText(`Tag ${tag.tagId}`, first.x * tickResult.aprilTagScale, first.y * tickResult.aprilTagScale - 6);
      }
    }

    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
    for (const candidate of tickResult.candidates) {
      if (!candidate.box) continue;
      const [x, y, w, h] = candidate.box;
      ctx.strokeRect(x, y, w, h);
    }
  }, [tickResult]);

  const modelsLoading = modelStatus.objects === 'loading' || modelStatus.apriltag === 'loading';

  return (
    <div className={styles.wrapper}>
      <div className={styles.stage} data-active={cameraState === 'active'}>
        <video ref={videoRef} className={styles.video} muted playsInline />
        <canvas ref={overlayRef} className={styles.overlay} />

        {cameraState === 'idle' ? (
          <div className={styles.placeholder}>
            <Camera size={28} aria-hidden="true" />
            <p className={styles.placeholderTitle}>Camera is off</p>
            <p className={styles.placeholderText}>
              Start your MacBook&rsquo;s webcam to begin live monitoring. Nothing is recorded until you start it.
            </p>
            <Button onClick={() => void start()}>
              <Video size={16} aria-hidden="true" /> Start Camera
            </Button>
          </div>
        ) : null}

        {cameraState === 'requesting' ? (
          <div className={styles.placeholder}>
            <Loader2 size={28} className={styles.spin} aria-hidden="true" />
            <p className={styles.placeholderTitle}>Requesting camera access&hellip;</p>
            <p className={styles.placeholderText}>Your browser will ask for permission. Allow it to continue.</p>
          </div>
        ) : null}

        {cameraState === 'error' ? (
          <div className={styles.placeholder}>
            <CameraOff size={28} aria-hidden="true" />
            <p className={styles.placeholderTitle}>Couldn&rsquo;t access the camera</p>
            <p className={styles.placeholderText}>{cameraError?.message}</p>
            {cameraError ? <p className={styles.placeholderHint}>{REASON_HINTS[cameraError.reason]}</p> : null}
            <Button onClick={() => void start()}>Try Again</Button>
          </div>
        ) : null}

        {cameraState === 'active' && modelsLoading ? (
          <div className={styles.modelOverlay}>
            <Loader2 size={16} className={styles.spin} aria-hidden="true" />
            Loading AI models&hellip; this can take a few seconds the first time.
          </div>
        ) : null}
      </div>

      {pipelineError ? (
        <p className={styles.pipelineError}>
          <AlertTriangle size={14} aria-hidden="true" /> {pipelineError}
        </p>
      ) : null}

      <div className={styles.footer}>
        <div className={styles.statusBadges}>
          <Badge tone={cameraState === 'active' ? 'success' : 'neutral'} dot>
            {cameraState === 'active' ? 'Camera live' : 'Camera off'}
          </Badge>
          <Badge tone={modelStatus.objects === 'ready' ? 'info' : 'neutral'}>Objects: {modelStatus.objects}</Badge>
        </div>
        {cameraState === 'active' ? (
          <Button variant="secondary" size="sm" onClick={stop}>
            <CameraOff size={15} aria-hidden="true" /> Stop Camera
          </Button>
        ) : null}
      </div>
    </div>
  );
}
