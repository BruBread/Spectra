'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Radio, Video } from 'lucide-react';
import type { CameraRecord } from '../../lib/cameras/types';
import { supportsDetection } from '../../lib/cameras/types';
import { createCameraSource } from '../../lib/vision/cameraSource';
import { useVisionPipeline } from '../../lib/vision/useVisionPipeline';
import { fetchVisionSettings, createAlert } from '../../lib/api/vision';
import { defaultVisionSettings } from '../../lib/vision/defaults';
import type { PipelineAlert } from '../../lib/vision/pipeline';
import type { VisionSettings } from '../../lib/vision/types';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import styles from './CameraTile.module.css';

interface CameraTileProps {
  camera: CameraRecord;
  onAlert?: (alert: PipelineAlert) => void;
}

export function CameraTile({ camera, onAlert }: CameraTileProps) {
  const [settings, setSettings] = useState<VisionSettings | null>(null);
  const detectionActive = camera.detectionEnabled && supportsDetection(camera.sourceType);

  useEffect(() => {
    if (!detectionActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing local state with the detectionActive prop, not derivable during render since it also depends on the async fetch below
      setSettings(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await fetchVisionSettings(camera.id);
      if (cancelled) return;
      setSettings(result.ok && result.data ? result.data : defaultVisionSettings(camera.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [camera.id, detectionActive]);

  if (camera.sourceType === 'mjpeg-stream') {
    return <MjpegTile camera={camera} />;
  }

  return <StreamableTile camera={camera} settings={settings} onAlert={onAlert} />;
}

function MjpegTile({ camera }: { camera: CameraRecord }) {
  const [status, setStatus] = useState<'connecting' | 'live' | 'error'>('connecting');

  return (
    <div className={styles.stage} data-status={status}>
      {camera.streamUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- MJPEG multipart stream, not an optimizable static asset
        <img
          src={camera.streamUrl}
          alt=""
          className={styles.media}
          onLoad={() => setStatus('live')}
          onError={() => setStatus('error')}
        />
      ) : null}

      {status === 'connecting' ? (
        <div className={styles.overlay}>
          <Loader2 size={22} className={styles.spin} aria-hidden="true" />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className={styles.overlay}>
          <AlertTriangle size={20} aria-hidden="true" />
          <span>Couldn&rsquo;t load stream</span>
        </div>
      ) : null}

      <span className={styles.statusBadge} data-live={status === 'live'}>
        {status === 'live' ? 'Live' : status === 'error' ? 'Offline' : 'Connecting'}
      </span>
      <span className={styles.noDetection} title="MJPEG streams show a live preview only — AI detection needs a <video>-based source">
        Preview only
      </span>
    </div>
  );
}

function StreamableTile({
  camera,
  settings,
  onAlert,
}: {
  camera: CameraRecord;
  settings: VisionSettings | null;
  onAlert?: (alert: PipelineAlert) => void;
}) {
  const handleAlert = (alert: PipelineAlert) => {
    onAlert?.(alert);
    void createAlert({
      cameraId: camera.id,
      type: alert.type,
      confidence: alert.confidence,
      message: alert.message,
      snapshot: alert.snapshot || null,
      metadata: alert.metadata,
    });
  };

  const { videoRef, cameraState, cameraError, modelStatus, start } = useVisionPipeline({
    settings: settings ?? defaultVisionSettings(camera.id),
    onAlert: handleAlert,
    createSource: () => createCameraSource(camera),
  });

  const autoStart = camera.sourceType === 'hls-stream';
  const startedRef = useRef(false);

  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const isDetectionCapable = supportsDetection(camera.sourceType) && camera.detectionEnabled;

  return (
    <div className={styles.stage} data-status={cameraState}>
      <video ref={videoRef} className={styles.media} muted playsInline />

      {cameraState === 'idle' ? (
        <div className={styles.overlay}>
          <Video size={22} aria-hidden="true" />
          <Button
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              void start();
            }}
          >
            Start
          </Button>
        </div>
      ) : null}

      {cameraState === 'requesting' ? (
        <div className={styles.overlay}>
          <Loader2 size={22} className={styles.spin} aria-hidden="true" />
          <span>Connecting&hellip;</span>
        </div>
      ) : null}

      {cameraState === 'error' ? (
        <div className={styles.overlay}>
          <AlertTriangle size={20} aria-hidden="true" />
          <span>{cameraError?.message ?? 'Connection failed'}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              void start();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <span className={styles.statusBadge} data-live={cameraState === 'active'}>
        {cameraState === 'active' ? 'Live' : cameraState === 'error' ? 'Offline' : 'Connecting'}
      </span>

      {isDetectionCapable ? (
        <Badge tone={modelStatus.objects === 'ready' || modelStatus.pose === 'ready' ? 'info' : 'neutral'} className={styles.detectionBadge}>
          <Radio size={11} aria-hidden="true" /> AI on
        </Badge>
      ) : null}
    </div>
  );
}
