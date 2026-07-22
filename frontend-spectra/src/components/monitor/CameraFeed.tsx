'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Camera, CameraOff, Loader2, Video } from 'lucide-react';
import type { useVisionPipeline } from '../../lib/vision/useVisionPipeline';
import { DetectionOverlay } from '../vision/DetectionOverlay';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/format';
import styles from './CameraFeed.module.css';

type CameraFeedProps = ReturnType<typeof useVisionPipeline> & {
  /** Stretch the stage to fill its container instead of holding a 4:3 box. */
  fill?: boolean;
  /** Rendered on top of the stage — the viewer puts its camera-rotation arrows here. */
  stageOverlay?: ReactNode;
};

const REASON_HINTS: Record<string, string> = {
  'permission-denied': 'Open your browser’s site settings and allow camera access for this page, then try again.',
  'not-found': 'Connect a camera or check that another app isn’t hiding it from the browser.',
  'in-use': 'Close other apps or browser tabs that might be using the camera (Zoom, FaceTime, another tab, ...).',
  unsupported: 'Try a recent version of Chrome, Edge, or Safari.',
  unknown: 'Reload the page and try again.',
};

export function CameraFeed({
  videoRef,
  cameraState,
  cameraError,
  modelStatus,
  tickResult,
  pipelineError,
  start,
  stop,
  fill,
  stageOverlay,
}: CameraFeedProps) {
  const modelsLoading = modelStatus.objects === 'loading' || modelStatus.apriltag === 'loading';

  return (
    <div className={cn(styles.wrapper, fill && styles.wrapperFill)}>
      <div className={cn(styles.stage, fill && styles.stageFill)} data-active={cameraState === 'active'}>
        <video ref={videoRef} className={styles.video} muted playsInline />
        <DetectionOverlay tick={tickResult} mirrored className={styles.overlay} />

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

        {stageOverlay}
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
