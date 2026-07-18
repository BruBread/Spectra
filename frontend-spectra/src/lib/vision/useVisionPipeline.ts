'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraSourceError, WebcamSource, type CameraErrorReason, type CameraSource } from './cameraSource';
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
}

export function useVisionPipeline({ settings, onAlert, onObservation, restrictedZones, createSource }: UseVisionPipelineOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pipelineRef = useRef<VisionPipeline | null>(null);
  const sourceRef = useRef<CameraSource | null>(null);
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

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [cameraError, setCameraError] = useState<CameraErrorInfo | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelLoadStatus>(IDLE_MODEL_STATUS);
  const [tickResult, setTickResult] = useState<VisionTickResult | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    pipelineRef.current?.updateSettings(settings);
  }, [settings]);

  const stop = useCallback(() => {
    pipelineRef.current?.stop();
    pipelineRef.current = null;
    sourceRef.current?.stop();
    sourceRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute('src');
    }
    setCameraState('idle');
    setTickResult(null);
    setModelStatus(IDLE_MODEL_STATUS);
    setPipelineError(null);
  }, []);

  const start = useCallback(async () => {
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

      const pipeline = new VisionPipeline(video, settingsRef.current, {
        onAlert: (alert) => onAlertRef.current(alert),
        onObservation: (observation) => onObservationRef.current?.(observation),
        onTick: setTickResult,
        onModelStatus: setModelStatus,
        onError: (error) => setPipelineError(error.message),
      });
      pipeline.setRestrictedZones(restrictedZonesRef.current);
      pipelineRef.current = pipeline;
      await pipeline.start();
    } catch (error) {
      sourceRef.current?.stop();
      sourceRef.current = null;
      setCameraState('error');
      if (error instanceof CameraSourceError) {
        setCameraError({ reason: error.reason, message: error.message });
      } else {
        setCameraError({
          reason: 'unknown',
          message: error instanceof Error ? error.message : 'Could not start the camera.',
        });
      }
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, cameraState, cameraError, modelStatus, tickResult, pipelineError, start, stop };
}
