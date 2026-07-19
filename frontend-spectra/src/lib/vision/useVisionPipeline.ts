'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CameraSourceError,
  WebcamSource,
  type CameraErrorReason,
  type CameraSource,
  type LocalDeviceSource,
} from './cameraSource';
import { liveCameraManager } from './liveCameraManager';
import { VisionPipeline, type ModelLoadStatus, type PipelineAlert, type PipelineObservation, type VisionTickResult } from './pipeline';
import type { ObserverZone } from './restrictedAreaObserver';
import type { VisionSettings } from './types';

export type CameraState = 'idle' | 'requesting' | 'active' | 'error';

export interface CameraErrorInfo {
  reason: CameraErrorReason;
  message: string;
}

const IDLE_MODEL_STATUS: ModelLoadStatus = { objects: 'idle', apriltag: 'idle' };

interface UseVisionPipelineOptions {
  settings: VisionSettings;
  onAlert: (alert: PipelineAlert) => void;
  /** Confirmed restricted-zone entries to hand to the server. */
  onObservation?: (observation: PipelineObservation) => void;
  /** Restricted zones to enforce on this camera. */
  restrictedZones?: ObserverZone[];
  /** Defaults to this browser's own webcam if omitted (the original "quick test" flow). */
  createSource?: () => CameraSource;
  /**
   * Identifies the camera for the shared-stream manager. Views sharing a key
   * share one live stream. Defaults to a per-instance key (no sharing).
   */
  sessionKey?: string;
  /**
   * True for local-device (getUserMedia) sources, whose MediaStream can be
   * shared across views and kept alive across navigation via liveCameraManager.
   * HLS binds MSE to one element and is never persistent.
   */
  persistent?: boolean;
  /**
   * Whether to run the (expensive) detection pipeline. When false the live video
   * still shows, but no objects/tags are detected and no alerts are posted.
   * Toggling it starts or stops detection without disturbing the stream.
   * Defaults to true so callers that don't care keep the original behaviour.
   */
  detectionEnabled?: boolean;
}

