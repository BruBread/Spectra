'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertOctagon, ArrowLeft, ChevronLeft, ChevronRight, ShieldQuestion } from 'lucide-react';
import { useVisionPipeline } from '../../../lib/vision/useVisionPipeline';
import { createCameraSource } from '../../../lib/vision/cameraSource';
import type { PipelineAlert } from '../../../lib/vision/pipeline';
import { defaultVisionSettings, DEFAULT_CAMERA_ID } from '../../../lib/vision/defaults';
import { defaultSeverityForType } from '../../../lib/vision/types';
import type { DetectorConfigType, DetectionTypeConfig, VisionSettings } from '../../../lib/vision/types';
import {
  acknowledgeAlert,
  createAlert,
  fetchAlerts,
  fetchVisionSettings,
  postObservation,
  updateVisionSettings,
} from '../../../lib/api/vision';
import { fetchZones } from '../../../lib/api/accessControl';
import type { PipelineObservation } from '../../../lib/vision/pipeline';
import type { ObserverZone } from '../../../lib/vision/restrictedAreaObserver';
import { useToast } from '../../../context/ToastContext';
import { useCameraSources } from '../../../context/CameraSourcesContext';
import { supportsDetection } from '../../../lib/cameras/types';
import { CameraFeed } from '../../../components/monitor/CameraFeed';
import { AlertFeed, type FeedAlert } from '../../../components/monitor/AlertFeed';
import { DetectionSettingsPanel } from '../../../components/monitor/DetectionSettingsPanel';
import styles from './monitor.module.css';

function makeLocalAlertId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function MonitorPage() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const { cameras, loading: camerasLoading } = useCameraSources();
  const selectableCameras = useMemo(() => cameras.filter((camera) => supportsDetection(camera.sourceType)), [cameras]);

  const requestedCameraId = searchParams.get('camera');
  const [selectedCameraId, setSelectedCameraId] = useState(requestedCameraId ?? DEFAULT_CAMERA_ID);

  useEffect(() => {
    if (requestedCameraId && requestedCameraId !== selectedCameraId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the URL's ?camera= param, an external navigation source
      setSelectedCameraId(requestedCameraId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCameraId]);

  const selectedCamera = selectableCameras.find((camera) => camera.id === selectedCameraId) ?? null;

  // The carousel the arrows cycle through. Real cameras when there are any;
  // otherwise the browser-webcam quick test, so a fresh install still has
  // something to view instead of an empty stage.
  const rotation = useMemo(
    () => (selectableCameras.length > 0 ? selectableCameras.map((camera) => camera.id) : [DEFAULT_CAMERA_ID]),
    [selectableCameras],
  );
  const rotationIndex = rotation.indexOf(selectedCameraId);
  const currentCameraName = selectedCamera?.name ?? 'This browser’s webcam (quick test)';

  // Arriving without ?camera= (or on a camera that has since been deleted)
  // lands on the first camera in the rotation rather than stranding the viewer.
  // Gated on the camera list having loaded — before that the rotation is just
  // the webcam placeholder and would stomp a valid ?camera= from the URL.
  useEffect(() => {
    if (camerasLoading || rotationIndex !== -1) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reconciling the selection with an async-loaded camera list, not derivable during render
    setSelectedCameraId(rotation[0]);
  }, [camerasLoading, rotationIndex, rotation]);

  const [settings, setSettings] = useState<VisionSettings>(() => defaultVisionSettings(selectedCameraId));
  const [alerts, setAlerts] = useState<FeedAlert[]>([]);
  const [restrictedZones, setRestrictedZones] = useState<ObserverZone[]>([]);
  const [backendConnected, setBackendConnected] = useState(true);
  const [previewSnapshot, setPreviewSnapshot] = useState<string | null>(null);

  const settingsLoaded = useRef(false);
  const persistTimeoutRef = useRef<number | null>(null);

  // Settings + alert history are scoped per camera, so they reload whenever the selection changes.
  useEffect(() => {
    let cancelled = false;
    settingsLoaded.current = false;

    (async () => {
      // Zones live on real camera records, keyed by the camera's own id. The
      // default webcam has no record, so it has no restricted zones to enforce.
      const zonesPromise = selectedCamera
        ? fetchZones({ cameraId: selectedCameraId, active: true })
        : Promise.resolve({ ok: true, data: [] as Awaited<ReturnType<typeof fetchZones>>['data'] });

      const [settingsResult, alertsResult, zonesResult] = await Promise.all([
        fetchVisionSettings(selectedCameraId),
        fetchAlerts({ cameraId: selectedCameraId, limit: 100 }),
        zonesPromise,
      ]);

      if (cancelled) return;

      if (settingsResult.ok && settingsResult.data) {
        setSettings(settingsResult.data);
      } else {
        setSettings(defaultVisionSettings(selectedCameraId));
        setBackendConnected(false);
      }

      setAlerts(alertsResult.ok && alertsResult.data ? alertsResult.data.map((alert) => ({ ...alert, persisted: true })) : []);

      setRestrictedZones(
        zonesResult.ok && zonesResult.data
          ? zonesResult.data.map((zone) => ({ id: zone.id, name: zone.name, rect: zone.rect }))
          : [],
      );

      settingsLoaded.current = true;
    })();

    return () => {
      cancelled = true;
    };
    // selectedCamera is derived from selectedCameraId; re-running on the id
    // alone is what we want, and reloads zones/settings/alerts together.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCameraId]);

  const persistSettings = useCallback(
    (next: VisionSettings) => {
      if (!settingsLoaded.current) return;
      if (persistTimeoutRef.current) window.clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = window.setTimeout(() => {
        void updateVisionSettings(next).then((result) => {
          if (!result.ok) {
            showToast('Could not save detection settings to the backend — applying locally only.', 'error');
          }
        });
      }, 500);
    },
    [showToast],
  );

  const handleUpdateDetector = useCallback(
    (type: DetectorConfigType, updates: Partial<DetectionTypeConfig>) => {
      setSettings((current) => {
        const next: VisionSettings = {
          ...current,
          detectors: current.detectors.map((detector) => (detector.type === type ? { ...detector, ...updates } : detector)),
        };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings],
  );

  const handleUpdateGlobal = useCallback(
    (updates: Partial<Pick<VisionSettings, 'processingIntervalMs' | 'retentionDays'>>) => {
      setSettings((current) => {
        const next: VisionSettings = { ...current, ...updates };
        persistSettings(next);
        return next;
      });
    },
    [persistSettings],
  );

  const handleAlert = useCallback(
    (alert: PipelineAlert) => {
      const localId = makeLocalAlertId();
      const now = new Date().toISOString();
      const optimistic: FeedAlert = {
        id: localId,
        cameraId: selectedCameraId,
        type: alert.type,
        // Placeholder values for the moment before the POST returns; the saved
        // alert replaces this row wholesale below.
        severity: defaultSeverityForType(alert.type),
        status: 'new',
        read: false,
        zoneName: null,
        confidence: alert.confidence,
        message: alert.message,
        snapshot: alert.snapshot || null,
        metadata: alert.metadata,
        occurrences: 1,
        lastOccurredAt: now,
        statusChangedAt: null,
        acknowledged: false,
        createdAt: now,
        persisted: false,
      };
      setAlerts((current) => [optimistic, ...current].slice(0, 300));

      void createAlert({
        cameraId: selectedCameraId,
        type: alert.type,
        confidence: alert.confidence,
        message: alert.message,
        snapshot: alert.snapshot || null,
        metadata: alert.metadata,
      }).then((result) => {
        if (result.ok && result.data) {
          const saved = result.data;
          setAlerts((current) => current.map((entry) => (entry.id === localId ? { ...saved, persisted: true } : entry)));
        }
      });
    },
    [selectedCameraId],
  );

  const handleObservation = useCallback(
    (observation: PipelineObservation) => {
      // Post the CV facts and let the server decide. The browser never resolves
      // identity or chooses to alert; if the server does raise a restricted-area
      // alert, it arrives through the normal alerts refresh below.
      void postObservation({ cameraId: selectedCameraId, ...observation }).then((result) => {
        if (result.ok && result.data?.outcome === 'alert_created' && !result.data.deduped) {
          void fetchAlerts({ cameraId: selectedCameraId, limit: 100 }).then((alertsResult) => {
            if (alertsResult.ok && alertsResult.data) {
              setAlerts(alertsResult.data.map((alert) => ({ ...alert, persisted: true })));
            }
          });
        }
      });
    },
    [selectedCameraId],
  );

  const pipeline = useVisionPipeline({
    settings,
    onAlert: handleAlert,
    onObservation: handleObservation,
    restrictedZones,
    createSource: selectedCamera ? () => createCameraSource(selectedCamera) : undefined,
    // The default webcam and any local-device camera share one persistent
    // stream, so a camera already live on the Cameras page shows here without a
    // second Start. HLS is per-view and auto-starts (below).
    sessionKey: selectedCameraId,
    persistent: selectedCamera ? selectedCamera.sourceType === 'local-device' : true,
  });

  // A URL/stream camera (HLS) is a passive network feed with no permission
  // prompt, so it starts on its own — the same way it does on the Cameras page,
  // and so a camera that's already "live" there isn't dead here behind a click.
  // The browser webcam and local devices are deliberately excluded: a real
  // camera must not switch on without an explicit user action.
  const autoStartsUnattended = selectedCamera?.sourceType === 'hls-stream';
  const autoStartedCameraRef = useRef<string | null>(null);

  const handleCameraChange = useCallback((id: string) => {
    // Deliberately does NOT call pipeline.stop(). For a shared local-device
    // camera stop() means "turn this camera off for every view", so rotating
    // used to switch the *previous* camera off — rotate away and back and it
    // was dead with a Start button. Changing sessionKey is enough: the hook's
    // own effect detaches this view from the old stream (leaving it running for
    // anyone else) and attaches the new one, and HLS sources are torn down by
    // their own per-view cleanup.
    // Let the newly selected camera auto-start if it qualifies.
    autoStartedCameraRef.current = null;
    setSelectedCameraId(id);
  }, []);

  /**
   * Step through the rotation, wrapping at both ends so it never dead-ends.
   * With a single camera the modulo lands back on the same id, so setting it is
   * a no-op re-render and the feed keeps playing — the arrows stay clickable
   * rather than disappearing.
   */
  const step = useCallback(
    (delta: number) => {
      if (rotation.length === 0) return;
      const from = rotationIndex === -1 ? 0 : rotationIndex;
      handleCameraChange(rotation[(from + delta + rotation.length) % rotation.length]);
    },
    [rotation, rotationIndex, handleCameraChange],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      // Don't hijack arrows while someone is typing in the settings panel below.
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      step(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step]);

  useEffect(() => {
    if (!autoStartsUnattended) return;
    if (autoStartedCameraRef.current === selectedCameraId) return;
    autoStartedCameraRef.current = selectedCameraId;
    void pipeline.start();
    // pipeline.start is stable; re-running only when the selection or its
    // eligibility changes is exactly what's wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCameraId, autoStartsUnattended]);

  useEffect(() => {
    if (!pipeline.tickResult) return;
    const video = pipeline.videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320) || 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Deriving a thumbnail from the live video element (an external system,
    // not React state) each time a new frame has been processed — not a
    // value we can compute during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewSnapshot(canvas.toDataURL('image/jpeg', 0.6));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.tickResult]);

  const handleAcknowledge = useCallback((id: string) => {
    setAlerts((current) => current.map((alert) => (alert.id === id ? { ...alert, acknowledged: true } : alert)));
    if (!id.startsWith('local-')) {
      void acknowledgeAlert(id);
    }
  }, []);

  const handleAcknowledgeAll = useCallback(() => {
    setAlerts((current) => {
      for (const alert of current) {
        if (!alert.acknowledged && !alert.id.startsWith('local-')) {
          void acknowledgeAlert(alert.id);
        }
      }
      return current.map((alert) => ({ ...alert, acknowledged: true }));
    });
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <Link href="/cameras" className={styles.backLink}>
          <ArrowLeft size={15} aria-hidden="true" /> Cameras
        </Link>
        <div className={styles.headerTitles}>
          <h2 className={styles.title}>{currentCameraName}</h2>
          <p className={styles.subtitle}>
            {rotation.length > 1 && rotationIndex !== -1 ? `Camera ${rotationIndex + 1} of ${rotation.length} · ` : ''}
            Every alert here is a suggestion for a human to verify — not a confirmed incident.
          </p>
        </div>
      </div>

      {!backendConnected ? (
        <div className={styles.banner}>
          <AlertOctagon size={16} aria-hidden="true" />
          Backend not reachable — detection settings and AprilTag mappings are using local defaults and won&rsquo;t be
          saved. New alerts still show up here for this session, but aren&rsquo;t persisted.
        </div>
      ) : null}

      <div className={styles.liveGrid}>
        <CameraFeed
          {...pipeline}
          fill
          stageOverlay={
            <>
              <button
                type="button"
                className={`${styles.arrow} ${styles.arrowLeft}`}
                onClick={() => step(-1)}
                aria-label="Previous camera"
              >
                <ChevronLeft size={26} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`${styles.arrow} ${styles.arrowRight}`}
                onClick={() => step(1)}
                aria-label="Next camera"
              >
                <ChevronRight size={26} aria-hidden="true" />
              </button>
              <span className={styles.stageLabel}>{currentCameraName}</span>
            </>
          }
        />
        <AlertFeed
          alerts={alerts}
          onAcknowledge={handleAcknowledge}
          onAcknowledgeAll={handleAcknowledgeAll}
          fill
          title="Recent Notifications"
        />
      </div>

      <div className={styles.disclaimer}>
        <ShieldQuestion size={16} aria-hidden="true" />
        This system flags patterns worth a human look — it does not reliably identify actual fights, drowning, or
        intoxication, and should never replace direct supervision in safety-critical settings (pools, in particular).
      </div>

      {/* AprilTag identity is administered under Access Control → People
          (Person.aprilTagId). The "AprilTag Devices" tab that used to live
          here kept a second, parallel record of who a tag belonged to. */}
      <DetectionSettingsPanel
        settings={settings}
        onUpdateDetector={handleUpdateDetector}
        onUpdateGlobal={handleUpdateGlobal}
        snapshotForZoneEditor={previewSnapshot}
      />
    </div>
  );
}