export function useVisionPipeline({
  settings,
  onAlert,
  onObservation,
  restrictedZones,
  createSource,
  sessionKey = 'local',
  persistent = false,
  detectionEnabled = true,
}: UseVisionPipelineOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipelineRef = useRef<VisionPipeline | null>(null);
  const sourceRef = useRef<CameraSource | null>(null);
  const detectionToken = useRef<symbol>(Symbol('detection'));

  const onAlertRef = useRef(onAlert);
  useEffect(() => {
    onAlertRef.current = onAlert;
  });
  const onObservationRef = useRef(onObservation);
  useEffect(() => {
    onObservationRef.current = onObservation;
  });
  const createSourceRef = useRef(createSource);
  useEffect(() => {
    createSourceRef.current = createSource;
  });

  const restrictedZonesRef = useRef<ObserverZone[]>(restrictedZones ?? []);
  useEffect(() => {
    restrictedZonesRef.current = restrictedZones ?? [];
    pipelineRef.current?.setRestrictedZones(restrictedZones ?? []);
  }, [restrictedZones]);

  const detectionEnabledRef = useRef(detectionEnabled);
  useEffect(() => {
    detectionEnabledRef.current = detectionEnabled;
  }, [detectionEnabled]);

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelLoadStatus>(IDLE_MODEL_STATUS);
  const [tickResult, setTickResult] = useState<VisionTickResult | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const cameraStateRef = useRef(cameraState);
  useEffect(() => {
    cameraStateRef.current = cameraState;
  }, [cameraState]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    pipelineRef.current?.updateSettings(settings);
  }, [settings]);

  /** Tears down this view's detection pipeline (not the shared stream). */
  const stopLocalPipeline = useCallback(() => {
    pipelineRef.current?.stop();
    pipelineRef.current = null;
    setTickResult(null);
    setModelStatus(IDLE_MODEL_STATUS);
    setPipelineError(null);
  }, []);

  const detachVideo = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute('src');
    }
  }, []);

  /**
   * Starts detection for this view — but only when it is enabled, the video is
   * ready, and (for shared/persistent sources) no other view already owns
   * detection for this camera. A no-op when detection is disabled, so the live
   * video shows without any pipeline running.
   */
  const startDetection = useCallback(() => {
    if (!detectionEnabledRef.current) return;
    if (pipelineRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    if (persistent && !liveCameraManager.claimDetection(sessionKey, detectionToken.current)) return;

    const pipeline = new VisionPipeline(video, settingsRef.current, {
      onAlert: (alert) => onAlertRef.current(alert),
      onObservation: (observation) => onObservationRef.current?.(observation),
      onTick: setTickResult,
      onModelStatus: setModelStatus,
      onError: (error) => setPipelineError(error.message),
    });
    pipeline.setRestrictedZones(restrictedZonesRef.current);
    pipelineRef.current = pipeline;
    void pipeline.start();
  }, [persistent, sessionKey]);

  /** Stops just detection (not the shared stream) and releases detection ownership. */
  const stopDetection = useCallback(() => {
    pipelineRef.current?.stop();
    pipelineRef.current = null;
    if (persistent) liveCameraManager.releaseDetection(sessionKey, detectionToken.current);
    setTickResult(null);
    setModelStatus(IDLE_MODEL_STATUS);
    setPipelineError(null);
  }, [persistent, sessionKey]);

  /** Attaches an already-open shared stream to our <video> — no getUserMedia. */
  const attachShared = useCallback(async () => {
    const stream = liveCameraManager.getStream(sessionKey);
    const video = videoRef.current;
    if (!stream || !video) return false;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay races settle on their own */
      }
    }
    setCameraState('active');
    startDetection();
    return true;
  }, [sessionKey, startDetection]);

  const attachSharedRef = useRef(attachShared);
  useEffect(() => {
    attachSharedRef.current = attachShared;
  });
  const startDetectionRef = useRef(startDetection);
  useEffect(() => {
    startDetectionRef.current = startDetection;
  });

  const start = useCallback(async () => {
    if (persistent) {
      if (cameraStateRef.current === 'active' || cameraStateRef.current === 'requesting') return;
      setCameraState('requesting');
      setCameraError(null);
      try {
        const source = (createSourceRef.current ? createSourceRef.current() : new WebcamSource()) as LocalDeviceSource;
        await liveCameraManager.acquire(sessionKey, source);
        await attachShared();
      } catch (error) {
        setCameraState('error');
        if (error instanceof CameraSourceError) {
          setCameraError({ reason: error.reason, message: error.message });
        } else {
          setCameraError({ reason: 'unknown', message: error instanceof Error ? error.message : 'Could not start the camera.' });
        }
      }
      return;
    }

    // Non-persistent (HLS): a per-view source bound to this element.
    if (sourceRef.current) return;
    setCameraState('requesting');
    setCameraError(null);

    const source = createSourceRef.current ? createSourceRef.current() : new WebcamSource();
    sourceRef.current = source;

    try {
      const video = videoRef.current;
      if (!video) throw new Error('Video element is not ready yet.');
      await source.attach(video);

      setCameraState('active');

      // Detection is gated on detectionEnabled; the video is live regardless.
      startDetection();
    } catch (error) {
      sourceRef.current?.stop();
      sourceRef.current = null;
      setCameraState('error');
      if (error instanceof CameraSourceError) {
        setCameraError({ reason: error.reason, message: error.message });
      } else {
        setCameraError({ reason: 'unknown', message: error instanceof Error ? error.message : 'Could not start the camera.' });
      }
    }
  }, [persistent, sessionKey, attachShared, startDetection]);

  const stop = useCallback(() => {
    if (persistent) {
      // Explicit Stop turns the camera off for every view sharing it.
      stopLocalPipeline();
      liveCameraManager.releaseDetection(sessionKey, detectionToken.current);
      liveCameraManager.release(sessionKey);
      detachVideo();
      setCameraState('idle');
      return;
    }

    pipelineRef.current?.stop();
    pipelineRef.current = null;
    sourceRef.current?.stop();
    sourceRef.current = null;
    detachVideo();
    setCameraState('idle');
    setTickResult(null);
    setModelStatus(IDLE_MODEL_STATUS);
    setPipelineError(null);
  }, [persistent, sessionKey, stopLocalPipeline, detachVideo]);

  // Persistent sessions: attach an already-live stream on mount / key change, and
  // detach (without stopping the shared stream) on unmount so the camera survives
  // navigation. Also react to other views starting/stopping the same camera.
  useEffect(() => {
    if (!persistent) return;
    const token = detectionToken.current;
    const video = videoRef.current;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- reflecting the shared manager's live/idle state for this session on mount
    setCameraState(liveCameraManager.has(sessionKey) ? 'active' : 'idle');
    void attachSharedRef.current();

    const unsubscribe = liveCameraManager.subscribe(() => {
      if (liveCameraManager.has(sessionKey)) {
        if (cameraStateRef.current !== 'active') {
          void attachSharedRef.current();
        } else if (!pipelineRef.current) {
          // Detection ownership may have been freed by another view.
          startDetectionRef.current();
        }
      } else if (cameraStateRef.current === 'active') {
        // Stopped elsewhere.
        pipelineRef.current?.stop();
        pipelineRef.current = null;
        if (video) video.srcObject = null;
        setCameraState('idle');
        setTickResult(null);
        setModelStatus(IDLE_MODEL_STATUS);
      }
    });

    return () => {
      unsubscribe();
      pipelineRef.current?.stop();
      pipelineRef.current = null;
      liveCameraManager.releaseDetection(sessionKey, token);
      if (video) video.srcObject = null;
      setTickResult(null);
      setModelStatus(IDLE_MODEL_STATUS);
      setPipelineError(null);
    };
  }, [sessionKey, persistent]);

  // React to the detectionEnabled flag (and the stream going active): start or
  // stop the pipeline live, without touching the video. Turning detection off
  // for a running camera tears the pipeline down; turning it on spins it up.
  useEffect(() => {
    if (cameraState !== 'active') return;
    if (detectionEnabled) {
      startDetection();
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- tearing the pipeline down when detection is toggled off is synchronizing the external vision system with React state, not a derived value
      stopDetection();
    }
  }, [detectionEnabled, cameraState, startDetection, stopDetection]);

  // Non-persistent (HLS): stop fully on unmount, as before.
  useEffect(() => {
    if (persistent) return;
    return stop;
  }, [stop, persistent]);

  return { videoRef, cameraState, cameraError, modelStatus, tickResult, pipelineError, start, stop };
}
